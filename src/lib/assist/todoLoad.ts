import type { Todo } from "../../stores/todoStore";
import { cleanMinutes } from "./sanitize.ts";

export function normalizeLoadedTodo(item: Todo): Todo {
  return {
    ...item,
    // Templates call string methods on the title, so a task without one gets an empty title
    todo: typeof item.todo === "string" ? item.todo : "",
    parentId: item.parentId ?? null,
    // A restored backup may carry anything here, so keep only well-formed values
    estimateMinutes: cleanMinutes(item.estimateMinutes),
    steps: Array.isArray(item.steps)
      ? item.steps.filter(step => step && typeof step.text === "string").map(step => ({
          id: typeof step.id === "string" ? step.id : crypto.randomUUID(),
          text: step.text.slice(0, 200),
          done: step.done === true,
          minutes: cleanMinutes(step.minutes)
        }))
      : undefined
  };
}
