import type { CheckIn } from "../stores/goalsStore";

// Fields that merge per-field when another tab saves: a locally edited value wins over the remote one.
const PLAIN_FIELDS = [
  "energy",
  "wins",
  "blockers",
  "nextFocus",
  "checkInPerson",
  "checkInPersonTaskId",
  "recharge",
  "mindfulDismissed"
] as const;

// Merge a remote check-in save into the local draft (`before` is the store value the local
// draft was last based on, `remote` the value the other tab just saved).
// Locally edited fields win, but the mindful prompt and answer stay paired: clicking "Another"
// clears the local answer as a side effect, so cycling onto the same prompt the remote tab
// saved must not wipe the remote answer — only a typed answer or a prompt the remote tab is
// not on takes the local pair.
export function mergeCheckInDraft(before: CheckIn, draft: CheckIn, remote: CheckIn): { merged: CheckIn; changed: boolean } {
  const merged: CheckIn = { ...remote };
  const mergedFields = merged as unknown as Record<string, unknown>;
  const draftFields = draft as unknown as Record<string, unknown>;
  const beforeFields = before as unknown as Record<string, unknown>;
  for (const field of PLAIN_FIELDS) {
    if (draftFields[field] !== beforeFields[field]) mergedFields[field] = draftFields[field];
  }
  const localPromptChanged = draft.mindfulPrompt !== before.mindfulPrompt;
  const localPromptDiverged = localPromptChanged && draft.mindfulPrompt !== remote.mindfulPrompt;
  const cycledOntoRemotePrompt = localPromptChanged && draft.mindfulPrompt === remote.mindfulPrompt;
  const localAnswerEdited = draft.mindfulAnswer !== before.mindfulAnswer;
  if (localPromptDiverged || (localAnswerEdited && !(cycledOntoRemotePrompt && draft.mindfulAnswer === ""))) {
    merged.mindfulPrompt = draft.mindfulPrompt;
    merged.mindfulAnswer = draft.mindfulAnswer;
  }
  const remoteFields = remote as unknown as Record<string, unknown>;
  const changed = [...PLAIN_FIELDS, "mindfulPrompt", "mindfulAnswer"].some(field => mergedFields[field] !== remoteFields[field]);
  return { merged, changed };
}
