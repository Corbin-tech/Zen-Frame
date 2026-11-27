import { test, expect } from '@playwright/test';

for (const width of [320, 390, 1280]) {
  test(`Cluster header names stay readable and controls fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('cluster-header-seeded')) return;
      sessionStorage.setItem('cluster-header-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'taskmanager');
      localStorage.setItem('todos', JSON.stringify([
        {
          id: 'c1', todo: 'Deep Work & Engineering', completed: false, isCluster: true,
          isPinned: true, color: 'teal', parentId: null, createdAt: '2026-11-20T09:00:00.000Z',
        },
        {
          id: 't1', todo: 'Refactor cluster header layout', completed: false, isCluster: false,
          isPinned: false, parentId: 'c1', estimateMinutes: 25, createdAt: '2026-11-20T09:01:00.000Z',
        },
        {
          id: 't2', todo: 'Verify 320px screenshot', completed: true, isCluster: false,
          isPinned: false, parentId: 'c1', createdAt: '2026-11-20T09:02:00.000Z',
        },
        {
          id: 'c2', todo: 'Personal Admin', completed: false, isCluster: true,
          isPinned: false, color: 'amber', parentId: null, createdAt: '2026-11-20T09:03:00.000Z',
        },
        {
          id: 't3', todo: 'Book dentist appointment', completed: false, isCluster: false,
          isPinned: false, parentId: 'c2', createdAt: '2026-11-20T09:04:00.000Z',
        },
        {
          id: 'c3', todo: 'quarterlyproductstrategyfinalversion'.repeat(3), completed: false, isCluster: true,
          isPinned: false, color: 'indigo', parentId: null, createdAt: '2026-11-20T09:05:00.000Z',
        },
      ]));
    });

    await page.goto('/');
    const headers = page.locator('.cluster-card .group\\/header:visible');
    await expect(headers).toHaveCount(3);

    const deepWorkInput = headers.nth(0).getByRole('textbox', { name: 'Cluster name', exact: true });
    const personalInput = headers.nth(1).getByRole('textbox', { name: 'Cluster name', exact: true });
    await expect(deepWorkInput).toHaveValue('Deep Work & Engineering');
    await expect(personalInput).toHaveValue('Personal Admin');

    // "Personal Admin" must fit without horizontal clipping even at 320px
    expect(await personalInput.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth)).toBe(true);

    // "Deep Work & Engineering" gets at least 170px at 320px and fits completely at 390px and 1280px
    if (width === 320) {
      expect(await deepWorkInput.evaluate((el: HTMLInputElement) => el.clientWidth)).toBeGreaterThanOrEqual(170);
    } else {
      expect(await deepWorkInput.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }

    for (const header of await headers.all()) {
      expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const headerBox = await header.boundingBox();
      const inputBox = await header.getByRole('textbox', { name: 'Cluster name', exact: true }).boundingBox();
      expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width + 0.5);

      for (const control of await header.locator('button:visible, span:visible').all()) {
        const box = await control.boundingBox();
        if (!box) continue;
        expect(box.x + box.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width + 0.5);
      }
    }

    const firstHeader = headers.first();
    const titleBox = await deepWorkInput.boundingBox();
    const pinBox = await firstHeader.getByRole('button', { name: /pin this cluster/i }).boundingBox();
    const upBox = await firstHeader.getByRole('button', { name: 'Move cluster up' }).boundingBox();
    const downBox = await firstHeader.getByRole('button', { name: 'Move cluster down' }).boundingBox();
    const deleteBox = await firstHeader.getByRole('button', { name: 'Delete cluster' }).boundingBox();

    if (width === 1280) {
      const titleMid = titleBox!.y + titleBox!.height / 2;
      expect(Math.abs(titleMid - (pinBox!.y + pinBox!.height / 2))).toBeLessThan(2);
      expect(Math.abs(titleMid - (deleteBox!.y + deleteBox!.height / 2))).toBeLessThan(2);
      // Up and down remain stacked vertically on desktop
      expect(downBox!.y).toBeGreaterThan(upBox!.y);
    } else {
      // Actions wrap below the title row on narrow phone viewports
      expect(pinBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height - 2);
      expect(deleteBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height - 2);
      // Up and down sit side-by-side on the action row to keep header height compact
      expect(Math.abs((upBox!.y + upBox!.height / 2) - (downBox!.y + downBox!.height / 2))).toBeLessThan(2);
    }
  });
}
