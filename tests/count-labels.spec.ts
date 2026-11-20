import { test, expect } from '@playwright/test';

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
  await page.locator('button[data-tab="insights"]').click();
  await expect(page.getByText('Last 26 weeks · 1 active day', { exact: true })).toBeVisible();
  await expect(page.getByText('1 task in the last 30 days', { exact: true })).toBeVisible();
  await page.locator('button[data-tab="dashboard"]').click();
  await expect(page.getByText('In a row. Longest: 1 day.', { exact: true })).toBeVisible();
  await page.locator('button[data-tab="board"]').click();
  await expect(page.getByRole('region', { name: 'Done, 1 task', exact: true })).toBeVisible();
});
