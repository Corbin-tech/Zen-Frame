import { z } from 'zod';

// Strict type validation for Todo
const TodoSchema = z.object({
    id: z.string(),
    todo: z.string().min(1, "Task must not be empty"),
    completed: z.boolean(),
    section: z.enum(['taskManager', 'Completed']),
    priority: z.enum(['none', 'low', 'medium', 'high']).default('none'),
    isEditing: z.boolean().optional().default(false),
    isCluster: z.boolean().optional().default(false),
    parentId: z.string().optional(),
    subtasks: z.array(z.object({
        id: z.string(),
        todo: z.string().min(1, "Task must not be empty"),
        completed: z.boolean(),
        createdAt: z.string().datetime(),
        parentId: z.string()
    })).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional()
});

export type Todo = z.infer<typeof TodoSchema>;

interface TodoStore {
    items: Todo[];
    init(): void;
    loadTodos(): void;
    saveTodos(): void;
    addTodo(todoText: string): void;
    createCluster(name: string): void;
    toggleTodo(id: string): void;
    deleteTodo(id: string): void;
    deleteCompleted(): void;
    updateTask(id: string, updates: Partial<Todo>): void;
    deleteTasksByGroup(groupId: string): void;
    createNewTaskDraft(): void;
    toggleSubtask(taskId: string, subtaskId: string): void;
    moveTask(taskId: string, newGroupId: string): void;
    reorderTask(taskId: string, targetId: string, position: "above" | "below"): void;
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

// Quick Task Store Definition
export interface QuickTaskStore {
  text: string;
  handleEnter: () => void;
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
            
            // Migrate legacy todos to ensure each has a unique id
            this.items = this.items.map(todo => {
                if (!todo.id.includes("-")) {
                    return {
                        ...todo,
                        id: `${todo.id}-${Math.random().toString(36).substring(2, 10)}`
                    };
                }
                return todo;
            });
        },
        
        saveTodos() {
            if (typeof window === "undefined") return;
            localStorage.setItem("todos", JSON.stringify(this.items));
        },
        
        addTodo(todoText: string) {
            if (typeof window === "undefined") return;
            if (!todoText?.trim()) return;
            
            const newTodo = {
                id: crypto.randomUUID(),
                todo: todoText.trim(),
                completed: false,
                section: 'taskManager',
                isEditing: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.items.push(TodoSchema.parse(newTodo));
            this.saveTodos();
        },
        
        createCluster(name: string) {
            const clusterId = crypto.randomUUID();
            const newCluster = {
                id: clusterId,
                todo: name,
                isCluster: true,
                completed: false,
                createdAt: new Date().toISOString()
            };
            this.items.push(TodoSchema.parse(newCluster));
            this.saveTodos();
        },
        
        createNewTaskDraft() {
            const draftTodo = {
                id: crypto.randomUUID(),
                todo: 'New Task',
                completed: false,
                section: 'taskManager',
                isEditing: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.items.unshift(TodoSchema.parse(draftTodo));
            this.saveTodos();
        },
        
        toggleTodo(id: string) {
            if (typeof window === "undefined") return;
            
            const todo = this.items.find(t => t.id === id);
            if (todo) {
                const wasCompleted = todo.completed;
                todo.completed = !todo.completed;
                todo.completedAt = todo.completed ? new Date().toISOString() : undefined;
                todo.updatedAt = new Date().toISOString();
                
                // Move task between sections
                if (todo.completed) {
                    todo.section = 'Completed';
                } else {
                    todo.section = 'taskManager';
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
                    const updatedTodo = { ...todo, ...updates, updatedAt: new Date().toISOString() };
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
        },
        
        deleteTasksByGroup(groupId: string) {
            this.items = this.items.filter((task) => task.section !== groupId);
            this.saveTodos();
        },
        
        toggleSubtask(taskId: string, subtaskId: string) {
            const task = this.items.find(t => t.id === taskId);
            if (task?.subtasks) {
                const subtask = task.subtasks.find(st => st.id === subtaskId);
                if (subtask) {
                    subtask.completed = !subtask.completed;
                    
                    // Check if all subtasks are completed
                    const allSubtasksCompleted = task.subtasks.every(st => st.completed);
                    if (allSubtasksCompleted) {
                        task.completed = true;
                        task.completedAt = new Date().toISOString();
                    } else {
                        task.completed = false;
                        task.completedAt = undefined;
                    }
                    
                    this.saveTodos();
                }
            }
        },
        
        moveTask(taskId, newGroupId) {
            const taskIndex = this.items.findIndex(t => t.id === taskId);
            if (taskIndex > -1) {
                this.items[taskIndex].section = newGroupId as 'taskManager' | 'Completed';
                this.saveTodos();
            }
        },
        
        reorderTask(taskId, targetId, position) {
            const draggedIndex = this.items.findIndex(t => t.id === taskId);
            const targetIndex = this.items.findIndex(t => t.id === targetId);
            if (draggedIndex === -1 || targetIndex === -1) return;
            // Remove the dragged task from its current position
            const [draggedTask] = this.items.splice(draggedIndex, 1);
            // Calculate new index based on position
            let newIndex = targetIndex;
            if (position === "below") {
                newIndex = targetIndex + 1;
            }
            // If draggedIndex was before targetIndex, targetIndex adjusted by 1 due to removal
            if (draggedIndex < targetIndex && position === "above") {
                newIndex = targetIndex - 1;
            }
            if (draggedIndex < targetIndex && position === "below") {
                newIndex = targetIndex;
            }
            // Insert dragged task at new index
            this.items.splice(newIndex, 0, draggedTask);
            this.saveTodos();
        },
    } as TodoStore);

    window.Alpine.store("quickTask", {
        text: '',
        
        handleEnter(this: QuickTaskStore) {
            const todoStore = window.Alpine.store('todos') as TodoStore;
            if (this.text.trim()) {
                todoStore.addTodo(this.text);
                this.text = '';
            }
        }
    } as QuickTaskStore);

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