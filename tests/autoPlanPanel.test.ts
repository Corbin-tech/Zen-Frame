import { afterEach, expect, test, vi } from "vitest";
import { plan, undo } from "../src/lib/autoPlanPanel";
import { initStores, type AutoPlanResult } from "../src/stores/todoStore";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-05T08:00:00"));
  let todos: any;
  vi.stubGlobal("window", { Alpine: { store: (_name: string, store: any) => { todos = store; } } });
  initStores();
  vi.spyOn(todos, "saveTodos").mockImplementation(() => {});
  todos.planning = { availability: [{ id: "hours", weekdays: [1], start: 540, end: 720 }], duration: 45, gap: 15 };
  todos.items = [{ id: "task", todo: "Write proposal", completed: false, isCluster: false, isPinned: false, parentId: null, createdAt: "2026-01-01", dueDate: "2026-01-10" }];
  return { selectedDate: "2026-01-05", $store: { todos }, lastPlan: null as AutoPlanResult | null, result: "", plan, undo };
}

test("a no-op keeps Undo for the real plan and restores its blocks and due dates", () => {
  const panel = setup();
  panel.plan(1);
  const realPlan = panel.lastPlan;
  expect(panel.result).toBe("Planned 1 task.");
  expect(realPlan?.blocks).toHaveLength(1);
  panel.plan(1);
  expect(panel.result).toMatch(/^Nothing to plan:/);
  expect(panel.lastPlan).toBe(realPlan);
  panel.undo();
  expect(panel.$store.todos.scheduledItems).toEqual([]);
  expect(panel.$store.todos.items[0].dueDate).toBe("2026-01-10");
  expect(panel.result).toBe("Removed 1 planned block.");
  expect(panel.lastPlan).toBeNull();
});

test("an initial empty run has no Undo", () => {
  const panel = setup();
  panel.$store.todos.items = [];
  panel.plan(1);
  expect(panel.result).toMatch(/^Nothing to plan:/);
  expect(panel.lastPlan).toBeNull();
});

test("a failed run leaves the previous Undo intact", () => {
  const panel = setup();
  panel.plan(1);
  const realPlan = panel.lastPlan;
  vi.spyOn(panel.$store.todos, "autoPlan").mockImplementation(() => { throw new Error("planning failed"); });
  expect(() => panel.plan(1)).toThrow("planning failed");
  expect(panel.lastPlan).toBe(realPlan);
});
