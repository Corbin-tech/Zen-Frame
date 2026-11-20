import { test, expect } from '@playwright/test';

test('weekly check-in labels the live goals count as current progress', async ({ page }) => {
  await page.goto('/');
  await page.locator('button[data-tab="goals"]').click();
  await page.getByRole('textbox', { name: 'New goal', exact: true }).fill('Finish certification');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  const checkIn = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Weekly check-in', exact: true }),
  });
  const progressLabel = checkIn.getByText('current goal progress', { exact: true });
  const progressCard = progressLabel.locator('..');
  await expect(progressCard.getByText('0/1', { exact: true })).toBeVisible();

  await checkIn.getByRole('button', { name: 'Previous week' }).click();
  const thisWeek = checkIn.getByRole('button', { name: 'This week', exact: true });
  await expect(thisWeek).toBeEnabled();
  await expect(progressCard.getByText('0/1', { exact: true })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Mark Finish certification reached', exact: true }).check();
  await expect(thisWeek).toBeEnabled();
  await expect(progressCard.getByText('1/1', { exact: true })).toBeVisible();
});
