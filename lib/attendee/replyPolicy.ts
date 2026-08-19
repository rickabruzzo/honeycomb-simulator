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
 * Note on the predicates: this reads the trainee's text via the director's own
 * isToolDomainQuestion / isSmallTalkQuestion rather than the directive's toolAnchored /
 * smallTalk flags. Those flags are only set under some stage conditions, so relying on them
 * alone sent 75% of tool questions and 100% of small talk to the LLM.
 */

import {
  isToolDomainQuestion,
  isSmallTalkQuestion,
  type DirectorDirective,
} from "./conversationDirector";

export type ReplyOwner = "template" | "llm";

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
  if (directive.toolAnchored || isToolDomainQuestion(traineeText)) return "template";
  if (directive.smallTalk || isSmallTalkQuestion(traineeText)) return "template";

  return "llm";
}
