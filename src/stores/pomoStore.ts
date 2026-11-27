import { formatTime, minutesNow } from "../lib/dates.ts";
import { loadJson, saveJson } from "../lib/storage.ts";
import { UNDO_TOAST_MS } from "../lib/notifications.ts";

export const CYCLE_LENGTH = 4;
export const BREATH_COUNT = 3;
export const BREATH_PHASE_MS = 4000;
const MIN_MINUTES = 1;
const MAX_WORK_MINUTES = 180;
const MAX_BREAK_MINUTES = 60;

export interface CustomDurations {
  work: number;
  break: number;
  longBreak: number;
}

const DEFAULT_CUSTOM: CustomDurations = { work: 30, break: 5, longBreak: 15 };

// Minutes for each built-in preset
export const POMO_DURATIONS = {
  pomodoro: { work: 25, break: 5, longBreak: 15 },
  long: { work: 50, break: 10, longBreak: 25 }
} as const;

export type PomoPreset = keyof typeof POMO_DURATIONS | "custom";
export type PomoStatus = "idle" | "running" | "paused";
export type BreathPhase = "in" | "out";

export interface FocusSession {
  completedAt: string;
  minutes: number;
  taskId?: string | null;
  taskTitle?: string;
  clusterId?: string | null;
  clusterName?: string;
}

export interface CompletedPhase {
  wasBreak: boolean;
  minutes: number;
}

interface PomoSavedState {
  preset?: string;
  isBreak?: boolean;
  cycle?: number;
  isLongBreak?: boolean;
  custom?: Partial<CustomDurations>;
  selectedTaskId?: string | null;
}

interface RunningTimer {
  preset: PomoPreset;
  isBreak: boolean;
  isLongBreak?: boolean;
  endsAt: number;
  focusTask?: FocusTask | null;
}

interface FocusTask extends PomoLinkedTask {
  clusterName: string;
}

interface PomoLinkedTask {
  id: string;
  todo: string;
  parentId: string | null;
  completed?: boolean;
  isCluster?: boolean;
}

interface PomoTodosApi {
  nextTask?: PomoLinkedTask | null;
  find?: (id: string) => PomoLinkedTask | undefined;
  clusterName?: (id: string | null) => string;
}

const todosApi = () => window.Alpine?.store("todos") as PomoTodosApi | undefined;

interface PomoSnapshot {
  selectedTaskId: string | null;
  focusTask?: FocusTask | null;
  preset: PomoPreset;
  isBreak: boolean;
  cycle: number;
  isLongBreak: boolean;
  custom: CustomDurations;
  totalTime: number;
  timeLeft: number;
  wasRunning: boolean;
}

function isValidPreset(value: unknown): value is PomoPreset {
  return value === "custom" || (typeof value === "string" && Object.hasOwn(POMO_DURATIONS, value));
}

function clampMinutes(value: unknown, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(MIN_MINUTES, Math.round(value)));
}

// Same as the toast's Undo button, so Undo never silently does nothing
const UNDO_WINDOW_MS = UNDO_TOAST_MS;

// A countdown belongs to this tab and isn't part of an exported backup.
const RUNNING_TIMER_KEY = "pomoRunningTimer";

function loadRunningTimer(): RunningTimer | null {
  try {
    const timer: RunningTimer | null = JSON.parse(sessionStorage.getItem(RUNNING_TIMER_KEY) ?? "null");
    if (isValidPreset(timer?.preset)
      && typeof timer.isBreak === "boolean" && typeof timer.endsAt === "number"
      && Number.isFinite(new Date(timer.endsAt).getTime()) && timer.endsAt > 0) {
      return timer;
    }
  } catch {
    // The timer still works when browser storage is unavailable.
  }
  return null;
}

function saveRunningTimer(timer: RunningTimer | null): void {
  try {
    if (timer) sessionStorage.setItem(RUNNING_TIMER_KEY, JSON.stringify(timer));
    else sessionStorage.removeItem(RUNNING_TIMER_KEY);
  } catch {
    // The timer still works when browser storage is unavailable.
  }
}

declare global {
  interface Window {
    notify?: (kind: string, title: string, body: string) => void;
  }
}

export function initPomoStore() {
  return {
    preset: "pomodoro" as PomoPreset,
    custom: { ...DEFAULT_CUSTOM } as CustomDurations,
    isBreak: false,
    cycle: 0, // Completed focus blocks in the current cycle (0–3)
    isLongBreak: false,
    totalTime: POMO_DURATIONS.pomodoro.work * 60, // Seconds
    timeLeft: POMO_DURATIONS.pomodoro.work * 60, // Seconds
    isRunning: false,
    isBreathing: false,
    breathingReducedMotion: false,
    breathIndex: 0,
    breathPhase: "in" as BreathPhase,
    breathTimer: null as ReturnType<typeof setTimeout> | null,
    breathingRestore: null as PomoSnapshot | null,
    breathingUndoTitle: null as string | null,
    endsAt: null as number | null,
    timer: null as ReturnType<typeof setInterval> | null,
    sessions: [] as FocusSession[], // Finished focus sessions: { completedAt, minutes }
    undoSnapshot: null as PomoSnapshot | null,
    undoTimer: null as ReturnType<typeof setTimeout> | null,
    lastCompleted: null as CompletedPhase | null,
    // null follows $store.todos.nextTask; "" means general focus (no task); string pins a task id
    selectedTaskId: null as string | null,
    focusTask: undefined as FocusTask | null | undefined,

    // Alpine calls init() when the store is registered
    init(): void {
      this.loadState();
      window.addEventListener("storage", event => {
        if (event.storageArea !== localStorage) return;
        if (event.key === null || event.key === "pomoSessions") this.loadSessions();
      });
      const running = loadRunningTimer();
      if (running) {
        this.preset = running.preset;
        this.isBreak = running.isBreak;
        this.isLongBreak = Boolean(running.isBreak && running.isLongBreak);
        this.focusTask = running.focusTask;
      }
      this.totalTime = this.phaseTime(this.isBreak);
      this.timeLeft = this.totalTime;
      if (running) {
        if (running.endsAt <= Date.now()) this.completeTimer(running.endsAt, false);
        else this.runTimer(running.endsAt);
      }

      // Space starts or pauses the timer only while a timer is on screen (the Timer view, or the
      // ring in Next step, where it starts focus on the shown task), unless the user is typing,
      // on a control, holding a modifier, or a dialog is open
      document.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.code !== "Space" || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const target = e.target as Element | null;
        if (target?.closest("input, textarea, select, button, [role='button'], [contenteditable], [role='dialog']")) return;
        if (Array.from(document.querySelectorAll("[role='dialog']")).some(dialog => dialog.checkVisibility())) return;
        const timer = Array.from(document.querySelectorAll<HTMLElement>("[data-pomo-timer]")).find(el => el.checkVisibility());
        if (!timer) return;
        const inNextStep = timer.dataset.pomoTimer === "zenmode";
        const todos = todosApi();
        if (inNextStep && !this.isRunning && !todos?.nextTask) return;
        e.preventDefault();
        if (this.isRunning) {
          this.pauseTimer();
        } else if (inNextStep) {
          this.startFocus(todos?.nextTask?.id);
        } else {
          this.startTimer();
        }
      });
    },

    get started(): boolean {
      return this.timeLeft < this.totalTime;
    },

    get status(): PomoStatus {
      if (this.isRunning) return "running";
      return this.started ? "paused" : "idle";
    },

    get percentComplete(): number {
      return 100 - (this.timeLeft / this.totalTime * 100);
    },

    get minutesText(): string {
      return Math.floor(this.timeLeft / 60).toString().padStart(2, "0");
    },

    get secondsText(): string {
      return (this.timeLeft % 60).toString().padStart(2, "0");
    },

    get formattedTime(): string {
      return `${this.minutesText}:${this.secondsText}`;
    },

    // "MMSS" (or "MMMSS" at 100+ minutes), for the faces that draw each digit
    get digits(): string {
      return this.minutesText + this.secondsText;
    },

    get completedInCycle(): number {
      return this.isLongBreak ? CYCLE_LENGTH : this.cycle;
    },

    get activeTask(): PomoLinkedTask | null {
      if (!this.isBreak && this.focusTask !== undefined) return this.focusTask;
      if (this.selectedTaskId === "") return null;
      const todos = todosApi();
      if (this.selectedTaskId) {
        const chosen = todos?.find?.(this.selectedTaskId);
        if (chosen && !chosen.completed && !chosen.isCluster) return chosen;
      }
      return todos?.nextTask ?? null;
    },

    get activeTaskId(): string {
      return this.activeTask?.id ?? "";
    },

    setTask(taskId: string | null): void {
      this.selectedTaskId = taskId;
      this.saveState();
    },

    // Full length in seconds of the focus, short-break, or long-break phase for the current preset
    phaseTime(isBreak: boolean, isLongBreak?: boolean): number {
      const durations = this.preset === "custom" ? this.custom : POMO_DURATIONS[this.preset];
      if (!isBreak) return durations.work * 60;
      return ((isLongBreak ?? this.isLongBreak) ? durations.longBreak : durations.break) * 60;
    },

    get phaseLabel(): string {
      return this.isBreak ? "Break" : "Focus";
    },

    get statusLabel(): string {
      if (this.isRunning && this.endsAt !== null) {
        return `Ends at ${formatTime(minutesNow(new Date(this.endsAt)))}`;
      }
      if (this.isBreak) {
        const nextMinutes = Math.round(this.phaseTime(false, false) / 60);
        return `Next: ${nextMinutes} min focus`;
      }
      const nextIsLong = this.cycle >= CYCLE_LENGTH - 1;
      const nextMinutes = Math.round(this.phaseTime(true, nextIsLong) / 60);
      return `Next: ${nextMinutes} min ${nextIsLong ? "long break" : "break"}`;
    },

    get completedHeadline(): string {
      if (!this.lastCompleted) return "";
      return this.lastCompleted.wasBreak
        ? "Break done"
        : `Focus done · ${this.lastCompleted.minutes} min logged`;
    },

    get breathCount(): number {
      return BREATH_COUNT;
    },

    get breathNumber(): number {
      return this.breathIndex + 1;
    },

    get breathPrompt(): string {
      if (this.breathingReducedMotion) return "Take three slow breaths.";
      return this.breathPhase === "in" ? "Breathe in" : "Breathe out";
    },

    clearBreathingTimer(): void {
      if (this.breathTimer !== null) {
        clearTimeout(this.breathTimer);
        this.breathTimer = null;
      }
    },

    startBreathing(): void {
      this.clearBreathingTimer();
      const reduced = typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.isBreathing = true;
      this.breathingReducedMotion = reduced;
      this.breathIndex = 0;
      this.breathPhase = "in";
      if (!reduced) this.scheduleBreathStep();
    },

    scheduleBreathStep(): void {
      this.clearBreathingTimer();
      this.breathTimer = setTimeout(() => {
        if (!this.isBreathing) return;
        if (this.breathPhase === "in") {
          this.breathPhase = "out";
          this.scheduleBreathStep();
        } else if (this.breathIndex + 1 < BREATH_COUNT) {
          this.breathIndex += 1;
          this.breathPhase = "in";
          this.scheduleBreathStep();
        } else {
          this.finishBreathing();
        }
      }, BREATH_PHASE_MS);
    },

    finishBreathing(): void {
      this.clearBreathingTimer();
      this.isBreathing = false;
      this.breathingReducedMotion = false;
      const restore = this.breathingRestore;
      const undoTitle = this.breathingUndoTitle;
      this.breathingRestore = null;
      this.breathingUndoTitle = null;
      if (restore && undoTitle) this.offerUndo(undoTitle, restore);
      this.startTimer({ skipBreathing: true });
    },

    skipBreathing(): void {
      if (!this.isBreathing) return;
      this.finishBreathing();
    },

    cancelBreathing(): void {
      if (!this.isBreathing) return;
      this.clearBreathingTimer();
      this.isBreathing = false;
      this.breathingReducedMotion = false;
      const restore = this.breathingRestore;
      this.breathingRestore = null;
      this.breathingUndoTitle = null;
      if (restore) {
        this.preset = restore.preset;
        this.isBreak = restore.isBreak;
        this.cycle = restore.cycle;
        this.isLongBreak = restore.isLongBreak;
        this.custom = { ...restore.custom };
        this.totalTime = restore.totalTime;
        this.timeLeft = restore.timeLeft;
        this.selectedTaskId = restore.selectedTaskId;
        this.focusTask = restore.focusTask;
        this.saveState();
        if (restore.wasRunning) this.startTimer({ skipBreathing: true });
      } else if (!this.started) {
        this.focusTask = undefined;
      }
    },

    startTimer(options?: { skipBreathing?: boolean }): void {
      if (this.isRunning || this.isBreathing) return;
      this.lastCompleted = null;
      if (this.timeLeft <= 0) this.resetTimer();
      if (!this.isBreak && this.focusTask === undefined) {
        const task = this.activeTask;
        const todos = todosApi();
        this.focusTask = task ? { ...task, clusterName: todos?.clusterName?.(task.parentId) ?? "" } : null;
      }

      const settings = window.Alpine?.store("settings") as { pomoBreathingStart?: boolean } | undefined;
      if (!options?.skipBreathing && !this.isBreak && !this.started && Boolean(settings?.pomoBreathingStart)) {
        this.startBreathing();
        return;
      }

      const endsAt = Date.now() + this.timeLeft * 1000;
      saveRunningTimer({ endsAt, preset: this.preset, isBreak: this.isBreak, isLongBreak: this.isLongBreak, focusTask: this.focusTask });
      this.runTimer(endsAt);
    },

    runTimer(endsAt: number): void {
      // Keep the same deadline across reloads and throttled background ticks.
      const tick = () => {
        const remaining = Math.ceil((endsAt - Date.now()) / 1000);
        this.timeLeft = Math.max(0, Math.min(this.totalTime, remaining));
        if (this.timeLeft === 0) this.completeTimer(endsAt);
      };
      this.isRunning = true;
      this.endsAt = endsAt;
      this.timer = setInterval(tick, 1000);
      tick();
    },

    stopTimer(): void {
      this.clearBreathingTimer();
      this.isBreathing = false;
      this.breathingReducedMotion = false;
      this.breathingRestore = null;
      this.breathingUndoTitle = null;
      this.isRunning = false;
      this.endsAt = null;
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      saveRunningTimer(null);
    },

    pauseTimer(): void {
      this.stopTimer();
    },

    clearUndo(): void {
      if (this.undoTimer !== null) {
        clearTimeout(this.undoTimer);
        this.undoTimer = null;
      }
      this.undoSnapshot = null;
    },

    offerUndo(title: string, saved?: PomoSnapshot): void {
      const snapshot: PomoSnapshot = saved ?? {
        selectedTaskId: this.selectedTaskId,
        focusTask: this.focusTask,
        preset: this.preset,
        isBreak: this.isBreak,
        cycle: this.cycle,
        isLongBreak: this.isLongBreak,
        custom: { ...this.custom },
        totalTime: this.totalTime,
        timeLeft: this.timeLeft,
        wasRunning: this.isRunning
      };
      this.clearUndo();
      this.undoSnapshot = snapshot;
      // Read it back: in an Alpine store this is a reactive proxy, which never equals the raw object.
      const stored = this.undoSnapshot;
      this.undoTimer = setTimeout(() => {
        if (this.undoSnapshot === stored) this.clearUndo();
      }, UNDO_WINDOW_MS);
      window.dispatchEvent(new CustomEvent("app-toast", {
        detail: {
          title,
          body: "",
          actionLabel: "Undo",
          onAction: () => this.restoreSnapshot(stored)
        }
      }));
    },

    restoreSnapshot(snapshot?: PomoSnapshot): void {
      const target = snapshot ?? this.undoSnapshot;
      if (!target || this.undoSnapshot !== target) return;
      this.clearUndo();
      this.lastCompleted = null;
      this.stopTimer();
      this.preset = target.preset;
      this.isBreak = target.isBreak;
      this.cycle = target.cycle;
      this.isLongBreak = target.isLongBreak;
      this.custom = { ...target.custom };
      this.totalTime = target.totalTime;
      this.timeLeft = target.timeLeft;
      this.selectedTaskId = target.selectedTaskId;
      this.focusTask = target.focusTask;
      this.saveState();
      if (target.wasRunning) this.startTimer({ skipBreathing: true });
    },

    resetTimer(announceUndo = false): void {
      if (announceUndo) this.lastCompleted = null;
      if (announceUndo && this.started) this.offerUndo("Timer reset");
      this.stopTimer();
      this.focusTask = undefined;
      this.totalTime = this.phaseTime(this.isBreak, this.isLongBreak);
      this.timeLeft = this.totalTime;
      this.saveState();
    },

    // Start or resume a focus session, leaving a break if one is set
    startFocus(taskId?: string): void {
      const before: PomoSnapshot = {
        selectedTaskId: this.selectedTaskId,
        focusTask: this.focusTask,
        preset: this.preset,
        isBreak: this.isBreak,
        cycle: this.cycle,
        isLongBreak: this.isLongBreak,
        custom: { ...this.custom },
        totalTime: this.totalTime,
        timeLeft: this.timeLeft,
        wasRunning: this.isRunning
      };
      const switchingTask = !this.isBreak && taskId !== undefined && this.focusTask !== undefined
        && taskId !== (this.focusTask?.id ?? "");
      const hadProgress = this.started;
      const settings = window.Alpine?.store("settings") as { pomoBreathingStart?: boolean } | undefined;
      const deferUndo = Boolean(settings?.pomoBreathingStart) && switchingTask && hadProgress;

      this.lastCompleted = null;
      if (switchingTask) {
        this.resetTimer(!deferUndo);
      }
      if (taskId !== undefined) this.selectedTaskId = taskId;
      if (this.isBreak) {
        this.isBreak = false;
        this.isLongBreak = false;
        this.resetTimer();
      } else if (taskId !== undefined) {
        this.saveState();
      }
      this.startTimer();
      if (this.isBreathing) {
        this.breathingRestore = before;
        this.breathingUndoTitle = deferUndo ? "Timer reset" : null;
      } else if (deferUndo) {
        this.offerUndo("Timer reset", before);
      }
    },

    completeTimer(endsAt: number = Date.now(), alert = true): void {
      this.clearUndo();
      if (alert) this.playAlarm();
      const finishedWasBreak = this.isBreak;
      const finishedMinutes = Math.round(this.totalTime / 60);
      if (!finishedWasBreak) {
        const completedAt = new Date(endsAt).toISOString();
        this.loadSessions();
        if (!this.sessions.some((session) => session?.completedAt === completedAt)) {
          const task = this.focusTask === undefined ? this.activeTask : this.focusTask;
          const todos = todosApi();
          const session: FocusSession = {
            completedAt,
            minutes: this.totalTime / 60,
            ...(task ? {
              taskId: task.id,
              taskTitle: task.todo,
              clusterId: task.parentId ?? null,
              clusterName: this.focusTask?.clusterName ?? todos?.clusterName?.(task.parentId ?? null) ?? ""
            } : {})
          };
          this.sessions = [...this.sessions, session].slice(-500);
          saveJson("pomoSessions", this.sessions);
        }
        const nextCycle = this.cycle + 1;
        if (nextCycle >= CYCLE_LENGTH) {
          this.cycle = 0;
          this.isLongBreak = true;
        } else {
          this.cycle = nextCycle;
          this.isLongBreak = false;
        }
      } else {
        this.isLongBreak = false;
      }
      // Switch between focus and break
      this.isBreak = !this.isBreak;
      this.resetTimer();

      const settings = window.Alpine.store("settings") as {
        pomoAutoStartBreak?: boolean;
        pomoAutoStartFocus?: boolean;
      } | undefined;
      const autoStart = alert && (this.isBreak
        ? Boolean(settings?.pomoAutoStartBreak)
        : Boolean(settings?.pomoAutoStartFocus));
      if (autoStart) {
        this.lastCompleted = null;
        this.startTimer({ skipBreathing: true });
      } else if (alert) {
        this.lastCompleted = { wasBreak: finishedWasBreak, minutes: finishedMinutes };
      }
    },

    toggleBreak(announceUndo = true): void {
      this.lastCompleted = null;
      if (announceUndo && this.started) {
        this.offerUndo(this.isBreak ? "Switched to focus" : "Switched to break");
      }
      this.isBreak = !this.isBreak;
      this.isLongBreak = false;
      this.resetTimer();
    },

    skipPhase(): void {
      this.lastCompleted = null;
      this.offerUndo(this.isBreak ? "Break skipped" : "Focus ended early");
      this.isBreak = !this.isBreak;
      this.isLongBreak = false;
      this.resetTimer();
    },

    setPreset(newPreset: PomoPreset, announceUndo = true): void {
      if (newPreset === this.preset) return;
      this.lastCompleted = null;
      if (announceUndo && this.started) this.offerUndo("Timer length changed");
      this.preset = newPreset;
      this.resetTimer();
    },

    setCustomDuration(field: "work" | "break", minutes: number, announceUndo = true): void {
      const max = field === "work" ? MAX_WORK_MINUTES : MAX_BREAK_MINUTES;
      const next = clampMinutes(minutes, this.custom[field], max);
      if (next === this.custom[field]) return;
      const affectsActive = this.preset === "custom" && ((field === "work" && !this.isBreak) || (field === "break" && this.isBreak));
      if (affectsActive && announceUndo && this.started) this.offerUndo("Custom length changed");
      const updated: CustomDurations = { ...this.custom, [field]: next };
      if (field === "break") {
        updated.longBreak = Math.min(MAX_BREAK_MINUTES, Math.max(next, next * 3));
      }
      this.custom = updated;
      if (affectsActive) {
        this.lastCompleted = null;
        this.resetTimer();
      } else {
        this.saveState();
      }
    },

    stepCustom(field: "work" | "break", delta: number): void {
      this.setCustomDuration(field, this.custom[field] + delta);
    },

    playAlarm(): void {
      // The sound and volume chosen in Settings
      const settings = window.Alpine.store("settings") as { playAlarm?: () => void } | undefined;
      settings?.playAlarm?.();

      // Shown only if timer alerts are on in Settings
      window.notify?.("timer", "Timer complete", `Your ${this.isBreak ? "break" : "focus"} session is complete.`);
    },

    saveState(): void {
      saveJson("pomoState", {
        preset: this.preset,
        isBreak: this.isBreak,
        cycle: this.cycle,
        isLongBreak: this.isLongBreak,
        custom: this.custom,
        selectedTaskId: this.selectedTaskId
      });
    },

    loadState(): void {
      const state = loadJson<PomoSavedState>("pomoState", {}) ?? {};
      this.preset = isValidPreset(state.preset) ? state.preset : "pomodoro";
      const savedCustom = state.custom && typeof state.custom === "object" ? state.custom : {};
      const work = clampMinutes(savedCustom.work, DEFAULT_CUSTOM.work, MAX_WORK_MINUTES);
      const breakMin = clampMinutes(savedCustom.break, DEFAULT_CUSTOM.break, MAX_BREAK_MINUTES);
      const defaultLong = Math.min(MAX_BREAK_MINUTES, Math.max(breakMin, breakMin * 3));
      const longBreak = clampMinutes(savedCustom.longBreak, defaultLong, MAX_BREAK_MINUTES);
      this.custom = { work, break: breakMin, longBreak };
      this.isBreak = Boolean(state.isBreak);
      this.cycle = typeof state.cycle === "number" && Number.isInteger(state.cycle) && state.cycle >= 0 && state.cycle < CYCLE_LENGTH
        ? state.cycle
        : 0;
      this.isLongBreak = Boolean(state.isLongBreak && this.isBreak);
      this.selectedTaskId = typeof state.selectedTaskId === "string" ? state.selectedTaskId : null;
      this.loadSessions([]);
    },

    // A missing key means the history was cleared (here or in another tab), so it is empty.
    // A failed read keeps `fallback`, which is the in-memory history unless the caller passes one.
    loadSessions(fallback?: FocusSession[]): void {
      this.sessions = loadJson<FocusSession[]>("pomoSessions", fallback ?? this.sessions, []);
    }
  };
}
