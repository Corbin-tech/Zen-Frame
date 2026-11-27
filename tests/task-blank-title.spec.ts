import { test, expect } from '@playwright/test';
import { openView } from './nav';

const SEEDED_TODOS = [
  { id: 't1', todo: 'Draft release notes', completed: false, isCluster: false, isPinned: false, parentId: null, createdAt: '2026-01-01T10:00:00Z' },
  { id: 't2', todo: 'Review pull request', completed: false, isCluster: false, isPinned: false, parentId: null, createdAt: '2026-01-01T11:00:00Z' },
];

test('clearing a task title reverts in Tasks and Board and keeps the task on Schedule', async ({ page }) => {
  await page.addInitScript((todos) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('todos', JSON.stringify(todos));
    localStorage.setItem('activeTab', 'taskmanager');
    sessionStorage.setItem('seeded', '1');
  }, SEEDED_TODOS);

  await page.goto('/');

  // Tasks view: empty and whitespace-only titles revert on commit
  const titleInput = page.locator('.task-item[data-task-id="t1"] input[name="task-name"]');
  await expect(titleInput).toHaveValue('Draft release notes');

  await titleInput.fill('');
  await titleInput.press('Enter');
  await expect(titleInput).toHaveValue('Draft release notes');

  await titleInput.fill('   ');
  await titleInput.blur();
  await expect(titleInput).toHaveValue('Draft release notes');

  await page.reload();
  await expect(titleInput).toHaveValue('Draft release notes');

  // Schedule still lists the task because its title was preserved
  await openView(page, 'schedule');
  await expect(page.getByTitle('Draft release notes', { exact: true })).toBeVisible();

  // Board view: clearing a card title reverts instead of saving as Untitled task
  await openView(page, 'board');
  const card = page.getByRole('listitem', { name: 'Draft release notes. Press [ or ] to move it.', exact: true });
  await card.getByText('Draft release notes', { exact: true }).dblclick();

  const editor = page.getByRole('textbox', { name: 'Task name', exact: true });
  await expect(editor).toBeFocused();
  await editor.fill('   ');
  await editor.press('Enter');

  await expect(editor).toBeHidden();
  await expect(card).toBeVisible();
  await expect(card.getByText('Draft release notes', { exact: true })).toBeVisible();
  await expect(page.getByText('Untitled task', { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(card).toBeVisible();
});
