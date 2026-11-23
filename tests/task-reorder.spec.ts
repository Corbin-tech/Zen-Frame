import { test, expect } from '@playwright/test';

const SEEDED_TODOS = [
  { id: 'done-1', todo: 'Archived draft', completed: true, isCluster: false, isPinned: false, parentId: null, createdAt: '2026-01-01T08:00:00Z', completedAt: '2026-01-01T09:00:00Z' },
  { id: 'open-1', todo: 'First open task', completed: false, isCluster: false, isPinned: false, parentId: null, createdAt: '2026-01-01T10:00:00Z' },
  { id: 'done-2', todo: 'Finished review', completed: true, isCluster: false, isPinned: false, parentId: null, createdAt: '2026-01-01T11:00:00Z', completedAt: '2026-01-01T12:00:00Z' },
  { id: 'open-2', todo: 'Second open task', completed: false, isCluster: false, isPinned: false, parentId: null, createdAt: '2026-01-01T13:00:00Z' },
  { id: 'done-3', todo: 'Old cleanup', completed: true, isCluster: false, isPinned: false, parentId: null, createdAt: '2026-01-01T14:00:00Z', completedAt: '2026-01-01T15:00:00Z' },
];

test('reordering open tasks in Task Manager skips hidden completed siblings', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await page.addInitScript((todos) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('todos', JSON.stringify(todos));
    localStorage.setItem('activeTab', 'taskmanager');
    sessionStorage.setItem('seeded', '1');
  }, SEEDED_TODOS);

  await page.goto('/');

  const inbox = page.locator('.cluster-card', { has: page.getByRole('heading', { name: 'Inbox', exact: true }) });
  const openRows = inbox.locator('.task-item:not(#done-inbox .task-item)');
  await expect(openRows).toHaveCount(2);
  await expect(openRows.nth(0)).toHaveAttribute('data-task-id', 'open-1');
  await expect(openRows.nth(1)).toHaveAttribute('data-task-id', 'open-2');

  // First open task has Move up disabled even with a completed task above it
  const firstRow = inbox.locator('.task-item[data-task-id="open-1"]');
  await firstRow.getByRole('button', { name: 'More actions for First open task' }).click();
  await expect(firstRow.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
  await expect(firstRow.getByRole('menuitem', { name: 'Move down' })).toBeEnabled();
  await page.keyboard.press('Escape');

  // Second open task has Move down disabled even with a completed task below it
  const secondRow = inbox.locator('.task-item[data-task-id="open-2"]');
  await secondRow.getByRole('button', { name: 'More actions for Second open task' }).click();
  await expect(secondRow.getByRole('menuitem', { name: 'Move down' })).toBeDisabled();
  await expect(secondRow.getByRole('menuitem', { name: 'Move up' })).toBeEnabled();

  // Clicking Move up skips the hidden completed sibling in one click
  await secondRow.getByRole('menuitem', { name: 'Move up' }).click();
  await expect(openRows.nth(0)).toHaveAttribute('data-task-id', 'open-2');
  await expect(openRows.nth(1)).toHaveAttribute('data-task-id', 'open-1');
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Moved to position 1 of 2 in Inbox' })).toBeAttached();

  // Alt+ArrowDown moves it back below First open task in one keypress
  await openRows.nth(0).focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(openRows.nth(0)).toHaveAttribute('data-task-id', 'open-1');
  await expect(openRows.nth(1)).toHaveAttribute('data-task-id', 'open-2');
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Moved to position 2 of 2 in Inbox' })).toBeAttached();
});
