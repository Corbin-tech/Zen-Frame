import { afterEach, expect, test, vi } from "vitest";
import { initGoalsStore } from "../src/stores/goalsStore";

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
