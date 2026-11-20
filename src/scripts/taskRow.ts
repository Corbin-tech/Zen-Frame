// Task row state for the Task Manager: the touch-screen "..." action sheet (spec item 13)
// and the inline steps checklist opened by the row's steps chip (spec item 16). Every
// mutation goes through the todos store, exactly like the row's inline controls -- the
// sheet only groups the same actions behind one button.

interface TodoStep {
    id: string;
    text: string;
    done: boolean;
    minutes?: number | null;
}

// The slice of a task the row reads, from the surrounding x-for scope
interface StepTask {
    id: string;
    steps?: TodoStep[] | null;
}

// The store methods the sheet calls; the same ones the row's inline controls use,
// so delete keeps firing the Undo toast and moves keep their keyboard semantics.
interface TodosApi {
    shiftTask(taskId: string, direction: -1 | 1): void;
    getTaskPosition(taskId: string): number;
    isFirstTask(taskId: string): boolean;
    isLastTask(taskId: string): boolean;
    deleteTodo(id: string): void;
}

// Alpine template magics, as they appear on `this` inside a data component. They come
// from Alpine at runtime; templates see them typed, data objects do not, so a row's
// own magics are spelled out here once.
interface RowMagics {
    $nextTick(callback: () => void): void;
    $root: HTMLElement;
    $refs: {
        menu: HTMLElement;
        menuEdit: HTMLButtonElement;
        title: HTMLInputElement;
        due: HTMLInputElement;
    };
}

// The row's own state and helper methods, and what `this` is inside them:
// that state plus the template magics
export interface RowState {
    dropEdge: 'top' | 'bottom' | null;
    titleDraft: string;
    menuOpen: boolean;
    opener: HTMLElement | null;
    stepsOpen: boolean;
    stepsDone(task: StepTask): number;
    stepsTotal(task: StepTask): number;
    stepsProgress(task: StepTask): string;
    openMenu(task: StepTask): void;
    closeMenu(restoreFocus?: boolean): void;
    toggleMenu(task: StepTask): void;
    menuFocus(direction: 1 | -1): void;
    moveTask(task: StepTask, direction: -1 | 1, from: HTMLElement, announce: () => void): void;
    deleteTask(task: StepTask): void;
    editName(): void;
    pickDueDate(): void;
    pickEstimate(): void;
}
type RowSelf = RowState & RowMagics;

export function taskRow(todos: TodosApi): RowState {
    return {
        // Which edge of the row a dragged task would land on, shown as a teal bar
        dropEdge: null,

        // The title being typed. It is saved on blur or Enter, so a search filter on
        // task.todo cannot hide the row in the middle of a rename (the Board fix, #55).
        titleDraft: '',

        // The "..." action sheet (item 13)
        menuOpen: false,
        // Where focus came from, so closing the sheet puts it back on the "..." button
        opener: null,

        // The inline checklist the steps chip opens (item 16). Collapsed per row by default.
        stepsOpen: false,

        stepsDone(task: StepTask): number {
            return (task.steps ?? []).filter(step => step.done).length;
        },

        stepsTotal(task: StepTask): number {
            return task.steps?.length ?? 0;
        },

        // Sentence case, like a board chip's read: "2 of 3 done"
        stepsProgress(this: RowSelf, task: StepTask): string {
            return `${this.stepsDone(task)} of ${this.stepsTotal(task)} done`;
        },

        openMenu(this: RowSelf, task: StepTask) {
            this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            this.menuOpen = true;
            // Only one row's sheet is open at a time; the rows close each other
            window.dispatchEvent(new CustomEvent('task-row-menu', { detail: { id: task.id } }));
            this.$nextTick(() => this.$refs.menuEdit.focus());
        },

        closeMenu(this: RowSelf, restoreFocus = true) {
            this.menuOpen = false;
            const opener = this.opener;
            this.opener = null;
            if (restoreFocus && opener && opener.isConnected) this.$nextTick(() => opener.focus());
        },

        // The button is the keyboard fallback for row actions on touch screens:
        // Tab reaches it, Enter or Space opens the sheet with focus inside.
        toggleMenu(this: RowSelf, task: StepTask) {
            if (this.menuOpen) this.closeMenu();
            else this.openMenu(task);
        },

        // Arrows cycle the sheet's buttons, like a menu
        menuFocus(this: RowSelf, direction: 1 | -1) {
            const items = Array.from(this.$refs.menu.querySelectorAll<HTMLElement>('button:not([disabled])'));
            if (!items.length) return;
            const at = items.indexOf(document.activeElement as HTMLElement);
            items[(at + direction + items.length) % items.length].focus();
        },

        // The same move the row's Alt+arrow shortcuts make, from the sheet's buttons.
        // announce only runs when the task actually changed place; the template passes
        // it in so the page's existing aria-live region speaks the move.
        moveTask(this: RowSelf, task: StepTask, direction: -1 | 1, from: HTMLElement, announce: () => void) {
            const before = todos.getTaskPosition(task.id);
            todos.shiftTask(task.id, direction);
            if (todos.getTaskPosition(task.id) !== before) announce();
            // The row just moved in the DOM; put focus back where it was. A move that
            // lands on the list edge disables the pressed button, and disabled buttons
            // cannot hold focus — hand it to the row instead (which closes the sheet).
            this.$nextTick(() => {
                if (from.hasAttribute("disabled")) return from.closest<HTMLElement>("[data-task-id]")?.focus();
                if (document.activeElement !== from) from.focus();
            });
        },

        deleteTask(this: RowSelf, task: StepTask) {
            this.closeMenu(false);
            // The same call as the row's inline delete button: the Undo toast fires
            todos.deleteTodo(task.id);
        },

        // The sheet's entries repeat the row's existing controls rather than adding
        // new semantics: they hand over to the same inputs and popovers.
        editName(this: RowSelf) {
            this.closeMenu(false);
            this.$nextTick(() => { this.$refs.title.focus(); this.$refs.title.select(); });
        },

        pickDueDate(this: RowSelf) {
            const due = this.$refs.due;
            this.closeMenu(false);
            this.$nextTick(() => due.showPicker ? due.showPicker() : due.focus());
        },

        pickEstimate(this: RowSelf) {
            // The EstimatePicker chip registers its refs on its own x-data root, so
            // reach it from the row: clicking it runs the same popover as tapping the chip
            const chip = this.$root.querySelector<HTMLElement>('.row-estimate > div > button');
            if (!chip) return;
            this.closeMenu(false);
            this.$nextTick(() => chip.click());
        }
    };
}
