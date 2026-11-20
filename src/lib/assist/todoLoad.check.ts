// @ts-expect-error Node provides assert at runtime; the browser app has no Node typings.
import assert from "node:assert/strict";
import type { Todo } from "../../stores/todoStore";
import { cleanStepTotal } from "./sanitize.ts";
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

const steps = [
  { id: "first", text: "First step", done: false, minutes: 300 },
  { id: "second", text: "Second step", done: false, minutes: 200 }
];
const estimateMinutes = cleanStepTotal(steps);
assert.equal(estimateMinutes, 480);
const loaded = normalizeLoadedTodo({ estimateMinutes, steps } as Todo);
assert.equal(loaded.estimateMinutes, estimateMinutes);
assert.deepEqual(loaded.steps, steps);

console.log("todo load checks passed");
