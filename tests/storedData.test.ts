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
  test(`${path}: normalizes existing todo fields and keeps valid values`, () => {
    const [todo] = read("todos", [{ id: "a", zenDeferredStart: at, estimateMinutes: -1,
      steps: [null, { text: "step", id: "s", done: "yes", minutes: -1 }] }]);
    expect(todo).toMatchObject({ parentId: null, zenDeferredStart: at, estimateMinutes: null,
      steps: [{ id: "s", text: "step", done: false, minutes: null }] });
    expect(read("planning", { gap: 0 }).gap).toBe(0);
    expect(read("pomoSessions", [])).toEqual([]);
  });
}
