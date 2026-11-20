import { addDays, daysBetween, fromDateKey, toDateKey } from "./dates";

// Stats for the Insights tab and the monthly recap. Everything is computed from three saved
// lists: finished tasks (the todo store's history), focus sessions, and weekly check-ins.

export interface Completion {
  taskId: string;
  title: string;
  clusterId: string | null;
  clusterName: string;
  dueDate: string | null;
  at: string;
  blockId?: string; // One ticked day of a repeating block
}

export interface FocusSession {
  completedAt: string;
  minutes: number;
}

export interface CheckInEnergy {
  week: string; // Monday, YYYY-MM-DD
  energy: number; // 1 to 5, 0 when not rated
}

// An inclusive range of local days
export interface DayRange {
  from: string;
  to: string;
}

const dayOf = (iso: string): string => toDateKey(new Date(iso));

const inRange = (day: string, range: DayRange) => day >= range.from && day <= range.to;

export function lastDays(count: number, today: string = toDateKey()): DayRange {
  return { from: addDays(today, 1 - count), to: today };
}

// The same number of days just before a range, for "vs. previous" comparisons
export function previousRange(range: DayRange): DayRange {
  const length = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) };
}

// "2026-10" -> Oct 1 to Oct 31
export function monthRange(month: string): DayRange {
  const [year, index] = month.split("-").map(Number);
  return { from: toDateKey(new Date(year, index - 1, 1)), to: toDateKey(new Date(year, index, 0)) };
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function previousMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return monthOf(toDateKey(new Date(year, index - 2, 1)));
}

export function formatMonth(month: string, options: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }): string {
  return fromDateKey(`${month}-01`).toLocaleDateString(undefined, options);
}

// Days with any finished task or focus session
export function activeDays(completions: Completion[], sessions: FocusSession[]): Set<string> {
  return new Set([...completions.map(record => dayOf(record.at)), ...sessions.map(session => dayOf(session.completedAt))]);
}

// Current streak counts back from today, or from yesterday when today has nothing yet
export function streaks(days: Set<string>, today: string = toDateKey()): { current: number; longest: number } {
  let current = 0;
  let day = days.has(today) ? today : addDays(today, -1);
  while (days.has(day)) {
    current++;
    day = addDays(day, -1);
  }
  return { current, longest: longestRun([...days]) };
}

function longestRun(days: string[], range?: DayRange): number {
  const sorted = [...new Set(days)].filter(day => !range || inRange(day, range)).sort();
  let longest = 0;
  let run = 0;
  sorted.forEach((day, i) => {
    run = i > 0 && daysBetween(sorted[i - 1], day) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
}

export interface ClusterCount {
  clusterId: string | null;
  name: string;
  count: number;
}

export interface Summary {
  tasks: number;
  focusMinutes: number;
  sessions: number;
  activeDays: number;
  longestStreak: number;
  // Of the finished tasks that had a due date, the percent done on or before it. Null with none.
  onTimePercent: number | null;
  byCluster: ClusterCount[]; // Most first
  byWeekday: number[]; // Tasks, 0 = Sunday
  byHour: number[]; // Tasks, 0 to 23
  busiestDay: { date: string; count: number } | null;
  bestFocusDay: { date: string; minutes: number } | null;
}

export function summarize(completions: Completion[], sessions: FocusSession[], range: DayRange): Summary {
  const done = completions.filter(record => inRange(dayOf(record.at), range));
  const focus = sessions.filter(session => inRange(dayOf(session.completedAt), range));

  const clusters = new Map<string, ClusterCount>();
  const byWeekday = Array(7).fill(0);
  const byHour = Array(24).fill(0);
  const perDay = new Map<string, number>();
  let dueCount = 0;
  let onTime = 0;

  for (const record of done) {
    const key = record.clusterId ?? "";
    const entry = clusters.get(key) ?? { clusterId: record.clusterId, name: record.clusterName || "No cluster", count: 0 };
    entry.count++;
    clusters.set(key, entry);

    const time = new Date(record.at);
    byWeekday[time.getDay()]++;
    byHour[time.getHours()]++;
    const day = dayOf(record.at);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);

    if (record.dueDate) {
      dueCount++;
      if (day <= record.dueDate) onTime++;
    }
  }

  const focusPerDay = new Map<string, number>();
  for (const session of focus) {
    const day = dayOf(session.completedAt);
    focusPerDay.set(day, (focusPerDay.get(day) ?? 0) + session.minutes);
  }

  const busiest = [...perDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const bestFocus = [...focusPerDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const days = [...perDay.keys(), ...focusPerDay.keys()];

  return {
    tasks: done.length,
    focusMinutes: focus.reduce((sum, session) => sum + session.minutes, 0),
    sessions: focus.length,
    activeDays: new Set(days).size,
    longestStreak: longestRun(days, range),
    onTimePercent: dueCount ? Math.round(onTime / dueCount * 100) : null,
    byCluster: [...clusters.values()].sort((a, b) => b.count - a.count),
    byWeekday,
    byHour,
    busiestDay: busiest ? { date: busiest[0], count: busiest[1] } : null,
    bestFocusDay: bestFocus ? { date: bestFocus[0], minutes: bestFocus[1] } : null
  };
}

export interface DayActivity {
  date: string;
  tasks: number;
  focusMinutes: number;
}

// One entry per day in the range, oldest first
export function dailyActivity(completions: Completion[], sessions: FocusSession[], range: DayRange): DayActivity[] {
  const tasks = new Map<string, number>();
  const focus = new Map<string, number>();
  completions.forEach(record => {
    const day = dayOf(record.at);
    tasks.set(day, (tasks.get(day) ?? 0) + 1);
  });
  sessions.forEach(session => {
    const day = dayOf(session.completedAt);
    focus.set(day, (focus.get(day) ?? 0) + session.minutes);
  });
  const length = daysBetween(range.from, range.to) + 1;
  return Array.from({ length }, (_, i) => {
    const date = addDays(range.from, i);
    return { date, tasks: tasks.get(date) ?? 0, focusMinutes: focus.get(date) ?? 0 };
  });
}

// Change from one count to another as a whole percent. Null when there's nothing to compare to.
export function percentChange(now: number, before: number): number | null {
  return before ? Math.round((now - before) / before * 100) : null;
}

// "Morning" for a peak at 9, and so on. Null with no tasks.
export function partOfDay(byHour: number[]): string | null {
  const parts = [
    { name: "early bird", hours: [5, 6, 7, 8] },
    { name: "morning", hours: [9, 10, 11] },
    { name: "afternoon", hours: [12, 13, 14, 15, 16] },
    { name: "evening", hours: [17, 18, 19, 20] },
    { name: "night owl", hours: [21, 22, 23, 0, 1, 2, 3, 4] }
  ];
  const totals = parts.map(part => ({ name: part.name, count: part.hours.reduce((sum, hour) => sum + byHour[hour], 0) }));
  const best = totals.sort((a, b) => b.count - a.count)[0];
  return best.count ? best.name : null;
}

export function averageEnergy(checkIns: CheckInEnergy[], range: DayRange): number | null {
  const rated = checkIns.filter(entry => entry.energy > 0 && inRange(entry.week, { from: addDays(range.from, -6), to: range.to }));
  if (!rated.length) return null;
  return Math.round(rated.reduce((sum, entry) => sum + entry.energy, 0) / rated.length * 10) / 10;
}

// Months with any activity, newest first, always including the current month
export function monthsWithActivity(completions: Completion[], sessions: FocusSession[], today: string = toDateKey()): string[] {
  const months = new Set([monthOf(today)]);
  completions.forEach(record => months.add(monthOf(dayOf(record.at))));
  sessions.forEach(session => months.add(monthOf(dayOf(session.completedAt))));
  return [...months].sort().reverse();
}
