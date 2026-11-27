// Quick add: natural-language parsing for the quick-add input.
//
// Pure and deterministic: every result is derived from the raw string and the
// "todayKey" argument (a local "YYYY-MM-DD" day key) — no clock reads, no
// randomness, no globals, so the same input always parses the same way and the
// module is safe to import from both app code and tests. All date math goes
// through src/lib/dates.ts, so due values are local day keys in exactly the
// representation Todo.dueDate expects.
import { addDays, fromDateKey } from "./dates";

/** The kinds of token `parseQuickAdd` can extract from a quick-add line. */
export type QuickAddMatchKind = "due" | "estimate" | "cluster";

/** One extracted token, for the chips-under-the-input preview UI.
 *
 * `raw` is the exact substring the parser consumed from the input (casing,
 * spacing and units preserved) so the UI can highlight it in the input text.
 */
export interface QuickAddMatch {
  /** What kind of value this token produced. */
  kind: QuickAddMatchKind;
  /** The exact substring that was consumed from the raw input. */
  raw: string;
  /** The parsed value: a local "YYYY-MM-DD" date key (due), minutes (estimate,
   * already clamped to at most 24h), or the cluster's name (cluster). */
  value: string | number;
}

/** Result of parsing one quick-add line. */
export interface ParsedQuickAdd {
  /** The input with every matched token removed, order preserved, whitespace
   * collapsed to single spaces and trimmed. May be '' when the input was empty
   * or contained only tokens. */
  title: string;
  /** Local "YYYY-MM-DD" due-date key. Set when a date word was found; with
   * several date words the LAST one wins (a later word reads as a
   * correction). All of them appear in `matches`. */
  dueDate?: string;
  /** Estimate in minutes. Compounds ("1h30m") and separate tokens ("1h 30m")
   * sum, capped at 24 hours (1440 minutes). */
  estimateMinutes?: number;
  /** Name of the FIRST #tag in the input, case preserved. Later tags are
   * stripped from the title too and appear in `matches`, but are otherwise
   * unused. */
  clusterName?: string;
  /** Every extracted token, in the order it appears in the input. */
  matches: QuickAddMatch[];
}

// A single estimate can never exceed one day: parse "30h" as 24h rather than
// letting a stray token schedule a week-long block.
const MAX_ESTIMATE_MINUTES = 24 * 60;

// "in N days" is clamped to about ten years: beyond that Date overflows to Invalid Date
// and the due key would come out as "NaN-NaN-NaN".
const MAX_DAYS_AHEAD = 3660;

// Every accepted weekday spelling, lowercase, mapped to the day offset the
// Date constructor uses (0 = Sunday). Alternations below must try longer
// names ("monday") before their prefixes ("mon") so "\b"-style lookaheads
// separate them.
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};

const WEEKDAY_ALTERNATION = Object.keys(WEEKDAY_INDEX)
  .sort((a, b) => b.length - a.length)
  .join("|");

// These boundaries are unicode-aware instead of \b (which is ASCII-only), so
// "wed" inside "weddìng"-style words cannot match across a non-ASCII letter.
const END_OF_WORD = "(?![\\p{L}\\p{N}_])";
const WORD_CHAR = /[\p{L}\p{N}_]/u;

const MINUTE_UNIT = "(?:minutes?|mins?|m)";
const HOUR_UNIT = "(?:hours?|hrs?|h)";

// #Name, where Name is letters/digits/hyphen/underscore, or a short "quoted
// name" that may contain spaces. A lone '#' (or #"unclosed) matches nothing
// and stays in the title as literal text.
const RE_CLUSTER = /^#(?:"([^"]*)"|([\p{L}\p{N}_-]+))/u;

const RE_KEYWORD = new RegExp(`^(today|tomorrow)${END_OF_WORD}`, "iu");
const RE_WEEKDAY = new RegExp(`^(${WEEKDAY_ALTERNATION})${END_OF_WORD}`, "iu");
const RE_NEXT_WEEKDAY = new RegExp(`^next[ \\t]+(${WEEKDAY_ALTERNATION})${END_OF_WORD}`, "iu");
const RE_IN_DAYS = new RegExp(`^in[ \\t]+(\\d+)[ \\t]+days?${END_OF_WORD}`, "iu");

// An hour amount with an optional minute compound: "2h", "2 h", "2hr",
// "2 hours"; minutes attach directly to the hours ("1h30", "1h30m") or, when
// separated by spaces, must carry their own unit ("2 h 30 min"). A bare "1h 30"
// is NOT a compound — the trailing 30 stays in the title.
// After an hour unit, a digit may follow ("1h30" attaches minutes) — only
// letters (and _; a unit would have to be a word) end the token.
const NOT_LETTER = "(?![\\p{L}_])";

const RE_HOUR_ESTIMATE = new RegExp(
  `^(\\d+)[ \\t]*${HOUR_UNIT}${NOT_LETTER}(?:(\\d+)(?:[ \\t]*${MINUTE_UNIT})?${END_OF_WORD}|[ \\t]+(\\d+)[ \\t]*${MINUTE_UNIT}${END_OF_WORD})?`,
  "iu"
);

// A standalone minute amount: "30m", "30 min", "30 minutes".
const RE_MINUTE_ESTIMATE = new RegExp(`^(\\d+)[ \\t]*${MINUTE_UNIT}${END_OF_WORD}`, "iu");

function localDayNumber(todayKey: string): number {
  return fromDateKey(todayKey).getDay();
}

// Days from todayKey to the next occurrence of `target` (0–6, Sunday = 0),
// strictly after today: a weekday equal to today rolls a full week forward.
function daysUntil(target: number, todayKey: string): number {
  const days = (target - localDayNumber(todayKey) + 7) % 7;
  return days === 0 ? 7 : days;
}

// The next due-date word at the start of `rest`, or null. "next <weekday>"
// resolves one week past the bare weekday's next occurrence.
function matchDue(rest: string, todayKey: string): { raw: string; key: string } | null {
  const keyword = rest.match(RE_KEYWORD);
  if (keyword) {
    const offset = keyword[1].toLowerCase() === "tomorrow" ? 1 : 0;
    return { raw: keyword[0], key: addDays(todayKey, offset) };
  }
  const next = rest.match(RE_NEXT_WEEKDAY);
  if (next) {
    const target = WEEKDAY_INDEX[next[1].toLowerCase()];
    return { raw: next[0], key: addDays(todayKey, daysUntil(target, todayKey) + 7) };
  }
  const weekday = rest.match(RE_WEEKDAY);
  if (weekday) {
    const target = WEEKDAY_INDEX[weekday[1].toLowerCase()];
    return { raw: weekday[0], key: addDays(todayKey, daysUntil(target, todayKey)) };
  }
  const inDays = rest.match(RE_IN_DAYS);
  if (inDays) {
    const days = Math.min(parseInt(inDays[1], 10) || 0, MAX_DAYS_AHEAD);
    return { raw: inDays[0], key: addDays(todayKey, days) };
  }
  return null;
}

// The next estimate at the start of `rest`, or null. Amounts of zero (such as
// "0m" or "0h") are not estimates and stay in the title. Values above 24h are
// clamped to 24h.
function matchEstimate(rest: string): { raw: string; minutes: number } | null {
  const hour = rest.match(RE_HOUR_ESTIMATE);
  if (hour) {
    const hours = parseInt(hour[1], 10);
    const attached = hour[2] !== undefined ? parseInt(hour[2], 10) : 0;
    const spaced = hour[3] !== undefined ? parseInt(hour[3], 10) : 0;
    const total = hours * 60 + attached + spaced;
    if (total <= 0) return null;
    return { raw: hour[0], minutes: Math.min(total, MAX_ESTIMATE_MINUTES) };
  }
  const minute = rest.match(RE_MINUTE_ESTIMATE);
  if (minute) {
    const minutes = parseInt(minute[1], 10);
    if (minutes <= 0) return null;
    return { raw: minute[0], minutes: Math.min(minutes, MAX_ESTIMATE_MINUTES) };
  }
  return null;
}

/**
 * Parse a quick-add line into a task title plus the due date, estimate, and
 * cluster it mentions. Pure and deterministic: dates resolve relative to
 * `todayKey`, a local "YYYY-MM-DD" day key, and nothing else.
 *
 * Tokens: "today" / "tomorrow" / weekday names and abbreviations ("mon",
 * "thurs"…) / "next <weekday>" / "in N days" for due dates; "30m", "30 min",
 * "1h", "2 h", "2hr", "1h30m", "1h30", "90m" for estimates; "#Name" or
 * `#"Quoted name"` for clusters. Everything not consumed stays in the title.
 */
export function parseQuickAdd(raw: string, todayKey: string): ParsedQuickAdd {
  const matches: QuickAddMatch[] = [];
  let kept = "";
  let dueDate: string | undefined;
  let estimateMinutes: number | undefined;
  let clusterName: string | undefined;
  let seenCluster = false;
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];
    // A '#' always opens a cluster token, even stuck to a word ("tidy#inbox").
    // "#30m" is a cluster named "30m", not an estimate.
    if (ch === "#") {
      const cluster = raw.slice(i).match(RE_CLUSTER);
      if (cluster) {
        const name = cluster[1] !== undefined ? cluster[1] : cluster[2] as string;
        matches.push({ kind: "cluster", raw: cluster[0], value: name });
        if (!seenCluster) {
          clusterName = name;
          seenCluster = true;
        }
        i += cluster[0].length;
        continue;
      }
      kept += ch; // a lone '#' is literal text
      i += 1;
      continue;
    }

    // Tokens only start at a word boundary, so "sunscreen", "wedding",
    // "tournament" and "pin 3 days" are never split mid-word.
    if (i === 0 || !WORD_CHAR.test(raw[i - 1])) {
      const rest = raw.slice(i);
      const due = matchDue(rest, todayKey);
      if (due) {
        dueDate = due.key; // several date words: the last one wins
        matches.push({ kind: "due", raw: due.raw, value: due.key });
        i += due.raw.length;
        continue;
      }
      const estimate = matchEstimate(rest);
      if (estimate) {
        estimateMinutes = Math.min((estimateMinutes ?? 0) + estimate.minutes, MAX_ESTIMATE_MINUTES);
        matches.push({ kind: "estimate", raw: estimate.raw, value: estimate.minutes });
        i += estimate.raw.length;
        continue;
      }
    }

    kept += ch;
    i += 1;
  }

  return {
    title: kept.replace(/\s+/g, " ").trim(),
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(estimateMinutes !== undefined ? { estimateMinutes } : {}),
    ...(clusterName !== undefined ? { clusterName } : {}),
    matches
  };
}
