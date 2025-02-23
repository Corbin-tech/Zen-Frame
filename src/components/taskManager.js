import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import Alpine from 'alpinejs';
import { TaskSchema } from '../schemas/taskSchema';

// Attach drag utilities to the window object for client-side access
if (typeof window !== 'undefined') {
  window.draggable = draggable;
  window.dropTargetForElements = dropTargetForElements;
}

// Register component BEFORE initialization
Alpine.data('taskManager', () => ({
    dragState: {
        activeId: null,
        items: [],
        lastOverId: null
    },
    tasks: [],
    init() {
        if (!this.$store.todos) {
            Alpine.store('todos', {
                items: [],
                addTodo(todo, isCluster = false) {
                    const newTask = {
                        id: crypto.randomUUID(),
                        todo,
                        completed: false,
                        isCluster
                    };
                    this.items.push(newTask);
                    return newTask;
                },
                deleteTodo(id) {
                    this.items = this.items.filter(item => item.id !== id);
                },
                toggleComplete(id) {
                    const task = this.items.find(item => item.id === id);
                    if (task && !task.isCluster) {
                        task.completed = !task.completed;
                    }
                },
                reorderTask(sourceId, targetId, position) {
                    const items = [...this.items];
                    const sourceIndex = items.findIndex(item => item.id === sourceId);
                    const targetIndex = items.findIndex(item => item.id === targetId);
                    
                    if (sourceIndex === -1 || targetIndex === -1) return;
                    
                    const [movedItem] = items.splice(sourceIndex, 1);
                    const newIndex = position === 'below' ? targetIndex + 1 : targetIndex;
                    
                    items.splice(newIndex, 0, movedItem);
                    this.items = items;
                }
            });
        }

        const savedTasks = localStorage.getItem('tasks');
        if (savedTasks) {
            this.tasks = JSON.parse(savedTasks);
        }

        this.$watch('tasks', value => this.persistTasks(value));
        this.setupDragAndDrop();
    },
    setupDragAndDrop() {
        this.$nextTick(() => {
            document.querySelectorAll('[data-task-handle]').forEach(handle => {
                const taskElement = handle.closest('[data-task-item]');
                if (!taskElement) return;

                draggable({
                    element: taskElement,
                    dragHandle: handle,
                    onDragStart: () => {
                        taskElement.classList.add('dragging');
                        this.dragState.activeId = taskElement.dataset.taskId;
                    },
                    onDrop: () => {
                        taskElement.classList.remove('dragging');
                        this.dragState.activeId = null;
                    }
                });

                dropTargetForElements({
                    element: taskElement,
                    onDragEnter: () => {
                        if (this.dragState.activeId === taskElement.dataset.taskId) return;
                        this.handleDragOver(taskElement.dataset.taskId);
                    }
                });
            });
        });
    },
    handleDragOver(overId) {
        if (!this.dragState.activeId || this.dragState.lastOverId === overId) return;
        
        const activeIndex = this.tasks.findIndex(t => t.id === this.dragState.activeId);
        const overIndex = this.tasks.findIndex(t => t.id === overId);
        
        this.tasks = this.reorderTasks(this.tasks, activeIndex, overIndex);
        this.dragState.lastOverId = overId;
    },
    reorderTasks(list, from, to) {
        const result = Array.from(list);
        const [removed] = result.splice(from, 1);
        result.splice(to, 0, removed);
        return result;
    },
    persistTasks(tasks) {
        localStorage.setItem('tasks', JSON.stringify(tasks));
    },
    addTask(todo, isCluster = false) {
        this.$store.todos.addTodo(todo, isCluster);
    },
    deleteTask(id) {
        this.$store.todos.deleteTodo(id);
    },
    toggleTaskComplete(id) {
        this.$store.todos.toggleComplete(id);
    },
    handleKeydown(event) {
        if (event.key === 'Escape') {
            this.selectedTask = null;
            this.showNewTaskForm = false;
        }
    }
}));

document.addEventListener('alpine:init', () => {
});

// Initialize Alpine once
if (!window.Alpine) {
    window.Alpine = Alpine;
}
