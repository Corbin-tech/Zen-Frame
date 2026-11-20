import { normalizeLoadedTodo } from "./assist/todoLoad";
import type { Todo } from "../stores/todoStore";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
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
        && Number.isFinite(session.minutes) && session.minutes > 0) : [];
    default:
      return value;
  }
}
