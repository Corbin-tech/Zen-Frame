import { cleanBreakdown, cleanBreakdownRequest, cleanText, DETAIL_LEVELS, type BreakdownResult, type DetailLevel, type StepSuggestion } from '../lib/assist';
import type { initAssistStore } from '../stores/assistStore';
import type { Todo } from '../stores/todoStore';

type DraftStep = StepSuggestion & { key: number };
type BreakdownTodos = {
    find(id: string): Todo | undefined;
    clusterName(id: string | null): string;
    setSteps(id: string, steps: StepSuggestion[]): void;
};

const assist = () => window.Alpine.store('assist') as unknown as ReturnType<typeof initAssistStore>;
const todos = () => window.Alpine.store('todos') as unknown as BreakdownTodos;
const retryMessage = 'Couldn’t find steps this time. Try again.';

// Release the shared busy state even if a provider is slow to honor the abort.
async function untilAborted(work: () => Promise<BreakdownResult>, signal: AbortSignal): Promise<BreakdownResult | null> {
    if (signal.aborted) return null;
    let abort: () => void;
    const canceled = new Promise<null>(resolve => {
        abort = () => resolve(null);
        signal.addEventListener('abort', abort, { once: true });
    });
    try {
        return await Promise.race([canceled, work()]);
    } finally {
        signal.removeEventListener('abort', abort);
    }
}

export function registerBreakdownPanel() {
    window.Alpine.data('breakdownPanel', (activeTaskId: () => string | undefined, fallbackFocus: () => HTMLElement | undefined) => {
        let request: AbortController | null = null;
        let nextKey = 0;

        return {
            detailLevels: DETAIL_LEVELS,
            maxSteps: 12,
            open: false,
            working: false,
            editing: false,
            level: 'five' as DetailLevel,
            draft: [] as DraftStep[],
            error: '',
            announcement: '',

            get breakdownTaskId() { return activeTaskId(); },
            get task() { return this.breakdownTaskId ? todos().find(this.breakdownTaskId) : undefined; },
            get canSuggest(): boolean {
                return Boolean(this.task?.todo.trim() && !this.task.isCluster && !this.task.completed
                    && assist().aiStatus === 'ready' && assist().source === 'plus');
            },
            get hasValidStep(): boolean { return this.draft.some(step => cleanText(step.text)); },

            init() { this.$watch('breakdownTaskId', () => this.close(false)); },
            destroy() { request?.abort(); },
            show() {
                if (!this.canSuggest) return;
                this.open = true;
                this.$dispatch('breakdown-visibility', true);
                this.level = assist().prefs.level;
                this.announcement = '';
                this.$nextTick(() => this.$refs.level.focus());
            },
            stopRequest() {
                request?.abort();
                request = null;
                this.working = false;
            },
            focusGenerate() {
                this.$nextTick(() => {
                    const button = this.$refs.generate as HTMLButtonElement;
                    (button.disabled ? this.$refs.level : button).focus();
                });
            },
            cancel() {
                request?.abort();
            },
            close(restoreFocus = true) {
                const wasOpen = this.open;
                this.stopRequest();
                this.open = false;
                this.editing = false;
                this.draft = [];
                this.error = '';
                this.announcement = '';
                if (!wasOpen) return;
                this.$dispatch('breakdown-visibility', false);
                if (restoreFocus) this.$nextTick(() => {
                    (this.canSuggest ? this.$refs.trigger : fallbackFocus())?.focus();
                });
            },
            async generate() {
                const store = assist();
                const task = this.task;
                if (!this.open || this.working || this.editing || !this.canSuggest || !task || store.busy) return;
                const input = cleanBreakdownRequest({ task: task.todo, level: this.level, context: todos().clusterName(task.parentId) });
                if (!input) {
                    this.error = 'Shorten the task or cluster name before finding steps.';
                    return;
                }
                if (this.level !== store.prefs.level) store.setPrefs({ level: this.level });

                const current = request = new AbortController();
                this.working = true;
                this.error = '';
                this.announcement = 'Finding steps.';
                this.$nextTick(() => { if (this.working) this.$refs.cancel.focus(); });

                const result = await store.run(async (provider, signal) => {
                    const combined = AbortSignal.any([current.signal, signal]);
                    const response = await untilAborted(
                        () => provider.breakdown(input.task, input.level, input.context ?? '', combined),
                        combined
                    );
                    return combined.aborted ? null : cleanBreakdown(response);
                });
                if (request !== current || task.id !== this.breakdownTaskId) return;
                const canceled = current.signal.aborted;
                this.stopRequest();
                if (canceled) {
                    this.announcement = 'Step suggestions canceled.';
                    this.focusGenerate();
                    return;
                }
                this.announcement = '';
                if (!result?.steps.length) {
                    this.error = store.error || retryMessage;
                    this.focusGenerate();
                    return;
                }

                this.draft = result.steps.map(step => ({ ...step, key: nextKey++ }));
                this.editing = true;
                this.announcement = `${this.draft.length} suggested steps ready to edit.`;
                this.focusStep(this.draft[0].key);
            },
            focusStep(key?: number) {
                this.$nextTick(() => {
                    const field = this.$root.querySelector<HTMLTextAreaElement>(`[data-draft-step="${key}"] textarea`);
                    (field ?? this.$refs.add).focus();
                });
            },
            add() {
                if (this.draft.length >= this.maxSteps) return;
                const key = nextKey++;
                this.draft.push({ key, text: '', minutes: null });
                this.announcement = `Step ${this.draft.length} added.`;
                this.focusStep(key);
            },
            move(index: number, direction: -1 | 1) {
                const target = index + direction;
                if (target < 0 || target >= this.draft.length) return;
                const [step] = this.draft.splice(index, 1);
                this.draft.splice(target, 0, step);
                this.announcement = `Step moved to position ${target + 1}.`;
                this.focusStep(step.key);
            },
            remove(index: number) {
                this.draft.splice(index, 1);
                this.announcement = `Step ${index + 1} removed.`;
                this.focusStep((this.draft[index] ?? this.draft.at(-1))?.key);
            },
            accept() {
                const task = this.task;
                if (!this.editing || !task || task.isCluster || task.completed) return;
                const { steps } = cleanBreakdown({ steps: this.draft });
                if (!steps.length) return;
                todos().setSteps(task.id, steps);
                this.close();
                this.announcement = 'Checklist saved.';
            }
        };
    });
}
