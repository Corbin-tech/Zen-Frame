import { fromDateKey } from "./dates";
import { SLOT_MINUTES } from "./timeline";

// Auto-planning: puts open tasks into the free parts of the user's availability windows.

export interface AvailabilityWindow {
  id: string;
  weekdays: number[]; // 0 = Sunday to 6 = Saturday
  start: number; // Minutes after midnight
  end: number;
}

interface Range {
  start: number;
  end: number;
}

export interface PlanTask {
  id: string;
  dueDate?: string | null;
  startedAt?: string;
  estimateMinutes?: number | null;
}

export interface PlannedBlock {
  taskId: string;
  date: string;
  start: number;
  end: number;
}

interface PlanInput {
  tasks: PlanTask[]; // In list order
  days: string[]; // Date keys to fill, in order
  availability: AvailabilityWindow[];
  busyOn: (dateKey: string) => Range[]; // Blocks already on that day
  duration: number; // Minutes per task
  durationOf?: (task: PlanTask) => number; // Per-task minutes, such as from an estimate. Falls back to duration.
  gap: number; // Minutes left free after each task
  earliestOn: (dateKey: string) => number; // For today: now, so nothing lands in the past
}

const roundUp = (minutes: number) => Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;

// Availability on a day, merged where windows overlap
export function windowsOn(availability: AvailabilityWindow[], dateKey: string): Range[] {
  const weekday = fromDateKey(dateKey).getDay();
  const ranges = availability
    .filter(window => window.weekdays.includes(weekday) && window.end > window.start)
    .map(({ start, end }) => ({ start, end }))
    .sort((a, b) => a.start - b.start);
  return ranges.reduce<Range[]>((merged, range) => {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
    return merged;
  }, []);
}

// Free ranges: the windows minus busy ranges, starting no earlier than `earliest`.
// Each busy range also takes the `gap` before it, so a task placed there keeps its break.
function freeRanges(windows: Range[], busy: Range[], earliest: number, gap: number): Range[] {
  let free = windows.map(range => ({ start: Math.max(range.start, roundUp(earliest)), end: range.end }))
    .filter(range => range.end > range.start);
  for (const { start, end } of busy) {
    const taken = { start: start - gap, end };
    free = free.flatMap(range => {
      if (taken.end <= range.start || taken.start >= range.end) return [range];
      return [
        { start: range.start, end: taken.start },
        { start: taken.end, end: range.end }
      ].filter(part => part.end > part.start);
    });
  }
  return free;
}

// Overdue and soonest due first, undated last; tasks already started come first among equals
export function planOrder<T extends PlanTask>(tasks: T[]): T[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) =>
      (a.task.dueDate || "9999-12-31").localeCompare(b.task.dueDate || "9999-12-31")
      || Number(Boolean(b.task.startedAt)) - Number(Boolean(a.task.startedAt))
      || a.index - b.index)
    .map(({ task }) => task);
}

// Each task gets the earliest free slot that fits, day by day. Tasks that don't fit are left out.
export function planTasks(input: PlanInput): PlannedBlock[] {
  const planned: PlannedBlock[] = [];
  const free = new Map(input.days.map(day => [
    day,
    freeRanges(windowsOn(input.availability, day), input.busyOn(day), input.earliestOn(day), input.gap)
  ]));

  for (const task of planOrder(input.tasks)) {
    const duration = input.durationOf?.(task) || input.duration;
    for (const day of input.days) {
      const ranges = free.get(day)!;
      const slot = ranges.find(range => range.end - range.start >= duration);
      if (!slot) continue;
      const start = slot.start;
      const end = start + duration;
      planned.push({ taskId: task.id, date: day, start, end });
      slot.start = Math.min(slot.end, roundUp(end + input.gap));
      break;
    }
  }
  return planned;
}
