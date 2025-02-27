declare module "alpinejs" {
  interface Alpine {
    store<T = unknown>(name: string): T;
    data(name: string, factory: () => object): void;
    data(name: 'taskInput', callback: () => TaskInputComponent): void;
  }
}

interface Todo {
  id: string;
  todo: string;
  completed: boolean;
  section: 'taskManager' | 'Completed';
  priority: 'none' | 'low' | 'medium' | 'high';
  isEditing?: boolean;
  isCluster?: boolean;
  parentId?: string | null;
  subtasks?: Array<{
    id: string;
    todo: string;
    completed: boolean;
    createdAt: string; // ISO datetime string
    parentId: string;
  }>;
  createdAt: string; // ISO datetime string
  updatedAt?: string; // ISO datetime string
  completedAt?: string; // ISO datetime string
}

interface TodoStore {
  items: Todo[];
  currentIndex: number;
  readonly incompleteTasks: Todo[];
  readonly currentTask: Todo | null;
  readonly hasMoreTasks: boolean;
  init(): void;
  saveTodos(): void;
  loadTodos(): void;
  addTodo(todo: string, isCluster?: boolean): string;
  deleteTodo(id: string): void;
  createNewTaskDraft(): void;
  toggleTodo(id: string): void;
  deleteCompleted(): void;
  updateTask(id: string, updates: Partial<Todo>): void;
  deleteTasksByGroup(groupId: string): void;
  toggleSubtask(taskId: string, subtaskId: string): void;
  moveTask(taskId: string, newGroupId: string): void;
  reorderTask(taskId: string, targetId: string, position: "above" | "below"): void;
  createCluster(name?: string): void;
}

interface AlpineComponent {
  $store: {
    todos: TodoStore;
    createCluster: (name?: string) => void;
  };
}

import { TaskInputComponent } from './taskTypes';
