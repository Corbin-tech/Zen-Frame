import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('meaningful goal cards persist why, obstacle plan, and celebration and show soft 3-goal focus guidance', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'goals');

  for (const title of ['Pass Network+', 'Write thesis outline', 'Run a 5k']) {
    await page.getByRole('textbox', { name: 'New goal', exact: true }).fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await expect(page.getByText('3 of 3 in focus', { exact: true })).toBeVisible();

  await page.getByRole('textbox', { name: 'New goal', exact: true }).fill('Learn piano basics');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('4 active goals. Keeping 3 in focus makes starting easier.', { exact: true })).toBeVisible();

  // Fill meaningful fields on the first goal
  await page.getByRole('button', { name: 'Add notes & settings', exact: true }).first().click();
  await page.locator('textarea[name="goal-notes"]').first().fill('Opens doors to infrastructure roles');
  await page.locator('textarea[name="goal-obstacle"]').first().fill('If I feel tired after work, I will review 5 flashcards');
  await page.locator('input[name="goal-celebration"]').first().fill('A quiet weekend hike and coffee');
  await page.locator('input[name="goal-celebration"]').first().blur();

  await page.reload();
  await openView(page, 'goals');

  await expect(page.getByText('Opens doors to infrastructure roles')).toBeVisible();
  await page.getByRole('button', { name: 'Notes & settings', exact: true }).first().click();
  await expect(page.locator('textarea[name="goal-notes"]').first()).toHaveValue('Opens doors to infrastructure roles');
  await expect(page.locator('textarea[name="goal-obstacle"]').first()).toHaveValue('If I feel tired after work, I will review 5 flashcards');
  await expect(page.locator('input[name="goal-celebration"]').first()).toHaveValue('A quiet weekend hike and coffee');
});

test('reaching a goal shows a calm celebration card and saves to wins', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'goals');

  await page.getByRole('textbox', { name: 'New goal', exact: true }).fill('Ship v1');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Add notes & settings', exact: true }).click();
  await page.locator('input[name="goal-celebration"]').fill('Dinner with friends');
  await page.locator('input[name="goal-celebration"]').blur();

  await page.getByRole('checkbox', { name: 'Mark Ship v1 reached', exact: true }).check();

  const banner = page.getByRole('status').filter({ hasText: 'Goal reached' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Ship v1');
  await expect(banner).toContainText('Dinner with friends');

  await banner.getByRole('button', { name: 'Save to wins', exact: true }).click();
  await expect(banner.getByText('Saved to wins', { exact: true })).toBeVisible();
  // The Close the day dialog also lists today's wins (hidden until opened), so match only visible text
  await expect(page.getByText('Reached goal: Ship v1 — Dinner with friends').filter({ visible: true }).first()).toBeVisible();
});

test('quiet daily wins persist, surface in weekly check-in, and work from the optional Dashboard widget', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'goals');

  await page.getByRole('textbox', { name: "Today's win", exact: true }).fill('Finished chapter 3 without distractions');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Finished chapter 3 without distractions').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Logged this week (1)', { exact: true })).toBeVisible();

  await page.getByLabel('What went well this week?').fill('Kept mornings calm');
  await page.getByRole('button', { name: 'Add to check-in', exact: true }).click();
  await expect(page.getByLabel('What went well this week?')).toHaveValue('Kept mornings calm\n- Finished chapter 3 without distractions');

  // Clicking again does not duplicate the same win line
  await page.getByRole('button', { name: 'Add to check-in', exact: true }).click();
  await expect(page.getByLabel('What went well this week?')).toHaveValue('Kept mornings calm\n- Finished chapter 3 without distractions');

  // Add optional Daily win widget on Dashboard
  await openView(page, 'dashboard');
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  const winOption = page.locator('li').filter({ hasText: 'Daily win' });
  await winOption.getByRole('button', { name: 'Add to side', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await page.getByRole('textbox', { name: "Today's win", exact: true }).fill('Went for a 20 minute walk');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Went for a 20 minute walk').filter({ visible: true }).first()).toBeVisible();
});
