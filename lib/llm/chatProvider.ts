/**
 * Chat Provider
 * Abstraction for chat generation with OpenAI + mock fallback
 */

import type { ChatInput, ChatResult } from "./chatTypes";

export interface ChatProvider {
  generate(input: ChatInput): Promise<ChatResult>;
}

/**
 * Mock Chat Provider
 * Returns deterministic placeholder responses for testing/development
 */
export class MockChatProvider implements ChatProvider {
  async generate(input: ChatInput): Promise<ChatResult> {
    // Deterministic placeholder response
    const messageCount = input.conversation.length;
    const lastUserMessage = input.conversation
      .filter((m) => m.role === "user")
      .slice(-1)[0]?.content;

    let response = "I appreciate you reaching out. ";

    if (lastUserMessage) {
      if (lastUserMessage.toLowerCase().includes("honeycomb")) {
        response +=
          "Tell me more about your observability challenges and what you're hoping to achieve.";
      } else if (lastUserMessage.toLowerCase().includes("opentelemetry")) {
        response +=
          "OpenTelemetry is interesting. What's your current setup like?";
      } else {
        response += `That's a good point. What made you think about that? (Message ${messageCount})`;
      }
    } else {
      response += "How can I help you today?";
    }

    return {
      text: response,
      provider: "mock",
      createdAt: new Date().toISOString(),
    };
  }
}

/**
 * OpenAI Chat Provider
 * Uses OpenAI API for chat completion
 */
export class OpenAIChatProvider implements ChatProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string) {
    if (!apiKey) {
      throw new Error(
        "OpenAI API key is required for OpenAIChatProvider. Set OPENAI_API_KEY environment variable."
      );
    }
    this.apiKey = apiKey;
    this.model = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
  }

  async generate(input: ChatInput): Promise<ChatResult> {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: this.apiKey });

    try {
      // Build messages array: system prompt + conversation history
      const messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [
        {
          role: "system",
          content: input.systemPrompt,
        },
        ...input.conversation,
      ];

      const completion = await client.chat.completions.create({
        model: this.model,
        temperature: 0.4,
        max_tokens: 300,
        messages,
      });

      const text = completion.choices[0]?.message?.content;
      if (!text) {
        throw new Error("No content in OpenAI response");
      }

      return {
        text: text.trim(),
        provider: "openai",
        model: this.model,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      // Log error without exposing API key
      console.error("OpenAI chat generation failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
        model: this.model,
        sessionId: input.sessionId,
      });
      throw error;
    }
  }
}

/**
 * Get Chat Provider
 * Returns appropriate provider based on environment configuration
 * Default: MockChatProvider
 * Enable OpenAI: CHAT_PROVIDER=openai + OPENAI_API_KEY set
 */
export function getChatProvider(): ChatProvider {
  const chatProvider = process.env.CHAT_PROVIDER;
  const apiKey = process.env.OPENAI_API_KEY;

  // Default to mock
  if (chatProvider !== "openai") {
    return new MockChatProvider();
  }

  // OpenAI requested but no API key
  if (!apiKey) {
    console.warn(
      "[ChatProvider] CHAT_PROVIDER=openai but OPENAI_API_KEY not set. Falling back to MockChatProvider."
    );
    return new MockChatProvider();
  }

  // Return OpenAI provider wrapped with fallback
  try {
    const openaiProvider = new OpenAIChatProvider(apiKey);

    // Wrap in fallback handler
    return {
      async generate(input: ChatInput): Promise<ChatResult> {
        try {
          return await openaiProvider.generate(input);
        } catch (error) {
          console.warn(
            "[ChatProvider] OpenAI generation failed, falling back to mock:",
            error instanceof Error ? error.message : "Unknown error"
          );
          const mockProvider = new MockChatProvider();
          return await mockProvider.generate(input);
        }
      },
    };
  } catch (error) {
    console.warn(
      "[ChatProvider] Failed to initialize OpenAI provider, using mock:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return new MockChatProvider();
  }
}
