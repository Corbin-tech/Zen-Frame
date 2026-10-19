// Dates are stored as local calendar days ("YYYY-MM-DD") and times as minutes after midnight.
// Do not use toISOString() for a day: it uses UTC and can shift the date.

export type DueTone = "overdue" | "today" | "soon" | "later";

const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Local midnight of a date key
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

// Whole calendar days from one key to another (negative when "to" is earlier)
export function daysBetween(from: string, to: string): number {
  return Math.round((fromDateKey(to).getTime() - fromDateKey(from).getTime()) / DAY_MS);
}

export function formatDate(key: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return fromDateKey(key).toLocaleDateString(undefined, options);
}

// 570 -> "9:30 AM"
export function formatTime(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = String(totalMinutes % 60).padStart(2, "0");
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

// 570 <-> "09:30", the value format of time inputs and selects
export function toTimeValue(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

export function fromTimeValue(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

// 90 -> "1h 30m"
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function minutesNow(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function dueTone(dueKey: string, todayKey: string = toDateKey()): DueTone {
  const days = daysBetween(todayKey, dueKey);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days <= 3 ? "soon" : "later";
}

// "Today", "Tomorrow", "In 3 days", "2 days overdue", or "Oct 30"
export function dueLabel(dueKey: string, todayKey: string = toDateKey()): string {
  const days = daysBetween(todayKey, dueKey);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${-days} days overdue`;
  if (days < 7) return `In ${days} days`;
  return formatDate(dueKey);
}

// For sentences: "due today", "due tomorrow", "due in 3 days", "due Oct 30", "2 days overdue"
export function dueText(dueKey: string, todayKey: string = toDateKey()): string {
  const days = daysBetween(todayKey, dueKey);
  if (days < 0) return dueLabel(dueKey, todayKey);
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 7) return `due in ${days} days`;
  return `due ${formatDate(dueKey)}`;
}

// Tailwind classes for a due-date chip. Completed tasks use the quiet style.
const DUE_TONE_CLASSES: Record<DueTone, string> = {
  overdue: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300",
  today: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  soon: "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  later: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300"
};

export function dueClass(dueKey: string, completed = false, todayKey: string = toDateKey()): string {
  return DUE_TONE_CLASSES[completed ? "later" : dueTone(dueKey, todayKey)];
}

export const dates = {
  toDateKey,
  fromDateKey,
  addDays,
  daysBetween,
  formatDate,
  formatTime,
  toTimeValue,
  fromTimeValue,
  formatDuration,
  minutesNow,
  dueTone,
  dueLabel,
  dueText,
  dueClass
};
