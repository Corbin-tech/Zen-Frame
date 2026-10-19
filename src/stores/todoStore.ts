export interface Todo {
  id: string;
  todo: string;
  completed: boolean;
  isCluster: boolean;
  isPinned: boolean;
  parentId: string | null;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export interface ScheduledItem {
  id: string;
  taskId: string;
  date: string; // Local date as YYYY-MM-DD
  startTimeMinutes: number;
  endTimeMinutes: number;
}

const NEW_CLUSTER_NAME = "New Cluster";

function loadJson<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : fallback;
}

function createTodosStore() {
  return {
    items: [] as Todo[],
    skippedClusters: [] as string[],
    scheduledItems: [] as ScheduledItem[],

    get clusters(): Todo[] {
      return this.items.filter(item => item.isCluster);
    },

    get hasCompletedTasks(): boolean {
      return this.items.some(item => item.completed);
    },

    // Alpine calls init() when the store is registered
    init(): void {
      this.items = loadJson<Todo[]>("todos", []).map(item => ({ ...item, parentId: item.parentId ?? null }));
      this.skippedClusters = loadJson<string[]>("skippedClusters", []);
      this.scheduledItems = loadJson<ScheduledItem[]>("scheduledItems", []);
    },

    saveTodos(): void {
      localStorage.setItem("todos", JSON.stringify(this.items));
      localStorage.setItem("skippedClusters", JSON.stringify(this.skippedClusters));
      localStorage.setItem("scheduledItems", JSON.stringify(this.scheduledItems));
    },

    find(id: string): Todo | undefined {
      return this.items.find(item => item.id === id);
    },

    addTodo(todoText: string, isCluster = false): string {
      const id = crypto.randomUUID();
      this.items = [...this.items, {
        id,
        todo: todoText,
        completed: false,
        isCluster,
        isPinned: false,
        parentId: null,
        createdAt: new Date().toISOString()
      }];
      this.saveTodos();
      return id;
    },

    createCluster(name = NEW_CLUSTER_NAME): string {
      return this.addTodo(name.trim() || NEW_CLUSTER_NAME, true);
    },

    deleteTodo(id: string): void {
      const todo = this.find(id);
      if (!todo) return;

      if (todo.isCluster && todo.isPinned &&
          !confirm(`"${todo.todo}" is pinned. Delete it and all of its tasks?`)) {
        return;
      }

      const ids = this.items.filter(item => item.id === id || item.parentId === id).map(item => item.id);
      this.removeItems(new Set(ids));
    },

    deleteCompleted(): void {
      // Unpinned clusters whose tasks are all complete go away with their tasks
      const finishedClusterIds = this.clusters
        .filter(cluster => {
          if (cluster.isPinned) return false;
          const tasks = this.items.filter(item => item.parentId === cluster.id);
          return tasks.length > 0 && tasks.every(task => task.completed);
        })
        .map(cluster => cluster.id);

      const ids = this.items
        .filter(item => item.completed || finishedClusterIds.includes(item.id))
        .map(item => item.id);
      this.removeItems(new Set(ids));
    },

    // Removes items and everything that points at them
    removeItems(ids: Set<string>): void {
      this.items = this.items.filter(item => !ids.has(item.id));
      this.scheduledItems = this.scheduledItems.filter(entry => !ids.has(entry.taskId));
      this.skippedClusters = this.skippedClusters.filter(clusterId => !ids.has(clusterId));
      this.saveTodos();
    },

    toggleTodo(id: string): void {
      const todo = this.find(id);
      if (!todo) return;

      const now = new Date().toISOString();
      todo.completed = !todo.completed;
      todo.completedAt = todo.completed ? now : undefined;
      todo.updatedAt = now;
      this.saveTodos();
    },

    updateTask(id: string, updates: Partial<Todo>): void {
      const task = this.find(id);
      if (!task) return;

      if (updates.todo !== undefined) {
        // A cluster always needs a name
        updates.todo = updates.todo.trim() || (task.isCluster ? NEW_CLUSTER_NAME : "");
      }

      Object.assign(task, updates, { updatedAt: new Date().toISOString() });
      this.saveTodos();
    },

    moveTask(taskId: string, clusterId: string): void {
      const task = this.find(taskId);
      if (!task || task.isCluster || task.parentId === clusterId) return;

      task.parentId = clusterId;
      task.updatedAt = new Date().toISOString();
      this.saveTodos();
    },

    // Tasks in the same cluster, or all unclustered tasks
    siblingsOf(task: Todo): Todo[] {
      return this.items.filter(item => !item.isCluster && item.parentId === task.parentId);
    },

    swapItems(firstId: string, secondId: string): void {
      const items = [...this.items];
      const i = items.findIndex(item => item.id === firstId);
      const j = items.findIndex(item => item.id === secondId);
      [items[i], items[j]] = [items[j], items[i]];
      this.items = items;
      this.saveTodos();
    },

    shiftTask(taskId: string, direction: -1 | 1): void {
      const task = this.find(taskId);
      if (!task) return;

      const siblings = this.siblingsOf(task);
      const neighbor = siblings[siblings.findIndex(item => item.id === taskId) + direction];
      if (neighbor) this.swapItems(taskId, neighbor.id);
    },

    getTaskPosition(taskId: string): number {
      const task = this.find(taskId);
      if (!task) return 0;
      return this.siblingsOf(task).findIndex(item => item.id === taskId) + 1;
    },

    isFirstTask(taskId: string): boolean {
      return this.getTaskPosition(taskId) === 1;
    },

    isLastTask(taskId: string): boolean {
      const task = this.find(taskId);
      return Boolean(task) && this.getTaskPosition(taskId) === this.siblingsOf(task).length;
    },

    shiftCluster(clusterId: string, direction: -1 | 1): void {
      const clusters = this.clusters;
      const neighbor = clusters[clusters.findIndex(cluster => cluster.id === clusterId) + direction];
      if (neighbor) this.swapItems(clusterId, neighbor.id);
    },

    isFirstCluster(clusterId: string): boolean {
      return this.clusters[0]?.id === clusterId;
    },

    isLastCluster(clusterId: string): boolean {
      return this.clusters[this.clusters.length - 1]?.id === clusterId;
    },

    togglePinCluster(clusterId: string): void {
      const cluster = this.find(clusterId);
      if (!cluster?.isCluster) return;

      cluster.isPinned = !cluster.isPinned;
      this.saveTodos();
    },

    // Zen mode: move a task behind the other open tasks in its cluster
    skipTaskToEndOfCluster(taskId: string): void {
      const task = this.find(taskId);
      if (!task?.parentId) return;

      const openSiblings = this.items.filter(item =>
        item.parentId === task.parentId && !item.completed && item.id !== taskId
      );
      if (openSiblings.length === 0) return;

      const items = this.items.filter(item => item.id !== taskId);
      const lastIndex = items.findIndex(item => item.id === openSiblings[openSiblings.length - 1].id);
      items.splice(lastIndex + 1, 0, task);
      this.items = items;
      this.saveTodos();
    },

    // Zen mode: hide a cluster's tasks until every other cluster has been skipped too
    skipCluster(clusterId: string): void {
      const openClusterIds = new Set(
        this.items.filter(item => !item.isCluster && !item.completed && item.parentId).map(item => item.parentId)
      );

      let skipped = this.skippedClusters.filter(id => openClusterIds.has(id) && id !== clusterId);
      skipped.push(clusterId);
      if ([...openClusterIds].every(id => skipped.includes(id))) {
        skipped = [clusterId];
      }

      this.skippedClusters = skipped;
      this.saveTodos();
    },

    saveScheduledItem(entry: ScheduledItem): void {
      this.scheduledItems = [...this.scheduledItems.filter(item => item.id !== entry.id), entry];
      this.saveTodos();
    },

    removeScheduledItem(id: string): void {
      this.scheduledItems = this.scheduledItems.filter(item => item.id !== id);
      this.saveTodos();
    }
  };
}

export function initStores(): void {
  window.Alpine.store("todos", createTodosStore());
}
