interface Todo {
    id: string;
    todo: string;
    completed: boolean;
}

export interface TodoStore {
    items: Todo[];
    init(): Todo[];
    saveTodos(): void;
    addTodo(todoText: string): void;
    toggleTodo(id: string): void;
    deleteTodo(id: string): void;
    deleteCompleted(): void;
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
    }
}

export {};
