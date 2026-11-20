export function mergeLists<T>(base: T[], local: T[], remote: T[], identity: (entry: T) => string): T[] {
  const before = new Map(base.map(entry => [identity(entry), JSON.stringify(entry)]));
  const current = new Map(local.map(entry => [identity(entry), entry]));
  const merged = new Map(remote.map(entry => {
    const id = identity(entry);
    const previous = current.get(id);
    return [id, previous !== undefined && JSON.stringify(previous) === JSON.stringify(entry) ? previous : entry] as const;
  }));
  for (const id of before.keys()) {
    if (!current.has(id)) merged.delete(id);
  }
  for (const [id, entry] of current) {
    if (before.get(id) !== JSON.stringify(entry)) merged.set(id, entry);
  }
  return [...merged.values()];
}
