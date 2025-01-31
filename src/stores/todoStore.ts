import { z } from 'zod';

// Strict type validation for Todo
const TodoSchema = z.object({
    id: z.string(),
    todo: z.string().min(1, "Task must not be empty"),
    completed: z.boolean(),
    section: z.enum(['today', 'tomorrow', 'backlog', 'drag task from here', 'completed']).default('drag task from here'),
    priority: z.enum(['none', 'low', 'medium', 'high']).default('none'),
    createdAt: z.string().optional(),
    completedAt: z.string().optional()
});

type Todo = z.infer<typeof TodoSchema>;

interface TodoStore {
    items: Todo[];
    init(): void;
    loadTodos(): void;
    saveTodos(): void;
    addTodo(todoText: string): void;
    toggleTodo(id: string): void;
    deleteTodo(id: string): void;
    deleteCompleted(): void;
    updateTask(id: string, updates: Partial<Todo>): void;
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

// Only initialize stores in browser environment
export function initStores(): void {
    if (typeof window === "undefined") return;

    if (!window.Alpine) {
        console.warn('Alpine.js not initialized');
        return;
    }

    window.Alpine.store("todos", {
        items: [] as Todo[],
        
        init() {
            if (typeof window !== "undefined") {
                this.loadTodos();
            }
        },
        
        loadTodos() {
            if (typeof window === "undefined") return;
            
            const savedTodos = localStorage.getItem("todos");
            if (savedTodos) {
                try {
                    const parsedTodos = JSON.parse(savedTodos);
                    this.items = Array.isArray(parsedTodos) ? parsedTodos.filter((todo: unknown) => 
                        TodoSchema.safeParse(todo).success
                    ) : [];
                } catch (e) {
                    console.error("Error loading todos:", e);
                    this.items = [];
                }
            }
        },
        
        saveTodos() {
            if (typeof window === "undefined") return;
            localStorage.setItem("todos", JSON.stringify(this.items));
        },
        
        addTodo(todoText: string) {
            if (typeof window === "undefined") return;
            if (!todoText?.trim()) return;
            
            const todo = {
                id: Date.now().toString(),
                todo: todoText.trim(),
                completed: false,
                section: 'drag task from here' as const,
                priority: 'none' as const,
                createdAt: new Date().toISOString()
            };
            
            this.items.push(todo);
            this.saveTodos();
        },
        
        toggleTodo(id: string) {
            if (typeof window === "undefined") return;
            
            const todo = this.items.find(t => t.id === id);
            if (todo) {
                const wasCompleted = todo.completed;
                todo.completed = !todo.completed;
                todo.completedAt = todo.completed ? new Date().toISOString() : undefined;
                
                // Move task between sections
                if (todo.completed) {
                    todo.section = 'completed';
                } else {
                    todo.section = 'drag task from here';
                }
                
                this.saveTodos();
            }
        },
        
        deleteTodo(id: string) {
            if (typeof window === "undefined") return;
            
            this.items = this.items.filter(todo => todo.id !== id);
            this.saveTodos();
        },
        
        deleteCompleted() {
            if (typeof window === "undefined") return;
            
            this.items = this.items.filter(todo => !todo.completed);
            this.saveTodos();
        },
        
        updateTask(id: string, updates: Partial<Todo>) {
            if (typeof window === "undefined") return;
            
            console.log('Updating task:', id, 'with updates:', updates);
            
            // Create a new array to trigger reactivity
            const updatedItems = this.items.map(todo => {
                if (todo.id === id) {
                    const updatedTodo = { ...todo, ...updates };
                    console.log('Updated todo:', updatedTodo);
                    return updatedTodo;
                }
                return todo;
            });
            
            // Assign new array to trigger Alpine reactivity
            this.items = updatedItems;
            
            // Save after update
            this.saveTodos();
            
            console.log('Store items after update:', this.items);
        }
    } as TodoStore);

    window.Alpine.store("weeklyTasks", {
        tasks: {} as WeeklyTask,
        
        init() {
            if (typeof window !== "undefined") {
                this.loadTasks();
            }
        },
        
        loadTasks() {
            if (typeof window === "undefined") return;
            
            const savedTasks = localStorage.getItem("weeklyTasks");
            if (savedTasks) {
                try {
                    this.tasks = JSON.parse(savedTasks);
                } catch (e) {
                    console.error("Error loading weekly tasks:", e);
                    this.tasks = {};
                }
            }
        },
        
        saveTasks() {
            if (typeof window === "undefined") return;
            localStorage.setItem("weeklyTasks", JSON.stringify(this.tasks));
        },
        
        addTaskToDay(day: string, taskId: string) {
            if (typeof window === "undefined") return;
            
            if (!this.tasks[day]) {
                this.tasks[day] = [];
            }
            if (!this.tasks[day].includes(taskId)) {
                this.tasks[day].push(taskId);
                this.saveTasks();
            }
        },
        
        removeTaskFromDay(day: string, taskId: string) {
            if (typeof window === "undefined") return;
            
            if (this.tasks[day]) {
                this.tasks[day] = this.tasks[day].filter(id => id !== taskId);
                this.saveTasks();
            }
        }
    } as WeeklyTaskStore);
}