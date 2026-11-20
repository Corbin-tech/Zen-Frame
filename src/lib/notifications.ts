import { addDays, formatTime, minutesNow, toDateKey } from "./dates";
import { loadJson, saveJson } from "./storage";

// Reminders while Zen Frame is open in a tab: a browser notification when allowed,
// and an in-app toast either way. There is no server, so nothing fires once the tab is closed.

export type NotificationKind = "timer" | "blocks" | "due";

const SENT_KEY = "remindersSent";
// The Settings switch for each kind
const SETTING: Record<NotificationKind, string> = { timer: "notifyTimer", blocks: "notifyBlocks", due: "notifyDue" };
const CHECK_EVERY_MS = 30 * 1000;

type Alpine = { store: (name: string) => any };

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
export function notify(Alpine: Alpine, kind: NotificationKind, title: string, body: string): void {
  const settings = Alpine.store("settings");
  if (!settings.notifyEnabled || !settings[SETTING[kind]]) return;

  window.dispatchEvent(new CustomEvent("app-toast", { detail: { title, body } }));
  if (permission() === "granted") {
    new Notification(title, { body, icon: "/favicon.svg", tag: `${kind}-${title}-${body}` });
  }
}

// Keys of reminders already sent, kept for two days so a reload doesn't repeat them
function loadSent(): Record<string, string> {
  return loadJson<Record<string, string>>(SENT_KEY, {});
}

function markSent(key: string, today: string): void {
  const yesterday = addDays(today, -1);
  const sent = Object.fromEntries(Object.entries(loadSent()).filter(([, day]) => day >= yesterday));
  sent[key] = today;
  saveJson(SENT_KEY, sent);
}

function checkReminders(Alpine: Alpine): void {
  const settings = Alpine.store("settings");
  if (!settings.notifyEnabled) return;
  const todos = Alpine.store("todos");
  const today = toDateKey();
  const now = minutesNow();
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
    const [hours, minutes] = String(settings.notifyDueTime).split(":").map(Number);
    const key = `due:${today}`;
    if (now >= hours * 60 + minutes && !sent[key]) {
      const open = todos.openTasks.filter((task: { dueDate?: string | null }) => task.dueDate);
      const dueToday = open.filter((task: { dueDate: string }) => task.dueDate === today).length;
      const overdue = open.filter((task: { dueDate: string }) => task.dueDate < today).length;
      if (dueToday || overdue) {
        const parts = [];
        if (dueToday) parts.push(`${dueToday} due today`);
        if (overdue) parts.push(`${overdue} overdue`);
        notify(Alpine, "due", "Today's deadlines", `You have ${parts.join(" and ")}.`);
      }
      markSent(key, today);
    }
  }
}

export function startReminders(Alpine: Alpine): void {
  checkReminders(Alpine);
  setInterval(() => checkReminders(Alpine), CHECK_EVERY_MS);
}
