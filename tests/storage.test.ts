import { beforeEach, expect, test } from "vitest";
import { exportBackup, importBackup } from '../src/lib/storage.ts';

beforeEach(() => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  } as unknown as Storage;
});

test('replacing an exported backup removes app keys absent from the backup', () => {
  localStorage.setItem('todos', '[{"id":"saved"}]');
  const backup = exportBackup();
  localStorage.setItem('goals', '[{"id":"new"}]');
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('unrelated', 'keep');

  expect(importBackup(backup)).toEqual({ ok: true, count: 1 });
  expect(localStorage.getItem('goals')).toBe(null);
  expect(localStorage.getItem('theme')).toBe(null);
  expect(localStorage.getItem('todos')).toBe('[{"id":"saved"}]');
  expect(localStorage.getItem('unrelated')).toBe('keep');
});

test('an empty backup clears app data without touching unrelated keys', () => {
  const backup = exportBackup();
  localStorage.setItem('goals', '[]');
  localStorage.setItem('unrelated', 'keep');
  expect(importBackup(backup)).toEqual({ ok: true, count: 0 });
  expect(localStorage.getItem('goals')).toBe(null);
  expect(localStorage.getItem('unrelated')).toBe('keep');
});

test('invalid backups leave existing data untouched', () => {
  localStorage.setItem('goals', '[]');
  for (const raw of ['{', '{}', JSON.stringify({ app: 'zen-frame', version: 2, data: {} }),
    JSON.stringify({ app: 'zen-frame', version: 1, data: { todos: [], goals: 'invalid' } })]) {
    expect(importBackup(raw).ok).toBe(false);
    expect(localStorage.getItem('goals')).toBe('[]');
  }
});

test('a failed write rolls back overwritten and removed keys', () => {
  localStorage.setItem('todos', '["original"]');
  localStorage.setItem('goals', '["new"]');
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === 'settings') throw new Error('Storage full');
    return setItem(key, value);
  };
  const result = importBackup(JSON.stringify({ app: 'zen-frame', version: 1,
    data: { todos: [], settings: {} } }));
  expect(result.ok).toBe(false);
  expect(localStorage.getItem('todos')).toBe('["original"]');
  expect(localStorage.getItem('goals')).toBe('["new"]');
  expect(localStorage.getItem('settings')).toBe(null);
});

test('a failed removal rolls back keys already removed', () => {
  localStorage.setItem('todos', '[]');
  localStorage.setItem('goals', '[]');
  const removeItem = localStorage.removeItem;
  localStorage.removeItem = key => {
    if (key === 'goals') throw new Error('Storage unavailable');
    return removeItem(key);
  };
  expect(importBackup(JSON.stringify({ app: 'zen-frame', version: 1, data: {} })).ok).toBe(false);
  expect(localStorage.getItem('todos')).toBe('[]');
  expect(localStorage.getItem('goals')).toBe('[]');
});

test('rollback frees imported values before restoring removed keys under quota', () => {
  const data = new Map<string, string>();
  localStorage.getItem = key => data.get(key) ?? null;
  localStorage.removeItem = key => { data.delete(key); };
  localStorage.setItem = (key, value) => {
    const size = [...data.entries()].reduce((total, [storedKey, storedValue]) =>
      total + (storedKey === key ? 0 : storedValue.length), value.length);
    if (size > 100) throw new Error('Quota exceeded');
    data.set(key, value);
  };
  localStorage.setItem('todos', '["original"]');
  localStorage.setItem('settings', '{}');
  localStorage.setItem('unrelated', 'keep');
  const previous = new Map(data);

  const result = importBackup(JSON.stringify({ app: 'zen-frame', version: 1,
    data: { settings: { name: 'x'.repeat(80) }, theme: 'y'.repeat(20) } }));

  expect(result.ok).toBe(false);
  expect(data).toEqual(previous);
});
