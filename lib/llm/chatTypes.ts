/**
 * Chat Provider Types
 * Shared interfaces for chat generation (OpenAI + mock fallback)
 */

export interface ChatInput {
  systemPrompt: string;
  conversation: {
    role: "system" | "user" | "assistant";
    content: string;
  }[];
  sessionId: string;
}

export interface ChatResult {
  text: string;
  provider: "openai" | "mock" | string; // Allow "(cached)" suffix for telemetry
  model?: string;
  createdAt: string;
  cached?: boolean; // Explicit flag for cache hits
}
