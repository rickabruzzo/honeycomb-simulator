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
  provider: "openai" | "mock";
  model?: string;
  createdAt: string;
}
