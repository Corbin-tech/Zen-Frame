import { test, expect } from '@playwright/test';
import { openView } from './nav';

function makeCompletions(month: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    taskId: `${month}-${i + 1}`,
    title: `Task ${i + 1}`,
    clusterId: null,
    clusterName: '',
    dueDate: null,
    at: `${month}-${String(i + 2).padStart(2, '0')}T12:00:00.000Z`,
  }));
}

async function openTasksSlide(page: import('@playwright/test').Page, currentCount: number, previousCount: number) {
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00'));
  const history = [
    ...makeCompletions('2026-09', previousCount),
    ...makeCompletions('2026-10', currentCount),
  ];
  await page.addInitScript((records) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('history', JSON.stringify(records));
  }, history);
  await page.goto('/');
  await openView(page, 'insights');
  await page.getByRole('button', { name: 'Play Stillpoint', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Stillpoint/ });
  await dialog.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByText('You got things done')).toBeVisible();
  return dialog;
}

test('Recap shows natural copy when month-over-month task delta is 0%', async ({ page }) => {
  const dialog = await openTasksSlide(page, 2, 2);
  await expect(dialog.getByText('Same as September.')).toBeVisible();
  await expect(dialog.getByText(/0% more/)).toHaveCount(0);
});

test('Recap shows more-tasks copy for positive delta', async ({ page }) => {
  const up = await openTasksSlide(page, 3, 2);
  await expect(up.getByText('That’s 50% more than September.')).toBeVisible();
});

test('Recap shows fewer-tasks copy for negative delta', async ({ page }) => {
  const down = await openTasksSlide(page, 1, 2);
  await expect(down.getByText('50% fewer than September. Rest counts too.')).toBeVisible();
});

test('Recap shows first-month copy when prior month has no tasks', async ({ page }) => {
  const first = await openTasksSlide(page, 2, 0);
  await expect(first.getByText('Your first month on the books.')).toBeVisible();
});
