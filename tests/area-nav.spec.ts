import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('an area button shows its views and reopens the view last open there', async ({ page }) => {
  await page.goto('/');
  const library = page.locator('button[data-area="library"]');
  const today = page.locator('button[data-area="today"]');

  await library.click();
  await expect(library).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('button[data-tab="taskmanager"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('button[data-tab="dashboard"]')).toBeHidden();

  await page.locator('button[data-tab="goals"]').click();
  await today.click();
  await expect(page.locator('button[data-tab="dashboard"]')).toHaveAttribute('aria-current', 'page');
  await library.click();
  await expect(page.locator('button[data-tab="goals"]')).toHaveAttribute('aria-current', 'page');

  // Only one control in the top bar says it is the current page
  await expect(page.locator('header [aria-current="page"]')).toHaveCount(1);

  // A footer area link opens that area too
  await page.locator('footer').getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.locator('button[data-tab="zenmode"]')).toHaveAttribute('aria-current', 'page');
});

test('below 360px a dot on Focus shows a running or paused timer', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  const focus = page.locator('button[data-area="focus"]');
  const chip = page.getByRole('button', { name: /^Pomodoro timer (running|paused)/ });

  await expect(focus).toHaveAccessibleName('Focus');
  await openView(page, 'pomodoro');
  await page.evaluate(() => (window as any).Alpine.store('pomoState').startTimer());
  await expect(focus).toHaveAccessibleName(/^Focus ?, timer running$/);
  await expect(chip).toBeHidden();
  // Pausing before the first tick resets to idle, so wait until the session has started
  await expect.poll(() => page.evaluate(() => (window as any).Alpine.store('pomoState').started), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => (window as any).Alpine.store('pomoState').pauseTimer());
  await expect(focus).toHaveAccessibleName(/^Focus ?, timer paused$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.setViewportSize({ width: 375, height: 700 });
  await expect(chip).toBeVisible();
  await expect(focus).toHaveAccessibleName('Focus');
});
