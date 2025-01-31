export type Task = {
  id: string;
  todo: string;
  completed: boolean;
  section: 'today' | 'tomorrow' | 'backlog' | 'drag task from here';
  priority: 'none' | 'low' | 'medium' | 'high';
  createdAt?: string;
  completedAt?: string;
};
