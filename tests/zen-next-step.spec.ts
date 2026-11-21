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

  // Before the first tick the timer still counts as not started, and the button says "Begin focus"
  await expect.poll(() => page.evaluate(() => (window as any).Alpine.store('pomoState').started)).toBe(true);
  await zen.getByRole('button', { name: 'Pause' }).click();
  await zen.getByRole('button', { name: 'Resume' }).click();
  await expect(zen.getByRole('button', { name: 'Pause' })).toBeVisible();
});
