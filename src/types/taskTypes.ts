import type { Todo } from '../stores/todoStore';

export interface Group {
  id: string;
  name: string;
}

export interface Task extends Todo {
  isEditing?: boolean;
}

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
