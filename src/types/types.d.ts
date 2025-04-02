import { TodoStore } from '../stores/todoStore';

/**
 * Group interface for task clusters
 */
export interface Group {
  id: string;
  name: string;
}

/**
 * Task input interfaces for task creation
 */
export interface TaskInput {
  id: number;
  text: string;
}

export interface TaskInputComponent {
  inputs: TaskInput[];
  getPlaceholder: (index: number) => string;
  handleEnter: (index: number) => void;
  addNewInput: () => void;
}

/**
 * Alpine.js type definitions
 */
interface Alpine {
  store(name: string, value: any): void;
  data(name: string, callback: () => any): void;
  init(): void;
  
  // Add drag and drop adapter types
  draggable: (element: HTMLElement) => void;
  dropTargetForElements: (element: HTMLElement) => void;
  monitorForElements: (element: HTMLElement) => void;
}

/**
 * Global type augmentations
 */
declare global {
  var Alpine: Alpine;
  var $todoStore: TodoStore;
  interface Window {
    Alpine: Alpine;
    $todoStore: TodoStore;
    todoList(): any;
    zenTodoList(): any;
    jsConfetti: any;
    taskPlanner(): any;
  }
}

export {};