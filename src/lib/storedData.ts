import { normalizeLoadedTodo } from "./assist/todoLoad.ts";
import type { Todo } from "../stores/todoStore";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

// Focus sessions can carry the task they were linked to. These fields render with x-text,
// but a hand-edited or imported backup can hold any type, so keep only strings (ids may be null).
const SESSION_TEXT_MAX = 200;

function cleanSession(session: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = { completedAt: session.completedAt, minutes: session.minutes };
  for (const key of ["taskId", "taskTitle", "clusterId", "clusterName"]) {
    const field = session[key];
    if (typeof field === "string") clean[key] = field.slice(0, SESSION_TEXT_MAX);
    else if (field === null && (key === "taskId" || key === "clusterId")) clean[key] = null;
  }
  return clean;
}

export function normalizeStoredData(key: string, value: unknown): unknown {
  switch (key) {
    case "todos":
      return Array.isArray(value) ? value.filter(isObject).map(item => {
        const todo = normalizeLoadedTodo(item as unknown as Todo);
        if (!isTimestamp(todo.zenDeferredStart)) delete todo.zenDeferredStart;
        return todo;
      }) : [];
    case "planning": {
      const planning = isObject(value) ? value : {};
      return {
        ...planning,
        gap: typeof planning.gap === "number" && Number.isFinite(planning.gap) && planning.gap >= 0
          ? planning.gap : 15
      };
    }
    case "pomoSessions":
      return Array.isArray(value) ? value.filter(session => isObject(session)
        && isTimestamp(session.completedAt) && typeof session.minutes === "number"
        && Number.isFinite(session.minutes) && session.minutes > 0).map(cleanSession) : [];
    default:
      return value;
  }
}
