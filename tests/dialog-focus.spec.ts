import { test, expect } from '@playwright/test';

test('Quick Add traps Tab focus and closes on Escape even after focus leaves controls', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'New task or cluster (N)' }).first();
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'New task' });
  const taskTab = dialog.getByRole('button', { name: 'Task', exact: true });
  const nameInput = dialog.getByLabel('Task name');
  const cancel = dialog.getByRole('button', { name: 'Cancel' });

  await expect(dialog).toBeVisible();
  await expect(nameInput).toBeFocused();

  await taskTab.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(taskTab).toBeFocused();

  await dialog.getByRole('heading', { name: 'New task' }).click();
  await page.keyboard.press('Tab');
  await expect(taskTab).toBeFocused();

  await dialog.getByRole('heading', { name: 'New task' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Schedule Add and Edit block modals trap Tab focus and restore focus on Escape', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 20, 10));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('todos', JSON.stringify([{
      id: 'task-1', todo: 'Draft roadmap', completed: false, isCluster: false, isPinned: false,
      parentId: null, createdAt: '2026-11-20T09:00:00.000Z', dueDate: '2026-11-20',
    }]));
    localStorage.setItem('scheduledItems', JSON.stringify([{
      id: 'block-1', taskId: 'task-1', date: '2026-11-20', startTimeMinutes: 600, endTimeMinutes: 660,
    }]));
    localStorage.setItem('activeTab', 'schedule');
  });
  await page.goto('/');

  // Add block modal
  const addOpener = page.getByRole('button', { name: 'Add block' });
  await addOpener.click();

  const addDialog = page.getByRole('dialog', { name: 'Plan a block' });
  const addClose = addDialog.getByRole('button', { name: 'Close', exact: true });
  const addCancel = addDialog.getByRole('button', { name: 'Cancel', exact: true });
  const search = addDialog.getByLabel('Task or cluster');

  await expect(addDialog).toBeVisible();
  await expect(search).toBeFocused();

  await addClose.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(addCancel).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(addClose).toBeFocused();

  await addDialog.getByRole('heading', { name: 'Plan a block' }).click();
  await page.keyboard.press('Tab');
  await expect(addClose).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(addDialog).toBeHidden();
  await expect(addOpener).toBeFocused();

  // Edit block modal
  const blockButton = page.getByRole('button', { name: /^Draft roadmap, / });
  await blockButton.press('Enter');

  const editDialog = page.getByRole('dialog', { name: 'Edit block' });
  const editClose = editDialog.getByRole('button', { name: 'Close', exact: true });
  const editSave = editDialog.getByRole('button', { name: 'Save', exact: true });

  await expect(editDialog).toBeVisible();
  await expect(editClose).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(editSave).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(editClose).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(editDialog).toBeHidden();
  await expect(blockButton).toBeFocused();
});

test('Feedback dialog traps Tab focus and restores focus on Escape', async ({ page }) => {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Send feedback' });
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Send feedback' });
  const close = dialog.getByRole('button', { name: 'Close feedback' });
  const message = dialog.locator('#feedback-message');
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });

  await expect(dialog).toBeVisible();
  await expect(message).toBeFocused();

  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await dialog.getByRole('heading', { name: 'Send feedback' }).click();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
