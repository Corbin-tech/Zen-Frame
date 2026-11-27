import { test, expect } from '@playwright/test';

for (const populated of [true, false]) {
  test(`phone insights KPI subtitles wrap with ${populated ? 'trend data' : 'no activity'}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.clock.setFixedTime(new Date(2026, 10, 22, 12));
    await page.addInitScript((populated) => {
      if (sessionStorage.getItem('insights-tiles-seeded')) return;
      sessionStorage.setItem('insights-tiles-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'insights');
      localStorage.setItem('insightsRange', '30d');
      localStorage.setItem('todos', JSON.stringify(populated ? [
        {
          id: 't1', todo: 'Draft launch brief', completed: true, isCluster: false, isPinned: false,
          parentId: null, createdAt: '2026-10-10T09:00:00.000Z', completedAt: '2026-10-12T12:00:00.000Z', dueDate: '2026-10-15',
        },
        {
          id: 't2', todo: 'Review analytics', completed: true, isCluster: false, isPinned: false,
          parentId: null, createdAt: '2026-11-20T09:00:00.000Z', completedAt: '2026-11-21T12:00:00.000Z', dueDate: '2026-11-22',
        },
        {
          id: 't3', todo: 'Ship polish pass', completed: true, isCluster: false, isPinned: false,
          parentId: null, createdAt: '2026-11-21T09:00:00.000Z', completedAt: '2026-11-22T10:00:00.000Z', dueDate: '2026-11-22',
        },
      ] : []));
      localStorage.setItem('pomoSessions', JSON.stringify(populated ? [
        { completedAt: '2026-10-12T12:00:00.000Z', minutes: 25 },
        { completedAt: '2026-11-21T12:00:00.000Z', minutes: 50 },
        { completedAt: '2026-11-22T10:00:00.000Z', minutes: 25 },
      ] : []));
    }, populated);

    await page.goto('/');
    const insights = page.locator('[x-data="insights"]:visible');
    const tileGrid = insights.locator('[x-for="tile in view.tiles"]').locator('..');
    const tiles = tileGrid.locator('> div');
    const details = tileGrid.locator('[x-text="tile.detail"]');

    await expect(tiles).toHaveCount(4);
    await expect(details).toHaveCount(4);
    if (populated) {
      await expect(details.nth(0)).toHaveText('100% more than the 30 days before');
      await expect(details.nth(1)).toHaveText('200% more than the 30 days before');
      await expect(details.nth(2)).toHaveText('With a finished task or focus');
      await expect(details.nth(3)).toHaveText('About 38m each');
    } else {
      await expect(details.nth(0)).toHaveText('Nothing logged yet');
      await expect(details.nth(1)).toHaveText('Nothing logged yet');
      await expect(details.nth(2)).toHaveText('Any small step counts');
      await expect(details.nth(3)).toHaveText('Start one from Timer');
    }

    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const detail of await details.all()) {
        await expect(detail).toBeVisible();
        expect(await detail.evaluate(el => {
          const tile = el.closest('.panel')!;
          return {
            fits: el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight,
            overflow: getComputedStyle(el).textOverflow,
            contained: el.getBoundingClientRect().right <= tile.getBoundingClientRect().right,
          };
        })).toEqual({ fits: true, overflow: 'clip', contained: true });
      }
      const boxes = await tiles.evaluateAll(els => els.map(el => el.getBoundingClientRect().toJSON()));
      expect(boxes[0].height).toBe(boxes[1].height);
      expect(boxes[2].height).toBe(boxes[3].height);
      expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 1280, height: 1000 });
    for (const detail of await details.all()) {
      expect(await detail.evaluate(el => getComputedStyle(el).textOverflow)).toBe('ellipsis');
      expect(await detail.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap');
    }
  });
}
