// Reads and writes JSON in localStorage safely, and handles full-app backup/restore.

const BACKUP_KEYS = [
  "todos",
  "skippedClusters",
  "scheduledItems",
  "planning",
  "history",
  "goals",
  "checkIns",
  "notes",
  "pomoState",
  "pomoSessions",
  "settings",
  "assist",
  "theme",
  "activeTab",
  "boardCluster",
  "boardSort",
  "boardWipLimit",
  "insightsRange"
] as const;

type BackupKey = typeof BACKUP_KEYS[number];

const ARRAY_KEYS = new Set<BackupKey>([
  "todos",
  "skippedClusters",
  "scheduledItems",
  "history",
  "goals",
  "notes",
  "pomoSessions"
]);

const OBJECT_KEYS = new Set<BackupKey>(["planning", "checkIns", "pomoState", "settings", "assist"]);
const STRING_KEYS = new Set<BackupKey>(["theme", "activeTab", "boardCluster", "boardSort", "boardWipLimit", "insightsRange"]);

export function loadSessionJson<T>(key: string, fallback: T): T {
  try {
    const saved = sessionStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

export function saveSessionJson(key: string, value: unknown): boolean {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeSession(key: string): boolean {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    console.error(`Could not read "${key}" from storage; starting empty.`);
    return fallback;
  }
}

// For plain string values (theme, activeTab, UI preferences) that aren't JSON
export function loadString(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  return saveString(key, JSON.stringify(value));
}

export function saveString(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Could not save "${key}" to storage:`, error);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("app-toast", {
        detail: { title: "Storage full", body: "Your browser could not save recent changes." }
      }));
    }
    return false;
  }
}

export function exportBackup(): string {
  const data: Record<string, unknown> = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    if (STRING_KEYS.has(key)) {
      data[key] = raw;
    } else {
      try {
        data[key] = JSON.parse(raw);
      } catch {
        // Skip corrupted entries
      }
    }
  }
  return JSON.stringify({
    app: "zen-frame",
    version: 1,
    exportedAt: new Date().toISOString(),
    data
  }, null, 2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function importBackup(raw: string): { ok: boolean; error?: string; count?: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The selected file is not valid JSON." };
  }

  if (!isPlainObject(parsed) || parsed.app !== "zen-frame" || !isPlainObject(parsed.data)) {
    return { ok: false, error: "This file does not look like a Zen Frame backup." };
  }
  if (parsed.version !== 1) {
    return { ok: false, error: "This backup uses an unsupported version." };
  }

  const entries: Array<[BackupKey, unknown]> = [];
  for (const key of BACKUP_KEYS) {
    if (!(key in parsed.data)) continue;
    const value = parsed.data[key];
    if (ARRAY_KEYS.has(key) && !Array.isArray(value)) {
      return { ok: false, error: `Invalid "${key}" data in backup.` };
    }
    if (OBJECT_KEYS.has(key) && !isPlainObject(value)) {
      return { ok: false, error: `Invalid "${key}" data in backup.` };
    }
    if (STRING_KEYS.has(key) && typeof value !== "string") {
      return { ok: false, error: `Invalid "${key}" data in backup.` };
    }
    entries.push([key, value]);
  }

  // Keep the current values so a write that fails partway can be rolled back
  const previous = BACKUP_KEYS.map(key => [key, localStorage.getItem(key)] as const);
  const restoredKeys = new Set(entries.map(([key]) => key));
  try {
    for (const key of BACKUP_KEYS) {
      if (!restoredKeys.has(key)) localStorage.removeItem(key);
    }
    for (const [key, value] of entries) {
      localStorage.setItem(key, STRING_KEYS.has(key) ? value as string : JSON.stringify(value));
    }
  } catch {
    for (const key of BACKUP_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {
        // Best effort if storage is unavailable
      }
    }
    for (const [oldKey, oldValue] of previous) {
      if (oldValue === null) continue;
      try {
        localStorage.setItem(oldKey, oldValue);
      } catch {
        // Best effort: the old value fit before, so this rarely fails
      }
    }
    return { ok: false, error: "Your browser storage is full. Nothing was restored." };
  }

  return { ok: true, count: entries.length };
}
