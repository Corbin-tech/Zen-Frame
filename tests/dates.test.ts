import { describe, expect, test } from "vitest";
import { dates } from "../src/lib/dates";

const TODAY = "2026-11-20";

describe("due date helpers", () => {
  test.each([
    [-2, "overdue", "2 days past due"],
    [-1, "overdue", "1 day past due"],
    [0, "today", "Today"],
    [1, "soon", "Tomorrow"],
    [3, "soon", "In 3 days"],
    [4, "later", "In 4 days"],
    [7, "later", dates.formatDate(dates.addDays(TODAY, 7))]
  ] as const)("offset %d day(s) -> tone %s, label %s", (offset, expectedTone, expectedLabel) => {
    const key = dates.addDays(TODAY, offset);
    expect(dates.dueTone(key, TODAY)).toBe(expectedTone);
    expect(dates.dueLabel(key, TODAY)).toBe(expectedLabel);
  });

  test("dueClass maps each tone and falls back to quiet style when completed", () => {
    const pastDue = dates.addDays(TODAY, -1);
    const today = TODAY;
    const soon = dates.addDays(TODAY, 3);
    const later = dates.addDays(TODAY, 4);

    expect(dates.dueClass(pastDue, false, TODAY)).toBe(
      "bg-warmth/35 text-gray-900 dark:bg-warmth/10 dark:text-warmth"
    );
    expect(dates.dueClass(today, false, TODAY)).toBe(
      "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
    );
    expect(dates.dueClass(soon, false, TODAY)).toBe(
      "ring-1 ring-teal-600/30 text-teal-700 dark:ring-teal-400/30 dark:text-teal-300"
    );
    expect(dates.dueClass(later, false, TODAY)).toBe(
      "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300"
    );
    expect(dates.dueClass(pastDue, true, TODAY)).toBe(dates.dueClass(later, false, TODAY));
  });
});
