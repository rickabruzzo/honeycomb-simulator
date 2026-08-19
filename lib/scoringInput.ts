/**
 * Scoring input helpers — ensure all scoring operates on the correct
 * subset of transcript messages.
 *
 * Rule: score ONLY trainee messages. Attendee messages may be used as
 * contextual reference (e.g. keyword overlap for listening) but must
 * never contribute points on their own.
 */

type TranscriptMessage = {
  id: string;
  type: "system" | "trainee" | "attendee";
  text: string;
  timestamp: string;
  momentumScore?: number;
  momentumDelta?: number;
};

export function getTraineeMessages(transcript: TranscriptMessage[]) {
  return transcript.filter((m) => m.type === "trainee");
}

export function getAttendeeMessages(transcript: TranscriptMessage[]) {
  return transcript.filter((m) => m.type === "attendee");
}
