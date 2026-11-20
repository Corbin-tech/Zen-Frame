import { afterEach, expect, test, vi } from "vitest";
import { initGoalsStore } from "../src/stores/goalsStore";
import { initStores } from "../src/stores/todoStore";

afterEach(() => vi.unstubAllGlobals());

test.each([
  { action: "deleteCompleted", completed: true, tasks: 1, expected: 100 },
  { action: "deleteTodo", completed: false, tasks: 2, expected: 50 },
  { action: "deleteTodo", completed: false, tasks: 0, expected: 0 },
] as const)("$action preserves $expected% progress when unlinking a cluster", ({ action, completed, tasks, expected }) => {
  const goals = initGoalsStore();
  vi.spyOn(goals, "save").mockImplementation(() => {});
  let todos: any;
  vi.stubGlobal("window", { dispatchEvent: () => true, Alpine: { store: (name: string, value?: unknown) => {
    if (value) todos = value;
    return name === "goals" ? goals : todos;
  } } });
  initStores();
  vi.spyOn(todos, "saveTodos").mockImplementation(() => {});
  const defaults = { completed: false, isPinned: false, parentId: null, createdAt: "2026-01-01" };
  todos.items = [
    { ...defaults, id: "cluster", todo: "Project", isCluster: true },
    ...Array.from({ length: tasks }, (_, i) => ({
      ...defaults, id: `task-${i}`, todo: "Task", isCluster: false, parentId: "cluster", completed: completed || i === 0,
    })),
  ];
  goals.addGoal("Project goal", { clusterId: "cluster", progress: 25 });
  goals.addGoal("Unrelated goal", { progress: 35 });
  expect(goals.goalProgress(goals.goals[0], todos.clusterProgress("cluster"))).toBe(expected);

  todos[action]("cluster");

  expect(todos.items).toEqual([]);
  expect(goals.goals[0].clusterId).toBeNull();
  expect(goals.goalProgress(goals.goals[0], null)).toBe(expected);
  expect(goals.goals[1].progress).toBe(35);
  vi.mocked(goals.save).mockClear();
  todos.deleteTodo("missing");
  todos.deleteCompleted();
  expect(goals.save).not.toHaveBeenCalled();
});
