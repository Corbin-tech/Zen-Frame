import { cleanMinutes, cleanText } from '../lib/assist';
import { canBreakDown } from './BreakdownPanel';
import type { Todo, TodoStep } from '../stores/todoStore';

type StepTodos = {
    find(id: string): Todo | undefined;
    toggleStep(taskId: string, stepId: string): void;
    toggleTodo(id: string): void;
    createCluster(name: string): string;
    addTodo(text: string, fields: Partial<Todo>): string;
};

const todos = () => window.Alpine.store('todos') as unknown as StepTodos;

export function registerTaskSteps() {
    window.Alpine.data('taskSteps', (activeTaskId: () => string | undefined, zen = false) => ({
        breakdownOpen: false,
        confirming: false,
        promotionMessage: '',
        get stepTaskId() { return activeTaskId(); },
        get stepTask(): Todo | undefined { return this.stepTaskId ? todos().find(this.stepTaskId) : undefined; },
        get savedSteps(): TodoStep[] { return this.stepTask?.steps ?? []; },
        get canShowSteps(): boolean {
            const task = this.stepTask;
            if (!task || task.isCluster) return false;
            // Task rows open Break down from the row icon. Zen shows its own link, so it needs this line.
            return Boolean(this.savedSteps.length || (zen && canBreakDown(task)));
        },
        get stepProgress(): string {
            return `${this.savedSteps.filter(step => step.done).length} of ${this.savedSteps.length} steps`;
        },
        get nextStep() { return this.savedSteps.find(step => !step.done); },
        init() {
            this.$watch('stepTaskId', () => {
                this.confirming = false;
                this.promotionMessage = '';
            });
        },
        toggleSavedStep(stepId: string) {
            if (this.stepTaskId) todos().toggleStep(this.stepTaskId, stepId);
        },
        finishNextStep(checkbox: HTMLInputElement) {
            const step = this.nextStep;
            if (!step) return;
            this.toggleSavedStep(step.id);
            checkbox.checked = false;
            if (!this.nextStep) this.$nextTick(() => this.$refs.stepHeading.focus());
        },
        showPromotion() {
            this.promotionMessage = '';
            this.confirming = true;
            this.$nextTick(() => this.$refs.promoteCancel.focus());
        },
        hidePromotion() {
            this.confirming = false;
            this.$nextTick(() => this.$refs.promote.focus());
        },
        promote() {
            const task = this.stepTask;
            if (!this.confirming || !task || task.isCluster) return;
            const steps = this.savedSteps
                .map(step => ({ text: cleanText(step.text), minutes: cleanMinutes(step.minutes), completed: step.done }))
                .filter(step => step.text);
            if (!steps.length) {
                this.hidePromotion();
                return;
            }
            const store = todos();
            const parentId = store.createCluster(task.todo);
            for (const { text, minutes, completed } of steps) {
                const id = store.addTodo(text, { parentId, estimateMinutes: minutes });
                if (completed) store.toggleTodo(id);
            }
            this.hidePromotion();
            this.promotionMessage = 'Cluster created. The original checklist is unchanged.';
        }
    }));
}
