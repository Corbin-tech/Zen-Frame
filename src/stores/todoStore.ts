import { toDateKey, fromDateKey, addDays, minutesNow } from "../lib/dates";
import { planTasks, type AvailabilityWindow } from "../lib/autoPlan";
import { loadJson, saveJson } from "../lib/storage";
import type { Milestone } from "./settingsStore";
import { blockMinutes } from "../lib/estimates";
import { cleanStepTotal } from "../lib/assist/sanitize";

export interface Todo {
  id: string;
  todo: string;
  completed: boolean;
  isCluster: boolean;
  isPinned: boolean;
  parentId: string | null;
  dueDate?: string | null; // Local date as YYYY-MM-DD
  color?: string; // Clusters only: a key of CLUSTER_COLORS
  createdAt: string;
  updatedAt?: string;
  startedAt?: string; // Set while the task is in the board's In progress column
  zenDeferredStart?: string; // The start timestamp that Skip Task deferred in Zen mode
  completedAt?: string;
  estimateMinutes?: number | null; // From Estimate, Brain dump, or the user
  steps?: TodoStep[]; // A checklist from Breakdown. Steps stay inside the task, so the board and schedule still see one task.
}

export interface TodoStep {
  id: string;
  text: string;
  done: boolean;
  minutes?: number | null;
}

// One finished task, kept after the task itself is cleared so Insights can count it
export interface CompletionRecord {
  taskId: string;
  title: string;
  clusterId: string | null;
  clusterName: string; // Kept in case the cluster is deleted later
  dueDate: string | null;
  at: string; // ISO time it was completed
  blockId?: string; // Set when this is one ticked day of a repeating block, not a finished task
}

const HISTORY_LIMIT = 5000;

// Kanban columns. A task's column comes from completed and startedAt.
export type BoardColumn = "todo" | "doing" | "done";

export interface ScheduledItem {
  id: string;
  taskId: string; // A task, or a cluster for a class meeting
  date: string; // Local date as YYYY-MM-DD. A repeating block starts on this day.
  startTimeMinutes: number;
  endTimeMinutes: number;
  repeat?: {
    weekdays: number[]; // 0 = Sunday to 6 = Saturday
    until: string | null; // Last day as YYYY-MM-DD, or null for no end
    doneDates: string[]; // Days the block was checked off. The task stays open for the other days.
  };
}

// Auto-planning preferences: when the user is free to work, and how blocks are sized
export interface Planning {
  availability: AvailabilityWindow[];
  duration: number; // Minutes per planned task
  gap: number; // Free minutes after each planned task
}

const DEFAULT_PLANNING: Planning = { availability: [], duration: 45, gap: 15 };

// What one Auto-plan run changed, so it can be undone
export interface AutoPlanResult {
  blocks: ScheduledItem[]; // The new blocks
  replaced: ScheduledItem[]; // Past one-off blocks of the planned tasks, removed by the plan
  dueDates: { taskId: string; dueDate: string | null }[]; // Due dates before the plan
}

const NEW_CLUSTER_NAME = "New Cluster";

// Cluster colors, picked in this order for new clusters. Each key is a CSS variable
// (--c-<key>) in Layout.astro with separate light and dark values. The order keeps
// neighbors distinct for color-blind readers; check changes with a palette validator.
// The last four extend the set so up to 12 clusters each get their own color.
const CLUSTER_COLORS = ["teal", "indigo", "amber", "sky", "rose", "violet", "emerald", "orange", "pink", "lime", "cyan", "fuchsia"];

function createTodosStore() {
  return {
    items: [] as Todo[],
    skippedClusters: [] as string[],
    scheduledItems: [] as ScheduledItem[],
    planning: { ...DEFAULT_PLANNING } as Planning,
    history: [] as CompletionRecord[],
    saveTimer: undefined as ReturnType<typeof window.setTimeout> | undefined,
    writesSuspended: false,

    get clusters(): Todo[] {
      return this.items.filter(item => item.isCluster);
    },

    get hasCompletedTasks(): boolean {
      return this.items.some(item => item.completed);
    },

    // What statistics count: finished tasks, plus one entry for each ticked day of a repeating
    // block. A routine ticked on a day its task was also finished counts once.
    get completions(): CompletionRecord[] {
      if (!this.history.some(record => record.blockId)) return this.history;
      const dayKey = (record: CompletionRecord) => `${record.taskId}|${toDateKey(new Date(record.at))}`;
      const finished = new Set(this.history.filter(record => !record.blockId).map(dayKey));
      return this.history.filter(record => !record.blockId || !finished.has(dayKey(record)));
    },

    get openTasks(): Todo[] {
      return this.items.filter(item => !item.isCluster && !item.completed);
    },

    get zenTaskOrder(): Todo[] {
      const priority = (task: Todo) => Number(Boolean(task.startedAt && task.startedAt !== task.zenDeferredStart));
      return this.openTasks.sort((a, b) => priority(b) - priority(a));
    },

    // The task Zen mode shows, skipping clusters the user skipped when possible.
    get nextTask(): Todo | null {
      const ordered = this.zenTaskOrder;
      return ordered.find(task => !task.parentId || !this.skippedClusters.includes(task.parentId))
        ?? ordered[0]
        ?? null;
    },

    palette: CLUSTER_COLORS,

    // Alpine calls init() when the store is registered
    init(): void {
      this.items = loadJson<Todo[]>("todos", []);
      this.skippedClusters = loadJson<string[]>("skippedClusters", []);
      this.scheduledItems = loadJson<ScheduledItem[]>("scheduledItems", []);
      this.planning = { ...DEFAULT_PLANNING, ...loadJson<Partial<Planning>>("planning", {}) };
      this.history = loadJson<CompletionRecord[]>("history", []);
      this.recordExistingCompletions();
      this.recordExistingTicks();
      // A write that is waiting when the tab is hidden or closed lands before it really goes
      window.addEventListener("pagehide", () => this.writeTodos());
      document.addEventListener("visibilitychange", () => { if (document.hidden) this.writeTodos(); });
      // Last: it may save, and saving writes every list, so all of them must be loaded first
      this.giveClustersDistinctColors();
    },

    // Writes happen a beat after the change, out of the completing click's frame, and runs of
    // changes (a drag, a sweep, a plan) share one write. The store stays the source in memory.
    saveTodos(): void {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => this.writeTodos(), 250);
    },

    writeTodos(): void {
      if (this.writesSuspended) return; // A restore put newer data in storage than we hold
      window.clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      // Stops at the first failed write, so one full-storage error shows one toast
      void (saveJson("todos", this.items)
        && saveJson("skippedClusters", this.skippedClusters)
        && saveJson("scheduledItems", this.scheduledItems)
        && saveJson("planning", this.planning)
        && saveJson("history", this.history));
    },

    // A backup restore wrote storage directly and the page is about to reload: cancel the
    // pending save and hold every later write, or unloading would put our stale lists back.
    suspendWrites(): void {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
      this.writesSuspended = true;
    },

    // Completed tasks from before the history existed, so their stats aren't lost
    recordExistingCompletions(): void {
      const recorded = new Set(this.history.map(record => `${record.taskId}|${record.at}`));
      const missing = this.items.filter(item => !item.isCluster && item.completed && item.completedAt && !recorded.has(`${item.id}|${item.completedAt}`));
      if (!missing.length) return;
      this.history = [...this.history, ...missing.map(task => this.completionRecord(task, task.completedAt!))]
        .sort((a, b) => a.at.localeCompare(b.at));
      saveJson("history", this.history);
    },

    // Days ticked on repeating blocks before ticks were kept in the history
    recordExistingTicks(): void {
      const recorded = new Set(this.history
        .filter(record => record.blockId)
        .map(record => `${record.blockId}|${toDateKey(new Date(record.at))}`));
      const missing: CompletionRecord[] = [];
      for (const item of this.scheduledItems) {
        for (const day of item.repeat?.doneDates ?? []) {
          if (typeof day !== "string" || recorded.has(`${item.id}|${day}`)) continue;
          const record = this.tickRecord(item, day);
          if (record) missing.push(record);
        }
      }
      if (!missing.length) return;
      this.history = [...this.history, ...missing].sort((a, b) => a.at.localeCompare(b.at)).slice(-HISTORY_LIMIT);
      saveJson("history", this.history);
    },

    // One ticked day of a repeating block. Today's tick is timed now; another day's is timed
    // at the block's start, so it counts on the day it was for. A class meeting (a cluster
    // block) is not a to-do, so it has no record.
    tickRecord(item: ScheduledItem, dateKey: string): CompletionRecord | null {
      const task = this.find(item.taskId);
      if (!task || task.isCluster) return null;
      const time = dateKey === toDateKey() ? new Date() : fromDateKey(dateKey);
      if (dateKey !== toDateKey()) time.setMinutes(item.startTimeMinutes);
      return { ...this.completionRecord(task, time.toISOString()), dueDate: null, blockId: item.id };
    },

    completionRecord(task: Todo, at: string): CompletionRecord {
      return {
        taskId: task.id,
        title: task.todo,
        clusterId: task.parentId,
        clusterName: this.clusterName(task.parentId),
        dueDate: task.dueDate ?? null,
        at
      };
    },

    find(id: string): Todo | undefined {
      return this.items.find(item => item.id === id);
    },

    addTodo(todoText: string, fields: Partial<Todo> = {}): string {
      const id = crypto.randomUUID();
      this.items = [...this.items, {
        id,
        todo: todoText,
        completed: false,
        isCluster: false,
        isPinned: false,
        parentId: null,
        dueDate: null,
        createdAt: new Date().toISOString(),
        ...fields
      }];
      this.saveTodos();
      return id;
    },

    createCluster(name = NEW_CLUSTER_NAME): string {
      return this.addTodo(name.trim() || NEW_CLUSTER_NAME, { isCluster: true, color: this.nextClusterColor() });
    },

    // The first color no cluster uses yet, or the least used one once all are taken
    nextClusterColor(): string {
      const uses = new Map(CLUSTER_COLORS.map(color => [color, 0]));
      for (const cluster of this.clusters) {
        if (cluster.color && uses.has(cluster.color)) uses.set(cluster.color, uses.get(cluster.color)! + 1);
      }
      return CLUSTER_COLORS.reduce((best, color) => uses.get(color)! < uses.get(best)! ? color : best);
    },

    // Clusters without a color, or sharing one with an earlier cluster, get an unused color.
    // Runs at load, so clusters made before there were enough colors are fixed once.
    giveClustersDistinctColors(): void {
      const taken = new Set<string>();
      const repaint: Todo[] = [];
      for (const cluster of this.clusters) {
        if (cluster.color && CLUSTER_COLORS.includes(cluster.color) && !taken.has(cluster.color)) {
          taken.add(cluster.color);
        } else {
          repaint.push(cluster);
        }
      }
      const free = CLUSTER_COLORS.filter(color => !taken.has(color));
      let changed = false;
      for (const cluster of repaint) {
        const color = free.shift();
        if (!color) break; // More clusters than colors: the rest keep what they have
        cluster.color = color;
        changed = true;
      }
      if (changed) this.saveTodos();
    },

    // Whether another cluster already has this color (the color picker marks these)
    colorTaken(color: string, exceptId: string): boolean {
      return this.clusters.some(cluster => cluster.id !== exceptId && this.clusterColorKey(cluster.id) === color);
    },

    // The cluster of a task, or the cluster itself
    clusterOf(item?: Todo | null): string | null {
      return item?.isCluster ? item.id : item?.parentId ?? null;
    },

    clusterName(clusterId: string | null): string {
      return clusterId ? this.find(clusterId)?.todo ?? "" : "";
    },

    // A cluster's progress. Finished tasks that were cleared from the list still count, from
    // the history, so "Delete completed" never moves a progress bar.
    clusterProgress(clusterId: string): { done: number; total: number } {
      const tasks = this.items.filter(item => !item.isCluster && item.parentId === clusterId);
      const listed = new Set(this.items.map(item => item.id));
      const cleared = new Set(this.history
        .filter(record => !record.blockId && record.clusterId === clusterId && !listed.has(record.taskId))
        .map(record => record.taskId));
      return {
        done: tasks.filter(task => task.completed).length + cleared.size,
        total: tasks.length + cleared.size
      };
    },

    // Clusters made before colors existed get a color from their position
    clusterColorKey(clusterId: string | null): string {
      const cluster = clusterId ? this.find(clusterId) : undefined;
      if (!cluster) return "none";
      if (cluster.color && CLUSTER_COLORS.includes(cluster.color)) return cluster.color;
      const position = Math.max(0, this.clusters.findIndex(item => item.id === clusterId));
      return CLUSTER_COLORS[position % CLUSTER_COLORS.length];
    },

    // A CSS color for inline styles, for example "var(--c-teal)"
    clusterColor(clusterId: string | null): string {
      return `var(--c-${this.clusterColorKey(clusterId)})`;
    },

    setClusterColor(clusterId: string, color: string): void {
      const cluster = this.find(clusterId);
      if (!cluster?.isCluster) return;
      cluster.color = color;
      this.saveTodos();
    },

    setDueDate(taskId: string, dueDate: string | null): void {
      const task = this.find(taskId);
      if (!task) return;
      task.dueDate = dueDate || null;
      task.updatedAt = new Date().toISOString();

      // A new due date moves the task's one-off block to that day, at the same time
      const block = this.scheduledItems.find(item => item.taskId === taskId && !item.repeat);
      if (task.dueDate && block && !task.isCluster && !task.completed) {
        this.saveScheduledItem({ ...block, date: task.dueDate });
        return;
      }
      this.saveTodos();
    },

    // Estimate in minutes, or null to clear it
    setEstimate(taskId: string, minutes: number | null): void {
      const task = this.find(taskId);
      if (!task || task.isCluster) return;
      task.estimateMinutes = minutes && minutes > 0 ? Math.round(minutes) : null;
      task.updatedAt = new Date().toISOString();
      this.saveTodos();
    },

    // Replaces the task's checklist. When no estimate is set yet, the steps' minutes add up to one.
    setSteps(taskId: string, steps: Array<{ text: string; minutes?: number | null }>): void {
      const task = this.find(taskId);
      if (!task || task.isCluster) return;
      task.steps = steps.map(step => ({ id: crypto.randomUUID(), text: step.text.trim(), done: false, minutes: step.minutes ?? null }));
      const total = cleanStepTotal(task.steps);
      if (!task.estimateMinutes && total) task.estimateMinutes = total;
      task.updatedAt = new Date().toISOString();
      this.saveTodos();
    },

    toggleStep(taskId: string, stepId: string): void {
      const step = this.find(taskId)?.steps?.find(item => item.id === stepId);
      if (!step) return;
      step.done = !step.done;
      this.saveTodos();
    },

    // A repeating block is returned as stored, for each day it repeats on
    scheduledItemsOn(dateKey: string = toDateKey()): ScheduledItem[] {
      const weekday = fromDateKey(dateKey).getDay();
      return this.scheduledItems
        .filter(item => item.repeat
          ? item.repeat.weekdays.includes(weekday) && item.date <= dateKey && (!item.repeat.until || dateKey <= item.repeat.until)
          : item.date === dateKey)
        .sort((a, b) => a.startTimeMinutes - b.startTimeMinutes);
    },

    // A repeating block is checked off one day at a time, so its other days stay open.
    // Its task is never marked completed by a tick.
    isBlockDone(item: ScheduledItem, dateKey: string): boolean {
      return item.repeat ? item.repeat.doneDates.includes(dateKey) : Boolean(this.find(item.taskId)?.completed);
    },

    toggleBlockDone(item: ScheduledItem, dateKey: string): void {
      if (!item.repeat) {
        this.toggleTodo(item.taskId);
        return;
      }
      const { doneDates } = item.repeat;
      const wasDone = doneDates.includes(dateKey);
      item.repeat.doneDates = wasDone ? doneDates.filter(day => day !== dateKey) : [...doneDates, dateKey];

      // Each ticked day is one history entry, so routines count in Insights and streaks.
      // Unticking takes that day's entry out again.
      const record = wasDone ? null : this.tickRecord(item, dateKey);
      this.history = this.history.filter(entry => !(entry.blockId === item.id && toDateKey(new Date(entry.at)) === dateKey));
      if (record) this.history = [...this.history, record].sort((a, b) => a.at.localeCompare(b.at)).slice(-HISTORY_LIMIT);
      this.saveTodos();
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
      // Unpinned clusters whose tasks are all complete go away with their tasks.
      // A cluster with blocks is a class on the timetable, so it stays.
      const finishedClusterIds = this.clusters
        .filter(cluster => {
          if (cluster.isPinned || this.scheduledItems.some(entry => entry.taskId === cluster.id)) return false;
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
      (window.Alpine.store("goals") as { unlinkClusters?: (ids: Set<string>) => void } | undefined)?.unlinkClusters?.(ids);
    },

    toggleTodo(id: string): void {
      const todo = this.find(id);
      if (!todo) return;

      const now = new Date().toISOString();
      if (!todo.isCluster) {
        this.history = todo.completed
          ? this.history.filter(record => !(record.taskId === id && record.at === todo.completedAt))
          : [...this.history, this.completionRecord(todo, now)].slice(-HISTORY_LIMIT);
      }
      todo.completed = !todo.completed;
      todo.completedAt = todo.completed ? now : undefined;
      if (todo.completed) todo.startedAt = undefined;
      todo.updatedAt = now;
      this.saveTodos();
    },

    // The biggest thing a just-finished task wraps up: every open task, its cluster, or only itself
    milestoneOf(task: Todo): Milestone {
      if (!this.openTasks.length) return "all";
      return this.siblingsOf(task).every(item => item.completed) ? "cluster" : "task";
    },

    // Set completion with toggleTodo, not here, so history stays in step.
    updateTask(id: string, updates: Partial<Omit<Todo, "id" | "completed" | "completedAt" | "isCluster">>): void {
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

    boardColumn(task: Todo): BoardColumn {
      if (task.completed) return "done";
      return task.startedAt ? "doing" : "todo";
    },

    // Moves a task to a board column. With a target task it lands just before
    // (or after) that card; without one it keeps its place in list order.
    moveToColumn(taskId: string, column: BoardColumn, targetId?: string, after = false): void {
      const task = this.find(taskId);
      if (!task || task.isCluster) return;

      if (this.boardColumn(task) !== column) {
        if (column === "done") {
          this.toggleTodo(taskId);
        } else {
          if (task.completed) this.toggleTodo(taskId);
          task.startedAt = column === "doing" ? task.startedAt ?? new Date().toISOString() : undefined;
          task.updatedAt = new Date().toISOString();
        }
      }

      if (targetId && targetId !== taskId) {
        const items = this.items.filter(item => item.id !== taskId);
        const index = items.findIndex(item => item.id === targetId);
        if (index !== -1) {
          items.splice(index + (after ? 1 : 0), 0, task);
          this.items = items;
        }
      }
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
      if (i === -1 || j === -1) return;
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
      if (task.startedAt) task.zenDeferredStart = task.startedAt;
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

    // An open task is on one day: a one-off block moves the task there. Its other one-off
    // blocks go, and its due date becomes that day, so the schedule, the list and the board agree.
    // Repeating blocks are routines and class meetings (cluster blocks) are not to-dos, so they stay.
    saveScheduledItem(entry: ScheduledItem): void {
      const task = this.find(entry.taskId);
      const movesTask = !entry.repeat && Boolean(task) && !task!.isCluster && !task!.completed;
      this.scheduledItems = [
        ...this.scheduledItems.filter(item => item.id !== entry.id
          && !(movesTask && item.taskId === entry.taskId && !item.repeat)),
        entry
      ];
      if (movesTask && task!.dueDate !== entry.date) {
        task!.dueDate = entry.date;
        task!.updatedAt = new Date().toISOString();
      }
      this.saveTodos();
    },

    updatePlanning(changes: Partial<Planning>): void {
      this.planning = { ...this.planning, ...changes };
      this.saveTodos();
    },

    // Plans open tasks into free availability on `dayCount` days from `fromDate`.
    // Skips tasks that already have a block today or later, and routines (repeating blocks).
    // Like saveScheduledItem, a planned task moves to its new day: its past one-off blocks go
    // and its due date becomes that day. Returns what changed so undoAutoPlan can put it back.
    autoPlan(fromDate: string, dayCount: number): AutoPlanResult {
      const today = toDateKey();
      const start = fromDate < today ? today : fromDate;
      const days = Array.from({ length: dayCount }, (_, i) => addDays(start, i));
      const planned = new Set(this.scheduledItems
        .filter(item => item.repeat || item.date >= today)
        .map(item => item.taskId));
      const tasks = this.openTasks.filter(task => task.todo.trim() && !planned.has(task.id));

      const blocks = planTasks({
        tasks,
        days,
        availability: this.planning.availability,
        busyOn: day => this.scheduledItemsOn(day).map(item => ({ start: item.startTimeMinutes, end: item.endTimeMinutes })),
        earliestOn: day => day === today ? minutesNow() : 0,
        duration: this.planning.duration,
        // Estimated tasks get a block that fits the estimate; the rest keep the planning default
        durationOf: task => task.estimateMinutes ? blockMinutes(task.estimateMinutes) : this.planning.duration,
        gap: this.planning.gap
      });

      const created = blocks.map(block => ({
        id: crypto.randomUUID(),
        taskId: block.taskId,
        date: block.date,
        startTimeMinutes: block.start,
        endTimeMinutes: block.end
      }));
      const plannedTasks = new Set(created.map(item => item.taskId));
      const replaced = this.scheduledItems.filter(item => !item.repeat && plannedTasks.has(item.taskId));
      const dueDates = created.map(item => ({ taskId: item.taskId, dueDate: this.find(item.taskId)?.dueDate ?? null }));
      this.scheduledItems = [...this.scheduledItems.filter(item => !replaced.includes(item)), ...created];
      const now = new Date().toISOString();
      for (const item of created) {
        const task = this.find(item.taskId)!;
        if (task.dueDate === item.date) continue;
        task.dueDate = item.date;
        task.updatedAt = now;
      }
      this.saveTodos();
      return { blocks: created, replaced, dueDates };
    },

    // Takes a plan back out: its blocks go, and replaced blocks and old due dates come back.
    // A task whose planned block was moved, resized or removed since keeps what the user chose.
    // Returns the number of blocks removed.
    undoAutoPlan(plan: AutoPlanResult): number {
      const untouched = new Set(plan.blocks
        .filter(block => this.scheduledItems.some(item => item.id === block.id && item.date === block.date
          && item.startTimeMinutes === block.startTimeMinutes && item.endTimeMinutes === block.endTimeMinutes))
        .map(block => block.taskId));
      const planIds = new Set(plan.blocks.filter(block => untouched.has(block.taskId)).map(block => block.id));
      this.scheduledItems = [
        ...this.scheduledItems.filter(item => !planIds.has(item.id)),
        ...plan.replaced.filter(item => untouched.has(item.taskId))
      ];
      // A due date changed or cleared after the plan is the user's choice, so it stays
      const plannedDate = new Map(plan.blocks.map(block => [block.taskId, block.date]));
      const now = new Date().toISOString();
      for (const { taskId, dueDate } of plan.dueDates) {
        const task = this.find(taskId);
        if (!task || !untouched.has(taskId) || task.dueDate !== plannedDate.get(taskId)) continue;
        task.dueDate = dueDate;
        task.updatedAt = now;
      }
      this.saveTodos();
      return planIds.size;
    },

    removeScheduledItems(ids: string[]): void {
      const remove = new Set(ids);
      this.scheduledItems = this.scheduledItems.filter(item => !remove.has(item.id));
      this.saveTodos();
    },

    removeScheduledItem(id: string): void {
      this.removeScheduledItems([id]);
    }
  };
}

export function initStores(): void {
  window.Alpine.store("todos", createTodosStore());
}
