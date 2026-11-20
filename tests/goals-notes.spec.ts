import { test, expect } from '@playwright/test';

test('saved multiline note is fully visible after reloading and opening Goals', async ({ page }) => {
  await page.goto('/');
  const goals = page.locator('button[data-tab="goals"]');
  await goals.click();
  const text = 'Prepare for the next milestone\nReview the plan with the team\nCelebrate our progress';
  await page.getByRole('textbox', { name: 'New note', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Note', exact: true });
  await expect(note).toHaveValue(text);
  await page.locator('button[data-tab="dashboard"]').click();
  await page.reload();
  await goals.click();
  await expect(note).toHaveValue(text);
  await expect(page.getByRole('heading', { name: 'Goals & check-ins' })).toBeVisible();
  await expect(note).toBeVisible();
  await expect.poll(() => note.evaluate(el => el.clientHeight)).toBeGreaterThan(0);
  await expect.poll(() => note.evaluate(el => el.clientHeight >= el.scrollHeight)).toBe(true);

  await note.fill('A shorter note');
  await note.blur();
  await expect.poll(() => note.evaluate(el => el.clientHeight >= el.scrollHeight)).toBe(true);
  await note.fill('');
  await note.blur();
  await expect(note).toHaveCount(0);
  await page.getByRole('textbox', { name: 'New note', exact: true }).fill('   ');
  await expect(page.getByRole('button', { name: 'Add note', exact: true })).toBeDisabled();
});
