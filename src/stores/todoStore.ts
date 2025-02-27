import { z } from 'zod';

// Strict type validation for Todo
const TodoSchema = z.object({
  id: z.string(),
  todo: z.string().min(1, "Task must not be empty"),
  completed: z.boolean(),
  section: z.enum(['taskManager', 'Completed', 'mainContainer']),
  priority: z.enum(['none', 'low', 'medium', 'high']).default('none'),
  isEditing: z.boolean().optional().default(false),
  isCluster: z.boolean().optional().default(false),
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
    },

    saveTodos(): void {
      localStorage.setItem("todos", JSON.stringify(this.items));
    },

    addTodo(todoText: string, isCluster: boolean = false): string {
      const id = crypto.randomUUID();
      const newItems = [...this.items];
      const newTask: Todo = {
        id,
        todo: todoText,
        completed: false,
        section: "taskManager",
        priority: "none",
        isEditing: false,
        isCluster,
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
      // Find the task
      const task = this.items.find(t => t.id === id);
      
      if (!task) return;
      
      if (task.isCluster) {
        // If it's a cluster, remove the cluster and all its children
        this.items = this.items.filter(item => item.id !== id && item.parentId !== id);
      } else {
        // Just remove the single task
        this.items = this.items.filter(item => item.id !== id);
      }
      
      const incompleteTasks = this.items.filter(item => !item.completed && !item.isCluster);
      if (this.currentIndex >= incompleteTasks.length) {
        this.currentIndex = Math.max(0, incompleteTasks.length - 1);
      }
      this.saveTodos();
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
      
      // Ensure the content is not empty for cluster names
      if (updates.todo !== undefined) {
        updates.todo = updates.todo.trim() || "New Cluster";
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
      if (taskId === targetId) return;
      
      // Find the tasks
      const sourceTask = this.items.find(t => t.id === taskId);
      const targetTask = this.items.find(t => t.id === targetId);
      
      if (!sourceTask || !targetTask) {
        console.error('Source or target task not found', { taskId, targetId });
        return;
      }
      
      // Make sure the parent IDs match (or both are null) to keep tasks in the same container
      sourceTask.parentId = targetTask.parentId;
      
      // Find indices
      const sourceIndex = this.items.findIndex(t => t.id === taskId);
      const targetIndex = this.items.findIndex(t => t.id === targetId);
      
      // Create a new array without the source task
      const newItems = [...this.items];
      const [removedTask] = newItems.splice(sourceIndex, 1);
      
      // Find the new target index after removing the source task
      const newTargetIndex = newItems.findIndex(t => t.id === targetId);
      
      // Calculate insert position
      const insertIndex = position === 'above' ? newTargetIndex : newTargetIndex + 1;
      
      // Insert the task at the new position
      newItems.splice(insertIndex, 0, removedTask);
      
      // Update the store
      this.items = newItems;
      this.saveTodos();
      
      console.log('Task reordering complete');
    },

    createCluster(name: string = "New Cluster"): string {
      // Make sure name is not empty
      const clusterName = name.trim() || "New Cluster";
      
      const newCluster: Todo = {
        id: crypto.randomUUID(),
        todo: clusterName,
        completed: false,
        section: "taskManager",
        priority: "none",
        isEditing: false,
        isCluster: true,
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
    }
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
