declare module "alpinejs" {
  interface Alpine {
    store<T = unknown>(name: string): T;
    data(name: string, factory: () => object): void;
    data(name: 'taskInput', callback: () => TaskInputComponent): void;
  }
}

interface AlpineComponent {
  $store: {
    todos: {
      addTodo: (todo: { id: number; text: string; completed: boolean; createdAt: string }) => void;
    };
  };
}

import { TaskInputComponent } from './taskTypes';
