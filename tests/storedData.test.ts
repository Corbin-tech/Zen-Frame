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
    expect(read("history", [null, 1, {}, { taskId: "" }, { taskId: "t1", at }])).toEqual([
      { taskId: "t1", title: "", clusterId: null, clusterName: "", dueDate: null, at }
    ]);
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

// Security regression (audit 2026-11-27): string methods are called on stored fields
// (history.at in the localeCompare sorts, note.createdAt in sortedNotes, todo.dueDate in
// the overdue sort), so every one of them must be schema-validated on load AND on import.
for (const path of ["load", "import"]) {
  function read(key: string, value: unknown): any {
    const json = JSON.stringify(value);
    if (path === "import") {
      expect(importBackup(`{"app":"zen-frame","version":1,"data":{"${key}":${json}}}`).ok).toBe(true);
      return JSON.parse(localStorage.getItem(key)!);
    }
    localStorage.setItem(key, json);
    return loadJson(key, null);
  }

  test(`${path}: history entries without a real timestamp are dropped whole`, () => {
    expect(read("history", [
      { taskId: "a", at }, // valid
      { taskId: "b", at: 123 }, // numeric at would throw in the sorts
      { taskId: "c", at: "not a date" },
      { taskId: "d" },
      { at: 123 }
    ])).toEqual([{ taskId: "a", title: "", clusterId: null, clusterName: "", dueDate: null, at }]);
  });

  test(`${path}: history text fields are coerced and dueDate must be a date key`, () => {
    const [record] = read("history", [{
      taskId: "a", at, title: 42, clusterName: null, clusterId: 7, dueDate: 20261127, blockId: 5
    }]);
    expect(record).toEqual({ taskId: "a", title: "", clusterId: null, clusterName: "", dueDate: null, at });
    const [dated] = read("history", [{ taskId: "a", at, dueDate: "2026-03-02", blockId: "b1" }]);
    expect(dated).toMatchObject({ dueDate: "2026-03-02", blockId: "b1" });
  });

  test(`${path}: notes are schema-validated (string id/text, boolean pinned, timestamps)`, () => {
    const notes = read("notes", [
      { id: "n1", text: "hello", pinned: 1, createdAt: at, updatedAt: 5 },
      { id: 2, text: "numeric id" },
      { text: "missing id" },
      "junk",
      { id: "n2", text: 42 }
    ]);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toEqual({ id: "n1", text: "hello", pinned: false, createdAt: at, updatedAt: expect.any(String) });
    expect(notes[1]).toMatchObject({ id: "n2", text: "", pinned: false });
  });

  test(`${path}: planning availability windows must be well-formed or they are dropped`, () => {
    const planning = read("planning", {
      availability: [
        { id: "w1", weekdays: [1, 2, 3], start: 540, end: 1260 }, // valid
        { id: "w2", weekdays: 5, start: 0, end: 100 }, // weekdays not an array
        { id: "w3", weekdays: [7], start: 0, end: 100 }, // weekday out of 0-6
        { id: "w4", weekdays: [1], start: 200, end: 100 }, // end <= start
        { id: "w5", weekdays: [1], start: 0, end: 1441 }, // past midnight
        { id: "w6", weekdays: [1], start: "9", end: 100 }, // string time
        { weekdays: [1], start: 0, end: 100 } // no id
      ],
      duration: "2 hours",
      gap: Number.NaN
    });
    expect(planning.availability).toEqual([{ id: "w1", weekdays: [1, 2, 3], start: 540, end: 1260 }]);
    expect(planning.duration).toBe(45);
    expect(planning.gap).toBe(15);
    expect(read("planning", { duration: 99999 }).duration).toBe(1440);
  });

  test(`${path}: todo dueDate/focusDate must be date keys; anything else becomes null`, () => {
    const todos = read("todos", [
      { id: "t1", todo: "ok", dueDate: "2026-03-02", focusDate: 123 },
      { id: "t2", todo: "bad", dueDate: 20260302 },
      { id: "t3", todo: "nan", dueDate: "NaN-NaN-NaN" }
    ]);
    expect(todos.map((todo: any) => [todo.dueDate, todo.focusDate])).toEqual([
      ["2026-03-02", null],
      [null, null],
      [null, null]
    ]);
  });
}

test("load: __proto__ keys inside todos never pollute the prototype", () => {
  localStorage.setItem("todos", '[{"id":"t","todo":"x","__proto__":{"polluted":true}}]');
  const [todo] = loadJson<any[]>("todos", []);
  expect(todo.polluted).toBeUndefined();
  expect(Object.getPrototypeOf(todo)).toBe(Object.prototype);
});

test("import: a crafted backup restores only normalized values end to end", () => {
  const result = importBackup(JSON.stringify({
    app: "zen-frame",
    version: 1,
    data: {
      todos: [{ id: "t1", todo: "Task", dueDate: 42 }],
      history: [{ taskId: "t1", at: 123 }],
      notes: [{ id: 7, text: "x" }, { id: "n1", text: "ok", pinned: false, createdAt: at, updatedAt: at }],
      planning: { availability: [{ id: "w", weekdays: "nope" }], duration: -5 },
      checkIns: JSON.parse('{"__proto__":{"energy":9},"2026-03-02":{"energy":"high","wins":5}}'),
      theme: "dark"
    }
  }));
  expect(result).toEqual({ ok: true, count: 6 });
  expect(loadJson<any[]>("todos", [])[0].dueDate).toBeNull();
  expect(loadJson("history", [])).toEqual([]);
  expect(loadJson<any[]>("notes", []).map(note => note.id)).toEqual(["n1"]);
  expect(loadJson<any>("planning", {})).toMatchObject({ availability: [], duration: 45, gap: 15 });
  const checkIns = loadJson<Record<string, any>>("checkIns", {});
  expect(Object.hasOwn(checkIns, "__proto__")).toBe(false);
  expect(checkIns["2026-03-02"]).toMatchObject({ energy: 0, wins: "" });
});
