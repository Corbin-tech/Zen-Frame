import { addDays, fromDateKey, toDateKey } from "../lib/dates";
import { loadJson, saveJson } from "../lib/storage";
import { mergeLists } from "../lib/mergeLists";

// Goals, weekly check-ins, notes, and wins. Saved in localStorage under "goals", "checkIns", "notes", and "wins".

export interface Goal {
  id: string;
  title: string;
  why: string; // Why this matters (self-concordance)
  obstaclePlan: string; // WOOP: one obstacle and an if-then fallback
  celebration: string; // How to mark reaching this goal
  clusterId: string | null; // When set, progress comes from the cluster's tasks
  progress: number; // 0 to 100, used when there is no cluster
  targetDate: string | null; // YYYY-MM-DD
  done: boolean;
  reachedAt: string | null;
  createdAt: string;
}

export interface Win {
  id: string;
  date: string; // YYYY-MM-DD
  text: string;
  goalId: string | null;
  goalTitle: string | null;
  createdAt: string;
}

export interface WeeklyIntention {
  id: string;
  text: string;
  goalId: string | null;
  done: boolean;
}

export const ACTIVE_GOAL_FOCUS_LIMIT = 3;
export const WEEKLY_INTENTIONS_LIMIT = 3;

export const MINDFUL_PROMPTS = [
  "What can you let go of this week?",
  "Who helped you recently?",
  "What gave you quiet energy this week?",
  "Where can you make things a little gentler?",
  "What is one thing that felt enough?",
  "What deserves your unhurried attention?",
  "What small boundary would protect your calm?",
  "What are you glad you noticed this week?"
] as const;

export function mindfulPromptForWeek(week: string): string {
  const days = Math.floor(fromDateKey(week).getTime() / 86_400_000);
  const weekIndex = Math.floor(days / 7);
  const index = ((weekIndex % MINDFUL_PROMPTS.length) + MINDFUL_PROMPTS.length) % MINDFUL_PROMPTS.length;
  return MINDFUL_PROMPTS[index];
}

export interface CheckIn {
  week: string; // The Monday of the week, YYYY-MM-DD
  energy: number; // 1 to 5, 0 when not rated
  wins: string;
  blockers: string;
  nextFocus: string;
  weeklyIntentions: WeeklyIntention[]; // 1 to 3 goal-linked weekly intentions (Weekly Big 3)
  checkInPerson: string; // Someone to check in on this week
  checkInPersonTaskId: string | null; // Optional task created from checkInPerson
  recharge: string; // How I'll recharge this week
  mindfulPrompt: string; // Rotating prompt text for this week
  mindfulAnswer: string; // Optional answer to the rotating prompt
  mindfulDismissed: boolean; // Whether the rotating prompt is hidden for this week
  savedAt: string;
}

export interface Note {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const PERSISTED_KEYS = ["goals", "checkIns", "notes", "wins"] as const;
type PersistedKey = typeof PERSISTED_KEYS[number];

// The Monday on or before a day
export function weekOf(dateKey: string = toDateKey()): string {
  const weekday = fromDateKey(dateKey).getDay();
  return addDays(dateKey, -((weekday + 6) % 7));
}

function hydrateGoal(goal: Partial<Goal> & Pick<Goal, "id" | "title">): Goal {
  return {
    why: "",
    obstaclePlan: "",
    celebration: "",
    clusterId: null,
    progress: 0,
    targetDate: null,
    done: false,
    reachedAt: null,
    createdAt: new Date().toISOString(),
    ...goal
  };
}

function cleanIntentions(raw: unknown): WeeklyIntention[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<WeeklyIntention> => Boolean(item && typeof item === "object"))
    .slice(0, WEEKLY_INTENTIONS_LIMIT)
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id ? item.id : `intention-${index + 1}`,
      text: typeof item.text === "string" ? item.text : "",
      goalId: typeof item.goalId === "string" && item.goalId ? item.goalId : null,
      done: Boolean(item.done)
    }));
}

function hydrateCheckIn(checkIn: Partial<CheckIn> & Pick<CheckIn, "week">): CheckIn {
  const weeklyIntentions = cleanIntentions(checkIn.weeklyIntentions);
  return {
    energy: 0,
    wins: "",
    blockers: "",
    nextFocus: "",
    checkInPerson: "",
    checkInPersonTaskId: null,
    recharge: "",
    mindfulAnswer: "",
    mindfulDismissed: false,
    savedAt: "",
    ...checkIn,
    weeklyIntentions,
    mindfulPrompt: typeof checkIn.mindfulPrompt === "string" && checkIn.mindfulPrompt.trim()
      ? checkIn.mindfulPrompt
      : mindfulPromptForWeek(checkIn.week)
  };
}

export function initGoalsStore() {
  return {
    goals: [] as Goal[],
    checkIns: {} as Record<string, CheckIn>,
    notes: [] as Note[],
    wins: [] as Win[],
    savedJson: {} as Partial<Record<PersistedKey, string>>,

    // Alpine calls init() when the store is registered
    init(): void {
      for (const key of PERSISTED_KEYS) this.loadListSafely(key);
      window.addEventListener("storage", event => {
        if (event.storageArea !== localStorage) return;
        for (const key of PERSISTED_KEYS) {
          if (event.key === null || event.key === key) this.loadListSafely(key, true);
        }
      });
    },

    // One unreadable list must not stop the others from loading. The failed list keeps what
    // it had, and its baseline is set to that, so save() leaves the stored copy alone until
    // the person changes that list. Without the baseline, the next save of any list would
    // write the empty default over it.
    loadListSafely(key: PersistedKey, merge = false): void {
      try {
        this.loadList(key, merge);
      } catch (error) {
        console.error(`Could not read "${key}" from storage; keeping what is shown.`, error);
        this.savedJson[key] ??= JSON.stringify(this[key]);
      }
    },

    loadList(key: PersistedKey, merge = false): void {
      const base = this.savedJson[key];
      const dirty = merge && base !== undefined && JSON.stringify(this[key]) !== base;
      switch (key) {
        case "goals": {
          const remote = loadJson<Goal[]>(key, []).map(hydrateGoal);
          this.savedJson[key] = JSON.stringify(remote);
          this.goals = mergeLists(dirty ? JSON.parse(base!) : this.goals, this.goals, remote, goal => goal.id);
          break;
        }
        case "checkIns": {
          const raw = loadJson<Record<string, CheckIn>>(key, {});
          const remote = Object.fromEntries(
            Object.entries(raw).map(([week, entry]) => [week, hydrateCheckIn({ ...entry, week: entry.week || week })])
          );
          this.savedJson[key] = JSON.stringify(remote);
          const local = Object.values(this.checkIns);
          const merged = mergeLists(dirty ? Object.values(JSON.parse(base!) as Record<string, CheckIn>) : local, local, Object.values(remote), checkIn => checkIn.week);
          this.checkIns = Object.fromEntries(merged.map(checkIn => [checkIn.week, checkIn]));
          break;
        }
        case "notes": {
          const remote = loadJson<Note[]>(key, []);
          this.savedJson[key] = JSON.stringify(remote);
          this.notes = mergeLists(dirty ? JSON.parse(base!) : this.notes, this.notes, remote, note => note.id);
          break;
        }
        case "wins": {
          const remote = loadJson<Win[]>(key, []);
          this.savedJson[key] = JSON.stringify(remote);
          this.wins = mergeLists(dirty ? JSON.parse(base!) : this.wins, this.wins, remote, win => win.id);
          break;
        }
      }
      if (dirty) this.save();
    },

    save(): void {
      for (const key of PERSISTED_KEYS) {
        const serialized = JSON.stringify(this[key]);
        if (this.savedJson[key] === serialized) continue;
        if (!saveJson(key, this[key])) break;
        this.savedJson[key] = serialized;
      }
    },

    addGoal(title: string, fields: Partial<Goal> = {}): string {
      const id = crypto.randomUUID();
      this.goals = [...this.goals, hydrateGoal({ id, title, ...fields })];
      this.save();
      return id;
    },

    updateGoal(id: string, changes: Partial<Goal>): void {
      this.goals = this.goals.map(goal => {
        if (goal.id !== id) return goal;
        const next: Goal = { ...goal, ...changes };
        if (changes.done === true && !goal.done && changes.reachedAt === undefined) {
          next.reachedAt = new Date().toISOString();
        } else if (changes.done === false && changes.reachedAt === undefined) {
          next.reachedAt = null;
        }
        return next;
      });
      this.save();
    },

    // Called by the todo store when clusters are deleted; goals fall back to manual progress
    unlinkClusters(progress: Map<string, { done: number; total: number }>): void {
      if (!this.goals.some(goal => goal.clusterId && progress.has(goal.clusterId))) return;
      this.goals = this.goals.map(goal => goal.clusterId && progress.has(goal.clusterId)
        ? { ...goal, progress: this.goalProgress(goal, progress.get(goal.clusterId)!), clusterId: null }
        : goal);
      this.save();
    },

    removeGoal(id: string): void {
      this.goals = this.goals.filter(goal => goal.id !== id);
      this.save();
    },

    // Percent complete: from the linked cluster's progress when there is one
    // (the todo store's clusterProgress, which still counts cleared tasks)
    goalProgress(goal: Goal, cluster: { done: number; total: number } | null): number {
      if (goal.done) return 100;
      if (!goal.clusterId || !cluster) return goal.progress;
      return cluster.total ? Math.round(cluster.done / cluster.total * 100) : 0;
    },

    checkInFor(week: string): CheckIn {
      return hydrateCheckIn(this.checkIns[week] ?? { week });
    },

    saveCheckIn(checkIn: Partial<CheckIn> & Pick<CheckIn, "week">): void {
      const next = hydrateCheckIn({ ...checkIn, savedAt: new Date().toISOString() });
      this.checkIns = { ...this.checkIns, [next.week]: next };
      this.save();
    },

    // Newest week first
    get pastCheckIns(): CheckIn[] {
      return Object.values(this.checkIns).sort((a, b) => b.week.localeCompare(a.week));
    },

    addNote(text: string): void {
      const now = new Date().toISOString();
      this.notes = [{ id: crypto.randomUUID(), text, pinned: false, createdAt: now, updatedAt: now }, ...this.notes];
      this.save();
    },

    updateNote(id: string, changes: Partial<Note>): void {
      this.notes = this.notes.map(note => note.id === id ? { ...note, ...changes, updatedAt: new Date().toISOString() } : note);
      this.save();
    },

    removeNote(id: string): void {
      this.notes = this.notes.filter(note => note.id !== id);
      this.save();
    },

    // Pinned first, then newest
    get sortedNotes(): Note[] {
      return [...this.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
    },

    addWin(text: string, options: { date?: string; goalId?: string | null; goalTitle?: string | null } = {}): string {
      const cleaned = text.trim();
      if (!cleaned) return "";
      const id = crypto.randomUUID();
      const win: Win = {
        id,
        date: options.date ?? toDateKey(),
        text: cleaned,
        goalId: options.goalId ?? null,
        goalTitle: options.goalTitle ?? null,
        createdAt: new Date().toISOString()
      };
      this.wins = [win, ...this.wins];
      this.save();
      return id;
    },

    removeWin(id: string): void {
      this.wins = this.wins.filter(win => win.id !== id);
      this.save();
    },

    winsInWeek(weekStart: string): Win[] {
      const end = addDays(weekStart, 7);
      return this.sortedWins.filter(win => win.date >= weekStart && win.date < end);
    },

    winsInRange(from: string, to: string): Win[] {
      return this.sortedWins.filter(win => win.date >= from && win.date <= to);
    },

    reachedGoalsInRange(from: string, to: string): Goal[] {
      return this.goals.filter(goal => {
        if (!goal.done || !goal.reachedAt) return false;
        const day = toDateKey(new Date(goal.reachedAt));
        return day >= from && day <= to;
      });
    },

    todayWins(todayKey: string = toDateKey()): Win[] {
      return this.sortedWins.filter(win => win.date === todayKey);
    },

    // Newest date first, then newest entry
    get sortedWins(): Win[] {
      return [...this.wins].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    }
  };
}
