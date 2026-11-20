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

function sharedTabs() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("document", { addEventListener: vi.fn(), hidden: false });
  function tab() {
    let store: any;
    const listeners = new Map<string, (event: any) => void>();
    vi.stubGlobal("window", {
      Alpine: { store: (_name: string, value: any) => { store = value; } },
      setTimeout: vi.fn(), clearTimeout: vi.fn(),
      addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener)
    });
    initStores();
    store.init();
    return { store, dispatch: (name: string, event = {}) => listeners.get(name)?.(event) };
  }
  return { a: tab(), b: tab(), storage };
}

test("another tab loads saved tasks before adding its own", () => {
  const { a, b, storage } = sharedTabs();
  a.store.addTodo("Task A");
  a.store.writeTodos();
  b.dispatch("storage", { key: "todos", newValue: storage.getItem("todos"), storageArea: storage });
  b.store.addTodo("Task B");
  b.store.writeTodos();
  expect(JSON.parse(storage.getItem("todos")!).map((task: Todo) => task.todo)).toEqual(["Task A", "Task B"]);
});

test("a pending local add survives a remote write before its timer flushes", () => {
  const { a, b, storage } = sharedTabs();
  b.store.addTodo("Pending B");
  const flush = vi.mocked(window.setTimeout).mock.calls.at(-1)![0] as () => void;
  a.store.addTodo("Saved A");
  a.store.writeTodos();
  b.dispatch("storage", { key: "todos", newValue: storage.getItem("todos"), storageArea: storage });
  flush();
  expect(JSON.parse(storage.getItem("todos")!).map((task: Todo) => task.todo)).toEqual(["Saved A", "Pending B"]);
});

test("dirty keyed lists merge local additions, edits, and deletions over remote changes", () => {
  const { a, storage } = sharedTabs();
  const cases = [
    { key: "todos", field: "items", entries: ["keep", "edit", "delete"].map(id => ({ id, todo: id, completed: false, isCluster: false, isPinned: false, parentId: null, createdAt: "2026-01-01" })) },
    { key: "scheduledItems", field: "scheduledItems", entries: ["keep", "edit", "delete"].map(id => ({ id, taskId: id })) },
    { key: "history", field: "history", entries: ["keep", "edit", "delete"].map(taskId => ({ taskId, at: "2026-01-01", blockId: "block", title: taskId })) }
  ];
  for (const { key, field, entries: initial } of cases) {
    let entries: any[] = initial;
    storage.setItem(key, JSON.stringify(entries));
    a.dispatch("storage", { key, storageArea: storage });
    entries = a.store[field];
    const added = { ...entries[0], id: "added", taskId: "added" };
    a.store[field] = [entries[0], { ...entries[1], title: "local", todo: "local" }, added];
    const remote = [{ ...entries[0], title: "remote", todo: "remote" }, entries[1], entries[2]];
    storage.setItem(key, JSON.stringify(remote));
    a.dispatch("storage", { key, storageArea: storage });
    expect(a.store[field]).toEqual([remote[0], { ...entries[1], title: "local", todo: "local" }, added]);
    expect(a.store.savedJson[key]).toBe(JSON.stringify(remote));
  }
});

test("dirty skipped clusters merge as a set and dirty planning stays local", () => {
  const { a, storage } = sharedTabs();
  storage.setItem("skippedClusters", '["keep","delete"]');
  a.dispatch("storage", { key: "skippedClusters", storageArea: storage });
  a.store.skippedClusters = ["keep", "local"];
  storage.setItem("skippedClusters", '["keep","delete","remote"]');
  a.dispatch("storage", { key: "skippedClusters", storageArea: storage });
  expect(a.store.skippedClusters).toEqual(["keep", "remote", "local"]);
  a.store.planning.duration = 60;
  storage.setItem("planning", '{"duration":30}');
  a.dispatch("storage", { key: "planning", storageArea: storage });
  expect(a.store.planning.duration).toBe(60);
  a.store.writeTodos();
  expect(JSON.parse(storage.getItem("planning")!).duration).toBe(60);
  a.store.skippedClusters = [];
  storage.setItem("skippedClusters", '["keep","remote","local","new"]');
  a.dispatch("storage", { key: "skippedClusters", storageArea: storage });
  expect(a.store.skippedClusters).toEqual(["new"]);
});

test("an unchanged stale tab does not overwrite another tab on unload", () => {
  const { a, b, storage } = sharedTabs();
  a.store.addTodo("Task A");
  a.store.writeTodos();
  b.dispatch("storage", { key: "todos", newValue: storage.getItem("todos"), storageArea: storage });
  b.store.addTodo("Task B");
  b.store.writeTodos();
  const saved = storage.getItem("todos");
  storage.setItem.mockClear();
  a.dispatch("pagehide");
  expect(storage.getItem("todos")).toBe(saved);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test("storage reloads each list, merges planning defaults, and handles removal and clear", () => {
  const { a, storage } = sharedTabs();
  const values = { skippedClusters: ["cluster"], scheduledItems: [{ id: "block" }], planning: { duration: 30 }, history: [{ taskId: "done" }] };
  for (const [key, value] of Object.entries(values)) {
    storage.setItem(key, JSON.stringify(value));
    a.dispatch("storage", { key, newValue: JSON.stringify(value), storageArea: storage });
  }
  expect(a.store.skippedClusters).toEqual(values.skippedClusters);
  expect(a.store.scheduledItems).toEqual(values.scheduledItems);
  expect(a.store.history).toEqual(values.history);
  expect(a.store.planning).toEqual({ availability: [], duration: 30, gap: 15 });
  storage.setItem("planning", "");
  a.dispatch("storage", { key: "planning", newValue: null, storageArea: storage });
  expect(a.store.planning.duration).toBe(45);
  for (const key of Object.keys(values)) storage.setItem(key, "");
  a.dispatch("storage", { key: null, newValue: null, storageArea: storage });
  expect(a.store.skippedClusters).toEqual([]);
  expect(a.store.scheduledItems).toEqual([]);
  expect(a.store.history).toEqual([]);
  storage.setItem.mockClear();
  a.store.writeTodos();
  expect(storage.setItem).not.toHaveBeenCalled();
});

test("failed writes stop the batch and retry without marking the failed key saved", () => {
  const { a, storage } = sharedTabs();
  a.store.addTodo("Retry me");
  a.store.skippedClusters = ["cluster"];
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("CustomEvent", class { constructor(public type: string) {} });
  (window as any).dispatchEvent = vi.fn();
  storage.setItem.mockImplementationOnce(() => { throw new Error("full"); });
  a.store.writeTodos();
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect((window as any).dispatchEvent).toHaveBeenCalledTimes(1);
  a.store.writeTodos();
  expect(JSON.parse(storage.getItem("todos")!)[0].todo).toBe("Retry me");
  expect(storage.getItem("skippedClusters")).toBe('["cluster"]');
  storage.setItem.mockClear();
  a.store.suspendWrites();
  a.store.addTodo("Do not save");
  a.store.writeTodos();
  expect(storage.setItem).not.toHaveBeenCalled();
  error.mockRestore();
});

test("history backfills update the saved snapshot", () => {
  const { a, storage } = sharedTabs();
  a.store.addTodo("Already done", { completed: true, completedAt: "2026-01-01T10:00:00.000Z" });
  a.store.recordExistingCompletions();
  expect(JSON.parse(storage.getItem("history")!)).toHaveLength(1);
  a.store.writeTodos();
  storage.setItem.mockClear();
  a.store.recordExistingCompletions();
  a.store.writeTodos();
  expect(storage.setItem).not.toHaveBeenCalled();
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
