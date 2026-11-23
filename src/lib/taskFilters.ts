// Search, sort, and quick-add chip helpers for the Task Manager.
//
// Pure and typed: every helper mirrors the Board's semantics (Board.astro),
// takes its inputs as arguments, and reads no clocks other than a `todayKey`
// passed in (see src/lib/dates.ts), so the module is safe to import from
// app code and tests alike, and everything stays deterministic.
//
// Mirrored semantics:
//   - Search: a case-insensitive match of the query against the task's own
//     text (`todo`), exactly as `board.tasks` filters cards. An empty query
//     matches everything.
//   - "Past due first": most overdue first (earliest due date key on top),
//     undated tasks last — Board's `tasksIn` comparator, verbatim.
//   - "My order": the store's list order, untouched.
import { dates } from "./dates";
import type { ParsedQuickAdd, QuickAddMatch } from "./quickAddParse";
import type { Todo } from "../stores/todoStore";

/** The Task Manager's sort settings. Mirrors the Board's sort options. */
export type TaskManagerSort = "manual" | "due";

/** Sort options with the Board's exact labels. */
export const TASK_MANAGER_SORT_OPTIONS: ReadonlyArray<{ id: TaskManagerSort; label: string }> = [
  { id: "manual", label: "My order" },
  { id: "due", label: "Past due first" }
];

// Board's sentinel for a card without a due date: undated tasks sort last.
const UNDATED = "9999-12-31";

/**
 * Whether a task matches a search query, mirroring the Board's card filter:
 * a case-insensitive match on the task's own text. An empty or blank query
 * matches everything.
 */
export function taskMatchesQuery(task: Todo, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  return !wanted || task.todo.toLowerCase().includes(wanted);
}

/**
 * Board's "Past due first" comparator, verbatim: the earliest (most overdue)
 * due date first, undated tasks last.
 */
export function compareOverdueFirst(a: Todo, b: Todo): number {
  return (a.dueDate || UNDATED).localeCompare(b.dueDate || UNDATED);
}

/**
 * A list of tasks in display order. "My order" keeps the store's list order;
 * "Past due first" sorts by due date (most overdue first, undated last) and
 * never mutates the input list.
 */
export function sortTasksForDisplay(tasks: readonly Todo[], sortBy: TaskManagerSort): Todo[] {
  if (sortBy !== "due") return [...tasks];
  return [...tasks].sort(compareOverdueFirst);
}

/**
 * The label of a quick-add chip, from the `label` of a parsed match:
 * a due date ("Tomorrow", "In 3 days"), an estimate ("1 hr 30 min", the
 * hr/min idiom from src/lib/estimates.ts), or a cluster ("#CS101").
 */
export function chipLabelFor(match: QuickAddMatch, todayKey: string): string {
  if (match.kind === "due") return dates.dueLabel(String(match.value), todayKey);
  if (match.kind === "estimate") return estimateChipLabel(Number(match.value));
  return clusterChipLabel(String(match.value));
}

/** An estimate in the estimator's own idiom: "30 min", "1 hr", "1 hr 30 min". */
export function estimateChipLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [hours ? `${hours} hr` : "", rest ? `${rest} min` : ""].filter(Boolean);
  return parts.join(" ") || "0 min";
}

/** A cluster chip rendered the way the user wrote it: "#CS101". */
export function clusterChipLabel(name: string): string {
  return `#${name}`;
}

/**
 * The cluster whose name matches `name`, case-insensitively, or undefined.
 * Cluster names are trimmed before comparing, like the store does on save.
 */
export function resolveClusterByName<C extends { todo: string }>(clusters: readonly C[], name: string): C | undefined {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  return clusters.find(cluster => cluster.todo.trim().toLowerCase() === wanted);
}

/**
 * The input line with one parsed token taken out, by re-serializing what is
 * left: the title first, then the remaining tokens in their original order.
 *
 * Re-serializing (rather than splicing the token's substring out of the raw
 * input) is the robust choice: a token's raw text can also appear inside a
 * word that stayed literal ("sun" inside "sunscreen"), and a plain substring
 * removal would corrupt the text there. The cost is that deleting a chip
 * normalizes the line's spacing and moves the surviving tokens after the
 * title, which the live chips preview immediately reflects.
 *
 * Removes the first match equal to `match` (same kind, raw, and value), so
 * one tap deletes exactly one chip even when the line repeats a token.
 */
export function withoutMatch(parsed: ParsedQuickAdd, match: QuickAddMatch): string {
  let removed = false;
  const tokens: string[] = [];
  for (const candidate of parsed.matches) {
    if (!removed && candidate.kind === match.kind && candidate.raw === match.raw && candidate.value === match.value) {
      removed = true;
      continue;
    }
    tokens.push(candidate.raw);
  }
  if (!removed) return parsed.title;
  return [parsed.title, ...tokens].filter(Boolean).join(" ");
}
