import { test, expect } from '@playwright/test';
import { openView } from './nav';

// Saved data that is valid JSON but the wrong shape must not break the page.
// A store that cannot read its data starts from defaults, and the rest still work.
test('wrong-shaped saved data keeps the app usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('settings', 'null');
    localStorage.setItem('notes', '[null, 7, "x"]');
    sessionStorage.setItem('seeded', '1');
  });
  await page.goto('/');

  await openView(page, 'pomodoro');
  await expect(page.getByRole('button', { name: /start/i }).first()).toBeVisible();
  await openView(page, 'goals');
  await expect(page.getByRole('textbox', { name: 'New goal', exact: true })).toBeVisible();
  await openView(page, 'taskmanager');
  expect(errors).toEqual([]);
});
