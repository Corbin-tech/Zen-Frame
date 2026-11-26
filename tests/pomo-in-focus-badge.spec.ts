import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('In focus badge follows the active Pomodoro task for default task and after Undo', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded_in_focus')) {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem('__seeded_in_focus', '1');
      localStorage.setItem('todos', JSON.stringify([
        { id: 'task-1', todo: 'Draft release notes', completed: false, parentId: null, createdAt: '2026-11-23T01:00:00.000Z' },
        { id: 'task-2', todo: 'Review pull requests', completed: false, parentId: null, createdAt: '2026-11-23T01:01:00.000Z' },
      ]));
      localStorage.setItem('activeTab', 'pomodoro');
    }
  });

  await page.goto('/');
  await page.clock.pauseAt(Date.now() + 60_000);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(3000);
  await page.clock.resume();

  const tmRow1 = page.locator('#item-task-1');
  const tmRow2 = page.locator('#item-task-2');
  const boardCard1 = page.getByRole('listitem', { name: 'Draft release notes. Press [ or ] to move it.', exact: true });
  const boardCard2 = page.getByRole('listitem', { name: 'Review pull requests. Press [ or ] to move it.', exact: true });

  // Running on the default task (selectedTaskId === null) should still show "In focus"
  await openView(page, 'taskmanager');
  await expect(tmRow1).toBeVisible();
  await expect(tmRow1.getByText('In focus', { exact: true })).toBeVisible();
  await expect(tmRow2.getByText('In focus', { exact: true })).toBeHidden();

  await openView(page, 'board');
  await expect(boardCard1).toBeVisible();
  await expect(boardCard1.getByText('In focus', { exact: true })).toBeVisible();
  await expect(boardCard2.getByText('In focus', { exact: true })).toBeHidden();

  // Switch focus to the second task, then Undo — badge and selectedTaskId should return to the first task
  await page.evaluate(() => (window as any).Alpine.store('pomoState').startFocus('task-2'));
  await expect(boardCard2.getByText('In focus', { exact: true })).toBeVisible();
  await expect(boardCard1.getByText('In focus', { exact: true })).toBeHidden();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(boardCard1.getByText('In focus', { exact: true })).toBeVisible();
  await expect(boardCard2.getByText('In focus', { exact: true })).toBeHidden();

  await openView(page, 'taskmanager');
  await expect(tmRow1.getByText('In focus', { exact: true })).toBeVisible();
  await expect(tmRow2.getByText('In focus', { exact: true })).toBeHidden();

  // Verify selectedTaskId was restored so resetting the timer does not jump to task-2
  expect(await page.evaluate(() => {
    const pomo = (window as any).Alpine.store('pomoState');
    pomo.resetTimer();
    return { selectedTaskId: pomo.selectedTaskId, activeTaskId: pomo.activeTaskId };
  })).toEqual({ selectedTaskId: null, activeTaskId: 'task-1' });
});
