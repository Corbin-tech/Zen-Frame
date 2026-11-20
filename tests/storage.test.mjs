import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { exportBackup, importBackup } from '../src/lib/storage.ts';

beforeEach(() => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  };
});

test('replacing an exported backup removes app keys absent from the backup', () => {
  localStorage.setItem('todos', '[{"id":"saved"}]');
  const backup = exportBackup();
  localStorage.setItem('goals', '[{"id":"new"}]');
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('unrelated', 'keep');

  assert.deepEqual(importBackup(backup), { ok: true, count: 1 });
  assert.equal(localStorage.getItem('goals'), null);
  assert.equal(localStorage.getItem('theme'), null);
  assert.equal(localStorage.getItem('todos'), '[{"id":"saved"}]');
  assert.equal(localStorage.getItem('unrelated'), 'keep');
});

test('an empty backup clears app data without touching unrelated keys', () => {
  const backup = exportBackup();
  localStorage.setItem('goals', '[]');
  localStorage.setItem('unrelated', 'keep');
  assert.deepEqual(importBackup(backup), { ok: true, count: 0 });
  assert.equal(localStorage.getItem('goals'), null);
  assert.equal(localStorage.getItem('unrelated'), 'keep');
});

test('invalid backups leave existing data untouched', () => {
  localStorage.setItem('goals', '[]');
  for (const raw of ['{', '{}', JSON.stringify({ app: 'zen-frame', version: 2, data: {} }),
    JSON.stringify({ app: 'zen-frame', version: 1, data: { todos: [], goals: 'invalid' } })]) {
    assert.equal(importBackup(raw).ok, false);
    assert.equal(localStorage.getItem('goals'), '[]');
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
  assert.equal(result.ok, false);
  assert.equal(localStorage.getItem('todos'), '["original"]');
  assert.equal(localStorage.getItem('goals'), '["new"]');
  assert.equal(localStorage.getItem('settings'), null);
});

test('a failed removal rolls back keys already removed', () => {
  localStorage.setItem('todos', '[]');
  localStorage.setItem('goals', '[]');
  const removeItem = localStorage.removeItem;
  localStorage.removeItem = key => {
    if (key === 'goals') throw new Error('Storage unavailable');
    return removeItem(key);
  };
  assert.equal(importBackup(JSON.stringify({ app: 'zen-frame', version: 1, data: {} })).ok, false);
  assert.equal(localStorage.getItem('todos'), '[]');
  assert.equal(localStorage.getItem('goals'), '[]');
});
