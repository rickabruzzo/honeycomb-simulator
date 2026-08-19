/**
 * Topic Detection — maps free-text to canonical topic labels.
 *
 * Used by the conversation director + reply generator to maintain topic
 * continuity across turns.  When the attendee picks a pain anchor, the
 * system prefers anchors whose keywords overlap the current topic.
 *
 * Topic persistence rule:
 *   - Keep current topic while the trainee references it.
 *   - Switch only after 2 consecutive trainee messages introduce a new topic.
 */

// ── Keyword → topic mapping ──────────────────────────────────────────────────

export const TOPIC_KEYWORDS: Record<string, string[]> = {
  alerts: ["alert", "alerting", "noise", "pager", "on-call", "oncall", "fatigue", "pagerduty"],
  logs: ["log", "logging", "splunk", "kibana", "elk", "logstash"],
  tracing: ["trace", "tracing", "span", "spans", "distributed trace"],
  incidents: ["incident", "outage", "debugging", "root cause", "root-cause", "mttr", "postmortem"],
  monitoring: ["monitoring", "observability", "metrics", "dashboard", "grafana", "datadog", "prometheus"],
};

/**
 * Detect the dominant topic in a text fragment.
 *
 * Scans for keyword hits across all topic categories and returns the
 * category with the most matches.  Ties are broken by declaration order
 * (first matching topic wins).
 *
 * Returns `null` when no keywords match.
 */
export function detectTopic(text: string): string | null {
  if (!text || text.trim().length === 0) return null;

  const lower = text.toLowerCase();
  let bestTopic: string | null = null;
  let bestCount = 0;

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const count = keywords.filter((kw) => lower.includes(kw)).length;
    if (count > bestCount) {
      bestCount = count;
      bestTopic = topic;
    }
  }

  return bestTopic;
}

// ── Topic persistence logic ──────────────────────────────────────────────────

/**
 * Determines the new current topic given the conversation state.
 *
 * Rules:
 *   1. If trainee text references the current topic, keep it.
 *   2. If trainee text introduces a different topic, increment the
 *      consecutive-new-topic counter.
 *   3. Switch to the new topic only after 2 consecutive trainee messages
 *      mention the new topic (consecutiveNewTopicCount >= 2).
 *   4. If no topic is detected in trainee text, keep current topic
 *      unchanged and reset counter.
 *
 * Returns { topic, consecutiveNewTopicCount }.
 */
export function resolveTopicUpdate(
  traineeText: string,
  currentTopic: string | null,
  consecutiveNewTopicCount: number
): { topic: string | null; consecutiveNewTopicCount: number } {
  const detected = detectTopic(traineeText);

  // No topic signal in trainee text → keep current, reset counter
  if (!detected) {
    return { topic: currentTopic, consecutiveNewTopicCount: 0 };
  }

  // Trainee references the current topic → keep it, reset counter
  if (detected === currentTopic) {
    return { topic: currentTopic, consecutiveNewTopicCount: 0 };
  }

  // New topic detected
  const newCount = consecutiveNewTopicCount + 1;

  // Switch after 2 consecutive mentions of the new topic
  if (newCount >= 2) {
    return { topic: detected, consecutiveNewTopicCount: 0 };
  }

  // Not enough consecutive mentions — keep current, record intent
  return { topic: currentTopic, consecutiveNewTopicCount: newCount };
}

// ── Pain anchor topic overlap ────────────────────────────────────────────────

/**
 * Returns true when a pain anchor's keywords overlap with the given topic's
 * keyword set.  Used to prefer on-topic anchors during pain selection.
 */
export function isPainAnchorOnTopic(
  anchorKeywords: string[],
  topic: string
): boolean {
  const topicKws = TOPIC_KEYWORDS[topic];
  if (!topicKws) return false;

  const anchorLower = anchorKeywords.map((k) => k.toLowerCase());
  return topicKws.some((tkw) =>
    anchorLower.some((akw) => akw.includes(tkw) || tkw.includes(akw))
  );
}
