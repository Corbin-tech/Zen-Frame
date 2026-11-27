import { beforeEach, expect, test } from "vitest";
import { importBackup, loadJson } from "../src/lib/storage";
import { initPomoStore } from "../src/stores/pomoStore";

beforeEach(() => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: key => { data.delete(key); }
  } as Storage;
});

const at = "2026-01-01T10:00:00.000Z";
for (const path of ["load", "import"]) {
  function read(key: string, value: unknown): any {
    const json = JSON.stringify(value);
    if (path === "import") {
      expect(importBackup(`{"app":"zen-frame","version":1,"data":{"${key}":${json}}}`).ok).toBe(true);
      return JSON.parse(localStorage.getItem(key)!);
    }
    localStorage.setItem(key, json);
    if (key === "pomoSessions") {
      const store = initPomoStore();
      store.loadState();
      return store.sessions;
    }
    return loadJson(key, null);
  }

  for (const bad of [null, false, 42, {}, [], "", "not-a-date"]) {
    test(`${path}: rejects deferred start ${JSON.stringify(bad)}`, () => {
      expect(read("todos", [{ id: "a", startedAt: at, zenDeferredStart: bad }])[0].zenDeferredStart).toBeUndefined();
    });
  }
  for (const bad of [NaN, Infinity, -1, "15", null, {}, false]) {
    test(`${path}: defaults invalid planning gap ${JSON.stringify(bad)}`, () => {
      expect(read("planning", { gap: bad }).gap).toBe(15);
    });
  }
  for (const bad of [null, {}, "sessions", 1]) {
    test(`${path}: defaults non-array sessions ${JSON.stringify(bad)}`, () => {
      if (path === "import") {
        expect(importBackup(JSON.stringify({ app: "zen-frame", version: 1,
          data: { pomoSessions: bad } }))).toEqual({
          ok: false, error: 'Invalid "pomoSessions" data in backup.'
        });
        return;
      }
      expect(read("pomoSessions", bad)).toEqual([]);
    });
  }
  test(`${path}: drops malformed sessions and preserves valid ones`, () => {
    const good = { completedAt: at, minutes: 25 };
    expect(read("pomoSessions", [null, 1, {}, { completedAt: at }, { minutes: 25 },
      { completedAt: 1, minutes: 25 }, { completedAt: "invalid", minutes: 25 },
      ...[NaN, Infinity, -1, 0, "25"].map(minutes => ({ completedAt: at, minutes })), good])).toEqual([good]);
  });
  test(`${path}: keeps valid task links on sessions and drops bad ones`, () => {
    const linked = { completedAt: at, minutes: 25, taskId: "t1", taskTitle: "Write", clusterId: null, clusterName: "Work" };
    expect(read("pomoSessions", [linked])).toEqual([linked]);
    expect(read("pomoSessions", [{ completedAt: at, minutes: 25, taskId: 5, taskTitle: { html: "<b>" },
      clusterId: ["c"], clusterName: "x".repeat(500), extra: "dropped" }])).toEqual([
      { completedAt: at, minutes: 25, clusterName: "x".repeat(200) }]);
    expect(read("pomoSessions", [{ completedAt: at, minutes: 25, taskTitle: null }])).toEqual([
      { completedAt: at, minutes: 25 }]);
  });
  test(`${path}: gives every todo a string title`, () => {
    const todos = read("todos", [{ id: "missing", text: "Ship a feature" }, { id: "null", todo: null },
      { id: "number", todo: 42 }, { id: "object", todo: {} }, { id: "valid", todo: "Write" }]);
    expect(todos.map((todo: { todo: unknown }) => todo.todo)).toEqual(["", "", "", "", "Write"]);
  });
  test(`${path}: normalizes existing todo fields and keeps valid values`, () => {
    const [todo] = read("todos", [{ id: "a", zenDeferredStart: at, estimateMinutes: -1,
      steps: [{ text: "step", id: "s", done: true }] }]);
    expect(todo).toMatchObject({ parentId: null, zenDeferredStart: at, estimateMinutes: null });
    expect(todo).not.toHaveProperty("steps");
    expect(read("planning", { gap: 0 }).gap).toBe(0);
    expect(read("pomoSessions", [])).toEqual([]);
  });
  test(`${path}: normalizes check-in entries and drops malformed ones`, () => {
    const result = read("checkIns", {
      "2026-03-02": { week: "2026-03-02", energy: 4, wins: "Shipped", savedAt: at },
      "2026-03-09": { energy: "high", mindfulDismissed: "yes", checkInPersonTaskId: 42, mindfulPrompt: 7, mindfulAnswer: null, recharge: 5 },
      malformed: 42
    });
    expect(result["2026-03-02"]).toMatchObject({
      week: "2026-03-02", energy: 4, wins: "Shipped", savedAt: at,
      checkInPerson: "", checkInPersonTaskId: null, recharge: "",
      mindfulPrompt: "", mindfulAnswer: "", mindfulDismissed: false
    });
    expect(result["2026-03-09"]).toMatchObject({
      week: "2026-03-09", energy: 0, mindfulDismissed: false,
      checkInPersonTaskId: null, mindfulPrompt: "", mindfulAnswer: "", recharge: ""
    });
    expect(result.malformed).toBeUndefined();
  });
  test(`${path}: drops malformed scheduledItems and normalizes repeat fields`, () => {
    const oneOff = { id: "b1", taskId: "t1", date: "2026-03-02", startTimeMinutes: 540, endTimeMinutes: 600 };
    const repeating = {
      id: "b2", taskId: "t2", date: "2026-03-02", startTimeMinutes: 600, endTimeMinutes: 660,
      repeat: { weekdays: [1, 3, 5], until: "2026-04-01", doneDates: ["2026-03-02"] }
    };
    const dirtyRepeat = {
      id: "b3", taskId: "t3", date: "2026-03-02", startTimeMinutes: 700, endTimeMinutes: 760,
      repeat: { weekdays: [1, 9, -1, 1.5, "2"], until: "bad-date", doneDates: ["2026-03-02", null, "nope"] }
    };
    const nonObjectRepeat = {
      id: "b4", taskId: "t4", date: "2026-03-02", startTimeMinutes: 800, endTimeMinutes: 860,
      repeat: "daily"
    };
    expect(read("scheduledItems", [
      null, 1, "x", [], {},
      { id: "", taskId: "t1", date: "2026-03-02", startTimeMinutes: 540, endTimeMinutes: 600 },
      { id: "missing-task", date: "2026-03-02", startTimeMinutes: 540, endTimeMinutes: 600 },
      { id: "bad-date", taskId: "t1", date: "not-a-date", startTimeMinutes: 540, endTimeMinutes: 600 },
      { id: "bad-time", taskId: "t1", date: "2026-03-02", startTimeMinutes: 600, endTimeMinutes: 540 },
      { id: "out-of-range", taskId: "t1", date: "2026-03-02", startTimeMinutes: -1, endTimeMinutes: 600 },
      { id: "over-day", taskId: "t1", date: "2026-03-02", startTimeMinutes: 540, endTimeMinutes: 1441 },
      oneOff, repeating, dirtyRepeat, nonObjectRepeat
    ])).toEqual([
      oneOff,
      repeating,
      {
        id: "b3", taskId: "t3", date: "2026-03-02", startTimeMinutes: 700, endTimeMinutes: 760,
        repeat: { weekdays: [1], until: null, doneDates: ["2026-03-02"] }
      },
      { id: "b4", taskId: "t4", date: "2026-03-02", startTimeMinutes: 800, endTimeMinutes: 860 }
    ]);
  });
  test(`${path}: drops non-string skippedClusters and malformed history entries`, () => {
    expect(read("skippedClusters", [null, 42, "", {}, "c1"])).toEqual(["c1"]);
    // A history record without a real `at` timestamp would break the init sort and day keys
    expect(read("history", [
      null, 1, {}, { taskId: "" }, { taskId: "no-time" }, { taskId: "number-time", at: 5 }, { taskId: "bad-time", at: "soon" },
      { taskId: "t1", at }
    ])).toEqual([{ taskId: "t1", at }]);
  });
}

test("load: a __proto__ week key in checkIns is dropped, not set as the prototype", () => {
  localStorage.setItem("checkIns", '{"__proto__":{"week":"x","polluted":true},"2026-03-02":{"week":"2026-03-02"}}');
  const result = loadJson<Record<string, unknown>>("checkIns", {});
  expect(Object.keys(result)).toEqual(["2026-03-02"]);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect((result as { polluted?: unknown }).polluted).toBeUndefined();
});

test("load: a non-object checkIns value reads as an empty object", () => {
  localStorage.setItem("checkIns", JSON.stringify([1, "x"]));
  expect(loadJson("checkIns", null)).toEqual({});
});

test("import: a non-object checkIns backup is rejected", () => {
  expect(importBackup(JSON.stringify({ app: "zen-frame", version: 1, data: { checkIns: [1] } })))
    .toEqual({ ok: false, error: 'Invalid "checkIns" data in backup.' });
});

test("import: crafted backup with null scheduledItems does not persist null entries", () => {
  const result = importBackup(JSON.stringify({ app: "zen-frame", version: 1, data: { scheduledItems: [null] } }));
  expect(result).toEqual({ ok: true, count: 1 });
  expect(JSON.parse(localStorage.getItem("scheduledItems")!)).toEqual([]);
});
