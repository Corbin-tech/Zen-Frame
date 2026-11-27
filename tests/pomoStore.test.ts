import { afterEach, expect, test, vi } from "vitest";
import { BREATH_COUNT, BREATH_PHASE_MS, initPomoStore } from "../src/stores/pomoStore";
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

test.each([
  { seconds: 25 * 60, minutesText: "25", secondsText: "00", formattedTime: "25:00", digits: "2500" },
  { seconds: 5 * 60 + 9, minutesText: "05", secondsText: "09", formattedTime: "05:09", digits: "0509" },
  { seconds: 99 * 60 + 59, minutesText: "99", secondsText: "59", formattedTime: "99:59", digits: "9959" },
  { seconds: 100 * 60, minutesText: "100", secondsText: "00", formattedTime: "100:00", digits: "10000" },
  { seconds: 125 * 60 + 4, minutesText: "125", secondsText: "04", formattedTime: "125:04", digits: "12504" },
  { seconds: 180 * 60, minutesText: "180", secondsText: "00", formattedTime: "180:00", digits: "18000" },
])("formats $formattedTime cleanly for 2- and 3-digit durations", ({ seconds, minutesText, secondsText, formattedTime, digits }) => {
  const store = initPomoStore();
  store.timeLeft = seconds;
  expect(store.minutesText).toBe(minutesText);
  expect(store.secondsText).toBe(secondsText);
  expect(store.formattedTime).toBe(formattedTime);
  expect(store.digits).toBe(digits);
});

test("breathing start runs 3 breaths before focus when enabled, and skips on resume or break", () => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  const settings = { pomoBreathingStart: true };
  const task = { id: "a", todo: "Read chapter", parentId: null, completed: false };
  const todos = { nextTask: task, find: (id: string) => id === "a" ? task : undefined, clusterName: () => "" };
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matchMedia: () => ({ matches: false }),
    Alpine: { store: (name: string) => name === "settings" ? settings : name === "todos" ? todos : {} },
  });
  vi.stubGlobal("CustomEvent", class {});
  const store = initPomoStore();

  // Fresh focus start enters breathing state instead of running immediately
  store.startTimer();
  expect(store.isBreathing).toBe(true);
  expect(store.isRunning).toBe(false);
  expect(store.breathNumber).toBe(1);
  expect(store.breathPhase).toBe("in");
  expect(store.breathPrompt).toBe("Breathe in");

  // Step through all 3 breaths (in + out each)
  for (let b = 1; b <= BREATH_COUNT; b++) {
    expect(store.breathNumber).toBe(b);
    expect(store.breathPhase).toBe("in");
    vi.advanceTimersByTime(BREATH_PHASE_MS);
    expect(store.breathPhase).toBe("out");
    expect(store.breathPrompt).toBe("Breathe out");
    vi.advanceTimersByTime(BREATH_PHASE_MS);
  }

  // Focus timer starts automatically after breath 3 exhale
  expect(store.isBreathing).toBe(false);
  expect(store.isRunning).toBe(true);
  expect(store.focusTask?.id).toBe("a");

  // Pausing and resuming does not trigger breathing again
  vi.advanceTimersByTime(2000);
  store.pauseTimer();
  store.startTimer();
  expect(store.isBreathing).toBe(false);
  expect(store.isRunning).toBe(true);

  // Starting a break does not trigger breathing
  store.toggleBreak(false);
  store.startTimer();
  expect(store.isBreathing).toBe(false);
  expect(store.isRunning).toBe(true);
});

test("breathing start can be skipped or cancelled, and stays static under reduced motion", () => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  let reducedMotion = false;
  const settings = { pomoBreathingStart: true };
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matchMedia: () => ({ matches: reducedMotion }),
    Alpine: { store: (name: string) => name === "settings" ? settings : {} },
  });
  const store = initPomoStore();

  // Cancel leaves timer idle and unlocks focusTask
  store.startTimer();
  expect(store.isBreathing).toBe(true);
  store.cancelBreathing();
  expect(store.isBreathing).toBe(false);
  expect(store.isRunning).toBe(false);
  expect(store.focusTask).toBeUndefined();

  // Skip starts focus immediately
  store.startTimer();
  store.skipBreathing();
  expect(store.isBreathing).toBe(false);
  expect(store.isRunning).toBe(true);

  // Reduced motion shows static prompt and does not auto-advance
  store.resetTimer();
  reducedMotion = true;
  store.startTimer();
  expect(store.isBreathing).toBe(true);
  expect(store.breathingReducedMotion).toBe(true);
  expect(store.breathPrompt).toBe("Take three slow breaths.");
  vi.advanceTimersByTime(BREATH_COUNT * BREATH_PHASE_MS * 2);
  expect(store.isBreathing).toBe(true);
  expect(store.isRunning).toBe(false);
  store.skipBreathing();
  expect(store.isBreathing).toBe(false);
  expect(store.isRunning).toBe(true);
});

test("cancelling breathing after startFocus during a paused break restores the paused break", () => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  const settings = { pomoBreathingStart: true };
  const task = { id: "a", todo: "Task A", parentId: null, completed: false };
  const todos = { nextTask: task, find: (id: string) => id === "a" ? task : undefined, clusterName: () => "" };
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matchMedia: () => ({ matches: false }),
    Alpine: { store: (name: string) => name === "settings" ? settings : name === "todos" ? todos : {} },
  });
  vi.stubGlobal("CustomEvent", class {});
  const store = initPomoStore();

  // Start a break, let 30s elapse, and pause it
  store.toggleBreak(false);
  store.startTimer();
  vi.advanceTimersByTime(30_000);
  store.pauseTimer();
  const remainingBreak = store.timeLeft;
  expect(store.isBreak).toBe(true);
  expect(remainingBreak).toBe(store.totalTime - 30);

  // Start focus from Next step during paused break, then cancel breathing
  store.startFocus("a");
  expect(store.isBreathing).toBe(true);
  store.cancelBreathing();
  expect(store.isBreathing).toBe(false);
  expect(store.isRunning).toBe(false);
  expect(store.isBreak).toBe(true);
  expect(store.timeLeft).toBe(remainingBreak);
  expect(JSON.parse(data.get("pomoState")!).isBreak).toBe(true);
});

test("switching focus tasks during a running session preserves running state on cancel and offers working Undo on commit", () => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  const settings = { pomoBreathingStart: true };
  const taskA = { id: "a", todo: "Task A", parentId: null, completed: false };
  const taskB = { id: "b", todo: "Task B", parentId: null, completed: false };
  const todos = {
    nextTask: taskA,
    find: (id: string) => id === "a" ? taskA : id === "b" ? taskB : undefined,
    clusterName: () => "",
  };
  const toasts: Array<{ title: string; onAction?: () => void }> = [];
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    dispatchEvent: (event: { detail?: { title: string; onAction?: () => void } }) => {
      if (event?.detail?.title) toasts.push(event.detail);
    },
    matchMedia: () => ({ matches: false }),
    Alpine: { store: (name: string) => name === "settings" ? settings : name === "todos" ? todos : {} },
  });
  vi.stubGlobal("CustomEvent", class {
    detail: unknown;
    constructor(_type: string, init?: { detail?: unknown }) {
      this.detail = init?.detail;
    }
  });
  const store = initPomoStore();

  // Start Task A and let 45s elapse
  store.startFocus("a");
  store.skipBreathing();
  vi.advanceTimersByTime(45_000);
  const remainingA = store.timeLeft;
  expect(store.isRunning).toBe(true);
  expect(store.focusTask?.id).toBe("a");
  expect(remainingA).toBe(store.totalTime - 45);

  // Switch to Task B, then cancel breathing -> Task A resumes running with no stray Undo toast
  store.startFocus("b");
  expect(store.isBreathing).toBe(true);
  expect(toasts).toHaveLength(0);
  store.cancelBreathing();
  expect(store.isBreathing).toBe(false);
  expect(store.isRunning).toBe(true);
  expect(store.focusTask?.id).toBe("a");
  expect(store.timeLeft).toBe(remainingA);

  // Switch to Task B and commit via skipBreathing -> Undo toast is offered and restores Task A running
  store.startFocus("b");
  store.skipBreathing();
  expect(store.isRunning).toBe(true);
  expect(store.focusTask?.id).toBe("b");
  expect(toasts).toHaveLength(1);
  expect(toasts[0].title).toBe("Timer reset");

  toasts[0].onAction?.();
  expect(store.isRunning).toBe(true);
  expect(store.focusTask?.id).toBe("a");
  expect(store.timeLeft).toBe(remainingA);
});

test("chess-clock hand-over from a running break to focus is a fresh focus start, so breathing applies", () => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  const settings = { pomoBreathingStart: true };
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matchMedia: () => ({ matches: false }),
    Alpine: { store: (name: string) => name === "settings" ? settings : {} },
  });
  vi.stubGlobal("CustomEvent", class {});
  const store = initPomoStore();

  // Run a break for 30s, then hand over to focus the way TimerFaces.astro handOver() does
  store.toggleBreak(false);
  store.startTimer();
  vi.advanceTimersByTime(30_000);
  expect(store.isRunning).toBe(true);
  const wasRunning = store.isRunning;
  store.toggleBreak();
  if (wasRunning) store.startTimer();

  expect(store.isBreak).toBe(false);
  expect(store.isBreathing).toBe(true);
  expect(store.isRunning).toBe(false);
  store.skipBreathing();
  expect(store.isBreathing).toBe(false);
  expect(store.isRunning).toBe(true);
});

test("cancelling breathing after a completed phase keeps the completion banner", () => {
  vi.useFakeTimers();
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  const settings = { pomoBreathingStart: true };
  const task = { id: "a", todo: "Task A", parentId: null, completed: false };
  const todos = { nextTask: task, find: (id: string) => id === "a" ? task : undefined, clusterName: () => "" };
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matchMedia: () => ({ matches: false }),
    Alpine: { store: (name: string) => name === "settings" ? settings : name === "todos" ? todos : {} },
  });
  vi.stubGlobal("CustomEvent", class {});
  const store = initPomoStore();

  // A finished focus leaves the "Focus done" banner up
  store.lastCompleted = { wasBreak: false, minutes: 25 };
  expect(store.completedHeadline).toBe("Focus done · 25 min logged");

  // Starting a fresh focus enters breathing and clears the banner; cancelling must restore it
  store.startFocus("a");
  expect(store.isBreathing).toBe(true);
  expect(store.lastCompleted).toBeNull();
  store.cancelBreathing();
  expect(store.isBreathing).toBe(false);
  expect(store.lastCompleted).toEqual({ wasBreak: false, minutes: 25 });
  expect(store.completedHeadline).toBe("Focus done · 25 min logged");
});
