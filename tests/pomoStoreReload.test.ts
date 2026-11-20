import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initPomoStore } from "../src/stores/pomoStore";

const start = new Date("2026-01-01T12:00:00Z");
const focusMs = 25 * 60 * 1000;

function storage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); }
  };
}

function openPage() {
  const store = initPomoStore();
  store.init();
  return store;
}

function reloadAfter(ms: number) {
  const now = Date.now();
  vi.clearAllTimers();
  vi.setSystemTime(now + ms);
  return openPage();
}

describe("Pomodoro reload", () => {
  const notify = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
    vi.stubGlobal("document", { addEventListener: vi.fn() });
    vi.stubGlobal("window", { addEventListener: vi.fn(), Alpine: { store: vi.fn() }, notify });
    notify.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([null, {}, "corrupted", 42])("starts with no focus history when storage contains %j", (saved) => {
    localStorage.setItem("pomoSessions", JSON.stringify(saved));

    expect(openPage().sessions).toEqual([]);
  });

  it("keeps counting down from the original deadline and saves the completed focus", () => {
    const first = openPage();
    first.startTimer();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(first.digits).toBe("1500");

    const reloaded = reloadAfter(60 * 1000);
    expect(reloaded.status).toBe("running");
    expect(reloaded.digits).toBe("1400");

    vi.advanceTimersByTime(14 * 60 * 1000);
    expect(reloaded.sessions).toEqual([
      { completedAt: new Date(+start + focusMs).toISOString(), minutes: 25 }
    ]);
    expect(reloaded.status).toBe("idle");
    expect(reloaded.digits).toBe("0500");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("records a focus that expired during reload once, at its original finish time", () => {
    openPage().startTimer();

    const reloaded = reloadAfter(focusMs + 90_000);
    expect(reloaded.sessions).toEqual([
      { completedAt: new Date(+start + focusMs).toISOString(), minutes: 25 }
    ]);
    expect(reloaded.status).toBe("idle");
    expect(reloaded.isBreak).toBe(true);
    expect(notify).not.toHaveBeenCalled();
    expect(reloadAfter(1000).sessions).toEqual(reloaded.sessions);
  });

  it("does not double-count a focus if a duplicated tab completes the same timer", () => {
    openPage().startTimer();
    const copiedTab = storage();
    copiedTab.setItem("pomoRunningTimer", sessionStorage.getItem("pomoRunningTimer"));

    vi.advanceTimersByTime(focusMs);
    vi.stubGlobal("sessionStorage", copiedTab);

    expect(openPage().sessions).toEqual([
      { completedAt: new Date(+start + focusMs).toISOString(), minutes: 25 }
    ]);
  });

  it("re-reads other tabs' sessions before saving even if their storage event has not arrived", () => {
    const store = openPage();
    store.startTimer();
    const remote = { completedAt: new Date(+start - 1000).toISOString(), minutes: 50 };
    localStorage.setItem("pomoSessions", JSON.stringify([remote]));

    vi.advanceTimersByTime(focusMs);

    expect(JSON.parse(localStorage.getItem("pomoSessions")!)).toEqual([
      remote, { completedAt: new Date(+start + focusMs).toISOString(), minutes: 25 }
    ]);
  });

  it("restores the current tab's break without recording focus or picking up another tab's preset", () => {
    const first = openPage();
    first.setPreset("long");
    first.toggleBreak();
    first.startTimer();
    localStorage.setItem("pomoState", JSON.stringify({ preset: "pomodoro", isBreak: false }));

    const reloaded = reloadAfter(30_000);
    expect(reloaded.status).toBe("running");
    expect(reloaded.isBreak).toBe(true);
    expect(reloaded.digits).toBe("0930");

    vi.advanceTimersByTime(570_000);
    expect(reloaded.sessions).toEqual([]);
    expect(reloaded.status).toBe("idle");
    expect(reloaded.digits).toBe("5000");
  });

  it.each(["pauseTimer", "resetTimer"] as const)("does not revive a timer after %s", (stop) => {
    const first = openPage();
    first.startTimer();
    vi.advanceTimersByTime(2000);
    first[stop]();

    const reloaded = reloadAfter(focusMs);
    expect(reloaded.status).toBe("idle");
    expect(reloaded.sessions).toEqual([]);
  });
});
