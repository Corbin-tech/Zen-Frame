import { breakdownPrompt, breakdownSchema, compilePrompt, COMPILE_SCHEMA, estimatePrompt, ESTIMATE_SCHEMA, SYSTEM_PROMPT } from "./prompts";
import { cleanBreakdown, cleanCompile, cleanEstimate } from "./sanitize";
import { detailLevel, type AssistProvider, type ProviderStatus } from "./types";

// Chrome's built-in model (Gemini Nano) through the Prompt API, on desktop Chrome 148 and later.
// The model runs on the device: the page makes no request, so the Content Security Policy
// (connect-src 'self') needs no change. Docs: https://developer.chrome.com/docs/ai/prompt-api
//
// Parked: not wired into provider selection. Never request a model download.

// Just the parts of the API this file uses. TypeScript's DOM types don't include it yet.
type Availability = "unavailable" | "downloadable" | "downloading" | "available";

interface LanguageModelSession {
  prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
}

interface LanguageModelStatic {
  availability(options?: object): Promise<Availability>;
  create(options?: object): Promise<LanguageModelSession>;
}

const LANGUAGE_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }]
};

function api(): LanguageModelStatic | undefined {
  return (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
}

export function createChromeProvider(): AssistProvider {
  // One session holds the system prompt; each request clones it so requests don't share history
  let base: Promise<LanguageModelSession> | null = null;

  function session(): Promise<LanguageModelSession> {
    base ??= api().create({
      ...LANGUAGE_OPTIONS,
      initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }]
    }).catch(error => {
      base = null;
      throw error;
    });
    return base;
  }

  async function ask(input: string, schema: object, signal?: AbortSignal): Promise<string> {
    const request = await (await session()).clone({ signal });
    try {
      return await request.prompt(input, { responseConstraint: schema, signal });
    } finally {
      request.destroy();
    }
  }

  return {
    id: "on-device-ai",

    async status(): Promise<ProviderStatus> {
      if (!api()) return "unavailable";
      try {
        const availability = await api().availability(LANGUAGE_OPTIONS);
        if (availability === "available") return "ready";
        return "unavailable";
      } catch {
        return "unavailable";
      }
    },

    async breakdown(task, levelId, context, signal) {
      const level = detailLevel(levelId);
      return cleanBreakdown(await ask(breakdownPrompt(task, level, context), breakdownSchema(level), signal));
    },

    async compile(dump, signal) {
      return cleanCompile(await ask(compilePrompt(dump), COMPILE_SCHEMA, signal));
    },

    async estimate(task, signal) {
      const result = cleanEstimate(await ask(estimatePrompt(task), ESTIMATE_SCHEMA, signal));
      if (!result) throw new Error("The model did not return an estimate.");
      return result;
    }
  };
}
