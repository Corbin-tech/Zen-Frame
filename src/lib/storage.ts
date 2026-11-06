// Reads a saved JSON value. A missing or unreadable value gives the fallback,
// so one bad entry can't stop the app from loading.
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    console.error(`Could not read "${key}" from storage; starting empty.`);
    return fallback;
  }
}
