interface Todo {
    id: string;
    todo: string;
    completed: boolean;
    section: 'today' | 'tomorrow' | 'backlog' | 'drag task from here';
    priority: 'none' | 'low' | 'medium' | 'high';
    createdAt?: string;
    completedAt?: string;
}

export interface TodoStore {
    items: Todo[];
    init(): void;
    saveTodos(): void;
    addTodo(todoText: string): void;
    toggleTodo(id: string): void;
    deleteTodo(id: string): void;
    deleteCompleted(): void;
    updateTask(id: string, updates: Partial<Todo>): void;
}

interface Alpine {
    store(name: string, value: any): void;
    data(name: string, callback: () => any): void;
    init(): void;
}

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
