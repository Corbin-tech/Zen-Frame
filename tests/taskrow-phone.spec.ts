import { test, expect } from '@playwright/test';

for (const width of [320, 390, 1280]) {
  test(`Tasks titles and metadata fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('taskrow-seeded')) return;
      sessionStorage.setItem('taskrow-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'taskmanager');
      localStorage.setItem('todos', JSON.stringify([
        'Read chapter 4', 'quarterlyproductstrategyfinalversion'.repeat(5), 'Buy groceries', '',
        'Pay rent', 'Practice piano', 'Ship release notes', 'Fix payment retry',
      ].map((todo, i) => ({
        id: `responsive-${i}`, todo, completed: false, isCluster: false,
        isPinned: false, parentId: null, createdAt: '2026-11-20T09:00:00.000Z',
        ...(i < 3 ? { estimateMinutes: 25, dueDate: '2026-11-25' } : {}),
        ...(i === 4 ? { dueDate: '2026-11-25' } : {}),
        ...(i === 5 ? { estimateMinutes: 25 } : {}),
        ...(i === 6 ? {
          startedAt: '2026-11-20T10:00:00.000Z',
          estimateMinutes: 25,
          dueDate: '2026-11-25',
          steps: [
            { id: 's1', text: 'Draft notes', done: true },
            { id: 's2', text: 'Publish', done: false },
          ],
        } : {}),
        ...(i === 7 ? {
          startedAt: '2026-11-20T10:00:00.000Z',
          dueDate: '2026-11-18',
          steps: [
            { id: 's3', text: 'Reproduce', done: true },
            { id: 's4', text: 'Add test', done: false },
          ],
        } : {}),
      }))));
    });
    await page.goto('/');
    const rows = page.locator('.task-item:visible');
    await expect(rows).toHaveCount(8);
    const title = rows.first().getByRole('textbox', { name: 'Task name', exact: true });
    await expect(title).toHaveValue('Read chapter 4');
    expect(await title.evaluate((el: HTMLInputElement) => {
      const style = getComputedStyle(el);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      ctx.font = style.font;
      return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        >= ctx.measureText(el.value).width;
    })).toBe(true);
    for (const row of await rows.all()) {
      expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const box = await row.getByRole('textbox', { name: 'Task name', exact: true }).boundingBox();
      const rowBox = await row.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
      for (const chip of await row.locator('button:visible, span:visible').all()) {
        const chipBox = await chip.boundingBox();
        if (!chipBox) continue;
        expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 0.5);
      }
    }
    const titleBox = await title.boundingBox();
    const estimateBox = await rows.first().getByRole('button', { name: /Change estimate/ }).boundingBox();
    if (width === 1280) {
      expect(Math.abs(titleBox!.y + titleBox!.height / 2 - estimateBox!.y - estimateBox!.height / 2)).toBeLessThan(2);
    } else {
      expect(estimateBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
      const titlePadding = await title.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
      expect(estimateBox!.x).toBe(titleBox!.x + titlePadding);
      if (width === 390) {
        const rowBox = await rows.first().boundingBox();
        expect(rowBox!.y + rowBox!.height - estimateBox!.y - estimateBox!.height).toBe(12);
      }
      for (const index of [4, 5]) {
        const row = rows.nth(index);
        const editor = row.getByRole('textbox', { name: 'Task name', exact: true });
        const editorBox = await editor.boundingBox();
        const padding = await editor.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
        const chip = index === 4
          ? row.getByRole('button', { name: /Change due date/ })
          : row.getByRole('button', { name: /Change estimate/ });
        const chipBox = await chip.boundingBox();
        expect(chipBox!.x).toBe(editorBox!.x + padding);
      }
    }
  });
}
