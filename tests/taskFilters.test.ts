import { describe, expect, test } from "vitest";
import {
  TASK_MANAGER_SORT_OPTIONS,
  chipLabelFor,
  clusterChipLabel,
  compareOverdueFirst,
  estimateChipLabel,
  resolveClusterByName,
  sortTasksForDisplay,
  taskMatchesQuery,
  withoutMatch
} from "../src/lib/taskFilters";
import { parseQuickAdd } from "../src/lib/quickAddParse";
import type { Todo } from "../src/stores/todoStore";

// A task with just the fields the helpers read, on top of Todo's required base.
function task(fields: Partial<Todo>): Todo {
  return {
    id: String(Math.random()),
    todo: "",
    completed: false,
    isCluster: false,
    isPinned: false,
    parentId: null,
    createdAt: "",
    ...fields
  };
}

describe("taskFilters", () => {
  describe("taskMatchesQuery (Board's card filter, verbatim)", () => {
    test("an empty or blank query matches everything", () => {
      const buy = task({ todo: "Buy milk" });
      expect(taskMatchesQuery(buy, "")).toBe(true);
      expect(taskMatchesQuery(buy, "   ")).toBe(true);
    });

    test("the match is case-insensitive in both directions", () => {
      const buy = task({ todo: "Buy MiLk" });
      expect(taskMatchesQuery(buy, "buy")).toBe(true);
      expect(taskMatchesQuery(buy, "MILK")).toBe(true);
      expect(taskMatchesQuery(buy, "buy milk")).toBe(true);
    });

    test("the query matches anywhere in the task text", () => {
      expect(taskMatchesQuery(task({ todo: "Read chapter 8" }), "chapter")).toBe(true);
    });

    test("a query the text does not contain does not match", () => {
      expect(taskMatchesQuery(task({ todo: "Buy milk" }), "bread")).toBe(false);
      expect(taskMatchesQuery(task({ todo: "Buy milk" }), "milk shake")).toBe(false);
    });
  });

  describe("sorting (Board's 'Carried over first' semantics)", () => {
    const open = [
      task({ id: "a", todo: "Undated", dueDate: null }),
      task({ id: "b", todo: "Later", dueDate: "2026-03-01" }),
      task({ id: "c", todo: "Overdue", dueDate: "2026-01-02" }),
      task({ id: "d", todo: "Also undated" })
    ];

    test("the sort options carry the Board's exact labels", () => {
      expect(TASK_MANAGER_SORT_OPTIONS).toEqual([
        { id: "manual", label: "My order" },
        { id: "due", label: "Carried over first" }
      ]);
    });

    test("'My order' keeps the store's list order", () => {
      expect(sortTasksForDisplay(open, "manual").map(item => item.id)).toEqual(["a", "b", "c", "d"]);
    });

    test("'Carried over first' is most overdue first, undated last", () => {
      expect(sortTasksForDisplay(open, "due").map(item => item.id)).toEqual(["c", "b", "a", "d"]);
    });

    test("'Carried over first' never mutates the input list", () => {
      const before = open.map(item => item.id);
      sortTasksForDisplay(open, "due");
      expect(open.map(item => item.id)).toEqual(before);
    });

    test("the comparator treats missing and empty due dates alike: last", () => {
      const undated = task({ dueDate: undefined });
      const empty = task({ dueDate: "" });
      const dated = task({ dueDate: "2026-05-01" });
      expect(compareOverdueFirst(dated, undated)).toBeLessThan(0);
      expect(compareOverdueFirst(dated, empty)).toBeLessThan(0);
      expect(compareOverdueFirst(undated, empty)).toBe(0);
    });
  });

  describe("chip labels (quick-add preview chips)", () => {
    const TODAY = "2026-01-05";

    test("a due chip reads like the due labels: 'Today', 'Tomorrow', 'In 3 days'", () => {
      expect(chipLabelFor({ kind: "due", raw: "today", value: TODAY }, TODAY)).toBe("Today");
      expect(chipLabelFor({ kind: "due", raw: "Tomorrow", value: "2026-01-06" }, TODAY)).toBe("Tomorrow");
      expect(chipLabelFor({ kind: "due", raw: "in 3 days", value: "2026-01-08" }, TODAY)).toBe("In 3 days");
    });

    test("an estimate chip reads in the estimator's hr/min idiom", () => {
      expect(estimateChipLabel(30)).toBe("30 min");
      expect(estimateChipLabel(60)).toBe("1 hr");
      expect(estimateChipLabel(90)).toBe("1 hr 30 min");
      expect(estimateChipLabel(1440)).toBe("24 hr");
      expect(chipLabelFor({ kind: "estimate", raw: "1h30", value: 90 }, TODAY)).toBe("1 hr 30 min");
    });

    test("a cluster chip keeps the tag form: '#CS101'", () => {
      expect(clusterChipLabel("CS101")).toBe("#CS101");
      expect(chipLabelFor({ kind: "cluster", raw: '#"Deep work"', value: "Deep work" }, TODAY)).toBe("#Deep work");
    });
  });

  describe("resolveClusterByName", () => {
    const clusters = [
      { id: "1", todo: "CS101" },
      { id: "2", todo: " Deep work " },
      { id: "3", todo: "home" }
    ];

    test("matches a cluster by name, case-insensitively", () => {
      expect(resolveClusterByName(clusters, "cs101")?.id).toBe("1");
      expect(resolveClusterByName(clusters, "CS101")?.id).toBe("1");
      expect(resolveClusterByName(clusters, "HOME")?.id).toBe("3");
    });

    test("trims both sides, like the store trims names on save", () => {
      expect(resolveClusterByName(clusters, "deep work")?.id).toBe("2");
    });

    test("an unknown or empty name resolves to nothing", () => {
      expect(resolveClusterByName(clusters, "physics")).toBeUndefined();
      expect(resolveClusterByName(clusters, "")).toBeUndefined();
      expect(resolveClusterByName([], "CS101")).toBeUndefined();
    });
  });

  describe("withoutMatch (deleting a chip re-serializes the line)", () => {
    const TODAY = "2026-01-05";

    test("removes one token and keeps the rest: title first, then tokens in order", () => {
      const parsed = parseQuickAdd("Read ch 8 tomorrow 30m #CS101", TODAY);
      expect(withoutMatch(parsed, { kind: "estimate", raw: "30m", value: 30 }))
        .toBe("Read ch 8 tomorrow #CS101");
    });

    test("the title comes first, whatever order the tokens sat in", () => {
      const parsed = parseQuickAdd("tomorrow read the report", TODAY);
      expect(withoutMatch(parsed, { kind: "due", raw: "tomorrow", value: "2026-01-06" }))
        .toBe("read the report");
    });

    test("a line of tokens only becomes the line without that token", () => {
      const parsed = parseQuickAdd("tomorrow 30m #home", TODAY);
      expect(withoutMatch(parsed, { kind: "due", raw: "tomorrow", value: "2026-01-06" })).toBe("30m #home");
    });

    test("one deletion removes exactly one repeated token", () => {
      const parsed = parseQuickAdd("warmup 1h 1h", TODAY);
      expect(withoutMatch(parsed, { kind: "estimate", raw: "1h", value: 60 })).toBe("warmup 1h");
    });

    test("a match that is not in the parse leaves the title", () => {
      const parsed = parseQuickAdd("Read ch 8", TODAY);
      expect(withoutMatch(parsed, { kind: "due", raw: "tomorrow", value: "2026-01-06" })).toBe("Read ch 8");
    });

    test("the re-serialized line parses back to the surviving values", () => {
      const line = withoutMatch(parseQuickAdd("Read ch 8 tomorrow 30m #CS101", TODAY), { kind: "due", raw: "tomorrow", value: "2026-01-06" });
      const reparsed = parseQuickAdd(line, TODAY);
      expect(reparsed).toMatchObject({ title: "Read ch 8", estimateMinutes: 30, clusterName: "CS101" });
      expect(reparsed.dueDate).toBeUndefined();
    });
  });
});
