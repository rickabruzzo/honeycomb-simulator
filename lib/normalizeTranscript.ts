export interface TranscriptMessage {
  id: string;
  type: "system" | "trainee" | "attendee";
  text: string;
  timestamp: string;
}

/**
 * Normalize transcript array to ensure all items are valid messages.
 * Filters out null, undefined, or malformed message objects.
 * This function is safe and will never throw.
 */
export function normalizeTranscript(input: unknown): TranscriptMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter((msg): msg is TranscriptMessage => {
    if (msg === null || msg === undefined || typeof msg !== "object") {
      return false;
    }

    const candidate = msg as Record<string, unknown>;

    return (
      typeof candidate.id === "string" &&
      typeof candidate.type === "string" &&
      (candidate.type === "system" ||
        candidate.type === "trainee" ||
        candidate.type === "attendee") &&
      typeof candidate.text === "string" &&
      typeof candidate.timestamp === "string"
    );
  });
}
