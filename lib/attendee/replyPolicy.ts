/**
 * Decides whether a turn is answered by the deterministic template banks or by the LLM.
 *
 * Context: the template layer was answering 100% of turns (measured: 0 of 360 sampled turns
 * reached the LLM across 6 personas x 3 states x 20 prompt shapes). That made every reply
 * come from a finite bank, which is why the attendee reads flat and repetitive, and why two
 * different personas could return byte-identical pain text.
 *
 * The split is by KIND of reply, not by quality of the banks:
 *
 *   Templates keep the FACTUAL and SCRIPTED turns, where fixed phrasing is a feature -
 *   naming the actual tool stack concretely, conference small talk, and the CTA-shaped asks
 *   (demo / docs / pricing / rollout / badge / exit).
 *
 *   The LLM takes the EXPRESSIVE turns - disclosing pain, following up on what the trainee
 *   just said, and going guarded - because those have to respond to the specific words the
 *   trainee used. A finite bank structurally cannot, and that is exactly where persona
 *   voice, earned candor, and venting live.
 *
 * Note on the predicates: this reads the trainee's text directly, because the directive's
 * toolAnchored / smallTalk flags are only set under some stage conditions - relying on them
 * alone sent 75% of tool questions and 100% of small talk to the LLM.
 *
 * It deliberately does NOT use the director's isToolDomainQuestion. That predicate tests
 * TOOL_DOMAIN_RE, which matches any observability topic word - incident, alert, debug,
 * monitoring, trace, logs - so it treats "What slows you down most during an incident?" as a
 * tool question and answered it with "we're mostly relying on a mix of tools", turning a pain
 * probe into a stack answer. Only the explicit enumeration phrasings below stay deterministic.
 */

import { isSmallTalkQuestion, type DirectorDirective } from "./conversationDirector";

export type ReplyOwner = "template" | "llm";

/**
 * Tool-enumeration phrasings that must stay on the deterministic banks so the attendee names
 * its actual stack concretely.
 *
 * Kept in step with TOOL_ENUM_Q_RE in generateAttendeeReply.ts. Duplicated deliberately
 * rather than imported: that module imports this one, so importing back would be circular.
 * conversationDirector's isToolDomainQuestion misses these ("in the mix", "relying on"),
 * which sent real tool questions to the LLM and broke toolQuestionAnswering.
 */
const TOOL_ENUM_Q_RE =
  /\b(what (tool|tools)\b|what (are|were) (you|your) (using|running|relying)\b|what'?s in (the|that|your|our) (mix|stack|setup)\b|what does (your|the) (stack|setup|tooling)\b|what (do|did) you (use|run|rely)\b|what are you using (for|alongside|with)\b)/i;

/** Moves whose whole purpose is reacting to what the trainee just said. */
const EXPRESSIVE_MOVES = new Set(["share_pain", "ask_clarifying", "deflect", "answer"]);

export function decideReplyOwner(
  directive: DirectorDirective,
  traineeText = ""
): ReplyOwner {
  // The director sometimes picks exact text on purpose (neutral hook bank, concrete
  // follow-up limiter). An explicit override outranks this policy.
  if (directive.hookOverride || directive.concreteOverride) return "template";

  if (!EXPRESSIVE_MOVES.has(directive.move)) return "template";

  // Keep the concrete, factual turns deterministic: naming the stack should not drift,
  // and small talk is genuinely formulaic.
  if (directive.toolAnchored || TOOL_ENUM_Q_RE.test(traineeText)) return "template";
  if (directive.smallTalk || isSmallTalkQuestion(traineeText)) return "template";

  return "llm";
}
