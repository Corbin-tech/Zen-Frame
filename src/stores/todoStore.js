// Initialize Alpine.js stores
export function initStores() {
    window.Alpine.store('todos', {
        items: [],
        init() {
            this.loadTodos();
        },
        loadTodos() {
            const savedTodos = localStorage.getItem('todos');
            if (savedTodos) {
                try {
                    this.items = JSON.parse(savedTodos);
                } catch (e) {
                    console.error('Error loading todos:', e);
                    this.items = [];
                }
            }
        },
        saveTodos() {
            localStorage.setItem('todos', JSON.stringify(this.items));
        },
        addTodo(todoText) {
            this.items.push({
                id: Date.now().toString(),
                todo: todoText,
                completed: false
            });
            this.saveTodos();
        },
        toggleTodo(id) {
            const todo = this.items.find(t => t.id === id);
            if (todo) {
                todo.completed = !todo.completed;
                this.saveTodos();
            }
        },
        deleteTodo(id) {
            this.items = this.items.filter(t => t.id !== id);
            this.saveTodos();
        },
        deleteCompleted() {
            this.items = this.items.filter(t => !t.completed);
            this.saveTodos();
        }
    });

    window.Alpine.store('weeklyTasks', {
        tasks: {},
        init() {
            this.loadTasks();
        },
        loadTasks() {
            const savedTasks = localStorage.getItem('weeklyTasks');
            if (savedTasks) {
                try {
                    this.tasks = JSON.parse(savedTasks);
                } catch (e) {
                    console.error('Error loading weekly tasks:', e);
                    this.tasks = {};
                }
            }
        },
        saveTasks() {
            localStorage.setItem('weeklyTasks', JSON.stringify(this.tasks));
        },
        addTaskToDay(day, taskId) {
            if (!this.tasks[day]) {
                this.tasks[day] = [];
            }
            if (!this.tasks[day].includes(taskId)) {
                this.tasks[day].push(taskId);
                this.saveTasks();
            }
        },
        removeTaskFromDay(day, taskId) {
            if (this.tasks[day]) {
                this.tasks[day] = this.tasks[day].filter(id => id !== taskId);
                this.saveTasks();
            }
        }
    });
}
