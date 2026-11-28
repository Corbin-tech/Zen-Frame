import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('single completion uses singular count labels across views', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('count-labels-seeded')) return;
    localStorage.clear();
    localStorage.setItem('todos', JSON.stringify([{ id: 'single', todo: 'Ship a feature', completed: true, completedAt: new Date().toISOString(), isCluster: false }]));
    localStorage.setItem('scheduledItems', '[]');
    localStorage.setItem('planning', '{}');
    localStorage.setItem('settings', JSON.stringify({ dashboardLayout: { top: ['stats'], main: ['plan', 'clusters', 'completed'], side: ['streak'] } }));
    localStorage.setItem('activeTab', 'dashboard');
    sessionStorage.setItem('count-labels-seeded', 'true');
  });
  await page.goto('/');
  await openView(page, 'insights');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByText('Last 26 weeks · 1 active day', { exact: true })).toBeVisible();
  await expect(page.getByText('1 task in the last 30 days', { exact: true })).toBeVisible();
  await openView(page, 'dashboard');
  // A saved layout with the retired Streak widget loads the "This month" totals in its place
  const month = page.locator('[x-data="dashboard"]:visible section').filter({ has: page.getByRole('heading', { name: 'This month', exact: true }) });
  await expect(month.locator('dt', { hasText: 'Days active' }).locator('+ dd')).toHaveText('1');
  await expect(month.locator('dt', { hasText: 'Tasks finished' }).locator('+ dd')).toHaveText('1');
  await expect(month).not.toContainText(/streak|in a row|longest/i);
  await openView(page, 'board');
  await expect(page.getByRole('region', { name: 'Done, 1 task', exact: true })).toBeVisible();
});
