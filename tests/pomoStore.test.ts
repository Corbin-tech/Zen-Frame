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
  { name: "dialog hidden by its backdrop", dialogVisible: false, timer: "pomodoro", timerVisible: true, starts: true },
  { name: "visible dialog", dialogVisible: true, timer: "pomodoro", timerVisible: true, starts: false },
  { name: "no dialogs", dialogVisible: null, timer: "pomodoro", timerVisible: true, starts: true },
  { name: "hidden dialog in Next step", dialogVisible: false, timer: "zenmode", timerVisible: true, starts: true },
  { name: "Next step with no next task", dialogVisible: false, timer: "zenmode", timerVisible: true, hasNext: false, starts: false },
  { name: "hidden timer on another view", dialogVisible: false, timer: "pomodoro", timerVisible: false, starts: false },
  { name: "no timer in the page (e.g. /principles)", dialogVisible: null, timer: null, timerVisible: false, starts: false },
  { name: "Shift+Space", dialogVisible: null, timer: "pomodoro", timerVisible: true, shiftKey: true, starts: false },
])("Space respects $name", ({ dialogVisible, timer, timerVisible, hasNext = true, shiftKey = false, starts }) => {
  let keydown: (event: unknown) => void = () => {};
  const dialog = dialogVisible === null ? null : { checkVisibility: () => dialogVisible };
  const timerEl = timer === null ? null : { dataset: { pomoTimer: timer }, checkVisibility: () => timerVisible };
  vi.stubGlobal("document", {
    addEventListener: (_: string, listener: typeof keydown) => { keydown = listener; },
    querySelectorAll: (selector: string) => {
      if (selector === "[role='dialog']") return dialog ? [dialog] : [];
      if (selector === "[data-pomo-timer]") return timerEl ? [timerEl] : [];
      return [];
    },
  });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    Alpine: { store: (name: string) => name === "todos" ? { nextTask: hasNext ? { id: "t1" } : null } : {} },
  });
  const store = initPomoStore();
  const start = vi.spyOn(store, timer === "zenmode" ? "startFocus" : "startTimer").mockImplementation(() => {});
  const pause = vi.spyOn(store, "pauseTimer").mockImplementation(() => {});
  store.init();
  const preventDefault = vi.fn();
  keydown({ code: "Space", shiftKey, target: { closest: () => null }, preventDefault });
  expect(start).toHaveBeenCalledTimes(starts ? 1 : 0);
  if (starts && timer === "zenmode") expect(start).toHaveBeenCalledWith("t1");
  expect(preventDefault).toHaveBeenCalledTimes(starts ? 1 : 0);
  if (starts) {
    store.isRunning = true;
    keydown({ code: "Space", shiftKey, target: { closest: () => null }, preventDefault });
    expect(pause).toHaveBeenCalledOnce();
  }
});

test("Space in Next step starts focus for the shown task rather than a previously paused one", () => {
  vi.useFakeTimers();
  let keydown: (event: unknown) => void = () => {};
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("document", {
    addEventListener: (_: string, listener: typeof keydown) => { keydown = listener; },
    querySelectorAll: (selector: string) => selector === "[data-pomo-timer]" ? [{ dataset: { pomoTimer: "zenmode" }, checkVisibility: () => true }] : [],
  });
  const taskA = { id: "a", todo: "Task A", parentId: null, completed: false };
  const taskB = { id: "b", todo: "Task B", parentId: null, completed: false };
  const todos = { nextTask: taskA, find: (id: string) => [taskA, taskB].find(t => t.id === id), clusterName: () => "" };
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    Alpine: { store: (name: string) => name === "todos" ? todos : {} },
  });
  vi.stubGlobal("CustomEvent", class {});
  const store = initPomoStore();
  store.init();
  store.startFocus("a");
  vi.advanceTimersByTime(2000);
  store.pauseTimer();
  expect(store.focusTask?.id).toBe("a");

  todos.nextTask = taskB;
  keydown({ code: "Space", target: { closest: () => null }, preventDefault: vi.fn() });
  expect(store.isRunning).toBe(true);
  expect(store.focusTask?.id).toBe("b");
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

test.each([null, "a"])("Undo after switching tasks restores selectedTaskId (%s)", (initialSelection) => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  const taskA = { id: "a", todo: "Task A", parentId: null, completed: false };
  const taskB = { id: "b", todo: "Task B", parentId: null, completed: false };
  const todos = { nextTask: taskA, find: (id: string) => [taskA, taskB].find(task => task.id === id), clusterName: () => "" };
  vi.stubGlobal("window", { addEventListener: vi.fn(), Alpine: { store: (name: string) => name === "todos" ? todos : {} }, dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});
  const store = initPomoStore();
  if (initialSelection !== null) store.setTask(initialSelection);
  store.startTimer();
  vi.advanceTimersByTime(2000);

  store.startFocus("b");
  expect(store.selectedTaskId).toBe("b");
  expect(store.activeTaskId).toBe("b");

  store.restoreSnapshot();
  expect(store.selectedTaskId).toBe(initialSelection);
  expect(store.activeTaskId).toBe("a");
  expect(JSON.parse(data.get("pomoState")!).selectedTaskId).toBe(initialSelection);

  // Once the restored focus block resets, activeTaskId should still follow the restored selection, not "b".
  store.resetTimer();
  expect(store.activeTaskId).toBe("a");
});
