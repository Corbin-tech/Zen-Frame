import { z } from 'zod';

// Strict type validation for Todo
const TodoSchema = z.object({
  id: z.string(),
  todo: z.string().min(1, "Task must not be empty"),
  completed: z.boolean(),
  section: z.enum(['taskManager', 'Completed', 'mainContainer']),
  isEditing: z.boolean().optional().default(false),
  isCluster: z.boolean().optional().default(false),
  isPinned: z.boolean().optional().default(false),
  parentId: z.string().nullable().optional(),
  subtasks: z.array(z.object({
    id: z.string(),
    todo: z.string().min(1, "Task must not be empty"),
    completed: z.boolean(),
    createdAt: z.string().datetime(),
    parentId: z.string()
  })).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional()
});

export type Todo = z.infer<typeof TodoSchema>;

interface TodoStore {
  items: Todo[];
  currentIndex: number;
  readonly incompleteTasks: Todo[];
  readonly currentTask: Todo | null;
  readonly hasMoreTasks: boolean;
  skippedClusters: string[];
  init(): void;
  loadTodos(): void;
  saveTodos(): void;
  addTodo(todoText: string, isCluster?: boolean): string;
  deleteTodo(id: string): void;
  createNewTaskDraft(): void;
  toggleTodo(id: string): void;
  deleteCompleted(): void;
  updateTask(id: string, updates: Partial<Todo>): void;
  deleteTasksByGroup(groupId: string): void;
  toggleSubtask(taskId: string, subtaskId: string): void;
  moveTask(taskId: string, newGroupId: string): void;
  reorderTask(taskId: string, targetId: string, position: "above" | "below"): void;
  createCluster(name?: string): string;
  migrateTasksToMainContainer(): void;
  shiftTask(taskId: string, direction: -1 | 1): void;
  moveTaskUp(taskId: string): void;
  moveTaskDown(taskId: string): void;
  isFirstTask(taskId: string): boolean;
  isLastTask(taskId: string): boolean;
  getTaskPosition(taskId: string): number;
  isCluster(id: string): boolean;
  setParentId(taskId: string, parentId: string): void;
  performTaskDeletion(id: string): void;
  togglePinCluster(clusterId: string): void;
  moveClusterUp(clusterId: string): void;
  moveClusterDown(clusterId: string): void;
  isFirstCluster(clusterId: string): boolean;
  isLastCluster(clusterId: string): boolean;
  getClusterPosition(clusterId: string): number;
  skipTaskToEndOfCluster(taskId: string): void;
  skipCurrentCluster(): void;
  getClusterIdsWithIncompleteTasks(): string[];
}

interface WeeklyTask {
  [day: string]: string[];
}

interface WeeklyTaskStore {
  tasks: WeeklyTask;
  init(): void;
  loadTasks(): void;
  saveTasks(): void;
  addTaskToDay(day: string, taskId: string): void;
  removeTaskFromDay(day: string, taskId: string): void;
}

export interface QuickTaskStore {
  text: string;
  handleEnter: () => void;
}

export function initStores(): void {
  if (typeof window === "undefined") return;

  if (!window.Alpine) {
    console.warn('Alpine.js not initialized');
    return;
  }

  // Define the todos store using ES6 getters
  const todosStore: TodoStore = {
    items: [] as Todo[],
    currentIndex: 0,
    skippedClusters: [] as string[],
    get incompleteTasks(): Todo[] {
      return this.items.filter(item => !item.completed && !item.isCluster);
    },

    get currentTask(): Todo | null {
      const tasks = this.items.filter(item => !item.completed && !item.isCluster);
      return tasks[this.currentIndex] || null;
    },

    get hasMoreTasks(): boolean {
      const tasks = this.items.filter(item => !item.completed && !item.isCluster);
      return this.currentIndex < tasks.length;
    },

    init(): void {
      this.loadTodos();
      this.migrateTasksToMainContainer();
    },

    loadTodos(): void {
      const savedTodos = localStorage.getItem("todos");
      if (savedTodos) {
        this.items = JSON.parse(savedTodos);
      }
      
      // Also load the skipped clusters state
      const savedSkippedClusters = localStorage.getItem("skippedClusters");
      if (savedSkippedClusters) {
        this.skippedClusters = JSON.parse(savedSkippedClusters);
      }
    },

    saveTodos(): void {
      localStorage.setItem("todos", JSON.stringify(this.items));
      // Also save the skipped clusters state
      localStorage.setItem("skippedClusters", JSON.stringify(this.skippedClusters));
    },

    addTodo(todoText: string, isCluster: boolean = false): string {
      const id = crypto.randomUUID();
      const newItems = [...this.items];
      const newTask: Todo = {
        id,
        todo: todoText,
        completed: false,
        section: "taskManager",
        isEditing: false,
        isCluster,
        isPinned: false,
        parentId: null,
        subtasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: undefined,
        completedAt: undefined
      };
      
      // If it's not a cluster, add it to the main container instead of 'other tasks'
      // by setting a special property that will be handled differently in the template
      if (!isCluster) {
        newTask.section = "mainContainer";
      }
      
      newItems.push(newTask);
      this.items = newItems;
      this.saveTodos();
      
      // Dispatch task-added event
      if (typeof document !== 'undefined') {
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('task-added', { 
            detail: { taskId: id } 
          }));
        }, 0);
      }
      
      return id;
    },

    deleteTodo(id: string): void {
      const todo = this.items.find(item => item.id === id);
      if (!todo) return;
      
      // If this is a pinned cluster, show a confirmation dialog
      if (todo.isCluster && todo.isPinned) {
        // Create and dispatch a custom event for the UI to handle
        const event = new CustomEvent('confirm-delete-pinned-cluster', {
          detail: { clusterId: id, clusterName: todo.todo }
        });
        document.dispatchEvent(event);
        return; // Exit early - the actual deletion will happen if user confirms
      }
      
      // If we reach here, either it's not a cluster or not pinned
      this.performTaskDeletion(id);
    },
    
    toggleTodo(id: string): void {
      const todo = this.items.find(t => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
        todo.completedAt = todo.completed ? new Date().toISOString() : undefined;
        todo.updatedAt = new Date().toISOString();
        
        // If it's a mainContainer task, keep it in the mainContainer section
        // otherwise use the default behavior
        if (todo.section === 'mainContainer') {
          // Keep it in mainContainer even when completed
          todo.section = 'mainContainer';
        } else {
          // Use original behavior for other tasks
          todo.section = todo.completed ? 'Completed' : 'taskManager';
        }
        
        this.saveTodos();
      }
    },

    deleteCompleted(): void {
      // First, identify clusters where all tasks are complete
      const clusters = this.items.filter(item => item.isCluster);
      const clustersToDelete: string[] = [];
      
      clusters.forEach(cluster => {
        // Skip pinned clusters
        if (cluster.isPinned) return;
        
        const clusterTasks = this.items.filter(item => item.parentId === cluster.id);
        // If all tasks in the cluster are complete or there are no tasks, mark the cluster for deletion
        if (clusterTasks.length > 0 && clusterTasks.every(task => task.completed)) {
          clustersToDelete.push(cluster.id);
        }
      });
      
      // Delete all completed tasks and the identified clusters
      this.items = this.items.filter(todo => {
        // Keep if not completed and not in the clusters to delete list
        return (!todo.completed && !clustersToDelete.includes(todo.id)) || 
               // Or if it's a cluster that's not in the delete list
               (todo.isCluster && !clustersToDelete.includes(todo.id));
      });
      
      this.saveTodos();
    },

    updateTask(id: string, updates: Partial<Todo>): void {
      console.log(`Updating task ${id} with:`, updates);
      
      // Find the task to check if it's a cluster
      const taskToUpdate = this.items.find(todo => todo.id === id);
      
      // Handle task name updates
      if (updates.todo !== undefined) {
        const trimmedInput = updates.todo.trim();
        
        // Only for clusters, and only when creating new ones (not editing)
        if (taskToUpdate?.isCluster) {
          // If the input is completely empty and we're not creating a new cluster,
          // preserve the existing name instead of using the default
          if (trimmedInput === '') {
            // Keep the existing name if this is an edit (not a new cluster)
            updates.todo = taskToUpdate.todo;
          } else {
            // Otherwise use the trimmed input
            updates.todo = trimmedInput;
          }
        } else {
          // For regular tasks, just trim the input
          updates.todo = trimmedInput;
        }
      }
      
      this.items = this.items.map(todo => {
        if (todo.id === id) {
          const updatedTodo = { ...todo, ...updates, updatedAt: new Date().toISOString() };
          console.log(`Task updated:`, updatedTodo);
          return updatedTodo;
        }
        return todo;
      });
      
      this.saveTodos();
    },

    deleteTasksByGroup(groupId: string): void {
      // Adjust filtering logic as needed.
      this.items = this.items.filter(task => task.section !== groupId);
      this.saveTodos();
    },

    createNewTaskDraft(): void {
      console.log("createNewTaskDraft not implemented");
    },

    toggleSubtask(taskId: string, subtaskId: string): void {
      const task = this.items.find(t => t.id === taskId);
      if (task && task.subtasks) {
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
          subtask.completed = !subtask.completed;
          const allSubtasksCompleted = task.subtasks.every(st => st.completed);
          task.completed = allSubtasksCompleted;
          task.completedAt = allSubtasksCompleted ? new Date().toISOString() : undefined;
          this.saveTodos();
        }
      }
    },

    moveTask(taskId: string, newGroupId: string): void {
      const taskIndex = this.items.findIndex(t => t.id === taskId);
      if (taskIndex > -1) {
        const newItems = [...this.items];
        newItems[taskIndex].section = newGroupId as 'taskManager' | 'Completed';
        this.items = newItems;
        this.saveTodos();
      }
    },

    reorderTask(taskId: string, targetId: string, position: "above" | "below"): void {
      console.log(`Reordering task ${taskId} ${position} ${targetId}`);
      
      // First check if the task is already in the right position
      if (taskId === targetId) {
        console.log('Task is being dropped onto itself - ignoring');
        return;
      }
      
      // Find the tasks
      const sourceTask = this.items.find(t => t.id === taskId);
      const targetTask = this.items.find(t => t.id === targetId);
      
      if (!sourceTask || !targetTask) {
        console.error('Source or target task not found', { taskId, targetId });
        return;
      }
      
      // Debug the task states before changing anything
      console.log('Source task before:', {
        id: sourceTask.id,
        todo: sourceTask.todo,
        isCluster: sourceTask.isCluster,
        parentId: sourceTask.parentId
      });
      console.log('Target task before:', {
        id: targetTask.id,
        todo: targetTask.todo,
        isCluster: targetTask.isCluster,
        parentId: targetTask.parentId
      });
      
      // Only update parentId if the tasks should be in the same container
      // Don't forcibly set parentId if moving between different contexts
      const oldParentId = sourceTask.parentId;
      if (sourceTask.isCluster === targetTask.isCluster) {
        sourceTask.parentId = targetTask.parentId;
        console.log(`Updated parentId from ${oldParentId} to ${sourceTask.parentId}`);
      } else {
        console.log(`Keeping parentId as ${sourceTask.parentId} since task types differ`);
      }
      
      // Find indices
      const sourceIndex = this.items.findIndex(t => t.id === taskId);
      const targetIndex = this.items.findIndex(t => t.id === targetId);
      
      console.log(`Source index: ${sourceIndex}, target index: ${targetIndex}`);
      
      // Create a new array without the source task
      const newItems = [...this.items];
      const [removedTask] = newItems.splice(sourceIndex, 1);
      
      // Find the new target index after removing the source task
      const newTargetIndex = newItems.findIndex(t => t.id === targetId);
      
      // Calculate insert position
      const insertIndex = position === 'above' ? newTargetIndex : newTargetIndex + 1;
      
      console.log(`Inserting at index: ${insertIndex} (${position} ${targetId})`);
      
      // Insert the task at the new position
      newItems.splice(insertIndex, 0, removedTask);
      
      // Update the store
      this.items = newItems;
      this.saveTodos();
      
      console.log('Task reordering complete');
    },

    createCluster(name: string = "New Cluster"): string {
      // Make sure name is not empty only when creating a new cluster
      const clusterName = name.trim() || "New Cluster";
      
      const newCluster: Todo = {
        id: crypto.randomUUID(),
        todo: clusterName,
        completed: false,
        section: "taskManager",
        isEditing: false,
        isCluster: true,
        isPinned: false,
        parentId: null,
        subtasks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: undefined
      };
      const newItems = [...this.items];
      newItems.push(newCluster);
      this.items = newItems;
      this.saveTodos();
      
      // Dispatch task-added event
      if (typeof document !== 'undefined') {
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('task-added', { 
            detail: { taskId: newCluster.id } 
          }));
        }, 0);
      }
      
      return newCluster.id;
    },

    migrateTasksToMainContainer(): void {
      let updated = false;
      
      this.items.forEach(item => {
        // Only modify non-cluster items that are not already in mainContainer
        if (!item.isCluster && item.section !== 'mainContainer') {
          item.section = 'mainContainer';
          updated = true;
        }
      });
      
      if (updated) {
        this.saveTodos();
        console.log('Migrated existing tasks to mainContainer section');
      }
    },

    shiftTask(taskId: string, direction: -1 | 1): void {
      const task = this.items.find(t => t.id === taskId);
      if (!task) return;

      // Get the container where this task belongs
      let containerTasks: Todo[];
      
      if (task.parentId) {
        // Task is in a cluster
        containerTasks = this.items.filter(t => t.parentId === task.parentId);
      } else {
        // Task is at the root level
        containerTasks = this.items.filter(t => !t.parentId && !this.isCluster(t.id));
      }

      // Find the task's position in its container
      const taskIndex = containerTasks.findIndex(t => t.id === taskId);
      
      // Check if we can move in the requested direction
      if (direction < 0 && taskIndex <= 0) return; // Already at the top
      if (direction > 0 && (taskIndex === -1 || taskIndex >= containerTasks.length - 1)) return; // Already at the bottom

      // Find the adjacent task
      const adjacentTask = containerTasks[taskIndex + direction];
      
      // Determine position based on direction
      const position = direction < 0 ? "above" : "below";
      
      // Reorder using the existing method
      this.reorderTask(taskId, adjacentTask.id, position);
    },

    moveTaskUp(taskId: string): void {
      this.shiftTask(taskId, -1);
    },

    moveTaskDown(taskId: string): void {
      this.shiftTask(taskId, 1);
    },

    isFirstTask(taskId: string): boolean {
      const task = this.items.find(t => t.id === taskId);
      if (!task) return false;

      // Get the container where this task belongs
      let containerTasks: Todo[];
      
      if (task.parentId) {
        // Task is in a cluster
        containerTasks = this.items.filter(t => t.parentId === task.parentId);
      } else {
        // Task is at the root level
        containerTasks = this.items.filter(t => !t.isCluster && !t.parentId);
      }

      // Check if this task is the first one in its container
      return containerTasks.length > 0 && containerTasks[0].id === taskId;
    },

    isLastTask(taskId: string): boolean {
      const task = this.items.find(item => item.id === taskId);
      if (!task) return false;
      
      // Get the relevant container
      const container = task.parentId 
        ? this.items.filter(t => t.parentId === task.parentId)
        : this.items.filter(t => !t.parentId && !t.isCluster);
        
      return container.indexOf(task) === container.length - 1;
    },

    getTaskPosition(taskId: string): number {
      const task = this.items.find(t => t.id === taskId);
      if (!task) return -1;
      
      // Get all tasks in the same container
      const tasksInContainer = task.parentId
        ? this.items.filter(t => t.parentId === task.parentId)
        : this.items.filter(t => !t.parentId && !this.isCluster(t.id));
      
      // Find the position (1-based)
      return tasksInContainer.findIndex(t => t.id === taskId) + 1;
    },
    
    isCluster(id: string): boolean {
      const task = this.items.find(item => item.id === id);
      return Boolean(task && task.isCluster);
    },

    setParentId(taskId: string, parentId: string): void {
      this.updateTask(taskId, { parentId });
    },

    performTaskDeletion(id: string): void {
      // Find the item index
      const taskIndex = this.items.findIndex(item => item.id === id);
      if (taskIndex === -1) return;

      // Get the item
      const taskToDelete = this.items[taskIndex];

      // If it's a cluster, delete all its tasks first
      if (this.isCluster(id)) {
        const tasksInCluster = this.items.filter(task => task.parentId === id);
        tasksInCluster.forEach(task => {
          this.performTaskDeletion(task.id);
        });
      }

      // Now delete the item itself
      this.items.splice(taskIndex, 1);
      this.saveTodos();
    },

    togglePinCluster(clusterId: string): void {
      const cluster = this.items.find(item => item.id === clusterId);
      if (!cluster || !cluster.isCluster) return;

      const newPinnedState = !cluster.isPinned;
      this.updateTask(clusterId, { isPinned: newPinnedState });

      // Dispatch an event for the UI to show a notification
      const eventName = newPinnedState ? 'cluster-pinned' : 'cluster-unpinned';
      const event = new CustomEvent(eventName, {
        detail: { clusterId, clusterName: cluster.todo }
      });
      document.dispatchEvent(event);
    },

    moveClusterUp(clusterId: string): void {
      const cluster = this.items.find(item => item.id === clusterId);
      if (!cluster || !cluster.isCluster) return;

      // Get all clusters
      const clusters = this.items.filter(item => item.isCluster);
      
      // Find the index of the current cluster
      const currentIndex = clusters.findIndex(c => c.id === clusterId);
      if (currentIndex <= 0) return; // Already at the top
      
      // Get the previous cluster
      const prevCluster = clusters[currentIndex - 1];
      
      // Swap the positions in the items array
      const currentIndexInItems = this.items.findIndex(item => item.id === clusterId);
      const prevIndexInItems = this.items.findIndex(item => item.id === prevCluster.id);
      
      // Swap in place
      [this.items[currentIndexInItems], this.items[prevIndexInItems]] = 
        [this.items[prevIndexInItems], this.items[currentIndexInItems]];
      
      this.saveTodos();
    },
    
    moveClusterDown(clusterId: string): void {
      const cluster = this.items.find(item => item.id === clusterId);
      if (!cluster || !cluster.isCluster) return;

      // Get all clusters
      const clusters = this.items.filter(item => item.isCluster);
      
      // Find the index of the current cluster
      const currentIndex = clusters.findIndex(c => c.id === clusterId);
      if (currentIndex === -1 || currentIndex >= clusters.length - 1) return; // Already at the bottom
      
      // Get the next cluster
      const nextCluster = clusters[currentIndex + 1];
      
      // Swap the positions in the items array
      const currentIndexInItems = this.items.findIndex(item => item.id === clusterId);
      const nextIndexInItems = this.items.findIndex(item => item.id === nextCluster.id);
      
      // Swap in place
      [this.items[currentIndexInItems], this.items[nextIndexInItems]] = 
        [this.items[nextIndexInItems], this.items[currentIndexInItems]];
      
      this.saveTodos();
    },
    
    isFirstCluster(clusterId: string): boolean {
      const clusters = this.items.filter(item => item.isCluster);
      return clusters.length > 0 && clusters[0].id === clusterId;
    },
    
    isLastCluster(clusterId: string): boolean {
      const clusters = this.items.filter(item => item.isCluster);
      return clusters.length > 0 && clusters[clusters.length - 1].id === clusterId;
    },
    
    getClusterPosition(clusterId: string): number {
      const clusters = this.items.filter(item => item.isCluster);
      const index = clusters.findIndex(c => c.id === clusterId);
      return index >= 0 ? index + 1 : 0; // 1-indexed for display
    },
    
    skipTaskToEndOfCluster(taskId: string): void {
      const task = this.items.find(t => t.id === taskId);
      if (!task) return;
      
      // If the task is not in a cluster, nothing to do
      if (!task.parentId) return;
      
      // Find all tasks in the same cluster
      const clusterTasks = this.items.filter(t => t.parentId === task.parentId && !t.completed && t.id !== taskId);
      
      // Remove the task from its current position
      const newItems = this.items.filter(t => t.id !== taskId);
      
      // Find the position of the last task in the cluster
      let insertIndex = newItems.length;
      if (clusterTasks.length > 0) {
        const lastTaskIndex = newItems.findIndex(t => t.id === clusterTasks[clusterTasks.length - 1].id);
        insertIndex = lastTaskIndex !== -1 ? lastTaskIndex + 1 : insertIndex;
      }
      
      // Insert the task at the new position
      newItems.splice(insertIndex, 0, task);
      this.items = newItems;
      this.saveTodos();
      
      // Refresh the currentTodoCache in the zenTodoList component
      document.dispatchEvent(new CustomEvent('zen-task-skipped'));
    },
    
    skipCurrentCluster(): void {
      // This method is meant to be used in Zen mode
      const todos = this.items;
      if (!todos || !todos.length) return;
      
      // Filter out clusters and only consider actual tasks
      const tasks = todos.filter(task => !task.isCluster);
      const clusters = todos.filter(item => item.isCluster);
      
      // Get all incomplete tasks
      const incompleteTasks = tasks.filter(task => !task.completed);
      if (incompleteTasks.length === 0) return;
      
      // Get all non-skipped incomplete tasks
      const nonSkippedIncompleteTasks = incompleteTasks.filter(task => {
        return !task.parentId || !this.skippedClusters.includes(task.parentId);
      });
      
      // Get the current highest priority task and its cluster
      let currentHighestTask;
      
      if (nonSkippedIncompleteTasks.length > 0) {
        // Get the first non-skipped task in visual order
        // Tasks appear in the same order as they are in the items array
        currentHighestTask = nonSkippedIncompleteTasks[0];
      } else {
        // If all tasks are in skipped clusters, use the first cluster in the skipped list
        // to implement cycling through all clusters
        const firstSkippedClusterId = this.skippedClusters[0];
        
        // Find tasks in this cluster
        const tasksInFirstSkippedCluster = incompleteTasks.filter(task => 
          task.parentId === firstSkippedClusterId
        );
        
        if (tasksInFirstSkippedCluster.length > 0) {
          currentHighestTask = tasksInFirstSkippedCluster[0];
        } else {
          // No tasks found, reset skipped clusters
          this.skippedClusters = [];
          // Dispatch event to refresh
          document.dispatchEvent(new CustomEvent('zen-cluster-skipped'));
          return;
        }
      }
      
      // Get the current cluster ID
      const currentClusterId = currentHighestTask.parentId;
      
      // If not in a cluster, nothing to skip
      if (!currentClusterId) return;
      
      // If we have already skipped all but one cluster, and we're trying to skip the last one,
      // rotate the skipped clusters instead
      const clustersWithIncompleteTasks = this.getClusterIdsWithIncompleteTasks();
      const nonSkippedClusters = clustersWithIncompleteTasks.filter(id => 
        !this.skippedClusters.includes(id)
      );
      
      if (nonSkippedClusters.length <= 1 && clustersWithIncompleteTasks.length > 1) {
        // If this is the last non-skipped cluster, rotate the skipped clusters
        const oldestSkippedCluster = this.skippedClusters.shift();
        
        // If we have an oldest skipped cluster, move the current cluster to the skipped list
        if (oldestSkippedCluster !== undefined) {
          this.skippedClusters.push(currentClusterId);
        }
      } else {
        // Normal case: Add this cluster to the skipped clusters list
        if (!this.skippedClusters.includes(currentClusterId)) {
          this.skippedClusters.push(currentClusterId);
        }
      }
      
      // Save the changes to localStorage
      this.saveTodos();
      
      // Refresh the currentTodoCache in the zenTodoList component
      document.dispatchEvent(new CustomEvent('zen-cluster-skipped'));
    },
    
    // Helper method to get all cluster IDs that have incomplete tasks
    getClusterIdsWithIncompleteTasks(): string[] {
      const tasks = this.items.filter(item => !item.isCluster && !item.completed);
      const clusterIds = new Set<string>();
      
      tasks.forEach(task => {
        if (task.parentId) {
          clusterIds.add(task.parentId);
        }
      });
      
      return Array.from(clusterIds);
    },
  };

  window.Alpine.store("todos", todosStore);

  window.Alpine.store("quickTask", {
    text: '',
    handleEnter(this: QuickTaskStore): void {
      const todoStore = window.Alpine.store('todos') as TodoStore;
      if (this.text.trim()) {
        todoStore.addTodo(this.text);
        this.text = '';
      }
    }
  } as QuickTaskStore);
}
