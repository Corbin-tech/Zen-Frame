import { test } from "vitest";
const assert = {
  equal<T>(actual: T, expected: T): void {
    if (!Object.is(actual, expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  },
  deepEqual(actual: unknown, expected: unknown): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
};

// Minimal browser globals for testing pomoStore under Node type stripping
const storage = new Map<string, string>();
const dispatched: Array<{ type: string; detail: unknown }> = [];

(globalThis as unknown as Record<string, unknown>).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); }
};

(globalThis as unknown as Record<string, unknown>).window = {
  Alpine: { store: () => ({}) },
  dispatchEvent: (event: { type: string; detail?: unknown }) => {
    dispatched.push({ type: event.type, detail: event.detail });
    return true;
  },
  notify: () => {}
};

(globalThis as unknown as Record<string, unknown>).CustomEvent = class {
  type: string;
  detail: unknown;
  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
};

test("cycles, long breaks, undo, custom lengths and task linking", async () => {
  const { initPomoStore, CYCLE_LENGTH, POMO_DURATIONS } = await import("../src/stores/pomoStore");

  // 1. Cycle progression: 4 focus blocks trigger a long break, then reset to 0
  const store = initPomoStore();
  store.loadState();
  store.resetTimer();

  assert.equal(store.cycle, 0);
  assert.equal(store.completedInCycle, 0);
  assert.equal(store.isLongBreak, false);
  assert.equal(store.statusLabel, "Next: 5 min break");

  for (let i = 1; i <= CYCLE_LENGTH - 1; i++) {
    store.completeTimer(); // finish focus #i
    assert.equal(store.isBreak, true);
    assert.equal(store.isLongBreak, false);
    assert.equal(store.cycle, i);
    assert.equal(store.completedInCycle, i);
    assert.equal(store.totalTime, POMO_DURATIONS.pomodoro.break * 60);

    store.completeTimer(); // finish short break #i
    assert.equal(store.isBreak, false);
    assert.equal(store.isLongBreak, false);
    assert.equal(store.cycle, i);
  }

  // On the 4th focus block, statusLabel previews the long break
  assert.equal(store.statusLabel, "Next: 15 min long break");

  store.completeTimer(); // finish focus #4 -> long break
  assert.equal(store.isBreak, true);
  assert.equal(store.isLongBreak, true);
  assert.equal(store.cycle, 0);
  assert.equal(store.completedInCycle, CYCLE_LENGTH);
  assert.equal(store.totalTime, POMO_DURATIONS.pomodoro.longBreak * 60);
  assert.equal(store.lastCompleted?.minutes, 25);

  // 2. Undo restores cycle and isLongBreak when skipping a long break
  store.skipPhase();
  assert.equal(store.isBreak, false);
  assert.equal(store.isLongBreak, false);
  assert.equal(store.completedInCycle, 0);
  store.restoreSnapshot();
  assert.equal(store.isBreak, true);
  assert.equal(store.isLongBreak, true);
  assert.equal(store.completedInCycle, CYCLE_LENGTH);

  // Finishing the long break returns to a fresh cycle
  store.completeTimer();
  assert.equal(store.isBreak, false);
  assert.equal(store.isLongBreak, false);
  assert.equal(store.cycle, 0);
  assert.equal(store.completedInCycle, 0);

  // 3. Long preset uses 25 min long break
  store.setPreset("long", false);
  store.cycle = CYCLE_LENGTH - 1;
  assert.equal(store.statusLabel, "Next: 25 min long break");
  store.completeTimer();
  assert.equal(store.isLongBreak, true);
  assert.equal(store.totalTime, POMO_DURATIONS.long.longBreak * 60);

  // 4. loadState() validates out-of-range cycle and mismatched isLongBreak
  storage.set("pomoState", JSON.stringify({ preset: "pomodoro", isBreak: false, cycle: 99, isLongBreak: true }));
  storage.set("pomoSessions", JSON.stringify("corrupted"));
  const fresh = initPomoStore();
  fresh.loadState();
  assert.equal(fresh.cycle, 0);
  assert.equal(fresh.isLongBreak, false);
  assert.deepEqual(fresh.sessions, []);

  storage.set("pomoState", JSON.stringify({ preset: "pomodoro", isBreak: true, cycle: 2, isLongBreak: true }));
  fresh.loadState();
  assert.equal(fresh.cycle, 2);
  assert.equal(fresh.isLongBreak, true);
  assert.equal(fresh.completedInCycle, CYCLE_LENGTH);

  // 5. Custom lengths: validation, active-phase reset with undo, and persistence
  store.setPreset("custom", false);
  store.isBreak = false;
  store.isLongBreak = false;
  store.resetTimer();
  assert.equal(store.totalTime, 30 * 60);

  store.setCustomDuration("work", 40, false);
  assert.equal(store.custom.work, 40);
  assert.equal(store.totalTime, 40 * 60);

  // Editing break while in Focus does not disturb remaining focus time
  store.timeLeft = 1000;
  store.setCustomDuration("break", 8, true);
  assert.equal(store.custom.break, 8);
  assert.equal(store.custom.longBreak, 24);
  assert.equal(store.timeLeft, 1000);

  // Editing work while Focus is started resets with an undo snapshot
  store.setCustomDuration("work", 45, true);
  assert.equal(store.custom.work, 45);
  assert.equal(store.totalTime, 45 * 60);
  store.restoreSnapshot();
  assert.equal(store.custom.work, 40);
  assert.equal(store.timeLeft, 1000);

  // Clamping & reload validation for custom durations
  store.setCustomDuration("work", 999, false);
  assert.equal(store.custom.work, 180);
  store.setCustomDuration("break", 0, false);
  assert.equal(store.custom.break, 8); // invalid <= 0 keeps previous value

  storage.set("pomoState", JSON.stringify({ preset: "custom", custom: { work: 35, break: 7, longBreak: 21 } }));
  fresh.loadState();
  assert.equal(fresh.preset, "custom");
  assert.equal(fresh.custom.work, 35);
  assert.equal(fresh.custom.break, 7);
  assert.equal(fresh.custom.longBreak, 21);

  // 6. Task linking: defaults to Up next, supports explicit task or none, logs taskId/cluster on FocusSession
  const mockTasks = [
    { id: "t1", todo: "Draft proposal", parentId: "c1", completed: false, isCluster: false },
    { id: "t2", todo: "Review slides", parentId: null, completed: false, isCluster: false }
  ];
  (globalThis as unknown as { window: { Alpine: { store: (name: string) => unknown } } }).window.Alpine.store = (name: string) => {
    if (name === "todos") {
      return {
        nextTask: mockTasks[0],
        find: (id: string) => mockTasks.find(t => t.id === id),
        clusterName: (id: string | null) => (id === "c1" ? "Work" : "")
      };
    }
    return {};
  };

  const linked = initPomoStore();
  linked.loadState();
  linked.setTask(null);
  assert.equal(linked.activeTaskId, "t1");

  linked.setTask("t2");
  assert.equal(linked.activeTaskId, "t2");

  // Each completion gets its own end time: sessions with the same completedAt are deduplicated
  linked.isBreak = false;
  linked.completeTimer(Date.UTC(2026, 0, 1, 9));
  const lastSession = linked.sessions[linked.sessions.length - 1];
  assert.equal(lastSession.taskId, "t2");
  assert.equal(lastSession.taskTitle, "Review slides");
  assert.equal(lastSession.clusterId, null);

  // Explicit "no specific task" omits taskId
  linked.setTask("");
  assert.equal(linked.activeTaskId, "");
  linked.isBreak = false;
  linked.completeTimer(Date.UTC(2026, 0, 1, 10));
  const unlinkedSession = linked.sessions[linked.sessions.length - 1];
  assert.equal(unlinkedSession.taskId, undefined);

  // Completed selected task falls back to Up next (t1, cluster Work)
  linked.setTask("t2");
  mockTasks[1].completed = true;
  assert.equal(linked.activeTaskId, "t1");
  linked.isBreak = false;
  linked.completeTimer(Date.UTC(2026, 0, 1, 11));
  const fallbackSession = linked.sessions[linked.sessions.length - 1];
  assert.equal(fallbackSession.taskId, "t1");
  assert.equal(fallbackSession.clusterId, "c1");
  assert.equal(fallbackSession.clusterName, "Work");
});
