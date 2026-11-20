import { expect, test } from "vitest";
import { chipEstimateLabel, totalEstimate, totalLabel } from "../src/lib/estimates";

test("chipEstimateLabel keeps only the estimate, with no not-estimated tail", () => {
  const tasks = [
    { estimateMinutes: 75 },
    { estimateMinutes: null },
    { estimateMinutes: 30 },
  ];
  expect(chipEstimateLabel(tasks)).toBe("~1 hr 45 min");
});

test("chipEstimateLabel handles single-unit durations and is empty without estimates", () => {
  expect(chipEstimateLabel([{ estimateMinutes: 45 }])).toBe("~45 min");
  expect(chipEstimateLabel([{ estimateMinutes: 120 }])).toBe("~2 hr");
  expect(chipEstimateLabel([{ estimateMinutes: null }, {}])).toBe("");
  expect(chipEstimateLabel([])).toBe("");
});

test("chipEstimateLabel skips completed tasks, like totalLabel's totals", () => {
  const tasks = [
    { estimateMinutes: 60, completed: true },
    { estimateMinutes: 15 },
  ];
  expect(chipEstimateLabel(tasks)).toBe("~15 min");
});

test("totalLabel keeps its long form, including the not-estimated tail", () => {
  expect(totalLabel([{ estimateMinutes: 135 }])).toBe("About 2 hr 15 min");
  expect(totalLabel([{ estimateMinutes: 135 }, {}])).toBe("About 2 hr 15 min · 1 not estimated");
});

test("totalEstimate still reports minutes and unestimated counts separately", () => {
  expect(totalEstimate([{ estimateMinutes: 30 }, { estimateMinutes: null }])).toEqual({
    minutes: 30,
    unestimated: 1,
  });
});
