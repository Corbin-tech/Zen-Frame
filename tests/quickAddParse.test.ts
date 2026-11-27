import { describe, expect, test } from "vitest";
import { parseQuickAdd } from "../src/lib/quickAddParse";
import { addDays } from "../src/lib/dates";

// Deterministic "today" keys near a week edge. 2026-01-04 is a Sunday, so
// 2026-01-05 is a Monday and 2026-01-10 a Saturday (see src/lib/dates.ts).
const SUNDAY = "2026-01-04";
const MONDAY = "2026-01-05";
const SATURDAY = "2026-01-10";

describe("parseQuickAdd", () => {
  test("reference example: title, due tomorrow, 30 minute estimate, CS101 cluster", () => {
    expect(parseQuickAdd("Read ch 8 tomorrow 30m #CS101", MONDAY)).toEqual({
      title: "Read ch 8",
      dueDate: "2026-01-06",
      estimateMinutes: 30,
      clusterName: "CS101",
      matches: [
        { kind: "due", raw: "tomorrow", value: "2026-01-06" },
        { kind: "estimate", raw: "30m", value: 30 },
        { kind: "cluster", raw: "#CS101", value: "CS101" }
      ]
    });
  });

  test("title-only input is untouched", () => {
    expect(parseQuickAdd("Fix the bug in the parser", MONDAY)).toEqual({ title: "Fix the bug in the parser", matches: [] });
    expect(parseQuickAdd("Read ch 8", MONDAY)).toEqual({ title: "Read ch 8", matches: [] });
  });

  test("empty and whitespace-only input parse to an empty title", () => {
    expect(parseQuickAdd("", MONDAY)).toEqual({ title: "", matches: [] });
    expect(parseQuickAdd("   \t  ", MONDAY)).toEqual({ title: "", matches: [] });
  });

  test("input consisting only of tokens has an empty title", () => {
    expect(parseQuickAdd("tomorrow 30m #home", MONDAY)).toEqual({
      title: "",
      dueDate: "2026-01-06",
      estimateMinutes: 30,
      clusterName: "home",
      matches: [
        { kind: "due", raw: "tomorrow", value: "2026-01-06" },
        { kind: "estimate", raw: "30m", value: 30 },
        { kind: "cluster", raw: "#home", value: "home" }
      ]
    });
  });

  test("extra spaces collapse to single spaces and the title is trimmed", () => {
    expect(parseQuickAdd("  read    the   report   tomorrow ", MONDAY).title).toBe("read the report");
  });

  describe("date words", () => {
    test("today resolves to the today key itself", () => {
      expect(parseQuickAdd("Water plants today", SATURDAY)).toEqual({
        title: "Water plants",
        dueDate: SATURDAY,
        matches: [{ kind: "due", raw: "today", value: SATURDAY }]
      });
    });

    test("tomorrow resolves to todayKey + 1, whatever the case", () => {
      expect(parseQuickAdd("Ship it TOMORROW", MONDAY).dueDate).toBe("2026-01-06");
      expect(parseQuickAdd("Tomorrow: standup", SUNDAY).dueDate).toBe("2026-01-05");
    });

    test("a bare weekday is the next occurrence strictly after today, so the same weekday is a week out", () => {
      expect(parseQuickAdd("Team sync monday", MONDAY).dueDate).toBe("2026-01-12");
      expect(parseQuickAdd("Team sync sunday", SUNDAY).dueDate).toBe("2026-01-11");
    });

    test("weekdays wrap forward across the week edge (mid-week today, earlier weekday)", () => {
      expect(parseQuickAdd("Dinner friday", MONDAY).dueDate).toBe("2026-01-09");
      expect(parseQuickAdd("Dinner sunday", MONDAY).dueDate).toBe("2026-01-11");
      expect(parseQuickAdd("Call sat", SATURDAY).dueDate).toBe("2026-01-17");
    });

    test("weekdays from the end of one week land on the start of the next", () => {
      expect(parseQuickAdd("Groceries sunday", SATURDAY).dueDate).toBe("2026-01-11");
      expect(parseQuickAdd("laundry mon", SATURDAY).dueDate).toBe("2026-01-12");
    });

    test("a weekday may sit in the middle of a sentence", () => {
      expect(parseQuickAdd("checkout in 3 days", MONDAY)).toEqual({
        title: "checkout",
        dueDate: "2026-01-08",
        matches: [{ kind: "due", raw: "in 3 days", value: "2026-01-08" }]
      });
    });

    test("abbreviations and full names resolve identically", () => {
      expect(parseQuickAdd("tuesday pick-up", MONDAY).dueDate).toBe(parseQuickAdd("tues pick-up", MONDAY).dueDate);
      expect(parseQuickAdd("thursday demo", MONDAY).dueDate).toBe(parseQuickAdd("thu demo", MONDAY).dueDate);
      expect(parseQuickAdd("Thursday DEMO", MONDAY).dueDate).toBe("2026-01-08");
    });

    test('"next <weekday>" pushes one full week past the bare weekday, in either direction', () => {
      expect(parseQuickAdd("next mon", MONDAY).dueDate).toBe("2026-01-19"); // bare would be +7, next adds another 7
      expect(parseQuickAdd("Next Friday", MONDAY).dueDate).toBe("2026-01-16"); // bare friday is +4
      expect(parseQuickAdd("next sunday", SUNDAY).dueDate).toBe("2026-01-18"); // bare sunday is +7
      expect(parseQuickAdd("next friday", SATURDAY).dueDate).toBe("2026-01-23"); // bare friday is +6
    });

    test('"in N days" counts N days forward', () => {
      expect(parseQuickAdd("in 3 days", MONDAY).dueDate).toBe("2026-01-08");
      expect(parseQuickAdd("In 1 day", MONDAY).dueDate).toBe("2026-01-06");
      expect(parseQuickAdd("essay due in 10 days", SUNDAY).dueDate).toBe("2026-01-14");
    });

    test("with several date words the last one wins, and all appear in matches", () => {
      const result = parseQuickAdd("ship today or tomorrow", MONDAY);
      expect(result.dueDate).toBe("2026-01-06");
      expect(result.title).toBe("ship or");
      expect(result.matches).toEqual([
        { kind: "due", raw: "today", value: MONDAY },
        { kind: "due", raw: "tomorrow", value: "2026-01-06" }
      ]);
    });
  });

  describe("estimates", () => {
    test.each([
      ["30m", 30], ["30 min", 30], ["30 minutes", 30], ["10 mins", 10],
      ["1h", 60], ["2 h", 120], ["2hr", 120], ["2 hours", 120], ["1 hour", 60], ["90m", 90]
    ])("%s parses to %i minutes", (token, minutes) => {
      expect(parseQuickAdd(`Deep work ${token}`, MONDAY).estimateMinutes).toBe(minutes);
    });

    test.each([["1h30m", 90], ["1h30", 90], ["1h 30 m", 90], ["1h 30m", 90], ["2h30min", 150], ["2 hr 30 min", 150]])(
      "compound %s sums its parts",
      (token, minutes) => {
        expect(parseQuickAdd(`Deep work ${token}`, MONDAY).estimateMinutes).toBe(minutes);
      }
    );

    test("the raw estimate text is preserved, including spacing and casing", () => {
      expect(parseQuickAdd("Deep work 2 h", MONDAY).matches).toEqual([{ kind: "estimate", raw: "2 h", value: 120 }]);
      expect(parseQuickAdd("Deep work 1H30M", MONDAY).matches).toEqual([{ kind: "estimate", raw: "1H30M", value: 90 }]);
    });

    test("separate estimate tokens sum", () => {
      expect(parseQuickAdd("Write essay 1h 30m 20m", MONDAY).estimateMinutes).toBe(110);
    });

    test("values above 24h are clamped to 24h, in one token or across the sum", () => {
      expect(parseQuickAdd("Sprint 25h", MONDAY).estimateMinutes).toBe(1440);
      expect(parseQuickAdd("Sprint 48h", MONDAY).matches).toEqual([{ kind: "estimate", raw: "48h", value: 1440 }]);
      expect(parseQuickAdd("Sprint 12h 12h", MONDAY).estimateMinutes).toBe(1440);
      expect(parseQuickAdd("Sprint 24h", MONDAY).estimateMinutes).toBe(1440); // exactly 24h is not clamped down
    });

    test("numbers of zero are not estimates and stay in the title", () => {
      expect(parseQuickAdd("0m wait", MONDAY)).toEqual({ title: "0m wait", matches: [] });
      expect(parseQuickAdd("0h lag", MONDAY).estimateMinutes).toBeUndefined();
      expect(parseQuickAdd("see 0h30 detail", MONDAY).estimateMinutes).toBe(30);
    });

    test("plain numbers and numbers inside words are left alone", () => {
      expect(parseQuickAdd("Call 911", MONDAY)).toEqual({ title: "Call 911", matches: [] });
      expect(parseQuickAdd("Buy 2 things", MONDAY)).toEqual({ title: "Buy 2 things", matches: [] });
      expect(parseQuickAdd("Drive 5 miles", MONDAY)).toEqual({ title: "Drive 5 miles", matches: [] });
      expect(parseQuickAdd("Fix 2ha bug", MONDAY)).toEqual({ title: "Fix 2ha bug", matches: [] });
    });
  });

  describe("clusters", () => {
    test("#Name is stripped from the title and reported with its case preserved", () => {
      expect(parseQuickAdd("lab work #Physics", MONDAY)).toEqual({
        title: "lab work",
        clusterName: "Physics",
        matches: [{ kind: "cluster", raw: "#Physics", value: "Physics" }]
      });
    });

    test("names may contain letters, digits, hyphens and underscores", () => {
      expect(parseQuickAdd("study #CS-101_basics", MONDAY).clusterName).toBe("CS-101_basics");
      expect(parseQuickAdd("study #2x", MONDAY).clusterName).toBe("2x");
    });

    test('a quoted name may contain spaces', () => {
      expect(parseQuickAdd('plan #"Deep work" session', MONDAY)).toEqual({
        title: "plan session",
        clusterName: "Deep work",
        matches: [{ kind: "cluster", raw: '#"Deep work"', value: "Deep work" }]
      });
    });

    test("the first tag wins; later tags are stripped too and appear unused in matches", () => {
      const result = parseQuickAdd("lab #physics #chem 45m", MONDAY);
      expect(result.title).toBe("lab");
      expect(result.clusterName).toBe("physics");
      expect(result.matches).toEqual([
        { kind: "cluster", raw: "#physics", value: "physics" },
        { kind: "cluster", raw: "#chem", value: "chem" },
        { kind: "estimate", raw: "45m", value: 45 }
      ]);
    });

    test("# immediately before an estimate is a cluster token, not an estimate", () => {
      expect(parseQuickAdd("Study #30m", MONDAY)).toEqual({
        title: "Study",
        clusterName: "30m",
        matches: [{ kind: "cluster", raw: "#30m", value: "30m" }]
      });
    });

    test("a cluster token can sit next to punctuation", () => {
      expect(parseQuickAdd("email #CS101, and #staff 1h", MONDAY).matches).toEqual([
        { kind: "cluster", raw: "#CS101", value: "CS101" },
        { kind: "cluster", raw: "#staff", value: "staff" },
        { kind: "estimate", raw: "1h", value: 60 }
      ]);
      expect(parseQuickAdd("email #CS101, and #staff 1h", MONDAY).title).toBe("email , and");
    });

    test("a lone # stays in the title as literal text", () => {
      expect(parseQuickAdd("Fix the # in the docs", MONDAY).title).toBe("Fix the # in the docs");
      expect(parseQuickAdd("todo #", MONDAY).title).toBe("todo #");
      expect(parseQuickAdd('unclosed #"Deep work note', MONDAY).title).toBe('unclosed #"Deep work note');
    });
  });

  describe("false positives", () => {
    test("weekday abbreviations inside words are never dates", () => {
      expect(parseQuickAdd("Buy sunscreen tomorrow", MONDAY).title).toBe("Buy sunscreen");
      expect(parseQuickAdd("Plan wedding venue monday", MONDAY).matches).toEqual([
        { kind: "due", raw: "monday", value: "2026-01-12" }
      ]);
      expect(parseQuickAdd("tournament of #CS101 fans", SUNDAY)).toEqual({
        title: "tournament of fans",
        clusterName: "CS101",
        matches: [{ kind: "cluster", raw: "#CS101", value: "CS101" }]
      });
    });

    test("tokens that begin mid-word are ignored", () => {
      expect(parseQuickAdd("pin 3 days", MONDAY)).toEqual({ title: "pin 3 days", matches: [] });
      expect(parseQuickAdd("star tomorrowish plan", SUNDAY).title).toBe("star tomorrowish plan");
    });
  });
});

describe("security: pathological amounts never overflow the date", () => {
  test('"in N days" clamps huge N to a valid local date key instead of "NaN-NaN-NaN"', () => {
    for (const raw of ["task in 5 days", "task in 999999999999 days", "task in 99999999999999999999999999 days"]) {
      const parsed = parseQuickAdd(raw, MONDAY);
      expect(parsed.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(parsed.dueDate!))).toBe(false);
    }
    expect(parseQuickAdd("task in 5 days", MONDAY).dueDate).toBe("2026-01-10");
    expect(parseQuickAdd("task in 999999999999 days", MONDAY).dueDate).toBe(addDays(MONDAY, 3660));
  });

  test("a huge hour estimate clamps to 24h and leaves the rest in the title", () => {
    const parsed = parseQuickAdd("big 99999999999999999999h task", MONDAY);
    expect(parsed.estimateMinutes).toBe(24 * 60);
    expect(parsed.title).toBe("big task");
  });
});
