import { DETAIL_LEVELS } from "./types.ts";
import type { BreakdownResult, CompileResult, DetailLevel, EstimateResult } from "./types.ts";

export const ASSIST_ENDPOINTS = {
  breakdown: "/api/assist/breakdown",
  compile: "/api/assist/compile",
  estimate: "/api/assist/estimate"
} as const;

export const MAX_INPUT_CHARS = 6000;

export interface BreakdownRequest {
  task: string;
  level: DetailLevel;
  context?: string;
}

export interface CompileRequest {
  text: string;
}

export interface EstimateRequest {
  task: string;
}

export interface AssistRequestMap {
  breakdown: BreakdownRequest;
  compile: CompileRequest;
  estimate: EstimateRequest;
}

export interface AssistResponseMap {
  breakdown: BreakdownResult;
  compile: CompileResult;
  estimate: EstimateResult;
}

export const ASSIST_ERROR_STATUS = {
  bad_request: 400,
  too_long: 413,
  unauthorized: 401,
  needs_plus: 403,
  trial_exhausted: 403,
  rate_limited: 429,
  model_error: 502,
  unavailable: 503
} as const;

export type AssistErrorCode = keyof typeof ASSIST_ERROR_STATUS;
export interface AssistErrorResponse {
  error: AssistErrorCode;
}

const inputText = { type: "string", minLength: 1, maxLength: MAX_INPUT_CHARS };

export const BREAKDOWN_REQUEST_SCHEMA = {
  type: "object",
  properties: {
    task: inputText,
    level: { type: "string", enum: DETAIL_LEVELS.map(level => level.id) },
    context: { type: "string", maxLength: MAX_INPUT_CHARS }
  },
  required: ["task", "level"],
  additionalProperties: false
};

export const COMPILE_REQUEST_SCHEMA = {
  type: "object",
  properties: { text: inputText },
  required: ["text"],
  additionalProperties: false
};

export const ESTIMATE_REQUEST_SCHEMA = {
  type: "object",
  properties: { task: inputText },
  required: ["task"],
  additionalProperties: false
};

const minutes = { type: "integer", minimum: 1, maximum: 480 };
const item = {
  type: "object",
  properties: {
    text: { type: "string", minLength: 1, maxLength: 200 },
    minutes: { anyOf: [minutes, { type: "null" }] }
  },
  required: ["text", "minutes"],
  additionalProperties: false
};

export function breakdownSchema(level: { min: number; max: number }) {
  return {
    type: "object",
    properties: { steps: { type: "array", items: item, minItems: level.min, maxItems: level.max } },
    required: ["steps"],
    additionalProperties: false
  };
}

export const COMPILE_SCHEMA = {
  type: "object",
  properties: {
    clusters: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 60 },
          tasks: { type: "array", items: item, minItems: 1, maxItems: 25 }
        },
        required: ["name", "tasks"],
        additionalProperties: false
      }
    }
  },
  required: ["clusters"],
  additionalProperties: false
};

export const ESTIMATE_SCHEMA = {
  type: "object",
  properties: { minutes, low: minutes, high: minutes },
  required: ["minutes", "low", "high"],
  additionalProperties: false
};

export const ASSIST_ERROR_SCHEMA = {
  type: "object",
  properties: { error: { type: "string", enum: Object.keys(ASSIST_ERROR_STATUS) } },
  required: ["error"],
  additionalProperties: false
};
