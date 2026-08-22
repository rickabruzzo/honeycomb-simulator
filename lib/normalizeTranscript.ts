export interface TranscriptMessage {
  id: string;
  type: "system" | "trainee" | "attendee";
  text: string;
  timestamp: string;
  // Momentum snapshot stored at message creation time
  momentumScore?: number;
  momentumDelta?: number;
}

/**
 * Normalize transcript array to ensure all items are valid messages.
 * Filters out null, undefined, or malformed message objects.
 * Passes through optional momentum fields if present.
 * This function is safe and will never throw.
 */
export function normalizeTranscript(input: unknown): TranscriptMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((msg): msg is Record<string, unknown> => {
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
    })
    .map((candidate): TranscriptMessage => ({
      id: candidate.id as string,
      type: candidate.type as "system" | "trainee" | "attendee",
      text: candidate.text as string,
      timestamp: candidate.timestamp as string,
      ...(typeof candidate.momentumScore === "number" && { momentumScore: candidate.momentumScore }),
      ...(typeof candidate.momentumDelta === "number" && { momentumDelta: candidate.momentumDelta }),
    }));
}
