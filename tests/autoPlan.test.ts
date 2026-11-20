import { describe, expect, it } from "vitest";
import { planTasks, type AvailabilityWindow } from "../src/lib/autoPlan";

const DAY = "2026-11-23"; // A Monday
const hour = (h: number) => h * 60;
const weekdays: AvailabilityWindow = { id: "w", weekdays: [1, 2, 3, 4, 5], start: hour(9), end: hour(12) };

const plan = (busy: { start: number; end: number }[], tasks = [{ id: "a" }]) => planTasks({
  tasks,
  days: [DAY],
  availability: [weekdays],
  busyOn: () => busy,
  earliestOn: () => 0,
  duration: 60,
  gap: 15
});

describe("planTasks", () => {
  it("keeps the break free before an existing block", () => {
    expect(plan([{ start: hour(10), end: hour(11) }])).toEqual([
      { taskId: "a", date: DAY, start: hour(11), end: hour(12) }
    ]);
  });

  it("still fills a slot that is long enough for the task and its break", () => {
    expect(plan([{ start: hour(10) + 15, end: hour(11) }])).toEqual([
      { taskId: "a", date: DAY, start: hour(9), end: hour(10) }
    ]);
  });

  it("lets the last task end at the end of the availability window", () => {
    expect(plan([], [{ id: "a" }, { id: "b" }, { id: "c" }])).toEqual([
      { taskId: "a", date: DAY, start: hour(9), end: hour(10) },
      { taskId: "b", date: DAY, start: hour(10) + 15, end: hour(11) + 15 }
    ]);
  });
});
