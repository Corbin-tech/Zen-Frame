import { test, expect } from '@playwright/test';

async function seedTaskManager(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('tm-enter-seeded')) return;
    sessionStorage.setItem('tm-enter-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('activeTab', 'taskmanager');
    localStorage.setItem('todos', JSON.stringify([
      {
        id: 'task-1',
        todo: 'Draft release notes',
        completed: false,
        isCluster: false,
        isPinned: false,
        parentId: null,
        createdAt: '2026-11-20T09:00:00.000Z',
        estimateMinutes: 25,
      },
    ]));
  });
  await page.goto('/');
  await expect(page.locator('.task-item:visible')).toHaveCount(1);
}

test('Enter activates focused Task Manager buttons outside rows', async ({ page }) => {
  await seedTaskManager(page);

  // "New cluster" button opens the QuickAdd dialog in cluster mode
  const newClusterBtn = page.getByRole('button', { name: 'New cluster' });
  await newClusterBtn.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // "Add task" button submits the typed task
  await page.getByRole('textbox', { name: 'New task' }).fill('Buy coffee beans');
  const addTaskBtn = page.getByRole('button', { name: 'Add task' });
  await addTaskBtn.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.task-item:visible')).toHaveCount(2);

  // Nav tab button switches tabs on Enter
  const boardTab = page.getByRole('button', { name: /^Board/ }).first();
  await boardTab.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: "What's moving" })).toBeVisible();
});

test('Enter activates buttons inside a task row, while Enter on the row itself edits the title', async ({ page }) => {
  await seedTaskManager(page);

  const row = page.locator('.task-item:visible').first();
  const titleInput = row.getByRole('textbox', { name: 'Task name', exact: true });

  // Enter on the row itself still focuses the inline title input
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(titleInput).toBeFocused();
  await titleInput.blur();

  // Enter on a button inside the row activates that button instead of being swallowed
  const estimateBtn = row.getByRole('button', { name: /Change estimate/ });
  await estimateBtn.focus();
  await page.keyboard.press('Enter');
  await expect(estimateBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(titleInput).not.toBeFocused();
});
