import { addDays, formatTime, fromDateKey, minutesNow, toDateKey } from "./dates";
import { loadJson, saveJson } from "./storage";
import { weekOf } from "../stores/goalsStore";

// Reminders while Zen Frame is open in a tab: a browser notification when allowed,
// and an in-app toast either way. There is no server, so nothing fires once the tab is closed.

export type NotificationKind = "timer" | "blocks" | "due" | "weeklyCheckIn" | "peopleCheckIn" | "closeDay";

const SENT_KEY = "remindersSent";
// The Settings switch for each kind
const SETTING: Record<NotificationKind, string> = {
  timer: "notifyTimer",
  blocks: "notifyBlocks",
  due: "notifyDue",
  weeklyCheckIn: "notifyWeeklyCheckIn",
  peopleCheckIn: "notifyPeopleCheckIn",
  closeDay: "notifyCloseDay"
};
const CHECK_EVERY_MS = 30 * 1000;

type Alpine = { store: (name: string) => any };

// The detail of an "app-toast" window event, shown by AppToasts.astro. The optional
// action renders as one quiet text button (e.g. "Undo") that runs and then
// dismisses the toast. Plain { title, body } payloads are unchanged.
export interface ToastDetail {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

// How long an action toast (Undo) stays up. Stores that keep an undo snapshot must
// keep it for this long too, so the button never shows after its action has expired.
export const UNDO_TOAST_MS = 12000;

// Fires one in-app toast. Closures in the action are fine: only the button keeps them.
export function dispatchToast(detail: ToastDetail): void {
  window.dispatchEvent(new CustomEvent("app-toast", { detail }));
}

function notificationsSupported(): boolean {
  return "Notification" in window;
}

export function permission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export async function requestPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission === "default" ? Notification.requestPermission() : Notification.permission;
}

// Sends one notification if the user turned this kind on in Settings
export function notify(
  Alpine: Alpine,
  kind: NotificationKind,
  title: string,
  body: string,
  action?: { label: string; onAction: () => void }
): void {
  const settings = Alpine.store("settings");
  if (!settings.notifyEnabled || !settings[SETTING[kind]]) return;

  dispatchToast({
    title,
    body,
    actionLabel: action?.label,
    onAction: action?.onAction
  });
  if (permission() === "granted") {
    new Notification(title, { body, icon: "/favicon.svg", tag: `${kind}-${title}-${body}` });
  }
}

// Keys of reminders already sent, kept for a week so weekly nudges don't repeat
function loadSent(): Record<string, string> {
  return loadJson<Record<string, string>>(SENT_KEY, {});
}

function markSent(key: string, today: string): void {
  const cutoff = addDays(today, -7);
  const sent = Object.fromEntries(Object.entries(loadSent()).filter(([, day]) => day >= cutoff));
  sent[key] = today;
  saveJson(SENT_KEY, sent);
}

function parseMinutes(hhmm: unknown, fallback: number): number {
  const parts = String(hhmm ?? "").split(":").map(Number);
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return fallback;
  return parts[0] * 60 + parts[1];
}

// Day offset within a Monday-first week: Monday = 0, ..., Sunday = 6
function mondayOffset(weekday: number): number {
  return (weekday + 6) % 7;
}

function hasReachedWeeklySlot(today: string, nowMinutes: number, targetWeekday: number, targetTime: string): boolean {
  const todayOffset = mondayOffset(fromDateKey(today).getDay());
  const targetOffset = mondayOffset(targetWeekday);
  if (todayOffset > targetOffset) return true;
  if (todayOffset < targetOffset) return false;
  return nowMinutes >= parseMinutes(targetTime, 18 * 60);
}

export function checkReminders(Alpine: Alpine, nowDate: Date = new Date()): void {
  const settings = Alpine.store("settings");
  if (!settings.notifyEnabled) return;
  const todos = Alpine.store("todos");
  const goals = Alpine.store("goals");
  const today = toDateKey(nowDate);
  const now = minutesNow(nowDate);
  const sent = loadSent();

  // Scheduled blocks: a reminder the chosen number of minutes before each one starts
  if (settings.notifyBlocks) {
    const lead = Number(settings.notifyBlockLead);
    for (const item of todos.scheduledItemsOn(today)) {
      const remindAt = item.startTimeMinutes - lead;
      const key = `block:${item.id}:${today}`;
      // A two-minute window, so a reload just after the time still reminds once
      if (now < remindAt || now > remindAt + 2 || sent[key] || todos.isBlockDone(item, today)) continue;
      const name = todos.find(item.taskId)?.todo ?? "A block";
      notify(Alpine, "blocks", lead ? `Starting in ${lead} min` : "Starting now", `${name} at ${formatTime(item.startTimeMinutes)}`);
      markSent(key, today);
    }
  }

  // Due dates: one summary a day, at the chosen time or the first check after it
  if (settings.notifyDue) {
    const dueAt = parseMinutes(settings.notifyDueTime, 9 * 60);
    const key = `due:${today}`;
    if (now >= dueAt && !sent[key]) {
      const open = todos.openTasks.filter((task: { dueDate?: string | null }) => task.dueDate);
      const dueToday = open.filter((task: { dueDate: string }) => task.dueDate === today).length;
      const overdue = open.filter((task: { dueDate: string }) => task.dueDate < today).length;
      if (dueToday || overdue) {
        const parts = [];
        if (dueToday) parts.push(`${dueToday} due today`);
        if (overdue) parts.push(`${overdue} carried over`);
        notify(Alpine, "due", "Today's tasks", `${parts.join(" and ")}.`);
      }
      markSent(key, today);
    }
  }

  const thisWeek = weekOf(today);

  // Weekly check-in: one quiet nudge on or after the chosen day/time if not saved yet this week
  if (settings.notifyWeeklyCheckIn && goals) {
    const key = `weekly-checkin:${thisWeek}`;
    const alreadySaved = Boolean(goals.checkIns?.[thisWeek]?.savedAt);
    if (!alreadySaved && !sent[key] && hasReachedWeeklySlot(today, now, Number(settings.notifyWeeklyCheckInDay ?? 0), settings.notifyWeeklyCheckInTime)) {
      notify(
        Alpine,
        "weeklyCheckIn",
        "Weekly check-in",
        "Take a quiet moment to look back on the week and set 1–3 intentions.",
        {
          label: "Open",
          onAction: () => window.dispatchEvent(new CustomEvent("change-tab", { detail: { tab: "goals" } }))
        }
      );
      markSent(key, today);
    }
  }

  // People check-in: mid-week gentle nudge naming the person from this week's check-in
  if (settings.notifyPeopleCheckIn && goals) {
    const checkIn = goals.checkInFor?.(thisWeek);
    const person = typeof checkIn?.checkInPerson === "string" ? checkIn.checkInPerson.trim() : "";
    const key = `people-checkin:${thisWeek}`;
    if (person && !sent[key] && hasReachedWeeklySlot(today, now, Number(settings.notifyPeopleCheckInDay ?? 3), settings.notifyPeopleCheckInTime)) {
      const title = `Check in on ${person}`;
      const existing = todos?.items?.some((task: { isCluster?: boolean; completed?: boolean; todo?: string }) => !task.isCluster && !task.completed && task.todo === title);
      notify(
        Alpine,
        "peopleCheckIn",
        title,
        "A quick message or call can mean more than you think.",
        existing
          ? {
              label: "Open",
              onAction: () => window.dispatchEvent(new CustomEvent("change-tab", { detail: { tab: "goals" } }))
            }
          : {
              label: "Add task",
              onAction: () => {
                const taskId = todos.addTodo(title, { dueDate: today });
                goals.saveCheckIn({ ...checkIn, week: thisWeek, checkInPersonTaskId: taskId });
              }
            }
      );
      markSent(key, today);
    }
  }

  // Evening wrap-up: one quiet nudge to open the 60-second Close the day flow
  if (settings.notifyCloseDay) {
    const closeAt = parseMinutes(settings.notifyCloseDayTime, 17 * 60 + 30);
    const key = `close-day:${today}`;
    if (now >= closeAt && !sent[key] && settings.lastClosedDay !== today) {
      notify(
        Alpine,
        "closeDay",
        "Close the day",
        "Carry loose ends to tomorrow and pick one next step.",
        {
          label: "Open",
          onAction: () => window.dispatchEvent(new CustomEvent("open-close-day"))
        }
      );
      markSent(key, today);
    }
  }
}

export function startReminders(Alpine: Alpine): void {
  checkReminders(Alpine);
  setInterval(() => checkReminders(Alpine), CHECK_EVERY_MS);
}
