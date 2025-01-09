interface Todo {
    id: string;
    todo: string;
    completed: boolean;
}

export const todoStore = {
    items: [] as Todo[],

    init(): Todo[] {
        const savedTodos = localStorage.getItem('todos');
        if (savedTodos) {
            try {
                this.items = JSON.parse(savedTodos);
            } catch (e) {
                console.error('Error loading todos:', e);
                this.items = [];
            }
        }
        return this.items;
    },

    saveTodos(): void {
        localStorage.setItem('todos', JSON.stringify(this.items));
    },

    addTodo(todoText: string): void {
        this.items.push({
            id: crypto.randomUUID(),
            todo: todoText,
            completed: false
        });
        this.saveTodos();
    },

    toggleTodo(id: string): void {
        const todo = this.items.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            this.saveTodos();
        }
    },

    deleteTodo(id: string): void {
        this.items = this.items.filter(t => t.id !== id);
        this.saveTodos();
    },

    deleteCompleted(): void {
        this.items = this.items.filter(t => !t.completed);
        this.saveTodos();
    }
};
