import { test, expect } from '@playwright/test';

for (const width of [320, 390, 1280]) {
  test(`QuickTaskInput action buttons stay inside panel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('qti-mobile-seeded')) return;
      sessionStorage.setItem('qti-mobile-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'taskmanager');
    });
    await page.goto('/');

    const root = page.locator('[x-data="quickTaskInput"]');
    const panel = root.locator('xpath=ancestor::div[contains(@class, "panel")][1]');
    const input = page.getByRole('textbox', { name: 'New task', exact: true });
    const more = root.getByRole('button', { name: 'More options', exact: true });
    const add = root.getByRole('button', { name: 'Add task', exact: true });
    const cluster = root.getByRole('button', { name: 'New cluster', exact: true });

    await expect(cluster).toBeVisible();

    const panelBox = (await panel.boundingBox())!;
    const inputBox = (await input.boundingBox())!;
    const moreBox = (await more.boundingBox())!;
    const addBox = (await add.boundingBox())!;
    const clusterBox = (await cluster.boundingBox())!;

    const panelPaddingRight = await panel.evaluate(el => parseFloat(getComputedStyle(el).paddingRight));
    const contentRight = panelBox.x + panelBox.width - panelPaddingRight;

    for (const box of [inputBox, moreBox, addBox, clusterBox]) {
      expect(box.x).toBeGreaterThanOrEqual(panelBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(contentRight + 1);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }

    if (width === 1280) {
      const inputCenter = inputBox.y + inputBox.height / 2;
      for (const box of [moreBox, addBox, clusterBox]) {
        expect(Math.abs(box.y + box.height / 2 - inputCenter)).toBeLessThan(2);
      }
    } else {
      expect(clusterBox.y).toBeGreaterThanOrEqual(addBox.y + addBox.height);
    }
  });
}
