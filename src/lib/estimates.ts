import { SLOT_MINUTES } from "./timeline";
import { cleanEstimate, cleanMinutes } from "./assist/sanitize";
import type { EstimateResult } from "./assist/types";
import type { initAssistStore } from "../stores/assistStore";

// Time estimates: totals for a cluster, a buffer for time blindness, rounding to the schedule
// grid, and a personal factor learned from how long the user's tasks actually took.

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

export function totalLabel(tasks: Estimated[]): string {
  const { minutes, unestimated } = totalEstimate(tasks);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const duration = [hours ? `${hours} hr` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
  const base = minutes ? `About ${duration}` : "No estimate yet";
  return unestimated ? `${base} · ${unestimated} not estimated` : base;
}

type AssistStore = ReturnType<typeof initAssistStore>;

export function estimatePicker(assist: AssistStore) {
  return {
    open: false,
    editing: false,
    minutes: null as number | null,
    suggestion: null as EstimateResult | null,
    pending: false,
    request: 0,
    error: "",

    get canSuggest() {
      return assist.aiStatus === "ready" && assist.source === "plus";
    },

    get saveMinutes() {
      return Number.isSafeInteger(this.minutes) ? cleanMinutes(this.minutes) : null;
    },

    startEditing(minutes: number | null) {
      this.minutes = minutes;
      this.suggestion = null;
      this.editing = true;
    },

    async suggest(taskId: string) {
      if (!this.canSuggest || assist.busy) return;
      const request = ++this.request;
      const previous = assist.preview;
      this.pending = true;
      this.error = "";
      this.editing = false;
      this.suggestion = null;
      await assist.estimate(taskId);
      const preview = assist.preview;
      const ownPreview = preview?.kind === "estimate" && preview.taskId === taskId && preview !== previous;
      if (ownPreview) assist.preview = null;
      if (request !== this.request) return;

      this.pending = false;
      if (ownPreview && this.canSuggest) {
        const result = cleanEstimate(preview.result);
        if (result) {
          this.startEditing(result.minutes);
          this.suggestion = result;
          return;
        }
      }
      this.error = assist.error || "No estimate was suggested. You can still pick one by hand.";
    },

    cancel() {
      if (!this.pending) return;
      this.request++;
      this.pending = false;
      assist.cancel();
    },

    close() {
      this.cancel();
      this.open = false;
      this.editing = false;
      this.suggestion = null;
      this.error = "";
    },

    destroy() {
      this.cancel();
    }
  };
}

// The block length the schedule should suggest: estimate × buffer, rounded up to the grid
export function blockMinutes(estimate: number, buffer = 1, fallback = 45): number {
  const minutes = estimate > 0 ? estimate * buffer : fallback;
  return Math.max(SLOT_MINUTES, Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES);
}

export interface EstimateSample {
  estimated: number;
  actual: number;
}

// How much longer (or shorter) the user's tasks take than estimated: the median ratio of
// recent samples, held between 0.5× and 3×. Returns 1 until there are enough samples to trust.
export function personalFactor(samples: EstimateSample[], minSamples = 5): number {
  const ratios = samples
    .filter(sample => sample.estimated > 0 && sample.actual > 0)
    .slice(-50)
    .map(sample => sample.actual / sample.estimated)
    .sort((a, b) => a - b);
  if (ratios.length < minSamples) return 1;
  const middle = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 ? ratios[middle] : (ratios[middle - 1] + ratios[middle]) / 2;
  return Math.min(3, Math.max(0.5, Math.round(median * 100) / 100));
}
