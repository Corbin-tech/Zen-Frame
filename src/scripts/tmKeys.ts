// Keyboard navigation for the Task Manager (spec item 17): j/k move row focus,
// x completes the focused task, e or Enter edits its name, # moves it to a cluster
// or the Inbox.
//
// Pure and typed: this module only answers "which intent does this keypress carry,
// if any" plus the small maths around the walks and announcements. Every DOM fact
// a keypress has to be weighed against (typing focus, the active tab, an open
// overlay, an open row sheet, the rows that actually rendered) arrives as an
// argument, so tests can assert intent dispatch while the component layer keeps
// only DOM effects.
//
// Guards: the intended keys are bare. Any other combination with Ctrl, Meta, or
// Alt bails out rather than intercepting a browser or system shortcut. Shift is
// kept only for "#", which most keyboards type as Shift+3.

/** The loose-tasks section's name, everywhere copy mentions it (spec item 18). */
export const INBOX_NAME = 'Inbox';

/** Under this name the cluster picker joins the app's window overlay coordination. */
export const TM_OVERLAY_NAME = 'tm-cluster-picker';

/** What a keypress asks the Task Manager to do. Null: not ours; the browser keeps the key. */
export type TmKeyIntent =
    | { kind: 'focusRow'; direction: 1 | -1 }
    | { kind: 'completeTask' }
    | { kind: 'editTask' }
    | { kind: 'openClusterPicker' };

/** The slice of a KeyboardEvent the map reads. */
export interface TmKeyEvent {
    key: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
}

/** Where focus sits relative to task rows. */
export type TmRowFocus = 'none' | 'within' | 'row';

/** The DOM facts of the moment, supplied by the page when a key lands. */
export interface TmKeyContext {
    /** Focus is in an input, textarea, select, or contenteditable: the user is typing. */
    typing: boolean;
    /** The Task Manager is the visible tab. */
    tabActive: boolean;
    /** Any app dialog is open (quick add, settings ...). */
    overlayOpen: boolean;
    /** A row's "..." action sheet is open. */
    rowMenuOpen: boolean;
    /** Whether focus is on a task row itself ('row'), inside one ('within'), or elsewhere ('none'). */
    rowFocus: TmRowFocus;
}

/**
 * The intent of one keypress, or null when the key is not the Task Manager's.
 * The map mirrors the app's existing shortcut idiom (the quick-add window's N):
 * never while typing, never with browser or system modifiers.
 */
export function tmKeyIntent(event: TmKeyEvent, context: TmKeyContext): TmKeyIntent | null {
    // Never while typing, on another tab, or under an overlay or a row sheet
    if (!context.tabActive || context.typing || context.overlayOpen || context.rowMenuOpen) return null;
    // No browser or system combinations: only bare keys are ours
    if (event.altKey || event.ctrlKey || event.metaKey) return null;
    // "#" is Shift+3 on many keyboards, so Shift stays allowed for it alone
    if (event.key === '#') return context.rowFocus === 'none' ? null : { kind: 'openClusterPicker' };
    if (event.shiftKey) return null;
    switch (event.key.toLowerCase()) {
        case 'j': return { kind: 'focusRow', direction: 1 };
        case 'k': return { kind: 'focusRow', direction: -1 };
        case 'x': return context.rowFocus === 'none' ? null : { kind: 'completeTask' };
        case 'e':
        case 'enter': return context.rowFocus === 'row' ? { kind: 'editTask' } : null;
        default: return null;
    }
}

/**
 * The row to focus after one j or k. `from` is the index of the row that holds
 * focus, or -1 when none does: j then goes to the first visible row, k to the
 * last. The result clamps at the ends, so repeated presses stay on the page.
 */
export function stepRowIndex(from: number, direction: 1 | -1, count: number): number | null {
    if (count <= 0) return null;
    if (from < 0) return direction === 1 ? 0 : count - 1;
    return Math.min(count - 1, Math.max(0, from + direction));
}

/**
 * The one line the aria-live region speaks for a move:
 * "Moved to position N of M in <cluster or Inbox>". Pure: callers read the
 * store after the move, so every entry point (drag and drop, Alt+arrows, the
 * # picker) announces the destination the task landed in.
 */
export function moveAnnouncementText(
    task: { parentId: string | null },
    position: number,
    total: number,
    clusterName: string
): string {
    // A loose task is "in the Inbox"; a cluster whose name went missing still says where
    const where = task.parentId ? (clusterName || 'its cluster') : INBOX_NAME;
    return `Moved to position ${position} of ${total} in ${where}`;
}
