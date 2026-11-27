import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('finishing Close the day moves focus to Done inside the dialog, and Done returns it to the opener', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'dashboard');

  const opener = page.getByRole('button', { name: 'Close the day', exact: true }).filter({ visible: true }).first();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Close the day' });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Close the day', exact: true }).click();
  await expect(dialog.getByText('Day closed', { exact: true })).toBeVisible();
  const done = dialog.getByRole('button', { name: 'Done', exact: true });
  await expect(done).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
