/**
 * Transcript export, shared by the Review page's Export button and the admin AI-review dialog so
 * both download the same JSON shape (the shape the 2026-11 feedback exports were in).
 * Input is the /api/review/[token] response.
 */

export interface ReviewPayload {
  sessionId: string;
  kickoff: { personaDisplayName?: string; personaId?: string; traineeNameShort?: string; traineeId?: string };
  startTime: string;
  currentState: string;
  active: boolean;
  detectedOutcome?: { type: string } | null;
  violations: string[];
  trainerFeedback?: { guidance?: string } | null;
  transcript: Array<{ timestamp: string; type: string; text: string }>;
  promptBundleVersion?: string;
}

export function buildSessionExport(r: ReviewPayload) {
  return {
    sessionId: r.sessionId,
    persona: r.kickoff.personaDisplayName || r.kickoff.personaId || "Unknown",
    trainee: r.kickoff.traineeNameShort || r.kickoff.traineeId || "Unknown",
    startTime: r.startTime,
    currentState: r.currentState,
    active: r.active,
    // detectedOutcome carries the actual result; currentState is only the state-machine position.
    outcome: r.active ? "In Progress" : r.detectedOutcome?.type ?? r.currentState,
    violations: r.violations,
    trainerFeedback: r.trainerFeedback?.guidance || null,
    transcript: r.transcript.map((m) => ({
      timestamp: m.timestamp,
      role: m.type === "trainee" ? "Trainee" : m.type === "attendee" ? "Attendee" : "System",
      message: m.text,
    })),
    promptBundleVersion: r.promptBundleVersion ?? "not recorded",
    exportedAt: new Date().toISOString(),
  };
}

/** Browser-only: trigger a JSON download of the session export. */
export function downloadSessionExport(r: ReviewPayload): void {
  const blob = new Blob([JSON.stringify(buildSessionExport(r), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `session-${r.sessionId}-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
