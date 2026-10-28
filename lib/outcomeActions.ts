/**
 * Outcome action mapping for explicit session completion CTAs.
 *
 * Maps conversation outcomes to real-world booth actions that trainees
 * should take to complete the interaction.
 */

export type OutcomeActionType =
  | "SCAN_BADGE"
  | "HANDOFF_DEMOER"
  | "HAND_POSTCARD"
  | "HAND_SWAG";

export interface OutcomeAction {
  actionType: OutcomeActionType;
  actionLabel: string;
  systemMessage: string;
  tooltip?: string;
}

/**
 * Maps conversation outcomes to completion actions.
 *
 * @param outcome - Detected outcome string
 * @returns Action configuration for the outcome
 */
export function getOutcomeAction(outcome: string): OutcomeAction {
  switch (outcome) {
    case "MQL_READY":
      return {
        actionType: "SCAN_BADGE",
        actionLabel: "Scan attendee badge",
        systemMessage: "You scan their badge and confirm a follow-up.",
        tooltip: "Record this as a hot lead for sales follow-up",
      };

    case "DEMO_READY":
      return {
        actionType: "HANDOFF_DEMOER",
        actionLabel: "Hand off to Technical Support",
        systemMessage: "You hand them off to a Technical Support Staffer.",
        tooltip: "Connect them with a Technical Support Staffer (SA, CS, DevRel, or Eng) for a deeper dive",
      };

    case "SELF_SERVICE_READY":
      return {
        actionType: "HAND_POSTCARD",
        actionLabel: "Hand them a postcard",
        systemMessage:
          "You hand them the 'You Meet Us At The Booth. Now What?' postcard: a landing page with free-tier signup, white papers and case studies.",
        tooltip:
          "Best for a self-directed, skeptical IC without budget/authority who trusts content over sales",
      };

    case "DEFERRED_INTEREST":
    case "POLITE_EXIT":
    default:
      return {
        actionType: "HAND_SWAG",
        actionLabel: "Hand them swag",
        systemMessage: "You hand them some swag and thank them for stopping by.",
        tooltip: "End the conversation politely with a branded item",
      };
  }
}

/**
 * Check if an outcome should trigger completion CTA.
 *
 * @param outcome - Outcome string
 * @returns true if outcome should show completion CTA
 */
export function shouldShowCompletionCTA(outcome: string): boolean {
  return [
    "MQL_READY",
    "DEMO_READY",
    "SELF_SERVICE_READY",
    "DEFERRED_INTEREST",
    "POLITE_EXIT",
  ].includes(outcome);
}
