// @ts-expect-error Node provides assert at runtime; the browser app has no Node typings.
import assert from "node:assert/strict";
import {
  cleanText, cleanMinutes, cleanBreakdown, cleanCompile, cleanEstimate,
  cleanBreakdownRequest, cleanCompileRequest, cleanEstimateRequest
} from "./sanitize.ts";
import { MAX_INPUT_CHARS } from "./api.ts";

assert.equal(cleanText("\u0000 1. Wash\n dishes\u007f"), "Wash dishes");
for (const marker of ["- ", "* ", "• ", "2) "]) {
  assert.equal(cleanText(marker + "Open file"), "Open file");
}
assert.equal(cleanText("x".repeat(201)).length, 200);
assert.equal(cleanMinutes(999), 480);
assert.equal(cleanMinutes(0.1), 1);
for (const value of [0, -1, NaN, Infinity, null, "no"]) {
  assert.equal(cleanMinutes(value), null);
}
assert.equal(cleanMinutes("25"), 25);
assert.deepEqual(cleanBreakdown("bad JSON"), { steps: [] });
assert.deepEqual(cleanCompile("bad JSON"), { clusters: [] });
assert.equal(cleanEstimate("bad JSON"), null);
assert.deepEqual(cleanBreakdown(null), { steps: [] });
assert.deepEqual(cleanCompile({}), { clusters: [] });
assert.equal(cleanEstimate({}), null);
assert.deepEqual(cleanBreakdown('{"steps":[{"text":"- Open file","minutes":999}]}'),
  { steps: [{ text: "Open file", minutes: 480 }] });
assert.equal(cleanBreakdown({ steps: Array(20).fill("Step") }).steps.length, 12);
const compiled = cleanCompile({
  clusters: Array(15).fill({ name: "x".repeat(80), tasks: Array(30).fill("x".repeat(250)) })
});
assert.equal(compiled.clusters.length, 12);
assert.equal(compiled.clusters[0].name.length, 60);
assert.equal(compiled.clusters[0].tasks.length, 25);
assert.equal(compiled.clusters[0].tasks[0].text.length, 200);
assert.deepEqual(cleanEstimate({ minutes: 25, low: 50, high: 10 }), { minutes: 25, low: 25, high: 25 });
assert.deepEqual(cleanEstimate({ minutes: 25, low: 10, high: 50 }), { minutes: 25, low: 10, high: 50 });

assert.deepEqual(cleanBreakdownRequest({ task: " Wash\n dishes ", level: "few", context: " Home " }),
  { task: "Wash dishes", level: "few", context: "Home" });
assert.deepEqual(cleanCompileRequest({ text: " Buy milk " }), { text: "Buy milk" });
assert.deepEqual(cleanEstimateRequest({ task: "Read" }), { task: "Read" });
for (const level of ["few", "some", "five", "many"]) {
  assert.ok(cleanBreakdownRequest({ task: "Read", level }));
}
assert.equal(cleanBreakdownRequest({ task: "Read", level: "invalid" }), null);
assert.equal(cleanBreakdownRequest({ task: "Read", level: "few", context: 5 }), null);
assert.equal(cleanBreakdownRequest({ task: "Read", level: "few", context: "x".repeat(6001) }), null);
for (const text of ["", " \n ", "x".repeat(MAX_INPUT_CHARS + 1), 42, null]) {
  assert.equal(cleanBreakdownRequest({ task: text, level: "few" }), null);
  assert.equal(cleanCompileRequest({ text }), null);
  assert.equal(cleanEstimateRequest({ task: text }), null);
}
for (const raw of [null, [], "bad JSON", {}, { task: "Read", extra: true }]) {
  assert.equal(cleanEstimateRequest(raw), null);
}
assert.ok(cleanCompileRequest({ text: "x".repeat(MAX_INPUT_CHARS) }));
assert.equal(cleanBreakdownRequest({ task: "Read" }), null);

const markup = "<script>alert('text')</script>";
const output = cleanBreakdown({ steps: [{ text: markup, minutes: 5 }, { text: { html: markup } }] });
assert.deepEqual(output, { steps: [{ text: markup, minutes: 5 }] });
assert.equal(typeof output.steps[0].text, "string");
assert.deepEqual(cleanCompile({ clusters: [{ name: markup, tasks: [markup] }] }),
  { clusters: [{ name: markup, tasks: [{ text: markup, minutes: null }] }] });
assert.equal(cleanText({ toString: () => markup }), "");

assert.equal(cleanMinutes({ toString: null }), null);
assert.deepEqual(cleanBreakdown({ steps: [{ text: "Open the laptop", minutes: { toString: null } }] }),
  { steps: [{ text: "Open the laptop", minutes: null }] });

console.log("sanitize checks passed");
