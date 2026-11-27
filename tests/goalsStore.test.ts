import { afterEach, expect, test, vi } from "vitest";
import { initGoalsStore, MINDFUL_PROMPTS, mindfulPromptForWeek } from "../src/stores/goalsStore";

afterEach(() => vi.unstubAllGlobals());

function sharedTabs() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
  vi.stubGlobal("localStorage", storage);
  function tab() {
    let listener: (event: any) => void = () => {};
    vi.stubGlobal("window", { addEventListener: (_name: string, callback: typeof listener) => { listener = callback; }, dispatchEvent: vi.fn() });
    const store = initGoalsStore();
    store.init();
    return { store, dispatch: (key: string | null, storageArea: unknown = storage) => listener({ key, storageArea }) };
  }
  return { a: tab(), b: tab(), storage };
}

test("a note in a stale tab does not overwrite another tab's goal", () => {
  const { a, b, storage } = sharedTabs();
  a.store.addGoal("Goal from A");
  b.store.addNote("Note from B");
  expect(JSON.parse(storage.getItem("goals")!)).toEqual(a.store.goals);
  expect(JSON.parse(storage.getItem("notes")!)).toEqual(b.store.notes);
});

test("storage events refresh goals, notes and weekly check-ins without writing back", () => {
  const { a, b, storage } = sharedTabs();
  a.store.addGoal("Goal from A");
  a.store.addNote("Note from A");
  a.store.saveCheckIn({ ...a.store.checkInFor("2026-01-05"), wins: "A win" });
  storage.setItem.mockClear();
  b.dispatch("goals", {});
  b.dispatch("unrelated");
  expect(b.store.goals).toEqual([]);
  for (const key of ["goals", "notes", "checkIns"]) b.dispatch(key);
  expect(b.store.goals).toEqual(a.store.goals);
  expect(b.store.notes).toEqual(a.store.notes);
  expect(b.store.checkIns).toEqual(a.store.checkIns);
  b.store.save();
  expect(storage.setItem).not.toHaveBeenCalled();
  storage.setItem("goals", "[]");
  storage.setItem("notes", "[]");
  storage.setItem("checkIns", "{}");
  b.dispatch(null);
  expect(b.store.goals).toEqual([]);
  expect(b.store.notes).toEqual([]);
  expect(b.store.checkIns).toEqual({});
});

test("failed writes can be retried", () => {
  const { a, storage } = sharedTabs();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("CustomEvent", class {});
  storage.setItem.mockImplementationOnce(() => { throw new Error("Full"); });
  a.store.addGoal("Retry me");
  a.store.save();
  expect(JSON.parse(storage.getItem("goals")!)).toEqual(a.store.goals);
  error.mockRestore();
});

test.each(["goals", "notes", "checkIns"] as const)("a remote %s reload merges and retries a failed local write", key => {
  const { a, b, storage } = sharedTabs();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("CustomEvent", class {});
  storage.setItem.mockImplementationOnce(() => { throw new Error("Full"); });
  if (key === "goals") {
    a.store.addGoal("Local");
    b.store.addGoal("Remote");
  } else if (key === "notes") {
    a.store.addNote("Local");
    b.store.addNote("Remote");
  } else {
    a.store.saveCheckIn({ ...a.store.checkInFor("2026-01-05"), wins: "Local" });
    b.store.saveCheckIn({ ...b.store.checkInFor("2026-01-12"), wins: "Remote" });
  }
  const local = structuredClone(a.store[key]);
  const remote = structuredClone(b.store[key]);
  a.dispatch(key);
  if (key === "checkIns") {
    expect(a.store[key]).toEqual({ ...remote, ...local });
  } else {
    expect(a.store[key]).toEqual([...remote as unknown[], ...local as unknown[]]);
  }
  expect(JSON.parse(storage.getItem(key)!)).toEqual(a.store[key]);
  error.mockRestore();
});

test("a failed local deletion is retained while merging a remote add", () => {
  const { a, b, storage } = sharedTabs();
  const id = a.store.addGoal("Delete me");
  b.dispatch("goals");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("CustomEvent", class {});
  storage.setItem.mockImplementationOnce(() => { throw new Error("Full"); });
  a.store.removeGoal(id);
  b.store.addGoal("Remote");
  a.dispatch("goals");
  expect(a.store.goals.map(goal => goal.title)).toEqual(["Remote"]);
  expect(JSON.parse(storage.getItem("goals")!)).toEqual(a.store.goals);
  error.mockRestore();
});

test("goals store persists obstaclePlan, celebration, and reachedAt and hydrates legacy goals", () => {
  const { a, b, storage } = sharedTabs();
  storage.setItem("goals", JSON.stringify([{
    id: "legacy-1",
    title: "Legacy goal",
    why: "Old note",
    clusterId: null,
    progress: 40,
    targetDate: null,
    done: false,
    createdAt: "2026-01-01T00:00:00.000Z"
  }]));
  a.dispatch("goals");
  expect(a.store.goals[0]).toMatchObject({
    id: "legacy-1",
    why: "Old note",
    obstaclePlan: "",
    celebration: "",
    reachedAt: null
  });

  const id = a.store.addGoal("Finish portfolio", {
    why: "Share my best work",
    obstaclePlan: "If I stall, open one draft for 10 minutes",
    celebration: "Dinner at my favorite spot"
  });
  a.store.updateGoal(id, { done: true });
  expect(a.store.goals.find(g => g.id === id)?.reachedAt).toEqual(expect.any(String));

  b.dispatch("goals");
  expect(b.store.goals.find(g => g.id === id)).toMatchObject({
    why: "Share my best work",
    obstaclePlan: "If I stall, open one draft for 10 minutes",
    celebration: "Dinner at my favorite spot",
    done: true
  });

  a.store.updateGoal(id, { done: false });
  expect(a.store.goals.find(g => g.id === id)?.reachedAt).toBeNull();
});

test("wins persist, filter by week, and sync across tabs", () => {
  const { a, b, storage } = sharedTabs();
  expect(a.store.addWin("   ")).toBe("");
  const win1 = a.store.addWin("Read 10 pages", { date: "2026-03-02" });
  const win2 = a.store.addWin("Reached goal: Pass exam", { date: "2026-03-04", goalId: "g-1", goalTitle: "Pass exam" });
  a.store.addWin("Last week win", { date: "2026-02-26" });

  expect(a.store.winsInWeek("2026-03-02").map(w => w.id)).toEqual([win2, win1]);
  expect(a.store.todayWins("2026-03-04").map(w => w.goalTitle)).toEqual(["Pass exam"]);

  b.dispatch("wins");
  expect(b.store.wins).toEqual(a.store.wins);

  a.store.removeWin(win1);
  b.dispatch("wins");
  expect(b.store.wins.map(w => w.id)).not.toContain(win1);
  expect(JSON.parse(storage.getItem("wins")!)).toEqual(b.store.wins);
});

test("check-ins hydrate legacy entries and persist connection, recharge, and mindful prompt fields", () => {
  const { a, b, storage } = sharedTabs();
  storage.setItem("checkIns", JSON.stringify({
    "2026-03-02": {
      week: "2026-03-02",
      energy: 4,
      wins: "Shipped release",
      blockers: "",
      nextFocus: "Rest",
      savedAt: "2026-03-02T12:00:00.000Z"
    }
  }));
  a.dispatch("checkIns");
  expect(a.store.checkInFor("2026-03-02")).toMatchObject({
    week: "2026-03-02",
    energy: 4,
    wins: "Shipped release",
    checkInPerson: "",
    checkInPersonTaskId: null,
    recharge: "",
    mindfulPrompt: mindfulPromptForWeek("2026-03-02"),
    mindfulAnswer: "",
    mindfulDismissed: false
  });

  // Adjacent weeks rotate through the prompt list deterministically
  expect(mindfulPromptForWeek("2026-03-02")).not.toBe(mindfulPromptForWeek("2026-03-09"));
  expect(MINDFUL_PROMPTS).toContain(mindfulPromptForWeek("2026-03-02"));

  a.store.saveCheckIn({
    ...a.store.checkInFor("2026-03-09"),
    checkInPerson: "Sam",
    checkInPersonTaskId: "task-1",
    recharge: "Sunday walk without phone",
    mindfulPrompt: MINDFUL_PROMPTS[1],
    mindfulAnswer: "Alex helped unblock the build",
    mindfulDismissed: false
  });
  b.dispatch("checkIns");
  expect(b.store.checkInFor("2026-03-09")).toMatchObject({
    checkInPerson: "Sam",
    checkInPersonTaskId: "task-1",
    recharge: "Sunday walk without phone",
    mindfulPrompt: MINDFUL_PROMPTS[1],
    mindfulAnswer: "Alex helped unblock the build",
    mindfulDismissed: false
  });
});
