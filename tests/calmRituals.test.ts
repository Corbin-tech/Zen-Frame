import { afterEach, describe, expect, test, vi } from "vitest";
import { initGoalsStore, mindfulPromptForWeek } from "../src/stores/goalsStore";
import { initSettingsStore } from "../src/stores/settingsStore";
import { checkReminders } from "../src/lib/notifications";
import { normalizeStoredData } from "../src/lib/storedData";

vi.mock("../src/lib/favicon", () => ({ applyAccentFavicon: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

function setupEnv() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: (key: string) => { data.delete(key); }
  };
  const dispatched: Array<{ type: string; detail?: any }> = [];
  class FakeCustomEvent {
    type: string;
    detail: any;
    constructor(type: string, init?: { detail?: any }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("document", { documentElement: { dataset: {} }, addEventListener: vi.fn(), hidden: false });
  vi.stubGlobal("CustomEvent", FakeCustomEvent);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn((event: { type: string; detail?: any }) => { dispatched.push(event); return true; }),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
  return { storage, dispatched };
}

describe("goalsStore check-in prompts, Weekly Big 3, and recap helpers", () => {
  test("hydrates legacy check-ins and persists connection, recharge, mindful prompt, and weekly intentions", () => {
    const { storage } = setupEnv();
    storage.setItem("checkIns", JSON.stringify({
      "2026-11-23": { week: "2026-11-23", energy: 4, wins: "Shipped", blockers: "", nextFocus: "Rest", savedAt: "2026-11-23T10:00:00.000Z" }
    }));
    const store = initGoalsStore();
    store.init();

    const legacy = store.checkInFor("2026-11-23");
    expect(legacy.checkInPerson).toBe("");
    expect(legacy.recharge).toBe("");
    expect(legacy.mindfulPrompt).toBe(mindfulPromptForWeek("2026-11-23"));
    expect(legacy.weeklyIntentions).toEqual([]);

    const goalId = store.addGoal("Finish thesis");
    store.saveCheckIn({
      ...legacy,
      checkInPerson: "Sam",
      recharge: "Sunday trail walk",
      mindfulAnswer: "Let go of perfectionism",
      weeklyIntentions: [
        { id: "w-1", text: "Draft chapter 2", goalId, done: false },
        { id: "w-2", text: "Review notes", goalId: null, done: true }
      ]
    });

    const saved = store.checkInFor("2026-11-23");
    expect(saved.checkInPerson).toBe("Sam");
    expect(saved.recharge).toBe("Sunday trail walk");
    expect(saved.mindfulAnswer).toBe("Let go of perfectionism");
    expect(saved.weeklyIntentions).toHaveLength(2);
    expect(saved.weeklyIntentions[0].goalId).toBe(goalId);
  });

  test("filters wins and reached goals by date range for recaps", () => {
    setupEnv();
    const store = initGoalsStore();
    store.init();

    store.addWin("Finished lab", { date: "2026-11-05" });
    store.addWin("Outside range", { date: "2026-10-30" });
    const g1 = store.addGoal("Run 5k");
    store.updateGoal(g1, { done: true, reachedAt: "2026-11-12T15:00:00.000Z" });
    const g2 = store.addGoal("Older goal");
    store.updateGoal(g2, { done: true, reachedAt: "2026-10-10T15:00:00.000Z" });

    expect(store.winsInRange("2026-11-01", "2026-11-30")).toHaveLength(1);
    expect(store.reachedGoalsInRange("2026-11-01", "2026-11-30").map(g => g.title)).toEqual(["Run 5k"]);
  });
});

describe("gentle opt-in reminders", () => {
  test("fires weekly check-in, people check-in, and close-day reminders once when opted in", () => {
    const { dispatched } = setupEnv();
    const settings = initSettingsStore();
    settings.init();
    settings.update({
      notifyEnabled: true,
      notifyWeeklyCheckIn: true,
      notifyWeeklyCheckInDay: 0, // Sunday
      notifyWeeklyCheckInTime: "18:00",
      notifyPeopleCheckIn: true,
      notifyPeopleCheckInDay: 3, // Wednesday
      notifyPeopleCheckInTime: "10:00",
      notifyCloseDay: true,
      notifyCloseDayTime: "17:30"
    });

    const goals = initGoalsStore();
    goals.init();
    goals.saveCheckIn({
      ...goals.checkInFor("2026-11-23"),
      checkInPerson: "Jordan"
    });
    // Clear savedAt so weekly check-in reminder is still eligible for test
    goals.checkIns["2026-11-23"].savedAt = "";

    const todos = {
      items: [] as any[],
      openTasks: [] as any[],
      scheduledItemsOn: () => [],
      isBlockDone: () => false,
      addTodo: vi.fn(() => "task-1")
    };
    const Alpine = {
      store: (name: string) => ({ settings, goals, todos }[name])
    };

    // Sunday 2026-11-29 at 18:30 (same Monday-first week as 2026-11-23)
    const sundayEvening = new Date(2026, 10, 29, 18, 30, 0);
    checkReminders(Alpine, sundayEvening);

    const toastTitles = dispatched.filter(e => e.type === "app-toast").map(e => e.detail.title);
    expect(toastTitles).toContain("Weekly check-in");
    expect(toastTitles).toContain("Check in on Jordan");
    expect(toastTitles).toContain("Close the day");

    // Calling again on the same day should not repeat any of them
    dispatched.length = 0;
    checkReminders(Alpine, sundayEvening);
    expect(dispatched.filter(e => e.type === "app-toast")).toEqual([]);
  });
});

describe("storedData normalization", () => {
  test("normalizes todo focusDate and checkIn fields safely", () => {
    const todos = normalizeStoredData("todos", [
      { id: "1", todo: "Valid", completed: false, isCluster: false, isPinned: false, parentId: null, focusDate: "2026-11-27", createdAt: "2026-11-27T00:00:00Z" },
      { id: "2", todo: "Invalid", completed: false, isCluster: false, isPinned: false, parentId: null, focusDate: "not-a-date", createdAt: "2026-11-27T00:00:00Z" }
    ]) as Array<{ focusDate?: string | null }>;

    expect(todos[0].focusDate).toBe("2026-11-27");
    expect(todos[1].focusDate).toBeNull();

    const checkIns = normalizeStoredData("checkIns", {
      "2026-11-23": {
        energy: 3,
        weeklyIntentions: [
          { id: "a", text: "One", goalId: "g1", done: false },
          { id: "b", text: "Two", goalId: null, done: true },
          { id: "c", text: "Three", goalId: null, done: false },
          { id: "d", text: "Four (trimmed)", goalId: null, done: false }
        ],
        checkInPerson: "Alex",
        recharge: "Read"
      }
    }) as Record<string, any>;

    expect(checkIns["2026-11-23"].weeklyIntentions).toHaveLength(3);
    expect(checkIns["2026-11-23"].checkInPerson).toBe("Alex");
    expect(checkIns["2026-11-23"].recharge).toBe("Read");
  });
});
