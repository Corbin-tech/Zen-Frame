// @ts-expect-error Node provides assert at runtime; the browser app has no Node typings.
import assert from "node:assert/strict";
import type { Todo } from "../../stores/todoStore";
import { normalizeLoadedTodo } from "./todoLoad.ts";

const cases = [
  [999999999, 480],
  [-1, null],
  [NaN, null],
  ["999999999", 480],
  ["25", 25],
  ["invalid", null]
] as const;

for (const [minutes, expected] of cases) {
  const task = {
    estimateMinutes: minutes,
    steps: [{ id: "step", text: "Open the file", done: false, minutes }]
  } as unknown as Todo;
  const loaded = normalizeLoadedTodo(task);
  assert.equal(loaded.estimateMinutes, expected);
  assert.equal(loaded.steps?.[0].minutes, expected);
}

console.log("todo load checks passed");
