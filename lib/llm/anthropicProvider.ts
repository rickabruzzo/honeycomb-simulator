/**
 * Attendee generation via the Anthropic API.
 *
 * Two API differences from the OpenAI path that are easy to get wrong, and both fail in ways
 * that look like "Claude is bad" rather than "the request was malformed", because the provider
 * factory degrades to the mock on any throw:
 *
 *  1. Sampling parameters are REMOVED on Claude 5 models. Sending `temperature` returns a 400.
 *     Response variation comes from the model, not from a temperature knob.
 *  2. Thinking tokens count toward max_tokens, so max_tokens has to leave headroom above the
 *     visible reply or the answer gets truncated mid-sentence.
 *
 * Effort is deliberately low: a booth reply is a short conversational turn, not a reasoning
 * task. High effort (the default) would add latency and thinking tokens for no gain in
 * persona quality.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ChatInput, ChatResult } from "./chatTypes";
import type { ChatProvider } from "./chatProvider";

const DEFAULT_MODEL = "claude-sonnet-5";

export class AnthropicChatProvider implements ChatProvider {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private effort: string;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY is required for AnthropicChatProvider. Set it in .env.local."
      );
    }
    this.client = new Anthropic({ apiKey: key });
    this.model = process.env.ATTENDEE_MODEL || DEFAULT_MODEL;
    // Headroom for adaptive thinking above the visible reply.
    this.maxTokens = Number(process.env.ATTENDEE_MAX_TOKENS ?? 4000);
    this.effort = process.env.ATTENDEE_EFFORT || "low";
  }

  async generate(input: ChatInput): Promise<ChatResult> {
    const messages = input.conversation
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: input.systemPrompt,
        messages,
        // NO temperature - Claude 5 models reject sampling params with a 400.
        thinking: { type: "adaptive" },
        output_config: { effort: this.effort },
      } as Anthropic.MessageCreateParamsNonStreaming);

      if (response.stop_reason === "refusal") {
        throw new Error(
          `Anthropic declined the request (${response.stop_details?.category ?? "unknown"})`
        );
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      if (!text) {
        throw new Error(
          `No text content in Anthropic response (stop_reason: ${response.stop_reason})`
        );
      }

      return {
        text,
        provider: "anthropic",
        model: this.model,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        console.error("[anthropic] generation failed", {
          status: error.status,
          model: this.model,
          sessionId: input.sessionId,
          message: error.message,
        });
      } else {
        console.error("[anthropic] generation failed", {
          model: this.model,
          sessionId: input.sessionId,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
      throw error;
    }
  }
}
