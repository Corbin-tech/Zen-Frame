import { test, expect } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`Task Manager titles and metadata fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('taskrow-seeded')) return;
      sessionStorage.setItem('taskrow-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'taskmanager');
      localStorage.setItem('todos', JSON.stringify([
        'Read chapter 4', 'quarterlyproductstrategyfinalversion'.repeat(5), 'Buy groceries', '',
        'Pay rent', 'Practice piano',
      ].map((todo, i) => ({
        id: `responsive-${i}`, todo, completed: false, isCluster: false,
        isPinned: false, parentId: null, createdAt: '2026-11-20T09:00:00.000Z',
        ...(i < 3 ? { estimateMinutes: 25, dueDate: '2026-11-25' } : {}),
        ...(i === 4 ? { dueDate: '2026-11-25' } : {}),
        ...(i === 5 ? { estimateMinutes: 25 } : {}),
      }))));
    });
    await page.goto('/');
    const rows = page.locator('.task-item:visible');
    await expect(rows).toHaveCount(6);
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
    }
    const titleBox = await title.boundingBox();
    const estimateBox = await rows.first().getByRole('button', { name: /Change estimate/ }).boundingBox();
    if (width === 1280) {
      expect(Math.abs(titleBox!.y + titleBox!.height / 2 - estimateBox!.y - estimateBox!.height / 2)).toBeLessThan(2);
    } else {
      expect(estimateBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height);
      const titlePadding = await title.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
      expect(estimateBox!.x).toBe(titleBox!.x + titlePadding);
      const rowBox = await rows.first().boundingBox();
      expect(rowBox!.y + rowBox!.height - estimateBox!.y - estimateBox!.height).toBe(12);
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
