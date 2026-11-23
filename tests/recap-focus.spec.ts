import { test, expect } from '@playwright/test';

test('paused recap traps focus and preserves slide navigation and focus return', async ({ page }) => {
  await page.goto('/');
  await page.locator('button[data-tab="insights"]').click();
  const opener = page.getByRole('button', { name: 'Play Stillpoint', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: /Stillpoint/ });
  await dialog.getByRole('button', { name: 'Pause', exact: true }).click();
  const play = dialog.getByRole('button', { name: 'Play', exact: true });
  const previous = dialog.getByRole('button', { name: 'Previous slide' });
  const next = dialog.getByRole('button', { name: 'Next slide' });
  await next.focus();
  await page.keyboard.press('Tab');
  await expect(play).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(next).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('button', { name: 'Copy summary' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Watch again' }).focus();
  await page.keyboard.press('Tab');
  await expect(play).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('button', { name: 'Copy summary' })).toBeHidden();
  await previous.focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
