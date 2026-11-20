import type { BreakdownResult, CompileResult, EstimateResult, StepSuggestion } from "./types.ts";
import { DETAIL_LEVELS } from "./types.ts";
import { MAX_INPUT_CHARS } from "./api.ts";
import type { BreakdownRequest, CompileRequest, EstimateRequest } from "./api.ts";

// Model output is untrusted input, just like an imported backup. Everything a provider returns
// goes through these before the UI shows it or the store saves it. Templates must still render
// it with x-text, never as markup.

const MAX_TEXT = 200;
const MAX_STEPS = 12;
const MAX_CLUSTERS = 12;
const MAX_TASKS_PER_CLUSTER = 25;
export const MAX_MINUTES = 8 * 60;

function requestObject(raw: unknown, keys: string[]): raw is Record<string, unknown> {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw)
    && Object.keys(raw).every(key => keys.includes(key));
}

function requestText(raw: unknown, allowEmpty = false): string | null {
  if (typeof raw !== "string" || raw.length > MAX_INPUT_CHARS) return null;
  const text = cleanText(raw, MAX_INPUT_CHARS);
  return text || allowEmpty ? text : null;
}

export function cleanBreakdownRequest(raw: unknown): BreakdownRequest | null {
  if (!requestObject(raw, ["task", "level", "context"])) return null;
  const task = requestText(raw.task);
  const context = raw.context === undefined ? undefined : requestText(raw.context, true);
  if (task === null || context === null
    || !DETAIL_LEVELS.some(level => level.id === raw.level)) return null;
  return { task, level: raw.level as BreakdownRequest["level"], ...(context === undefined ? {} : { context }) };
}

export function cleanCompileRequest(raw: unknown): CompileRequest | null {
  if (!requestObject(raw, ["text"])) return null;
  const text = requestText(raw.text);
  return text === null ? null : { text };
}

export function cleanEstimateRequest(raw: unknown): EstimateRequest | null {
  if (!requestObject(raw, ["task"])) return null;
  const task = requestText(raw.task);
  return task === null ? null : { task };
}

// Trims, collapses whitespace, strips control characters and list markers, and caps the length
export function cleanText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function cleanMinutes(value: unknown): number | null {
  const minutes = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.min(MAX_MINUTES, Math.max(1, Math.round(minutes)));
}

function parse(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cleanSteps(list: unknown, cap: number): StepSuggestion[] {
  if (!Array.isArray(list)) return [];
  return list
    .map(item => typeof item === "string"
      ? { text: cleanText(item), minutes: null }
      : { text: cleanText(item?.text), minutes: cleanMinutes(item?.minutes) })
    .filter(step => step.text)
    .slice(0, cap);
}

export function cleanBreakdown(raw: unknown): BreakdownResult {
  const data = parse(raw) as { steps?: unknown } | null;
  return { steps: cleanSteps(data?.steps, MAX_STEPS) };
}

export function cleanCompile(raw: unknown): CompileResult {
  const data = parse(raw) as { clusters?: unknown } | null;
  const clusters = Array.isArray(data?.clusters) ? data.clusters : [];
  return {
    clusters: clusters
      .map(cluster => ({
        name: cleanText(cluster?.name, 60) || "Tasks",
        tasks: cleanSteps(cluster?.tasks, MAX_TASKS_PER_CLUSTER)
      }))
      .filter(cluster => cluster.tasks.length)
      .slice(0, MAX_CLUSTERS)
  };
}

export function cleanEstimate(raw: unknown): EstimateResult | null {
  const data = parse(raw) as { minutes?: unknown; low?: unknown; high?: unknown } | null;
  const minutes = cleanMinutes(data?.minutes);
  if (!minutes) return null;
  const low = Math.min(minutes, cleanMinutes(data?.low) ?? minutes);
  const high = Math.max(minutes, cleanMinutes(data?.high) ?? minutes);
  return { minutes, low, high };
}
