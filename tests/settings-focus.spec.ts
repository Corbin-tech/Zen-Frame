import { test, expect } from '@playwright/test';

test('keyboard focus stays inside the open Settings panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).first().click();
  const panel = page.getByRole('dialog', { name: 'Settings' });
  const close = panel.getByRole('button', { name: 'Close settings' });
  const reset = panel.getByRole('button', { name: 'Reset to defaults' });
  await expect(close).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(reset).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await panel.getByRole('heading', { name: 'Settings' }).click();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open settings' }).first()).toBeFocused();
});
