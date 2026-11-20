import { afterEach, expect, test, vi } from "vitest";
import { initPomoStore } from "../src/stores/pomoStore";
import { UNDO_TOAST_MS } from "../src/lib/notifications";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

test.each(["completed", "deleted", "paused", "reloaded", "expired", "reset", "general", "undo", "switch", "same-task", "switch-undo", "switch-general"])("focus attribution when %s", (scenario) => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  const taskA = { id: "a", todo: "Task A", parentId: "cluster-a", completed: false };
  const taskB = { id: "b", todo: "Task B", parentId: "cluster-b", completed: false };
  const todos = { nextTask: taskA, find: (id: string) => [taskA, taskB].find(task => task.id === id), clusterName: (id: string) => id };
  vi.stubGlobal("window", { addEventListener: vi.fn(), Alpine: { store: (name: string) => name === "todos" ? todos : {} }, dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});
  vi.stubGlobal("document", { addEventListener: vi.fn() });
  let store = initPomoStore();
  store.setTask(scenario === "general" ? "" : "a");
  store.startTimer();
  vi.advanceTimersByTime(1000);
  taskA.completed = true;
  todos.nextTask = taskB;
  if (["switch", "same-task", "switch-undo", "switch-general"].includes(scenario)) {
    store.pauseTimer();
    store.startFocus(scenario === "same-task" ? "a" : scenario === "switch-general" ? "" : "b");
    expect(store.timeLeft).toBe(scenario === "same-task" ? store.totalTime - 1 : store.totalTime);
    if (scenario === "switch-undo") store.restoreSnapshot();
  }
  if (scenario === "deleted") todos.find = () => undefined;
  if (scenario === "paused") { store.pauseTimer(); store.startTimer(); }
  if (scenario === "undo") { store.resetTimer(true); store.restoreSnapshot(); }
  if (scenario === "reset") { store.resetTimer(); store.startTimer(); }
  if (scenario === "reloaded" || scenario === "expired") {
    vi.clearAllTimers();
    if (scenario === "expired") vi.setSystemTime(Date.now() + store.totalTime * 1000);
    store = initPomoStore();
    store.init();
  }
  const general = scenario === "general" || scenario === "switch-general";
  const switched = scenario === "reset" || scenario === "switch";
  if (scenario !== "expired") expect(store.activeTaskId).toBe(general ? "" : switched ? "b" : "a");
  if (scenario === "switch-undo") store.startTimer();
  vi.advanceTimersByTime(store.totalTime * 1000);
  if (general) {
    expect(store.sessions).toEqual([{ completedAt: expect.any(String), minutes: 25 }]);
  } else {
    const id = switched ? "b" : "a";
    expect(store.sessions).toEqual([expect.objectContaining({ taskId: id, clusterId: `cluster-${id}`, minutes: 25 })]);
  }
});

test.each([
  { name: "dialog hidden by its backdrop", visible: false, tab: "pomodoro", starts: true },
  { name: "visible dialog", visible: true, tab: "pomodoro", starts: false },
  { name: "no dialogs", visible: null, tab: "pomodoro", starts: true },
  { name: "hidden dialog in Zen mode", visible: false, tab: "zenmode", starts: true },
  { name: "unrelated tab", visible: false, tab: "dashboard", starts: false },
])("Space respects $name", ({ visible, tab, starts }) => {
  let keydown: (event: unknown) => void = () => {};
  const dialog = visible === null ? null : { checkVisibility: () => visible };
  vi.stubGlobal("document", {
    addEventListener: (_: string, listener: typeof keydown) => { keydown = listener; },
    querySelector: () => dialog,
    querySelectorAll: () => dialog ? [dialog] : [],
  });
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === "activeTab" ? tab : null });
  vi.stubGlobal("sessionStorage", { getItem: () => null });
  vi.stubGlobal("window", { addEventListener: vi.fn(), Alpine: { store: () => ({ zenShowTimer: true }) } });
  const store = initPomoStore();
  const start = vi.spyOn(store, "startTimer").mockImplementation(() => {});
  const pause = vi.spyOn(store, "pauseTimer").mockImplementation(() => {});
  store.init();
  const preventDefault = vi.fn();
  keydown({ code: "Space", target: { closest: () => null }, preventDefault });
  expect(start).toHaveBeenCalledTimes(starts ? 1 : 0);
  expect(preventDefault).toHaveBeenCalledTimes(starts ? 1 : 0);
  if (starts) {
    store.isRunning = true;
    keydown({ code: "Space", target: { closest: () => null }, preventDefault });
    expect(pause).toHaveBeenCalledOnce();
  }
});

test("Undo stays available for as long as the toast shows its button", () => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("window", { addEventListener: vi.fn(), Alpine: { store: () => ({}) }, dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});
  const store = initPomoStore();
  store.skipPhase();
  expect(store.isBreak).toBe(true);
  vi.advanceTimersByTime(UNDO_TOAST_MS - 1000); // past the old 8-second window
  store.restoreSnapshot();
  expect(store.isBreak).toBe(false);
  store.skipPhase();
  vi.advanceTimersByTime(UNDO_TOAST_MS);
  store.restoreSnapshot(); // the toast is gone, so the snapshot is too
  expect(store.isBreak).toBe(true);
});
