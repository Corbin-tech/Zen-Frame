import { afterEach, expect, test, vi } from "vitest";
import { initStores, type Todo } from "../src/stores/todoStore";

afterEach(() => vi.unstubAllGlobals());

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
  const registerStore = vi.fn<(name: string, store: {
    items: Todo[];
    nextTask: Todo | null;
    saveTodos(): void;
    skipTaskToEndOfCluster(id: string): void;
    boardColumn(task: Todo): string;
    moveToColumn(id: string, column: "todo" | "doing", targetId?: string, after?: boolean): void;
  }) => void>();
  vi.stubGlobal("window", { Alpine: { store: registerStore } });
  initStores();
  const [, store] = registerStore.mock.calls[0];
  vi.spyOn(store, "saveTodos").mockImplementation(() => {});
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
