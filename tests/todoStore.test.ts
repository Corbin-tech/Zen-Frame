import { afterEach, expect, test, vi } from "vitest";
import { initStores, type Todo } from "../src/stores/todoStore";

afterEach(() => vi.unstubAllGlobals());

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
