import { addDays, fromDateKey, toDateKey } from "../lib/dates";
import { loadJson } from "../lib/storage";

// Goals, weekly check-ins, and notes. Saved in localStorage under "goals", "checkIns", and "notes".

export interface Goal {
  id: string;
  title: string;
  why: string; // Notes on the goal: why it matters, next steps
  clusterId: string | null; // When set, progress comes from the cluster's tasks
  progress: number; // 0 to 100, used when there is no cluster
  targetDate: string | null; // YYYY-MM-DD
  done: boolean;
  createdAt: string;
}

export interface CheckIn {
  week: string; // The Monday of the week, YYYY-MM-DD
  energy: number; // 1 to 5, 0 when not rated
  wins: string;
  blockers: string;
  nextFocus: string;
  savedAt: string;
}

export interface Note {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// The Monday on or before a day
export function weekOf(dateKey: string = toDateKey()): string {
  const weekday = fromDateKey(dateKey).getDay();
  return addDays(dateKey, -((weekday + 6) % 7));
}

export function initGoalsStore() {
  return {
    goals: [] as Goal[],
    checkIns: {} as Record<string, CheckIn>,
    notes: [] as Note[],

    // Alpine calls init() when the store is registered
    init(): void {
      this.goals = loadJson<Goal[]>("goals", []);
      this.checkIns = loadJson<Record<string, CheckIn>>("checkIns", {});
      this.notes = loadJson<Note[]>("notes", []);
    },

    save(): void {
      localStorage.setItem("goals", JSON.stringify(this.goals));
      localStorage.setItem("checkIns", JSON.stringify(this.checkIns));
      localStorage.setItem("notes", JSON.stringify(this.notes));
    },

    addGoal(title: string, fields: Partial<Goal> = {}): string {
      const id = crypto.randomUUID();
      this.goals = [...this.goals, {
        id, title, why: "", clusterId: null, progress: 0, targetDate: null, done: false,
        createdAt: new Date().toISOString(), ...fields
      }];
      this.save();
      return id;
    },

    updateGoal(id: string, changes: Partial<Goal>): void {
      this.goals = this.goals.map(goal => goal.id === id ? { ...goal, ...changes } : goal);
      this.save();
    },

    removeGoal(id: string): void {
      this.goals = this.goals.filter(goal => goal.id !== id);
      this.save();
    },

    // Percent complete: from the linked cluster's tasks when there is one
    goalProgress(goal: Goal, tasks: { parentId: string | null; completed: boolean; isCluster: boolean }[]): number {
      if (goal.done) return 100;
      if (!goal.clusterId) return goal.progress;
      const clusterTasks = tasks.filter(task => !task.isCluster && task.parentId === goal.clusterId);
      if (!clusterTasks.length) return 0;
      return Math.round(clusterTasks.filter(task => task.completed).length / clusterTasks.length * 100);
    },

    checkInFor(week: string): CheckIn {
      return this.checkIns[week] ?? { week, energy: 0, wins: "", blockers: "", nextFocus: "", savedAt: "" };
    },

    saveCheckIn(checkIn: CheckIn): void {
      this.checkIns = { ...this.checkIns, [checkIn.week]: { ...checkIn, savedAt: new Date().toISOString() } };
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
    }
  };
}
