import { DETAIL_LEVELS, pickProvider, type AssistProvider, type CompiledCluster, type DetailLevel, type EstimateResult, type ProviderStatus, type StepSuggestion } from "../lib/assist/index.ts";
import { loadJson, saveJson } from "../lib/storage.ts";
import { AssistError } from "../lib/assist/cloudProvider.ts";
import type { initPlusStore } from "./plusStore";

// The task helpers, registered as $store.assist. Saved under "assist" in localStorage
// (preferences only, never task text).
//
// Suggestions are never applied on their own: each run fills `preview`, the user reviews and
// edits it, and only accept*() writes to $store.todos. Predictable, undoable changes matter
// for autistic users, and a quick review keeps ADHD users in charge of the plan.

export type AssistPreview =
  | { kind: "breakdown"; taskId: string; level: DetailLevel; steps: StepSuggestion[] }
  | { kind: "compile"; clusters: CompiledCluster[] }
  | { kind: "estimate"; taskId: string; result: EstimateResult };

interface AssistPrefs {
  level: DetailLevel;
}

const DEFAULT_PREFS: AssistPrefs = { level: "five" };
const LEVELS = new Set<string>(DETAIL_LEVELS.map(level => level.id));

function loadPrefs(): AssistPrefs {
  const saved = loadJson<Partial<AssistPrefs>>("assist", {});
  return {
    level: LEVELS.has(saved?.level as string) ? saved.level : DEFAULT_PREFS.level
  };
}

// Minimal view of $store.todos used here
interface TodosApi {
  find(id: string): { id: string; todo: string; parentId: string | null } | undefined;
  clusterName(id: string | null): string;
  createCluster(name?: string): string;
  addTodo(text: string, fields?: object): string;
  setSteps(taskId: string, steps: StepSuggestion[]): void;
  setEstimate(taskId: string, minutes: number | null): void;
}

const todos = () => window.Alpine.store("todos") as unknown as TodosApi;

export function initAssistStore() {
  let provider: AssistProvider | null = null;
  let controller: AbortController | null = null;

  return {
    prefs: { ...DEFAULT_PREFS } as AssistPrefs,
    consent: loadJson<unknown>('assistConsent', false) === true,
    aiStatus: "needs-plus" as ProviderStatus,
    source: null as AssistProvider["id"] | null,
    busy: false,
    error: "",
    preview: null as AssistPreview | null,

    async init(): Promise<void> {
      this.prefs = loadPrefs();
      await this.refresh();
    },

    async refresh(): Promise<void> {
      const picked = await pickProvider(this.consent);
      this.aiStatus = picked.status;
      provider = picked.provider;
      this.source = provider?.id ?? null;
    },

    giveConsent(): void {
      this.consent = true;
      saveJson('assistConsent', true);
      void this.refresh();
    },

    withdrawConsent(): void {
      this.consent = false;
      saveJson('assistConsent', false);
      this.discard();
      void this.refresh();
    },

    setPrefs(changes: Partial<AssistPrefs>): void {
      this.prefs = { level: LEVELS.has(changes.level) ? changes.level : this.prefs.level };
      saveJson("assist", this.prefs);
      void this.refresh();
    },

    // Runs one request at a time; starting another cancels the last
    async run<T>(work: (provider: AssistProvider, signal: AbortSignal) => Promise<T>): Promise<T | null> {
      controller?.abort();
      if (!provider || !this.consent) {
        controller = null;
        this.busy = false;
        this.error = "Plus isn't available yet. You can still edit the task by hand.";
        return null;
      }
      const current = controller = new AbortController();
      this.busy = true;
      this.error = "";
      try {
        const result = await work(provider, current.signal);
        if (result !== null) void (window.Alpine.store('plus') as ReturnType<typeof initPlusStore> | undefined)?.refresh();
        return current.signal.aborted ? null : result;
      } catch (error) {
        if (!current.signal.aborted) {
          this.error = error instanceof AssistError && ['unauthorized', 'needs_plus', 'trial_exhausted'].includes(error.code)
            ? "Plus isn't available yet. You can still edit the task by hand."
            : "Couldn't make suggestions this time. Try again, or edit the task by hand.";
        }
        return null;
      } finally {
        if (controller === current) {
          this.busy = false;
          controller = null;
        }
      }
    },

    cancel(): void {
      controller?.abort();
    },

    discard(): void {
      this.cancel();
      this.preview = null;
    },

    // Remembers the level, so the picker opens on the user's last choice
    async breakdown(taskId: string, chosen?: DetailLevel): Promise<void> {
      const task = todos().find(taskId);
      if (!task?.todo.trim()) return;
      const level = chosen ?? this.prefs.level;
      if (level !== this.prefs.level) this.setPrefs({ level });
      const result = await this.run((p, signal) => p.breakdown(task.todo, level, todos().clusterName(task.parentId), signal));
      if (result) this.preview = { kind: "breakdown", taskId, level, steps: result.steps };
    },

    async compile(dump: string): Promise<void> {
      if (!dump.trim()) return;
      const result = await this.run((p, signal) => p.compile(dump.slice(0, 6000), signal));
      if (result) this.preview = { kind: "compile", clusters: result.clusters };
    },

    async estimate(taskId: string): Promise<void> {
      const task = todos().find(taskId);
      if (!task?.todo.trim()) return;
      const result = await this.run((p, signal) => p.estimate(task.todo, signal));
      if (result) this.preview = { kind: "estimate", taskId, result };
    },

    // Saves the (possibly edited) preview to the task list
    accept(): void {
      const preview = this.preview;
      if (!preview) return;
      if (preview.kind === "breakdown") {
        todos().setSteps(preview.taskId, preview.steps.filter(step => step.text.trim()));
      } else if (preview.kind === "estimate") {
        todos().setEstimate(preview.taskId, preview.result.minutes);
      } else {
        for (const cluster of preview.clusters) {
          const clusterId = todos().createCluster(cluster.name);
          for (const task of cluster.tasks) {
            if (task.text.trim()) todos().addTodo(task.text, { parentId: clusterId, estimateMinutes: task.minutes });
          }
        }
      }
      this.preview = null;
    }
  };
}
