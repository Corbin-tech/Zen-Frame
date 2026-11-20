import { test, expect } from '@playwright/test';

for (const populated of [true, false]) {
  test(`phone dashboard details wrap with ${populated ? 'a long next task' : 'no tasks'}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.clock.setFixedTime(new Date(2026, 10, 20, 10));
    await page.addInitScript((populated) => {
      if (sessionStorage.getItem('dashboard-seeded')) return;
      sessionStorage.setItem('dashboard-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'dashboard');
      localStorage.setItem('todos', JSON.stringify(populated ? [{
        id: 'task', todo: 'Review quarterlyproductstrategyfinalv2.pdf with the design team',
        completed: false, isCluster: false, isPinned: false, parentId: null,
        createdAt: '2026-11-20T09:00:00.000Z', dueDate: '2026-11-19',
      }] : []));
      localStorage.setItem('scheduledItems', JSON.stringify(populated ? [{
        id: 'block', taskId: 'task', date: '2026-11-20', startTimeMinutes: 900, endTimeMinutes: 960,
      }] : []));
      localStorage.setItem('planning', '{}');
    }, populated);
    await page.goto('/');
    const dashboard = page.locator('[x-data="dashboard"]:visible');
    const details = dashboard.locator('[x-text="tile.detail"]');
    await expect(details).toHaveCount(4);
    await expect(details.last()).toHaveText('0 sessions in the last 7 days');
    await expect(details.nth(2)).toHaveText(populated
      ? 'Next: Review quarterlyproductstrategyfinalv2.pdf with the design team at 3:00 PM'
      : 'No blocks yet');
    for (const detail of await details.all()) {
      await expect(detail).toBeVisible();
      expect(await detail.evaluate(el => ({
        fits: el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
        overflow: getComputedStyle(el).textOverflow,
        contained: el.getBoundingClientRect().right <= el.closest('button')!.getBoundingClientRect().right,
      }))).toEqual({ fits: true, overflow: 'clip', contained: true });
    }
    const tiles = dashboard.locator('[x-for="tile in tiles"]').locator('..').locator('button');
    const boxes = await tiles.evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()));
    expect(boxes[0].height).toBe(boxes[1].height);
    expect(boxes[2].height).toBe(boxes[3].height);

    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const detail of await details.all()) {
      expect(await detail.evaluate(el => getComputedStyle(el).textOverflow)).toBe('ellipsis');
      expect(await detail.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');
    }
  });
}
