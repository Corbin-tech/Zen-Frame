import { afterEach, expect, test, vi } from "vitest";
import { initStores, type AutoPlanResult, type Planning, type ScheduledItem, type Todo } from "../src/stores/todoStore";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setupStore<T extends { items: Todo[]; saveTodos(): void }>(): T {
  const registerStore = vi.fn<(name: string, store: T) => void>();
  vi.stubGlobal("window", { Alpine: { store: registerStore } });
  initStores();
  const [, store] = registerStore.mock.calls[0];
  vi.spyOn(store, "saveTodos").mockImplementation(() => {});
  return store;
}

test.each([false, true])("skipping an unclustered task advances Zen and moves it behind its open siblings (started: %s)", (isStarted) => {
  const startedAt = "2026-01-01T10:00:00.000Z";
  const defaults = { completed: false, isCluster: false, isPinned: false, parentId: null, createdAt: startedAt };
  const started: Todo = { ...defaults, id: "started", todo: "Review project brief", ...(isStarted ? { startedAt } : {}) };
  const queued: Todo = { ...defaults, id: "queued", todo: "Draft meeting agenda" };
  const last: Todo = { ...defaults, id: "last", todo: "Send weekly update" };
  const registerStore = vi.fn<(name: string, store: {
    items: Todo[];
    nextTask: Todo | null;
    zenTaskOrder: Todo[];
    saveTodos(): void;
    skipTaskToEndOfCluster(id: string): void;
  }) => void>();
  vi.stubGlobal("window", { Alpine: { store: registerStore } });
  initStores();
  const [, store] = registerStore.mock.calls[0];
  vi.spyOn(store, "saveTodos").mockImplementation(() => {});
  const cluster: Todo = { ...defaults, id: "cluster", todo: "Work", isCluster: true };
  const clustered: Todo = { ...defaults, id: "clustered", todo: "Prepare report", parentId: cluster.id };
  store.items = [started, queued, last, cluster, clustered];

  store.skipTaskToEndOfCluster(started.id);

  expect(store.nextTask?.id).toBe(queued.id);
  expect(store.zenTaskOrder.map(task => task.id)).toEqual([queued.id, last.id, started.id, clustered.id]);
  expect(store.items.map(task => task.id)).toEqual([queued.id, last.id, started.id, cluster.id, clustered.id]);
  expect(started.startedAt).toBe(isStarted ? startedAt : undefined);

  store.items = [started, cluster];
  vi.mocked(store.saveTodos).mockClear();
  store.skipTaskToEndOfCluster(started.id);
  store.skipTaskToEndOfCluster("missing");
  store.skipTaskToEndOfCluster(cluster.id);
  expect(store.items).toEqual([started, cluster]);
  expect(store.saveTodos).not.toHaveBeenCalled();

  store.items = [];
  store.skipTaskToEndOfCluster(started.id);
  expect(store.nextTask).toBeNull();
});

test("skipping a started task in Zen advances to its open sibling without stopping it", () => {
  const startedAt = "2026-01-01T10:00:00.000Z";
  const taskDefaults = { completed: false, isCluster: false, isPinned: false, parentId: "cluster", createdAt: startedAt };
  const started: Todo = { ...taskDefaults, id: "started", todo: "Started task", startedAt };
  const queued: Todo = { ...taskDefaults, id: "queued", todo: "Queued task" };
  const store = setupStore<{
    items: Todo[];
    nextTask: Todo | null;
    saveTodos(): void;
    skipTaskToEndOfCluster(id: string): void;
    boardColumn(task: Todo): string;
    moveToColumn(id: string, column: "todo" | "doing", targetId?: string, after?: boolean): void;
  }>();
  store.items = [started, queued];

  expect(store.nextTask?.id).toBe(started.id);
  store.skipTaskToEndOfCluster(started.id);

  expect(store.items.map(task => task.id)).toEqual([queued.id, started.id]);
  expect(store.nextTask?.id).toBe(queued.id);
  expect(store.boardColumn(started)).toBe("doing");
  expect(started.startedAt).toBe(startedAt);

  store.skipTaskToEndOfCluster(queued.id);
  expect(store.nextTask?.id).toBe(started.id);

  store.moveToColumn(started.id, "todo");
  store.moveToColumn(started.id, "doing", queued.id, true);
  expect(store.items.map(task => task.id)).toEqual([queued.id, started.id]);
  expect(store.nextTask?.id).toBe(started.id);
});

test("auto-plan schedules ended routines, preserving their blocks and skipping active routines", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 0, 5, 8)); // Monday, local time
  const store = setupStore<{
    items: Todo[];
    scheduledItems: ScheduledItem[];
    planning: Planning;
    saveTodos(): void;
    autoPlan(fromDate: string, dayCount: number): AutoPlanResult;
  }>();
  const routine = (taskId: string, until: string | null): ScheduledItem => ({
    id: `${taskId}-routine`,
    taskId,
    date: "2025-12-29",
    startTimeMinutes: 540,
    endTimeMinutes: 585,
    repeat: { weekdays: [1], until, doneDates: ["2025-12-29"] }
  });
  const ended = routine("ended", "2026-01-04");
  const routines = [
    ended,
    routine("ends-today", "2026-01-05"),
    routine("ends-later", "2026-01-19"),
    routine("no-end", null)
  ];
  store.items = routines.map(({ taskId }) => ({
    id: taskId,
    todo: taskId,
    completed: false,
    isCluster: false,
    isPinned: false,
    parentId: null,
    createdAt: "2025-12-29T08:00:00.000Z"
  }));
  store.scheduledItems = routines;
  store.planning.availability = [{ id: "tuesday", weekdays: [2], start: 540, end: 780 }];

  const result = store.autoPlan("2026-01-06", 7);

  expect(result.blocks).toEqual([expect.objectContaining({
    taskId: ended.taskId,
    date: "2026-01-06",
    startTimeMinutes: 540,
    endTimeMinutes: 585
  })]);
  expect(result.blocks[0].repeat).toBeUndefined();
  expect(result.replaced).toEqual([]);
  expect(store.scheduledItems).toEqual([...routines, ...result.blocks]);
  expect(store.items[0].dueDate).toBe("2026-01-06");
  expect(store.autoPlan("2026-01-06", 7).blocks).toEqual([]);
});
