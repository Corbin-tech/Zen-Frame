const synced = new WeakMap<{ value: string }, string>();

// Sync a store value into an input/textarea without overwriting an unsaved draft.
export function syncDraft(el: { value: string }, value: string): void {
  const previous = synced.get(el);
  if (previous === undefined || el.value === previous) el.value = value;
  synced.set(el, value);
}

// Re-sync on blur so undoing a draft (which fires no change event) catches up to remote edits.
export function resetDraft(el: { value: string }, value: string): void {
  el.value = value;
  synced.set(el, value);
}
