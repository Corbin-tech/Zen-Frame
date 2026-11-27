import { test, expect } from '@playwright/test';

for (const width of [320, 390, 1280]) {
  test(`Board WIP limit popover stays on screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('board-wip-popover-seeded')) return;
      sessionStorage.setItem('board-wip-popover-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'board');
    });
    await page.goto('/');

    const column = page.locator('.board-column').nth(1);
    await expect(column).toBeVisible();
    await column.evaluate(el => el.scrollIntoView({ inline: 'start', block: 'nearest' }));

    const trigger = column.getByRole('button', { name: 'Set a limit for In progress', exact: true });
    await trigger.click();

    const select = column.getByLabel('Limit in progress', { exact: true });
    await expect(select).toBeVisible();
    const popover = select.locator('xpath=..');

    const popBox = (await popover.boundingBox())!;
    const scrollerBox = (await page.locator('.board-scroller').boundingBox())!;
    const colBox = (await column.boundingBox())!;
    const triggerBox = (await trigger.boundingBox())!;

    // Popover stays within the viewport and is not clipped by the board scroller
    expect(popBox.x).toBeGreaterThanOrEqual(0);
    expect(popBox.x + popBox.width).toBeLessThanOrEqual(width);
    expect(popBox.x).toBeGreaterThanOrEqual(scrollerBox.x - 0.5);
    expect(popBox.x + popBox.width).toBeLessThanOrEqual(scrollerBox.x + scrollerBox.width + 0.5);

    if (width < 640) {
      expect(popBox.x).toBeGreaterThanOrEqual(colBox.x - 0.5);
      expect(popBox.x + popBox.width).toBeLessThanOrEqual(colBox.x + colBox.width + 0.5);
    } else {
      expect(Math.abs(popBox.x - triggerBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(popBox.width - 224)).toBeLessThanOrEqual(1);
    }

    await select.selectOption('3');
    await expect(column.getByText('0 / 3', { exact: true })).toBeVisible();
  });
}
