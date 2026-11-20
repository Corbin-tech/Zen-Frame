// Shared types for the task helpers: Breakdown (split one task into steps),
// Brain dump (turn free text into clusters and tasks), and Estimate (minutes per task).
// Plus sends helper text to our server and its hosted model.

// How finely Breakdown splits a task. The user picks one of these each time.
// min/max are the step counts the helper aims for.
export const DETAIL_LEVELS = Object.freeze([
  Object.freeze({ id: "few", label: "1–3 steps", min: 1, max: 3 }),
  Object.freeze({ id: "some", label: "3–4 steps", min: 3, max: 4 }),
  Object.freeze({ id: "five", label: "About 5", min: 4, max: 6 }),
  Object.freeze({ id: "many", label: "7 or more", min: 7, max: 10 })
] as const);

export type DetailLevel = typeof DETAIL_LEVELS[number]["id"];

export function detailLevel(id: string): typeof DETAIL_LEVELS[number] {
  return DETAIL_LEVELS.find(level => level.id === id) ?? DETAIL_LEVELS[2];
}

export interface StepSuggestion {
  text: string;
  minutes: number | null; // Estimate for the step, when the helper gave one
}

export interface BreakdownResult {
  steps: StepSuggestion[];
}

export interface CompiledTask {
  text: string;
  minutes: number | null;
}

export interface CompiledCluster {
  name: string;
  tasks: CompiledTask[];
}

export interface CompileResult {
  clusters: CompiledCluster[];
}

export interface EstimateResult {
  minutes: number; // Best guess
  low: number; // A range is easier to trust than one number
  high: number;
}

// Chrome's built-in model is a parked, optional future provider.
export type ProviderId = "plus" | "on-device-ai";

export type ProviderStatus = "ready" | "needs-plus" | "needs-consent" | "unavailable";

export interface AssistProvider {
  id: ProviderId;
  status(): Promise<ProviderStatus>;
  breakdown(task: string, level: DetailLevel, context: string, signal?: AbortSignal): Promise<BreakdownResult>;
  compile(dump: string, signal?: AbortSignal): Promise<CompileResult>;
  estimate(task: string, signal?: AbortSignal): Promise<EstimateResult>;
}
