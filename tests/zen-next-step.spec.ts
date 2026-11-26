import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('Begin focus in Next step starts a session for the shown task, then pauses and resumes it', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const todos = (window as any).Alpine.store('todos');
    todos.addTodo('Read chapter 4', { estimateMinutes: 10 });
  });
  await openView(page, 'zenmode');
  const zen = page.locator('[x-data="zenTodoList"]');
  await expect(zen.getByText('About 10 min')).toBeVisible();

  const focus = zen.getByRole('button', { name: 'Begin focus' });
  await focus.click();
  await expect(zen.getByRole('button', { name: 'Pause' })).toBeVisible();
  expect(await page.evaluate(() => {
    const pomo = (window as any).Alpine.store('pomoState');
    return { running: pomo.isRunning, task: pomo.focusTask?.todo };
  })).toEqual({ running: true, task: 'Read chapter 4' });

  // Wait for the first tick so the timer counts as started and pausing shows "Resume"
  await expect.poll(() => page.evaluate(() => (window as any).Alpine.store('pomoState').started), { timeout: 5000 }).toBe(true);
  await zen.getByRole('button', { name: 'Pause' }).click();
  await expect(zen.getByRole('button', { name: 'Resume' })).toBeVisible();
  await zen.getByRole('button', { name: 'Resume' }).click();
  await expect(zen.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('Next step shows No estimate yet when unestimated, and Resume only for the same paused focus task', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const todos = (window as any).Alpine.store('todos');
    todos.addTodo('Write summary');
    todos.addTodo('Review slides', { estimateMinutes: 15 });
  });
  await openView(page, 'zenmode');
  const zen = page.locator('[x-data="zenTodoList"]');

  // Unestimated task explicitly shows "No estimate yet"
  await expect(zen.getByText('No estimate yet')).toBeVisible();

  // Start and pause focus on the first task -> shows "Resume"
  await zen.getByRole('button', { name: 'Begin focus' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).Alpine.store('pomoState').started), { timeout: 5000 }).toBe(true);
  await zen.getByRole('button', { name: 'Pause' }).click();
  await expect(zen.getByRole('button', { name: 'Resume' })).toBeVisible();

  // Skipping to a different task flips "Resume" back to "Begin focus"
  await zen.getByRole('button', { name: 'Not now: skip this task' }).click();
  await expect(zen.locator('[x-ref="currentTaskTitle"]')).toHaveText('Review slides');
  await expect(zen.getByRole('button', { name: 'Begin focus' })).toBeVisible();

  // Paused during a break also shows "Begin focus", not "Resume"
  await page.evaluate(() => {
    const pomo = (window as any).Alpine.store('pomoState');
    pomo.toggleBreak(false);
    pomo.timeLeft = pomo.totalTime - 5;
  });
  await expect(zen.getByRole('button', { name: 'Begin focus' })).toBeVisible();
});
