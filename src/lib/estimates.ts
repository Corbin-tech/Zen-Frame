import { SLOT_MINUTES } from "./timeline";

// Time estimates: totals for a cluster, a buffer for time blindness, and rounding to the
// schedule grid.

export const MAX_MINUTES = 8 * 60;

// A whole number of minutes between 1 and MAX_MINUTES, or null
export function cleanMinutes(value: unknown): number | null {
  const minutes = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : NaN;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.min(MAX_MINUTES, Math.max(1, Math.round(minutes)));
}

export interface Estimated {
  estimateMinutes?: number | null;
  completed?: boolean;
}

// Minutes left in a group of tasks. Tasks with no estimate are counted, not guessed.
export function totalEstimate(tasks: Estimated[]): { minutes: number; unestimated: number } {
  let minutes = 0;
  let unestimated = 0;
  for (const task of tasks) {
    if (task.completed) continue;
    if (task.estimateMinutes) minutes += task.estimateMinutes;
    else unestimated += 1;
  }
  return { minutes, unestimated };
}

export function estimateLabel(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "No estimate yet";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const duration = [hours ? `${hours} hr` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
  return `About ${duration}`;
}

export function totalLabel(tasks: Estimated[]): string {
  const { minutes, unestimated } = totalEstimate(tasks);
  const base = estimateLabel(minutes);
  return unestimated ? `${base} · ${unestimated} not estimated` : base;
}

// Estimate-only label for tight header chips: "~2 hr 15 min" with no "About" and no
// "not estimated" tail (unestimated tasks carry their own add-controls row by row).
// Empty when nothing in the list is estimated, so callers can drop the segment.
export function chipEstimateLabel(tasks: Estimated[]): string {
  const { minutes } = totalEstimate(tasks);
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const duration = [hours ? `${hours} hr` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
  return `~${duration}`;
}

export function estimatePicker() {
  return {
    open: false,
    editing: false,
    minutes: null as number | null,

    get saveMinutes() {
      return Number.isSafeInteger(this.minutes) ? cleanMinutes(this.minutes) : null;
    },

    startEditing(minutes: number | null) {
      this.minutes = minutes;
      this.editing = true;
    },

    close() {
      this.open = false;
      this.editing = false;
    }
  };
}

// The block length the schedule should suggest: estimate × buffer, rounded up to the grid
export function blockMinutes(estimate: number, buffer = 1, fallback = 45): number {
  const minutes = estimate > 0 ? estimate * buffer : fallback;
  return Math.max(SLOT_MINUTES, Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES);
}
