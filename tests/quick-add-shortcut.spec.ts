import { test, expect, type Page } from '@playwright/test';
import { openView } from './nav';

async function pressNAndFlush(page: Page) {
  await page.keyboard.press('n');
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test('N shortcut does not open Quick Add while Settings, Recap, or Feedback is open', async ({ page }) => {
  await page.goto('/');
  const quickAdd = page.getByRole('dialog', { name: 'New task' });

  // Settings panel
  await page.getByRole('button', { name: 'Open settings' }).first().click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await pressNAndFlush(page);
  await expect(quickAdd).toBeHidden();
  await expect(settings).toBeVisible();

  // Even if focus leaves the dialog to the document body, the open dialog still blocks N
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await pressNAndFlush(page);
  await expect(quickAdd).toBeHidden();
  await expect(settings).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  // Feedback dialog (focus moved off the textarea onto Close)
  await page.getByRole('button', { name: 'Send feedback' }).click();
  const feedback = page.getByRole('dialog', { name: 'Send feedback' });
  await expect(feedback).toBeVisible();
  await feedback.getByRole('button', { name: 'Close feedback' }).focus();
  await pressNAndFlush(page);
  await expect(quickAdd).toBeHidden();
  await expect(feedback).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(feedback).toBeHidden();

  // Recap (Stillpoint) dialog
  await openView(page, 'insights');
  await page.getByRole('button', { name: 'Play Stillpoint', exact: true }).click();
  const recap = page.getByRole('dialog', { name: /Stillpoint/ });
  await expect(recap).toBeVisible();
  await pressNAndFlush(page);
  await expect(quickAdd).toBeHidden();
  await expect(recap).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(recap).toBeHidden();

  // After closing dialogs, N still opens Quick Add
  await page.keyboard.press('n');
  await expect(quickAdd).toBeVisible();
});

test('N shortcut does not open Quick Add while Schedule Add or Edit block dialog is open', async ({ page }) => {
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
  const quickAdd = page.getByRole('dialog', { name: 'New task' });

  // Add block modal (focus on Close button)
  await page.getByRole('button', { name: 'Add block' }).click();
  const addDialog = page.getByRole('dialog', { name: 'Plan a block' });
  await expect(addDialog).toBeVisible();
  await addDialog.getByRole('button', { name: 'Close', exact: true }).focus();
  await pressNAndFlush(page);
  await expect(quickAdd).toBeHidden();
  await expect(addDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(addDialog).toBeHidden();

  // Edit block modal (focus starts on Close button)
  await page.getByRole('button', { name: /^Draft roadmap, / }).press('Enter');
  const editDialog = page.getByRole('dialog', { name: 'Edit block' });
  await expect(editDialog).toBeVisible();
  await pressNAndFlush(page);
  await expect(quickAdd).toBeHidden();
  await expect(editDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editDialog).toBeHidden();

  // After closing, N works again
  await page.keyboard.press('n');
  await expect(quickAdd).toBeVisible();
});
