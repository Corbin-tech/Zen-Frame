import { test, expect, type Page } from '@playwright/test';
import { openView } from './nav';

// The /principles promises: no streak counters, no lateness scores, and "carried over"
// instead of "past due". These checks keep the copy honest across views.

const PRESSURE = /past due|caught up|streak|in a row|longest ever|on time/i;

async function seed(page: Page, todos: object[], settings: object = {}) {
  await page.clock.setFixedTime(new Date(2026, 10, 22, 12));
  await page.addInitScript(({ todos, settings }) => {
    if (sessionStorage.getItem('calm-copy-seeded')) return;
    sessionStorage.setItem('calm-copy-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('todos', JSON.stringify(todos));
    localStorage.setItem('settings', JSON.stringify(settings));
    localStorage.setItem('activeTab', 'dashboard');
  }, { todos, settings });
  await page.goto('/');
}

const visibleText = (page: Page) => page.locator('main').evaluate(el => (el as HTMLElement).innerText);

test('a task from an earlier day reads as carried over in Overview, Tasks, Board and Schedule', async ({ page }) => {
  await seed(page, [
    { id: 'c1', todo: 'Biology', isCluster: true, completed: false, isPinned: false, parentId: null, createdAt: '2026-11-01T09:00:00.000Z' },
    { id: 't1', todo: 'Read chapter 4', isCluster: false, completed: false, isPinned: false, parentId: 'c1', createdAt: '2026-11-01T09:00:00.000Z', dueDate: '2026-11-21' },
    { id: 't2', todo: 'Lab write-up', isCluster: false, completed: true, isPinned: false, parentId: 'c1', createdAt: '2026-11-01T09:00:00.000Z', completedAt: '2026-11-22T10:00:00.000Z', dueDate: '2026-11-20' }
  ], { dashboardLayout: { top: ['stats'], main: ['plan'], side: ['deadlines', 'month'] } });

  const dashboard = page.locator('[x-data="dashboard"]:visible');
  await expect(dashboard.locator('header')).toContainText('1 carried over');
  await expect(dashboard.getByText('1 carried over', { exact: true })).toBeVisible();
  await expect(dashboard.getByText('Carried over', { exact: true }).first()).toBeVisible();
  expect(await visibleText(page)).not.toMatch(PRESSURE);

  await openView(page, 'taskmanager');
  await expect(page.getByRole('group', { name: 'Sort tasks' }).getByRole('button', { name: 'Carried over first' })).toBeVisible();
  await expect(page.locator('main').getByText('Carried over', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Carried over from Nov 21. Change due date' }).filter({ visible: true }).first()).toBeVisible();
  expect(await visibleText(page)).not.toMatch(PRESSURE);

  await openView(page, 'board');
  await expect(page.locator('main').getByRole('button', { name: 'Carried over first' }).filter({ visible: true })).toBeVisible();
  await expect(page.locator('main').getByText('Carried over', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  expect(await visibleText(page)).not.toMatch(PRESSURE);

  await openView(page, 'schedule');
  await expect(page.locator('main').getByText('Carried over', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  expect(await visibleText(page)).not.toMatch(PRESSURE);
});

test('Insights shows reflective totals with no streak or on-time score', async ({ page }) => {
  await seed(page, [
    { id: 't1', todo: 'Draft brief', isCluster: false, completed: true, isPinned: false, parentId: null, createdAt: '2026-11-20T09:00:00.000Z', completedAt: '2026-11-21T12:00:00.000Z', dueDate: '2026-11-20' },
    { id: 't2', todo: 'Review notes', isCluster: false, completed: true, isPinned: false, parentId: null, createdAt: '2026-11-20T09:00:00.000Z', completedAt: '2026-11-22T10:00:00.000Z', dueDate: '2026-11-25' }
  ]);
  await openView(page, 'insights');
  const tiles = page.locator('[x-data="insights"]:visible [x-text="tile.label"]');
  await expect(tiles).toHaveText(['Tasks completed', 'Focus time', 'Days active', 'Focus moments']);
  await expect(page.locator('[x-data="insights"]:visible [x-text="tile.value"]').nth(2)).toHaveText('2 days');
  expect(await visibleText(page)).not.toMatch(PRESSURE);
});

test('the empty Overview offers a clear moment, not a catch-up message', async ({ page }) => {
  await seed(page, [], { dashboardLayout: { top: ['stats'], main: ['plan'], side: ['upnext', 'month'] } });
  const upNext = page.locator('[x-data="dashboard"]:visible section').filter({ hasText: 'A clear moment' });
  await expect(upNext).toBeVisible();
  await expect(upNext).toContainText('Nothing is asking for attention.');
  await expect(page.getByText('Nothing carried over', { exact: true })).toBeVisible();
  const month = page.locator('[x-data="dashboard"]:visible section').filter({ has: page.getByRole('heading', { name: 'This month', exact: true }) });
  await expect(month).toContainText('November is just getting started. Any small step counts.');
  expect(await visibleText(page)).not.toMatch(PRESSURE);
});
