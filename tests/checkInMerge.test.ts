import { expect, test } from "vitest";
import { mergeCheckInDraft } from "../src/lib/checkInMerge";
import type { CheckIn } from "../src/stores/goalsStore";

const checkIn = (over: Partial<CheckIn> = {}): CheckIn => ({
  week: "2026-03-02",
  energy: 0,
  wins: "",
  blockers: "",
  nextFocus: "",
  checkInPerson: "",
  checkInPersonTaskId: null,
  recharge: "",
  mindfulPrompt: "P",
  mindfulAnswer: "",
  mindfulDismissed: false,
  savedAt: "",
  ...over
});

test("cycling onto the prompt a remote tab saved keeps the remote answer", () => {
  // "Another" clears the local answer as a side effect; the remote tab saved Q with answer B
  const before = checkIn({ mindfulPrompt: "P", mindfulAnswer: "A" });
  const draft = checkIn({ mindfulPrompt: "Q", mindfulAnswer: "" });
  const remote = checkIn({ mindfulPrompt: "Q", mindfulAnswer: "B" });
  const { merged, changed } = mergeCheckInDraft(before, draft, remote);
  expect(merged.mindfulPrompt).toBe("Q");
  expect(merged.mindfulAnswer).toBe("B");
  expect(changed).toBe(false);
});

test("a typed answer on the remote's prompt still wins locally", () => {
  const before = checkIn({ mindfulPrompt: "P", mindfulAnswer: "A" });
  const draft = checkIn({ mindfulPrompt: "Q", mindfulAnswer: "C" });
  const remote = checkIn({ mindfulPrompt: "Q", mindfulAnswer: "B" });
  const { merged, changed } = mergeCheckInDraft(before, draft, remote);
  expect(merged.mindfulPrompt).toBe("Q");
  expect(merged.mindfulAnswer).toBe("C");
  expect(changed).toBe(true);
});

test("a prompt the remote tab is not on takes the local pair", () => {
  const before = checkIn({ mindfulPrompt: "P", mindfulAnswer: "A" });
  const draft = checkIn({ mindfulPrompt: "R", mindfulAnswer: "" });
  const remote = checkIn({ mindfulPrompt: "Q", mindfulAnswer: "B" });
  const { merged, changed } = mergeCheckInDraft(before, draft, remote);
  expect(merged.mindfulPrompt).toBe("R");
  expect(merged.mindfulAnswer).toBe("");
  expect(changed).toBe(true);
});

test("editing the answer without changing the prompt wins locally", () => {
  const before = checkIn({ mindfulPrompt: "P", mindfulAnswer: "A" });
  const draft = checkIn({ mindfulPrompt: "P", mindfulAnswer: "C" });
  const remote = checkIn({ mindfulPrompt: "P", mindfulAnswer: "B" });
  const { merged } = mergeCheckInDraft(before, draft, remote);
  expect(merged.mindfulPrompt).toBe("P");
  expect(merged.mindfulAnswer).toBe("C");
});

test("no local edits takes the remote check-in wholesale", () => {
  const before = checkIn({ mindfulPrompt: "P", mindfulAnswer: "A", wins: "old" });
  const draft = checkIn({ mindfulPrompt: "P", mindfulAnswer: "A", wins: "old" });
  const remote = checkIn({ mindfulPrompt: "Q", mindfulAnswer: "B", wins: "remote win" });
  const { merged, changed } = mergeCheckInDraft(before, draft, remote);
  expect(merged).toMatchObject({ mindfulPrompt: "Q", mindfulAnswer: "B", wins: "remote win" });
  expect(changed).toBe(false);
});

test("locally edited plain fields win, untouched fields follow remote", () => {
  const before = checkIn({ wins: "old", energy: 0, recharge: "" });
  const draft = checkIn({ wins: "local win", energy: 3, recharge: "" });
  const remote = checkIn({ wins: "remote win", energy: 5, recharge: "remote rest" });
  const { merged, changed } = mergeCheckInDraft(before, draft, remote);
  expect(merged.wins).toBe("local win");
  expect(merged.energy).toBe(3);
  expect(merged.recharge).toBe("remote rest");
  expect(changed).toBe(true);
});
