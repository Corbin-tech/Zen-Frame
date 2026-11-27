import { cleanMinutes } from "./estimates";
import type { ScheduledItem, Todo } from "../stores/todoStore";

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Focus sessions can carry the task they were linked to. These fields render with x-text,
// but a hand-edited or imported backup can hold any type, so keep only strings (ids may be null).
const SESSION_TEXT_MAX = 200;

function cleanSession(session: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = { completedAt: session.completedAt, minutes: session.minutes };
  for (const key of ["taskId", "taskTitle", "clusterId", "clusterName"]) {
    const field = session[key];
    if (typeof field === "string") clean[key] = field.slice(0, SESSION_TEXT_MAX);
    else if (field === null && (key === "taskId" || key === "clusterId")) clean[key] = null;
  }
  return clean;
}

function cleanWin(win: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(win.id),
    date: String(win.date),
    text: String(win.text),
    goalId: typeof win.goalId === "string" ? win.goalId : null,
    goalTitle: typeof win.goalTitle === "string" ? win.goalTitle : null,
    createdAt: isTimestamp(win.createdAt) ? win.createdAt : new Date().toISOString()
  };
}

function cleanWeeklyIntentions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .slice(0, 3)
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id ? item.id : `intention-${index + 1}`,
      text: typeof item.text === "string" ? item.text : "",
      goalId: typeof item.goalId === "string" && item.goalId ? item.goalId : null,
      done: Boolean(item.done)
    }));
}

// A restored backup may carry anything, so keep only well-formed values. The "steps"
// checklist field from older saves is dropped: nothing reads it any more.
function normalizeLoadedTodo(item: Todo & { steps?: unknown }): Todo {
  const { steps: _steps, ...todo } = item;
  const cleaned: Todo = {
    ...todo,
    // Templates call string methods on the title, so a task without one gets an empty title
    todo: typeof todo.todo === "string" ? todo.todo : "",
    parentId: todo.parentId ?? null,
    estimateMinutes: cleanMinutes(todo.estimateMinutes)
  };
  if (todo.focusDate !== undefined) {
    cleaned.focusDate = isDateKey(todo.focusDate) ? todo.focusDate : null;
  }
  return cleaned;
}

function cleanScheduledRepeat(value: unknown): ScheduledItem["repeat"] | undefined {
  if (!isObject(value)) return undefined;
  const weekdays = Array.isArray(value.weekdays)
    ? value.weekdays.filter((day): day is number => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const until = isDateKey(value.until) ? value.until : null;
  const doneDates = Array.isArray(value.doneDates) ? value.doneDates.filter(isDateKey) : [];
  return { weekdays, until, doneDates };
}

function cleanScheduledItem(item: Record<string, unknown>): ScheduledItem | null {
  if (typeof item.id !== "string" || item.id.trim() === "") return null;
  if (typeof item.taskId !== "string" || item.taskId.trim() === "") return null;
  if (!isDateKey(item.date)) return null;
  if (typeof item.startTimeMinutes !== "number" || !Number.isFinite(item.startTimeMinutes)) return null;
  if (typeof item.endTimeMinutes !== "number" || !Number.isFinite(item.endTimeMinutes)) return null;
  if (item.startTimeMinutes < 0 || item.endTimeMinutes <= item.startTimeMinutes || item.endTimeMinutes > 1440) return null;

  const { repeat: rawRepeat, ...rest } = item;
  const cleaned: ScheduledItem = {
    ...rest,
    id: item.id,
    taskId: item.taskId,
    date: item.date,
    startTimeMinutes: item.startTimeMinutes,
    endTimeMinutes: item.endTimeMinutes
  };
  const repeat = cleanScheduledRepeat(rawRepeat);
  if (repeat) cleaned.repeat = repeat;
  return cleaned;
}

export function normalizeStoredData(key: string, value: unknown): unknown {
  switch (key) {
    case "todos":
      return Array.isArray(value) ? value.filter(isObject).map(item => {
        const todo = normalizeLoadedTodo(item as unknown as Todo);
        if (!isTimestamp(todo.zenDeferredStart)) delete todo.zenDeferredStart;
        return todo;
      }) : [];
    case "skippedClusters":
      return Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string" && id !== "")
        : [];
    case "scheduledItems":
      return Array.isArray(value)
        ? value.filter(isObject).map(cleanScheduledItem).filter((item): item is ScheduledItem => item !== null)
        : [];
    case "history":
      return Array.isArray(value)
        ? value.filter(item => isObject(item) && typeof item.taskId === "string" && item.taskId !== "")
        : [];
    case "goals":
      return Array.isArray(value) ? value.filter(item => isObject(item) && typeof item.id === "string" && typeof item.title === "string").map(goal => ({
        ...goal,
        why: typeof goal.why === "string" ? goal.why : "",
        obstaclePlan: typeof goal.obstaclePlan === "string" ? goal.obstaclePlan : "",
        celebration: typeof goal.celebration === "string" ? goal.celebration : "",
        reachedAt: isTimestamp(goal.reachedAt) ? goal.reachedAt : null
      })) : [];
    case "wins":
      return Array.isArray(value) ? value.filter(win => isObject(win)
        && typeof win.id === "string" && typeof win.date === "string"
        && typeof win.text === "string" && win.text.trim() !== "").map(cleanWin) : [];
    case "checkIns": {
      if (!isObject(value)) return {};
      const cleaned: Record<string, Record<string, unknown>> = {};
      for (const [week, entry] of Object.entries(value)) {
        if (!isObject(entry)) continue;
        cleaned[week] = {
          ...entry,
          week: typeof entry.week === "string" && entry.week ? entry.week : week,
          energy: typeof entry.energy === "number" && Number.isFinite(entry.energy) ? entry.energy : 0,
          wins: typeof entry.wins === "string" ? entry.wins : "",
          blockers: typeof entry.blockers === "string" ? entry.blockers : "",
          nextFocus: typeof entry.nextFocus === "string" ? entry.nextFocus : "",
          weeklyIntentions: cleanWeeklyIntentions(entry.weeklyIntentions),
          checkInPerson: typeof entry.checkInPerson === "string" ? entry.checkInPerson : "",
          checkInPersonTaskId: typeof entry.checkInPersonTaskId === "string" ? entry.checkInPersonTaskId : null,
          recharge: typeof entry.recharge === "string" ? entry.recharge : "",
          mindfulPrompt: typeof entry.mindfulPrompt === "string" ? entry.mindfulPrompt : "",
          mindfulAnswer: typeof entry.mindfulAnswer === "string" ? entry.mindfulAnswer : "",
          mindfulDismissed: entry.mindfulDismissed === true,
          savedAt: typeof entry.savedAt === "string" ? entry.savedAt : ""
        };
      }
      return cleaned;
    }
    case "planning": {
      const planning = isObject(value) ? value : {};
      return {
        ...planning,
        gap: typeof planning.gap === "number" && Number.isFinite(planning.gap) && planning.gap >= 0
          ? planning.gap : 15
      };
    }
    case "pomoSessions":
      return Array.isArray(value) ? value.filter(session => isObject(session)
        && isTimestamp(session.completedAt) && typeof session.minutes === "number"
        && Number.isFinite(session.minutes) && session.minutes > 0).map(cleanSession) : [];
    default:
      return value;
  }
}
