import { addDays, fromDateKey, toDateKey } from "../lib/dates";
import { loadJson, saveJson } from "../lib/storage";
import { mergeLists } from "../lib/mergeLists";

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

const PERSISTED_KEYS = ["goals", "checkIns", "notes"] as const;
type PersistedKey = typeof PERSISTED_KEYS[number];

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
    savedJson: {} as Partial<Record<PersistedKey, string>>,

    // Alpine calls init() when the store is registered
    init(): void {
      for (const key of PERSISTED_KEYS) this.loadList(key);
      window.addEventListener("storage", event => {
        if (event.storageArea !== localStorage) return;
        for (const key of PERSISTED_KEYS) {
          if (event.key === null || event.key === key) this.loadList(key, true);
        }
      });
    },

    loadList(key: PersistedKey, merge = false): void {
      const base = this.savedJson[key];
      const dirty = merge && base !== undefined && JSON.stringify(this[key]) !== base;
      switch (key) {
        case "goals": {
          const remote = loadJson<Goal[]>(key, []);
          this.savedJson[key] = JSON.stringify(remote);
          this.goals = mergeLists(dirty ? JSON.parse(base!) : this.goals, this.goals, remote, goal => goal.id);
          break;
        }
        case "checkIns": {
          const remote = loadJson<Record<string, CheckIn>>(key, {});
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
