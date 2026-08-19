// Usage: NODE_ENV=development node --env-file=.env.local --import tsx scripts/score-real-transcript.mjs
import { scoreSession } from "/Users/rickabruzzo/Documents/honeycomb-simulator/.claude/worktrees/conference-simulator-handoff-3fbe5c/lib/scoring.ts";

const t = (type, text) => ({ id: Math.random().toString(36).slice(2), type, text, timestamp: new Date().toISOString() });

const session = {
  id: "real-tdm",
  currentState: "OUTCOME",
  active: false,
  startTime: new Date().toISOString(),
  violations: ["Assumed OTel familiarity without asking"],
  stateHistory: [],
  detectedOutcome: { type: "BADGE_SCAN", detectedAt: new Date().toISOString(), detectedFrom: "attendee" },
  kickoff: {
    personaId: "tdm-canonical",
    personaDisplayName: "Technical Decision-Maker",
    attendeeProfile: "Persona: Technical Decision-Maker\nModifiers: buyer, team-focused\nEmotional posture: outcome-driven\nTooling bias: Datadog + homegrown logging\nOpenTelemetry familiarity: aware",
  },
  transcript: [
    t("trainee", "Hi! How's your conference going so far?"),
    t("attendee", "It's fine, a bit of a blur. Mostly here scouting what might help my team ship faster without burning everyone out."),
    t("trainee", "What does the company do and what is your role in it?"),
    t("attendee", "Mid-size fintech, I run a couple platform teams, about twenty engineers across payments infra and internal tooling."),
    t("trainee", "That sounds rough and a huge challenge. What do you use now to solve issues and why is it falling short?"),
    t("attendee", "Datadog for metrics and alerts, plus homegrown logging. When payments breaks it takes forever to get from alert to root cause. Last incident took almost four hours."),
    t("trainee", "I hear that. Having to switch tools means switching context. The next tool in the runbook doesn't always have signal overlap with the last one. It can feel like you are starting over each time"),
    t("attendee", "Yeah, exactly. So if there's a way to keep that context intact, how does that actually work?"),
    t("trainee", "Honeycomb is a single pane where you can drill down without switching tools. If your code is instrumented you can follow the customer journey end to end. It works alongside your existing metrics and logs, especially with OpenTelemetry."),
    t("attendee", "We've dabbled with OpenTelemetry but not gone all-in. What's the lift to get useful data in?"),
    t("trainee", "It can be a big lift and slowing the team is the last thing we want. OpenTelemetry has auto-instrumentation for common codebases, and we'd give you a dedicated person to help transition. We can schedule a POC against your current stack."),
    t("attendee", "That's reasonable. Can you get me in touch with someone who can talk through what that POC looks like for our stack?"),
    t("trainee", "I'd be happy to, let me scan your badge and we can have a team member reach out."),
  ],
};

const record = await scoreSession(session, "real-tdm-token");
console.log("method:", record.scoringMethod, "| grade:", record.grade, "| score:", record.score);
console.log("breakdown:", record.breakdown);
console.log("listening evidence:", record.evidence.find((e) => e.dimension === "listening"));
console.log("summary highlights:", record.highlights);
