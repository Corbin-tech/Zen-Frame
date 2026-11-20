import { test, expect, type Page } from '@playwright/test';

const date = '2026-11-20';

async function openDashboard(page: Page, includeTask: boolean) {
  await page.clock.setFixedTime(new Date(2026, 10, 20, 10));
  await page.addInitScript(({ date, includeTask }) => {
    const todos = [
      { id: 'cluster', todo: 'Design studio', isCluster: true },
      ...(includeTask ? [{ id: 'task', todo: 'Review project brief', isCluster: false }] : []),
    ];
    localStorage.setItem('todos', JSON.stringify(todos.map(todo => ({
      ...todo, completed: false, isPinned: false, parentId: null, createdAt: `${date}T08:00:00.000Z`,
    }))));
    localStorage.setItem('scheduledItems', JSON.stringify(todos.map(({ id }, i) => ({
      id: `block-${id}`, taskId: id, date, startTimeMinutes: 480 + i * 30, endTimeMinutes: 510 + i * 30,
    }))));
  }, { date, includeTask });
  await page.goto('/');
}

test('expired task blocks are not finished until checked off', async ({ page }) => {
  await openDashboard(page, true);
  const planned = page.getByRole('button', { name: /^Planned today:/ });
  const plan = page.locator('section').filter({ has: page.getByRole('heading', { name: "Today's plan" }) });
  const task = plan.getByRole('listitem').filter({ hasText: 'Review project brief' });
  const done = task.getByRole('checkbox', { name: 'Mark Review project brief done' });

  await expect(task.getByText('Ended', { exact: true })).toBeVisible();
  await expect(done).not.toBeChecked();
  await expect(planned).toContainText('Ended with tasks left');
  await expect(plan.getByText('2 blocks · 1h · 0 of 1 done', { exact: true })).toBeVisible();

  await done.check();
  await expect(task.getByText('Ended', { exact: true })).toBeHidden();
  await expect(planned).toContainText('All tasks done');
  await expect(plan.getByText('2 blocks · 1h · 1 of 1 done', { exact: true })).toBeVisible();
});

test('cluster-only blocks can end without contributing a done count', async ({ page }) => {
  await openDashboard(page, false);
  const planned = page.getByRole('button', { name: /^Planned today:/ });
  const plan = page.locator('section').filter({ has: page.getByRole('heading', { name: "Today's plan" }) });

  await expect(plan.getByText('Ended', { exact: true })).toBeVisible();
  await expect(plan.getByRole('checkbox')).toHaveCount(0);
  await expect(planned).toContainText('All blocks ended');
  await expect(plan.getByText('1 block · 30m', { exact: true })).toBeVisible();
});
