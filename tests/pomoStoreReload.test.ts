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

  it("does not restore cleared history when completing before the storage event arrives", () => {
    const store = openPage();
    store.completeTimer(+start, false);
    localStorage.removeItem("pomoSessions");
    store.toggleBreak();

    store.completeTimer(+start + focusMs, false);

    const expected = [{ completedAt: new Date(+start + focusMs).toISOString(), minutes: 25 }];
    expect(store.sessions).toEqual(expected);
    expect(JSON.parse(localStorage.getItem("pomoSessions")!)).toEqual(expected);
  });

  it("keeps both in-tab completions when session storage reads throw", () => {
    const store = openPage();
    const getItem = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, "getItem").mockImplementation(key => {
      if (key === "pomoSessions") throw new Error("Storage unavailable");
      return getItem(key);
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      store.completeTimer(+start, false);
      store.toggleBreak();
      store.completeTimer(+start + focusMs, false);

      expect(store.sessions).toEqual([
        { completedAt: start.toISOString(), minutes: 25 },
        { completedAt: new Date(+start + focusMs).toISOString(), minutes: 25 }
      ]);
    } finally {
      errors.mockRestore();
    }
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

  it("restores a running long break even when another tab cleared isLongBreak in localStorage", () => {
    const first = openPage();
    first.cycle = 3;
    first.completeTimer(+start, false);
    expect(first.isBreak).toBe(true);
    expect(first.isLongBreak).toBe(true);
    first.startTimer();
    localStorage.setItem("pomoState", JSON.stringify({ preset: "pomodoro", isBreak: false, isLongBreak: false }));

    const reloaded = reloadAfter(30_000);
    expect(reloaded.status).toBe("running");
    expect(reloaded.isBreak).toBe(true);
    expect(reloaded.isLongBreak).toBe(true);
    expect(reloaded.totalTime).toBe(15 * 60);
    expect(reloaded.digits).toBe("1430");
    expect(reloaded.completedInCycle).toBe(4);

    vi.advanceTimersByTime(14 * 60 * 1000 + 30_000);
    expect(reloaded.status).toBe("idle");
    expect(reloaded.isBreak).toBe(false);
    expect(reloaded.isLongBreak).toBe(false);
    expect(reloaded.digits).toBe("2500");
  });

  it("does not inherit another tab's isLongBreak when reloading a running short break or focus", () => {
    const shortBreak = openPage();
    shortBreak.toggleBreak(false);
    shortBreak.startTimer();
    localStorage.setItem("pomoState", JSON.stringify({ preset: "pomodoro", isBreak: true, isLongBreak: true }));

    const reloadedBreak = reloadAfter(30_000);
    expect(reloadedBreak.isBreak).toBe(true);
    expect(reloadedBreak.isLongBreak).toBe(false);
    expect(reloadedBreak.totalTime).toBe(5 * 60);
    expect(reloadedBreak.digits).toBe("0430");

    reloadedBreak.toggleBreak(false);
    reloadedBreak.startTimer();
    localStorage.setItem("pomoState", JSON.stringify({ preset: "pomodoro", isBreak: true, isLongBreak: true }));

    const reloadedFocus = reloadAfter(30_000);
    expect(reloadedFocus.isBreak).toBe(false);
    expect(reloadedFocus.isLongBreak).toBe(false);
    expect(reloadedFocus.totalTime).toBe(25 * 60);
    expect(reloadedFocus.digits).toBe("2430");
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
