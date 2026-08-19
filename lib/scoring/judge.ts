/**
 * The LLM judge: sends the transcript to the chat provider and returns validated per-dimension
 * scores with evidence. Knows nothing about ScoreRecord or grades - that mapping lives in
 * lib/scoring/judge-mapping.ts.
 */

import type { SessionState } from "../storage";
import { getChatProvider } from "../llm/chatProvider";
import {
  JUDGE_SYSTEM_PROMPT,
  buildJudgeUserMessage,
  SCORING_DIMENSIONS,
  type ScoringDimension,
} from "./rubric";

export interface JudgeDimension {
  score: number; // integer 0-5
  rationale: string;
  evidence: string; // verbatim trainee quote, or ""
}

export type JudgeResult = Record<ScoringDimension, JudgeDimension> & {
  summary: string;
};

function coerceDimension(raw: unknown): JudgeDimension {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("dimension is not an object");
  }
  const r = raw as Record<string, unknown>;
  const score = r.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 5) {
    throw new Error(`invalid score: ${String(score)}`);
  }
  return {
    score,
    rationale: typeof r.rationale === "string" ? r.rationale : "",
    evidence: typeof r.evidence === "string" ? r.evidence : "",
  };
}

/**
 * Parse and validate the judge's JSON. Throws on anything malformed so the caller can fall
 * back to the heuristic scorer rather than trust a partial result.
 */
export function parseJudgeResult(text: string): JudgeResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const result = { summary: "" } as JudgeResult;
  for (const dim of SCORING_DIMENSIONS) {
    if (!(dim in parsed)) throw new Error(`missing dimension: ${dim}`);
    result[dim] = coerceDimension(parsed[dim]);
  }
  result.summary = typeof parsed.summary === "string" ? parsed.summary : "";
  return result;
}

/**
 * Run the judge against a completed session. Throws if the provider fails or returns
 * unparseable output; the orchestrator catches and falls back.
 */
export async function judgeSession(session: SessionState): Promise<JudgeResult> {
  const provider = getChatProvider();
  const result = await provider.generate({
    systemPrompt: JUDGE_SYSTEM_PROMPT,
    conversation: [{ role: "user", content: buildJudgeUserMessage(session) }],
    sessionId: `judge-${session.id}`,
  });
  return parseJudgeResult(result.text);
}
