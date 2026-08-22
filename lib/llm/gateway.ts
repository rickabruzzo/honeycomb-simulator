/**
 * Attendee generation through Vercel AI Gateway.
 *
 * A plain "provider/model" string routes through the Gateway automatically, so changing
 * models is an env change rather than a code change. Resolve slugs with
 * scripts/smoke-gateway.mjs - the catalog changes and 4.x-line slugs version with dots
 * (anthropic/claude-sonnet-4.6, not -4-6).
 *
 * Requires either AI_GATEWAY_API_KEY or a VERCEL_OIDC_TOKEN (written by `vercel env pull`),
 * and a payment method on the Vercel team - the Gateway refuses to serve generation requests
 * without one even while free credits are available.
 */

import { generateText, APICallError } from "ai";
import type { ChatInput, ChatResult } from "./chatTypes";
import type { ChatProvider } from "./chatProvider";

export class GatewayChatProvider implements ChatProvider {
  private model: string;
  private temperature: number;
  private maxOutputTokens: number;

  constructor(model?: string) {
    const resolved = model || process.env.ATTENDEE_MODEL;
    if (!resolved) {
      throw new Error(
        "ATTENDEE_MODEL is not set. Run scripts/smoke-gateway.mjs to list available slugs."
      );
    }
    this.model = resolved;
    this.temperature = Number(process.env.ATTENDEE_TEMPERATURE ?? 0.8);
    this.maxOutputTokens = Number(process.env.ATTENDEE_MAX_TOKENS ?? 700);
  }

  async generate(input: ChatInput): Promise<ChatResult> {
    const messages = input.conversation
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const result = await generateText({
        model: this.model,
        system: input.systemPrompt,
        messages,
        temperature: this.temperature,
        maxOutputTokens: this.maxOutputTokens,
        providerOptions: { gateway: { tags: ["feature:attendee-sim"] } },
      });

      return {
        text: result.text.trim(),
        provider: "gateway",
        model: this.model,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      const status = APICallError.isInstance(error) ? error.statusCode : undefined;
      console.error("[gateway] generation failed", {
        status,
        model: this.model,
        sessionId: input.sessionId,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}
