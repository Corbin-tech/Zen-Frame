import { loadJson, loadString, saveJson } from "../lib/storage";

// Minutes for each preset
const POMO_DURATIONS = {
  pomodoro: { work: 25, break: 5 },
  long: { work: 50, break: 10 }
} as const;

export type PomoPreset = keyof typeof POMO_DURATIONS;
export type PomoStatus = "idle" | "running" | "paused";

export interface FocusSession {
  completedAt: string;
  minutes: number;
}

interface PomoSavedState {
  preset?: string;
  isBreak?: boolean;
}

interface RunningTimer {
  preset: PomoPreset;
  isBreak: boolean;
  endsAt: number;
}

// A countdown belongs to this tab and isn't part of an exported backup.
const RUNNING_TIMER_KEY = "pomoRunningTimer";

function loadRunningTimer(): RunningTimer | null {
  try {
    const timer: RunningTimer | null = JSON.parse(sessionStorage.getItem(RUNNING_TIMER_KEY) ?? "null");
    if (typeof timer?.preset === "string" && Object.hasOwn(POMO_DURATIONS, timer.preset)
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
    isBreak: false,
    totalTime: POMO_DURATIONS.pomodoro.work * 60, // Seconds
    timeLeft: POMO_DURATIONS.pomodoro.work * 60, // Seconds
    isRunning: false,
    timer: null as ReturnType<typeof setInterval> | null,
    sessions: [] as FocusSession[], // Finished focus sessions: { completedAt, minutes }

    // Alpine calls init() when the store is registered
    init(): void {
      this.loadState();
      const running = loadRunningTimer();
      if (running) {
        this.preset = running.preset;
        this.isBreak = running.isBreak;
      }
      this.totalTime = this.phaseTime(this.isBreak);
      this.timeLeft = this.totalTime;
      if (running) {
        if (running.endsAt <= Date.now()) this.completeTimer(running.endsAt, false);
        else this.runTimer(running.endsAt);
      }

      // Space starts or pauses the timer when on Pomodoro (or Zen Mode with its timer visible),
      // unless the user is typing, on a control, or a dialog is open
      document.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.code !== "Space") return;
        const target = e.target as Element | null;
        if (target?.closest("input, textarea, select, button, [role='button'], [contenteditable], [role='dialog']")) return;
        if (Array.from(document.querySelectorAll("[role='dialog']")).some(dialog => dialog.checkVisibility())) return;
        const activeTab = loadString("activeTab", "dashboard");
        const settings = window.Alpine.store("settings") as { zenShowTimer?: boolean } | undefined;
        const zenTimerActive = activeTab === "zenmode" && Boolean(settings?.zenShowTimer);
        if (activeTab !== "pomodoro" && !zenTimerActive) return;
        e.preventDefault();
        this.isRunning ? this.pauseTimer() : this.startTimer();
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

    // "MMSS", for the faces that draw each digit
    get digits(): string {
      const minutes = Math.floor(this.timeLeft / 60);
      return minutes.toString().padStart(2, "0") + (this.timeLeft % 60).toString().padStart(2, "0");
    },

    // Full length in seconds of the work or break phase for the current preset
    phaseTime(isBreak: boolean): number {
      return POMO_DURATIONS[this.preset][isBreak ? "break" : "work"] * 60;
    },

    get currentPresetName(): string {
      if (this.isBreak) return "Recharge";
      return this.preset === "long" ? "Extended Focus" : "Burst Focus";
    },

    startTimer(): void {
      if (this.isRunning) return;
      if (this.timeLeft <= 0) this.resetTimer();

      const endsAt = Date.now() + this.timeLeft * 1000;
      saveRunningTimer({ endsAt, preset: this.preset, isBreak: this.isBreak });
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
      this.timer = setInterval(tick, 1000);
      tick();
    },

    stopTimer(): void {
      this.isRunning = false;
      if (this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
      saveRunningTimer(null);
    },

    pauseTimer(): void {
      this.stopTimer();
    },

    resetTimer(): void {
      this.stopTimer();
      this.totalTime = this.phaseTime(this.isBreak);
      this.timeLeft = this.totalTime;
      this.saveState();
    },

    // Start or resume a focus session, leaving a break if one is set
    startFocus(): void {
      if (this.isBreak) {
        this.isBreak = false;
        this.resetTimer();
      }
      this.startTimer();
    },

    completeTimer(endsAt: number, alert = true): void {
      if (alert) this.playAlarm();
      if (!this.isBreak) {
        const completedAt = new Date(endsAt).toISOString();
        const saved = loadJson<FocusSession[]>("pomoSessions", this.sessions);
        this.sessions = saved;
        if (!this.sessions.some((session) => session?.completedAt === completedAt)) {
          this.sessions = [...this.sessions, { completedAt, minutes: this.totalTime / 60 }].slice(-500);
          saveJson("pomoSessions", this.sessions);
        }
      }
      // Switch between work and break
      this.isBreak = !this.isBreak;
      this.resetTimer();
    },

    toggleBreak(): void {
      this.isBreak = !this.isBreak;
      this.resetTimer();
    },

    setPreset(newPreset: PomoPreset): void {
      this.preset = newPreset;
      this.resetTimer();
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
        isBreak: this.isBreak
      });
    },

    loadState(): void {
      const state = loadJson<PomoSavedState>("pomoState", {}) ?? {};
      this.preset = state.preset && Object.hasOwn(POMO_DURATIONS, state.preset) ? state.preset as PomoPreset : "pomodoro";
      this.isBreak = Boolean(state.isBreak);
      this.sessions = loadJson<FocusSession[]>("pomoSessions", []);
    }
  };
}
