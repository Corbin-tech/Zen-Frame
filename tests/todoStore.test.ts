import { afterEach, expect, test, vi } from "vitest";
import { initStores, type AutoPlanResult, type CompletionRecord, type Planning, type ScheduledItem, type Todo } from "../src/stores/todoStore";
import { dispatchToast, type ToastDetail } from "../src/lib/notifications";

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

test.each([false, true])("setting a block's completion is idempotent (repeating: %s)", (repeating) => {
  const store = setupStore<{
    items: Todo[];
    history: CompletionRecord[];
    saveTodos(): void;
    setBlockDone(item: ScheduledItem, dateKey: string, done: boolean): void;
  }>();
  const day = "2026-01-05";
  const otherDay = "2026-01-06";
  const task: Todo = {
    id: "task", todo: "Review project brief", completed: false, isCluster: false,
    isPinned: false, parentId: null, createdAt: "2026-01-01T00:00:00Z",
  };
  const block: ScheduledItem = {
    id: "block", taskId: task.id, date: day, startTimeMinutes: 600, endTimeMinutes: 660,
    repeat: repeating ? { weekdays: [1, 2], until: null, doneDates: [otherDay] } : undefined,
  };
  store.items = [task];

  store.setBlockDone(block, day, true);
  store.setBlockDone(block, day, true);
  expect(task.completed).toBe(!repeating);
  if (repeating) expect(block.repeat?.doneDates).toEqual([otherDay, day]);
  expect(store.history).toHaveLength(1);
  expect(store.history[0].blockId).toBe(repeating ? block.id : undefined);
  expect(store.saveTodos).toHaveBeenCalledTimes(1);

  store.setBlockDone(block, day, false);
  store.setBlockDone(block, day, false);
  expect(task.completed).toBe(false);
  if (repeating) expect(block.repeat?.doneDates).toEqual([otherDay]);
  expect(store.history).toEqual([]);
  expect(store.saveTodos).toHaveBeenCalledTimes(2);
});

test.each([false, true])("converting a weekly block keeps the chosen day's completion (done: %s)", (done) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 13, 12));
  const store = setupStore<{
    items: Todo[];
    scheduledItems: ScheduledItem[];
    history: CompletionRecord[];
    saveTodos(): void;
    isBlockDone(item: ScheduledItem, dateKey: string): boolean;
    setBlockDone(item: ScheduledItem, dateKey: string, done: boolean): void;
    saveScheduledItem(item: ScheduledItem): void;
  }>();
  const task: Todo = {
    id: "task", todo: "Review project brief", completed: false, isCluster: false,
    isPinned: false, parentId: null, createdAt: "2026-01-01T00:00:00Z",
  };
  const firstDay = "2026-01-05";
  const selectedDay = "2026-01-12";
  const weekly: ScheduledItem = {
    id: "block", taskId: task.id, date: firstDay, startTimeMinutes: 600, endTimeMinutes: 660,
    repeat: { weekdays: [1], until: null, doneDates: [] },
  };
  store.items = [task];
  store.saveScheduledItem(weekly);
  store.setBlockDone(weekly, firstDay, true);
  store.setBlockDone(weekly, selectedDay, done);
  const [firstTick, selectedTick] = store.history;
  const otherWeekly = { ...weekly, id: "other-block", repeat: { weekdays: [1], until: null, doneDates: [] } };
  store.saveScheduledItem(otherWeekly);
  store.setBlockDone(otherWeekly, selectedDay, true);
  const otherTick = store.history.at(-1);

  const oneOff = { ...weekly, date: selectedDay, repeat: undefined };
  store.saveScheduledItem(oneOff);

  expect(store.scheduledItems).toEqual([otherWeekly, oneOff]);
  expect(store.isBlockDone(oneOff, selectedDay)).toBe(done);
  expect(task.completed).toBe(done);
  expect(task.dueDate).toBe(selectedDay);
  expect(task.completedAt).toBe(selectedTick?.at);
  expect(store.history).toEqual(done ? [firstTick, otherTick, {
    taskId: task.id, title: task.todo, clusterId: null, clusterName: '', dueDate: selectedDay, at: selectedTick.at,
  }] : [firstTick, otherTick]);

  store.setBlockDone(oneOff, selectedDay, false);
  expect(store.history).toEqual([firstTick, otherTick]);
});

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
    { key: "scheduledItems", field: "scheduledItems", entries: ["keep", "edit", "delete"].map(id => ({ id, taskId: id, date: "2026-01-01", startTimeMinutes: 540, endTimeMinutes: 600 })) },
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
    // History entries are normalized to their known fields, so drop the extra keys the
    // shared fixture adds (id/todo) on the remote-derived entry before comparing
    const norm = (entry: any) => key === "history"
      ? { taskId: entry.taskId, title: typeof entry.title === "string" ? entry.title : "", clusterId: null, clusterName: "", dueDate: null, at: entry.at, ...(entry.blockId ? { blockId: entry.blockId } : {}) }
      : entry;
    const localEdited = { ...entries[1], title: "local", todo: "local" };
    expect(a.store[field]).toEqual([norm(remote[0]), localEdited, added]);
    expect(a.store.savedJson[key]).toBe(JSON.stringify(remote.map(norm)));
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
  const values = { skippedClusters: ["cluster"], scheduledItems: [{ id: "block", taskId: "task", date: "2026-01-01", startTimeMinutes: 540, endTimeMinutes: 600 }], planning: { duration: 30 }, history: [{ taskId: "done", at: "2026-01-01T10:00:00.000Z" }] };
  for (const [key, value] of Object.entries(values)) {
    storage.setItem(key, JSON.stringify(value));
    a.dispatch("storage", { key, newValue: JSON.stringify(value), storageArea: storage });
  }
  expect(a.store.skippedClusters).toEqual(values.skippedClusters);
  expect(a.store.scheduledItems).toEqual(values.scheduledItems);
  expect(a.store.history).toEqual([{ taskId: "done", title: "", clusterId: null, clusterName: "", dueDate: null, at: "2026-01-01T10:00:00.000Z" }]);
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

test("init survives malformed null entries in persisted scheduledItems, history, and skippedClusters", () => {
  const data = new Map<string, string>([
    ["scheduledItems", JSON.stringify([null, { id: "bad" }, { id: "ok", taskId: "t1", date: "2026-01-01", startTimeMinutes: 540, endTimeMinutes: 600 }])],
    ["history", JSON.stringify([null, { taskId: "" }, { taskId: "t1", at: "2026-01-01T10:00:00.000Z" }])],
    ["skippedClusters", JSON.stringify([null, 42, "c1"])]
  ]);
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("document", { addEventListener: vi.fn(), hidden: false });
  let store: any;
  vi.stubGlobal("window", {
    Alpine: { store: (_name: string, value: any) => { store = value; } },
    setTimeout: vi.fn(), clearTimeout: vi.fn(),
    addEventListener: vi.fn()
  });
  initStores();
  expect(() => store.init()).not.toThrow();
  expect(store.scheduledItems).toEqual([{ id: "ok", taskId: "t1", date: "2026-01-01", startTimeMinutes: 540, endTimeMinutes: 600 }]);
  expect(store.history).toEqual([{ taskId: "t1", title: "", clusterId: null, clusterName: "", dueDate: null, at: "2026-01-01T10:00:00.000Z" }]);
  expect(store.skippedClusters).toEqual(["c1"]);
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

// The undo/toast foundation: destructive store actions capture what they remove,
// then fire an "app-toast" (with the Undo action in the detail) that restores it.
type UndoStore = {
  items: Todo[];
  skippedClusters: string[];
  scheduledItems: ScheduledItem[];
  saveTodos(): void;
  deleteTodo(id: string): void;
  deleteCompleted(): void;
  clearClusterCompleted(clusterId: string | null): void;
};

function undoStore(): { store: UndoStore; toasts: ToastDetail[] } {
  const registerStore = vi.fn<(name: string, store: UndoStore) => void>();
  const toasts: ToastDetail[] = [];
  vi.stubGlobal("window", {
    Alpine: { store: registerStore },
    dispatchEvent: vi.fn((event: { detail: ToastDetail }) => toasts.push(event.detail))
  });
  vi.stubGlobal("CustomEvent", class {
    detail: ToastDetail;
    constructor(_type: string, init: { detail: ToastDetail }) { this.detail = init.detail; }
  });
  initStores();
  const [, store] = registerStore.mock.calls[0];
  vi.spyOn(store, "saveTodos").mockImplementation(() => {});
  return { store, toasts };
}

const made = (fields: Partial<Todo> & { id: string }): Todo => ({
  todo: fields.id,
  completed: false,
  isCluster: false,
  isPinned: false,
  parentId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...fields
});

test("clear-completed fires one Undo toast whose action restores the removed items in place", () => {
  const { store, toasts } = undoStore();
  const keep = made({ id: "keep", todo: "Water the plant" });
  const doneOne = made({ id: "done-one", todo: "Submit the report", completed: true, completedAt: "2026-01-02T10:00:00.000Z" });
  const cluster = made({ id: "cluster", todo: "Website relaunch", isCluster: true, color: "teal" });
  const doneTwo = made({ id: "done-two", todo: "Proofread the copy", completed: true, completedAt: "2026-01-02T11:00:00.000Z", parentId: "cluster" });
  const keepTwo = made({ id: "keep-two", todo: "Order business cards", parentId: "cluster" });
  // An unpinned cluster whose only task is complete goes with that task
  const oldCluster = made({ id: "old-cluster", todo: "Static site migration", isCluster: true, color: "indigo" });
  const oldDone = made({ id: "old-done", todo: "Move the last pages", completed: true, completedAt: "2026-01-02T12:00:00.000Z", parentId: "old-cluster" });
  store.items = [keep, doneOne, cluster, doneTwo, keepTwo, oldCluster, oldDone];
  store.skippedClusters = [oldCluster.id, cluster.id];
  const doneBlock = { id: "block", taskId: "done-one", date: "2026-01-03", startTimeMinutes: 540, endTimeMinutes: 600 };
  const classBlock = { id: "class", taskId: "cluster", date: "2026-01-05", startTimeMinutes: 540, endTimeMinutes: 660, repeat: { weekdays: [1], until: null, doneDates: [] } };
  store.scheduledItems = [doneBlock, classBlock];

  store.deleteCompleted();

  expect(store.items.map(item => item.id)).toEqual([keep.id, cluster.id, keepTwo.id]);
  expect(store.skippedClusters).toEqual([cluster.id]);
  expect(store.scheduledItems).toEqual([classBlock]);
  expect(toasts).toEqual([{
    title: "Cleared completed",
    body: "3 tasks cleared",
    actionLabel: "Undo",
    onAction: expect.any(Function)
  }]);

  toasts[0].onAction!();

  // The exact items, in their original order, with their original identities
  expect(store.items.map(item => item.id)).toEqual([keep.id, doneOne.id, cluster.id, doneTwo.id, keepTwo.id, oldCluster.id, oldDone.id]);
  expect(store.items[1]).toBe(doneOne);
  expect(store.items[6].parentId).toBe(oldCluster.id);
  expect(store.skippedClusters).toEqual([oldCluster.id, cluster.id]);
  expect(store.scheduledItems).toEqual([doneBlock, classBlock]);
  expect(store.saveTodos).toHaveBeenCalled();
});

test("deleting a task removes its blocks and an undo puts both back", () => {
  const confirm = vi.fn();
  vi.stubGlobal("confirm", confirm);
  const { store, toasts } = undoStore();
  const task = made({ id: "task", todo: "Book the venue" });
  const block = { id: "block", taskId: "task", date: "2026-01-05", startTimeMinutes: 600, endTimeMinutes: 660 };
  store.items = [task];
  store.scheduledItems = [block];

  store.deleteTodo(task.id);

  expect(confirm).not.toHaveBeenCalled(); // Undo covers unpinned deletions; no confirm needed
  expect(store.items).toEqual([]);
  expect(store.scheduledItems).toEqual([]);
  expect(toasts).toEqual([expect.objectContaining({ title: "Task deleted", body: "Book the venue" })]);

  toasts[0].onAction!();

  expect(store.items).toEqual([task]);
  expect(store.items[0]).toBe(task);
  expect(store.scheduledItems).toEqual([block]);
});

test("a pinned cluster still requires its confirm, and a decline changes nothing", () => {
  vi.stubGlobal("confirm", () => false);
  const { store, toasts } = undoStore();
  const cluster = made({ id: "cluster", todo: "Class schedule", isCluster: true, isPinned: true });
  const task = made({ id: "task", todo: "Buy a planner", parentId: "cluster" });
  store.items = [cluster, task];

  store.deleteTodo(cluster.id);

  expect(store.items.map(item => item.id)).toEqual([cluster.id, task.id]);
  expect(toasts).toEqual([]);
});

test("an accepted pinned-cluster confirm deletes with an Undo toast that restores the cluster", () => {
  vi.stubGlobal("confirm", () => true);
  const { store, toasts } = undoStore();
  const cluster = made({ id: "cluster", todo: "Class schedule", isCluster: true, isPinned: true });
  const task = made({ id: "task", todo: "Buy a planner", parentId: "cluster" });
  store.items = [cluster, task];

  store.deleteTodo(cluster.id);

  expect(store.items).toEqual([]);
  expect(toasts).toEqual([expect.objectContaining({ title: "Cluster deleted", body: "Class schedule" })]);

  toasts[0].onAction!();

  expect(store.items.map(item => item.id)).toEqual([cluster.id, task.id]);
  expect(store.items[1].parentId).toBe(cluster.id);
});

test("plain { title, body } toasts are unchanged and no-op deletions stay silent", () => {
  const { store, toasts } = undoStore();
  vi.mocked(store.saveTodos).mockClear();

  dispatchToast({ title: "Water the ferns", body: "Today at noon" });
  expect(toasts).toEqual([{ title: "Water the ferns", body: "Today at noon" }]);

  store.deleteTodo("missing");
  store.deleteCompleted();
  expect(toasts).toEqual([{ title: "Water the ferns", body: "Today at noon" }]);
  expect(store.saveTodos).not.toHaveBeenCalled();
});

// The ordered move (spec item 12): a drop on a row lands directly before or after that
// row, within its list or across lists; a drop on a container reassigns the cluster
// only, so the two handlers one drop fires never fight over position. A no-op move
// (dropped on itself, or back where it already sat) restores nothing and saves nothing.
type MoveStore = {
  items: Todo[];
  saveTodos(): void;
  moveTaskTo(taskId: string, target: { clusterId: string | null; beforeId?: string; afterId?: string }): boolean;
  moveTask(taskId: string, clusterId: string): void;
};

const clusterOf = (id: string): Todo => made({ id, todo: id, isCluster: true, color: "teal" });
const inCluster = (id: string, parentId: string): Todo => made({ id, todo: id, parentId });
const looseTask = (id: string): Todo => made({ id, todo: id });

function moveResult(store: MoveStore, taskId: string, target: Parameters<MoveStore["moveTaskTo"]>[1]) {
  vi.mocked(store.saveTodos).mockClear();
  const moved = store.moveTaskTo(taskId, target);
  return { moved, order: store.items.map(item => item.id), saved: store.saveTodos.mock.calls.length > 0 };
}

test("a row drop reorders within a cluster, before or after first, middle, and last", () => {
  const store = setupStore<MoveStore>();
  const pristine = () => [clusterOf("alpha"), inCluster("a1", "alpha"), inCluster("a2", "alpha"), inCluster("a3", "alpha")];
  const cluster = (order: string[]) => ["alpha", ...order];

  store.items = pristine();
  expect(moveResult(store, "a3", { clusterId: "alpha", beforeId: "a1" }))
    .toEqual({ moved: true, order: cluster(["a3", "a1", "a2"]), saved: true });

  store.items = pristine();
  expect(moveResult(store, "a1", { clusterId: "alpha", afterId: "a3" }))
    .toEqual({ moved: true, order: cluster(["a2", "a3", "a1"]), saved: true });

  store.items = pristine();
  expect(moveResult(store, "a3", { clusterId: "alpha", beforeId: "a2" }))
    .toEqual({ moved: true, order: cluster(["a1", "a3", "a2"]), saved: true });

  store.items = pristine();
  expect(moveResult(store, "a1", { clusterId: "alpha", afterId: "a2" }))
    .toEqual({ moved: true, order: cluster(["a2", "a1", "a3"]), saved: true });

  store.items = pristine();
  expect(moveResult(store, "a2", { clusterId: "alpha", afterId: "a1" }))
    .toEqual({ moved: false, order: cluster(["a1", "a2", "a3"]), saved: false });

  store.items = pristine();
  expect(moveResult(store, "a2", { clusterId: "alpha", beforeId: "a3" }))
    .toEqual({ moved: false, order: cluster(["a1", "a2", "a3"]), saved: false });
});

test("no-op moves save nothing: dropping on itself, the same place, another cluster already home", () => {
  const store = setupStore<MoveStore>();
  store.items = [clusterOf("alpha"), inCluster("a1", "alpha"), inCluster("a2", "alpha"), clusterOf("beta"), inCluster("b1", "beta"), looseTask("l1")];
  const pristine = store.items.map(item => item.id);

  // Dropped on itself
  expect(moveResult(store, "a1", { clusterId: "alpha", beforeId: "a1" })).toEqual({ moved: false, order: pristine, saved: false });
  expect(moveResult(store, "b1", { clusterId: "beta", afterId: "b1" })).toEqual({ moved: false, order: pristine, saved: false });
  // A container drop into the list the task is already in
  expect(moveResult(store, "a2", { clusterId: "alpha" })).toEqual({ moved: false, order: pristine, saved: false });
  expect(moveResult(store, "l1", { clusterId: null })).toEqual({ moved: false, order: pristine, saved: false });
  // Missing task, missing target, or a cluster as the target
  expect(moveResult(store, "missing", { clusterId: "alpha", beforeId: "a1" })).toEqual({ moved: false, order: pristine, saved: false });
  expect(moveResult(store, "a1", { clusterId: "alpha", beforeId: "missing" })).toEqual({ moved: false, order: pristine, saved: false });
  expect(moveResult(store, "a1", { clusterId: "alpha", beforeId: "beta" })).toEqual({ moved: false, order: pristine, saved: false });

  expect(store.items.map(item => item.id)).toEqual(pristine);
  expect(store.items.map(item => item.parentId)).toEqual([null, "alpha", "alpha", null, "beta", null]);
});

test("rows move across clusters and out to loose tasks at the dropped position", () => {
  const store = setupStore<MoveStore>();
  const pristine = () => [clusterOf("alpha"), inCluster("a1", "alpha"), inCluster("a2", "alpha"), clusterOf("beta"), inCluster("b1", "beta"), looseTask("l1"), looseTask("l2")];

  // Across clusters, before and after the target
  store.items = pristine();
  const intoBeta = moveResult(store, "a2", { clusterId: "beta", beforeId: "b1" });
  expect(intoBeta).toEqual({ moved: true, order: ["alpha", "a1", "beta", "a2", "b1", "l1", "l2"], saved: true });
  expect(store.items[3].parentId).toBe("beta");

  store.items = pristine();
  expect(moveResult(store, "l1", { clusterId: "alpha", afterId: "a1" }))
    .toEqual({ moved: true, order: ["alpha", "a1", "l1", "a2", "beta", "b1", "l2"], saved: true });

  // Out to loose tasks, before and after a loose target
  store.items = pristine();
  expect(moveResult(store, "b1", { clusterId: null, afterId: "l1" }))
    .toEqual({ moved: true, order: ["alpha", "a1", "a2", "beta", "l1", "b1", "l2"], saved: true });
  expect(store.items[5].parentId).toBeNull();

  store.items = pristine();
  expect(moveResult(store, "a2", { clusterId: null, beforeId: "l1" }))    .toEqual({ moved: true, order: ["alpha", "a1", "beta", "b1", "a2", "l1", "l2"], saved: true });

  // A container drop reassigns the cluster and keeps list position, in both directions
  store.items = pristine();
  expect(moveResult(store, "a2", { clusterId: null }))
    .toEqual({ moved: true, order: ["alpha", "a1", "a2", "beta", "b1", "l1", "l2"], saved: true });
  expect(store.items[2].parentId).toBeNull();

  store.items = pristine();
  expect(moveResult(store, "l2", { clusterId: "beta" }))
    .toEqual({ moved: true, order: ["alpha", "a1", "a2", "beta", "b1", "l1", "l2"], saved: true });
  expect(store.items[6].parentId).toBe("beta"); // l2 keeps its list position, joins beta

  // The old moveTask stays a thin wrapper over the same semantics
  store.items = pristine();
  vi.mocked(store.saveTodos).mockClear();
  store.moveTask("l1", "alpha");
  expect(store.items.map(item => item.id)).toEqual(["alpha", "a1", "a2", "beta", "b1", "l1", "l2"]);
  expect(store.items[5].parentId).toBe("alpha");
  expect(store.saveTodos).toHaveBeenCalled();
});

test("row drops that keep the same array order still reassign parentId across lists", () => {
  const store = setupStore<MoveStore>();

  // Loose task immediately before a cluster task, dropped onto its top half (beforeId)
  store.items = [clusterOf("alpha"), looseTask("l1"), inCluster("a1", "alpha")];
  expect(moveResult(store, "l1", { clusterId: "alpha", beforeId: "a1" }))
    .toEqual({ moved: true, order: ["alpha", "l1", "a1"], saved: true });
  expect(store.items[1].parentId).toBe("alpha");

  // Cluster task immediately after a loose task, dropped onto its bottom half (afterId)
  store.items = [clusterOf("alpha"), looseTask("l1"), inCluster("a1", "alpha")];
  expect(moveResult(store, "a1", { clusterId: null, afterId: "l1" }))
    .toEqual({ moved: true, order: ["alpha", "l1", "a1"], saved: true });
  expect(store.items[2].parentId).toBeNull();

  // Adjacent tasks in different clusters, beforeId and afterId
  store.items = [clusterOf("alpha"), clusterOf("beta"), inCluster("a1", "alpha"), inCluster("b1", "beta")];
  expect(moveResult(store, "a1", { clusterId: "beta", beforeId: "b1" }))
    .toEqual({ moved: true, order: ["alpha", "beta", "a1", "b1"], saved: true });
  expect(store.items[2].parentId).toBe("beta");

  store.items = [clusterOf("alpha"), clusterOf("beta"), inCluster("a1", "alpha"), inCluster("b1", "beta")];
  expect(moveResult(store, "b1", { clusterId: "alpha", afterId: "a1" }))
    .toEqual({ moved: true, order: ["alpha", "beta", "a1", "b1"], saved: true });
  expect(store.items[3].parentId).toBe("alpha");
});

test("clearing one cluster's completed tasks fires one Undo toast that restores their positions", () => {
  const { store, toasts } = undoStore();
  const alpha = clusterOf("alpha");
  const a1 = inCluster("a1", "alpha");
  const doneTwo = made({ id: "done-two", todo: "Proofread the copy", completed: true, completedAt: "2026-01-02T11:00:00.000Z", parentId: "alpha" });
  const doneLoose = made({ id: "done-loose", todo: "Archive the receipts", completed: true, completedAt: "2026-01-02T12:00:00.000Z" });
  const l1 = looseTask("l1");
  const beta = clusterOf("beta");
  const doneBeta = made({ id: "done-beta", todo: "Ship the invites", completed: true, completedAt: "2026-01-02T13:00:00.000Z", parentId: "beta" });
  store.items = [alpha, a1, doneTwo, beta, doneBeta, doneLoose, l1];
  vi.mocked(store.saveTodos).mockClear();

  store.clearClusterCompleted("alpha");

  // Only alpha's finished task went; beta's and the loose one stayed
  expect(store.items.map(item => item.id)).toEqual(["alpha", "a1", "beta", "done-beta", "done-loose", "l1"]);
  expect(toasts).toEqual([{
    title: "Cleared 1 completed task",
    body: "From alpha",
    actionLabel: "Undo",
    onAction: expect.any(Function)
  }]);
  expect(store.saveTodos).toHaveBeenCalled();

  toasts[0].onAction!();

  // The exact item, back at its exact position
  expect(store.items.map(item => item.id)).toEqual(["alpha", "a1", "done-two", "beta", "done-beta", "done-loose", "l1"]);
  expect(store.items[2]).toBe(doneTwo);
  expect(doneTwo.parentId).toBe("alpha");

  // The loose list's own clear, through the same store method with null
  toasts.pop();
  vi.mocked(store.saveTodos).mockClear();
  store.clearClusterCompleted(null);
  expect(store.items.map(item => item.id)).toEqual(["alpha", "a1", "done-two", "beta", "done-beta", "l1"]);
  expect(toasts).toEqual([expect.objectContaining({ title: "Cleared 1 completed task", body: "From loose tasks" })]);

  toasts[0].onAction!();
  expect(store.items.map(item => item.id)).toEqual(["alpha", "a1", "done-two", "beta", "done-beta", "done-loose", "l1"]);
});

test("clearing a list with nothing completed is silent and saves nothing", () => {
  const { store, toasts } = undoStore();
  store.items = [clusterOf("alpha"), inCluster("a1", "alpha"), looseTask("l1")];
  vi.mocked(store.saveTodos).mockClear();

  store.clearClusterCompleted("alpha");
  store.clearClusterCompleted(null);

  expect(store.items.map(item => item.id)).toEqual(["alpha", "a1", "l1"]);
  expect(toasts).toEqual([]);
  expect(store.saveTodos).not.toHaveBeenCalled();
});

test("a new cluster defaults to the sentence-case 'New cluster'", () => {
  const store = setupStore<{ items: Todo[]; saveTodos(): void; createCluster(name?: string): string; updateTask(id: string, updates: Partial<Todo>): void }>();
  const id = store.createCluster("");
  expect(store.items[0].todo).toBe("New cluster");

  // Emptying a cluster's name falls back to the same default
  store.updateTask(id, { todo: "   " });
  expect(store.items[0].todo).toBe("New cluster");
  expect(store.saveTodos).toHaveBeenCalled();
});

test("clearing a task title keeps its previous title", () => {
  const store = setupStore<{ items: Todo[]; saveTodos(): void; updateTask(id: string, updates: Partial<Todo>): void }>();
  const cluster = clusterOf("alpha");
  const task = made({ id: "t1", todo: "Draft release notes", updatedAt: "2026-01-01T10:00:00.000Z" });
  store.items = [cluster, task];

  store.updateTask("t1", { todo: "" });
  store.updateTask("t1", { todo: "   " });

  expect(task.todo).toBe("Draft release notes");
  expect(task.updatedAt).toBe("2026-01-01T10:00:00.000Z");
  expect(store.saveTodos).not.toHaveBeenCalled();

  // Other fields in the same update still apply without blanking the title
  store.updateTask("t1", { todo: "   ", parentId: "alpha" });
  expect(task.todo).toBe("Draft release notes");
  expect(task.parentId).toBe("alpha");
  expect(store.saveTodos).toHaveBeenCalledTimes(1);

  // Non-empty titles still trim and save
  store.updateTask("t1", { todo: "  Publish release notes  " });
  expect(task.todo).toBe("Publish release notes");
  expect(store.saveTodos).toHaveBeenCalledTimes(2);
});

test("Undo for a task whose cluster was deleted since brings it back as a loose task", () => {
  const { store, toasts } = undoStore();
  const cluster = made({ id: "cluster", todo: "Errands", isCluster: true });
  const task = made({ id: "task", todo: "Buy stamps", parentId: "cluster" });
  const sibling = made({ id: "sibling", todo: "Post the letter", parentId: "cluster" });
  store.items = [cluster, task, sibling];

  store.deleteTodo(task.id);
  store.deleteTodo(cluster.id);
  expect(store.items).toEqual([]);

  toasts[0].onAction!(); // Undo on the task's toast, still in the stack

  expect(store.items.map(item => item.id)).toEqual(["task"]);
  expect(store.items[0].parentId).toBeNull();
});

test("shifting and positioning open tasks skips completed siblings in the same list", () => {
  const store = setupStore<{
    items: Todo[];
    saveTodos(): void;
    siblingsOf(task: Todo, sameCompletion?: boolean): Todo[];
    shiftTask(taskId: string, direction: -1 | 1): void;
    getTaskPosition(taskId: string): number;
    isFirstTask(taskId: string): boolean;
    isLastTask(taskId: string): boolean;
    milestoneOf(task: Todo): string;
  }>();
  const alpha = clusterOf("alpha");
  const doneBefore = made({ id: "done-before", todo: "Done before", completed: true, parentId: "alpha" });
  const openFirst = made({ id: "open-first", todo: "Open first", parentId: "alpha" });
  const doneMiddle = made({ id: "done-middle", todo: "Done middle", completed: true, parentId: "alpha" });
  const openSecond = made({ id: "open-second", todo: "Open second", parentId: "alpha" });
  const doneAfter = made({ id: "done-after", todo: "Done after", completed: true, parentId: "alpha" });
  store.items = [alpha, doneBefore, openFirst, doneMiddle, openSecond, doneAfter];

  expect(store.siblingsOf(openFirst).map(item => item.id)).toEqual(["open-first", "open-second"]);
  expect(store.getTaskPosition("open-first")).toBe(1);
  expect(store.getTaskPosition("open-second")).toBe(2);
  expect(store.isFirstTask("open-first")).toBe(true);
  expect(store.isLastTask("open-first")).toBe(false);
  expect(store.isFirstTask("open-second")).toBe(false);
  expect(store.isLastTask("open-second")).toBe(true);

  // Moving past the open edges is a no-op and does not swap with hidden completed tasks
  store.shiftTask("open-first", -1);
  store.shiftTask("open-second", 1);
  expect(store.items.map(item => item.id)).toEqual(["alpha", "done-before", "open-first", "done-middle", "open-second", "done-after"]);
  expect(store.saveTodos).not.toHaveBeenCalled();

  // Moving up skips the completed task in between in one step
  store.shiftTask("open-second", -1);
  expect(store.items.filter(item => !item.isCluster && !item.completed).map(item => item.id)).toEqual(["open-second", "open-first"]);
  expect(store.items.filter(item => !item.isCluster && item.completed).map(item => item.id)).toEqual(["done-before", "done-middle", "done-after"]);
  expect(store.getTaskPosition("open-second")).toBe(1);
  expect(store.isFirstTask("open-second")).toBe(true);
  expect(store.isLastTask("open-first")).toBe(true);

  // Completed tasks reorder among themselves without swapping with open tasks
  store.shiftTask("done-middle", -1);
  expect(store.items.filter(item => !item.isCluster && item.completed).map(item => item.id)).toEqual(["done-middle", "done-before", "done-after"]);
  expect(store.items.filter(item => !item.isCluster && !item.completed).map(item => item.id)).toEqual(["open-second", "open-first"]);

  // Cluster milestones still consider every task in the cluster, open and completed
  expect(store.milestoneOf(doneBefore)).toBe("task");
  const beta = clusterOf("beta");
  const betaDone = made({ id: "beta-done", todo: "Beta done", completed: true, parentId: "beta" });
  store.items.push(beta, betaDone);
  expect(store.milestoneOf(betaDone)).toBe("cluster");
});
