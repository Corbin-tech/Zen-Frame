import { test, expect } from '@playwright/test';

const SEED_TODOS = [
  { id: 't1', text: 'Early task', completed: true, completedAt: '2026-06-11T09:00:00.000Z', isCluster: false },
  { id: 't2', text: 'Mid task', completed: true, completedAt: '2026-06-14T14:00:00.000Z', isCluster: false },
  { id: 't3', text: 'Today task', completed: true, completedAt: '2026-06-17T11:00:00.000Z', isCluster: false },
];

const SEED_POMOS = [
  { completedAt: '2026-06-11T09:30:00.000Z', minutes: 25 },
  { completedAt: '2026-06-14T14:30:00.000Z', minutes: 45 },
  { completedAt: '2026-06-17T11:30:00.000Z', minutes: 30 },
];

const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];

test('Insights BarChart tooltips stay inside their card and viewport', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-17T12:00:00'));
  await page.addInitScript(({ todos, pomos }) => {
    localStorage.clear();
    localStorage.setItem('activeTab', 'insights');
    localStorage.setItem('todos', JSON.stringify(todos));
    localStorage.setItem('pomoSessions', JSON.stringify(pomos));
  }, { todos: SEED_TODOS, pomos: SEED_POMOS });
  await page.goto('/');

  const charts = [
    { cardHeading: 'Tasks completed', listLabel: 'Tasks completed per period' },
    { cardHeading: 'Focus time', listLabel: 'Focus minutes per period' },
    { cardHeading: 'Your rhythm', listLabel: 'Tasks completed per weekday' },
    { cardHeading: 'Your rhythm', listLabel: 'Tasks completed per hour of the day' },
  ];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);

    for (const { cardHeading, listLabel } of charts) {
      const card = page.locator('section').filter({ has: page.getByRole('heading', { name: cardHeading, exact: true }) });
      const list = card.getByRole('list', { name: listLabel, exact: true });
      const bars = list.getByRole('listitem');
      const tooltip = list.locator('..').locator('[x-show="hovered"]');
      const count = await bars.count();
      expect(count).toBeGreaterThan(2);

      const indices = [0, Math.floor(count / 2), count - 1];
      for (const index of indices) {
        const bar = bars.nth(index);
        const expectedTip = await bar.getAttribute('aria-label');
        await bar.focus();
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveText(expectedTip!);

        const cardBox = await card.boundingBox();
        const tipBox = await tooltip.boundingBox();
        expect(cardBox).not.toBeNull();
        expect(tipBox).not.toBeNull();

        const ctx = `${listLabel} bar ${index}/${count} at ${viewport.width}px`;
        expect(tipBox!.x, `card left (${ctx})`).toBeGreaterThanOrEqual(cardBox!.x);
        expect(tipBox!.x + tipBox!.width, `card right (${ctx})`).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
        expect(tipBox!.x, `viewport left (${ctx})`).toBeGreaterThanOrEqual(0);
        expect(tipBox!.x + tipBox!.width, `viewport right (${ctx})`).toBeLessThanOrEqual(viewport.width);
        expect(tipBox!.y, `card top (${ctx})`).toBeGreaterThanOrEqual(cardBox!.y);
        expect(tipBox!.y + tipBox!.height, `card bottom (${ctx})`).toBeLessThanOrEqual(cardBox!.y + cardBox!.height);
      }

      await bars.nth(count - 1).blur();
      await expect(tooltip).toBeHidden();
    }
  }

  // Also exercise pointer hover on both edge bars of Tasks completed at 320px
  await page.setViewportSize({ width: 320, height: 640 });
  const tasksCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Tasks completed', exact: true }) });
  const taskBars = tasksCard.getByRole('list', { name: 'Tasks completed per period', exact: true }).getByRole('listitem');
  const taskTip = tasksCard.locator('[x-show="hovered"]');
  const total = await taskBars.count();
  for (const index of [0, total - 1]) {
    await taskBars.nth(index).hover();
    await expect(taskTip).toBeVisible();
    const cardBox = await tasksCard.boundingBox();
    const tipBox = await taskTip.boundingBox();
    expect(tipBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    expect(tipBox!.x).toBeGreaterThanOrEqual(0);
    expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(320);
  }
});

test('Dashboard Tasks completed tooltip stays inside its card and viewport', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-17T12:00:00'));
  await page.addInitScript(({ todos }) => {
    localStorage.clear();
    localStorage.setItem('activeTab', 'dashboard');
    localStorage.setItem('todos', JSON.stringify(todos));
  }, { todos: SEED_TODOS });
  await page.goto('/');

  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Tasks completed', exact: true }) });
  const bars = card.getByRole('img');
  const tooltip = card.locator('[x-show="hoveredDay"]');
  await expect(bars).toHaveCount(7);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);

    for (const index of [0, 3, 6]) {
      await bars.nth(index).focus();
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText(/task/);

      const cardBox = await card.boundingBox();
      const tipBox = await tooltip.boundingBox();
      expect(cardBox).not.toBeNull();
      expect(tipBox).not.toBeNull();

      const ctx = `dashboard bar ${index}/7 at ${viewport.width}px`;
      expect(tipBox!.x, `card left (${ctx})`).toBeGreaterThanOrEqual(cardBox!.x);
      expect(tipBox!.x + tipBox!.width, `card right (${ctx})`).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
      expect(tipBox!.x, `viewport left (${ctx})`).toBeGreaterThanOrEqual(0);
      expect(tipBox!.x + tipBox!.width, `viewport right (${ctx})`).toBeLessThanOrEqual(viewport.width);
      expect(tipBox!.y, `card top (${ctx})`).toBeGreaterThanOrEqual(cardBox!.y);
      expect(tipBox!.y + tipBox!.height, `card bottom (${ctx})`).toBeLessThanOrEqual(cardBox!.y + cardBox!.height);
    }

    await bars.nth(6).blur();
    await expect(tooltip).toBeHidden();
  }

  // Also exercise pointer hover on both edge bars at 320px
  await page.setViewportSize({ width: 320, height: 640 });
  for (const index of [0, 6]) {
    await bars.nth(index).hover();
    await expect(tooltip).toBeVisible();
    const cardBox = await card.boundingBox();
    const tipBox = await tooltip.boundingBox();
    expect(tipBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
    expect(tipBox!.x).toBeGreaterThanOrEqual(0);
    expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(320);
  }
});
