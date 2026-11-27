import { test, expect } from '@playwright/test';

for (const width of [320, 390, 1280]) {
  test(`Settings color scheme pills fit their labels at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Open settings' }).first().click();
    const panel = page.getByRole('dialog', { name: 'Settings' });
    const group = panel.getByRole('group', { name: 'Color scheme' });
    await expect(group).toBeVisible();
    await expect
      .poll(() => panel.evaluate(el => getComputedStyle(el).transform))
      .toBe('none');

    const buttons = group.getByRole('button');
    const count = await buttons.count();
    expect(count).toBe(9);

    const groupBox = (await group.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(groupBox.x).toBeGreaterThanOrEqual(panelBox.x);
    expect(groupBox.x + groupBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 0.5);
    expect(groupBox.x + groupBox.width).toBeLessThanOrEqual(width + 0.5);

    const rowXs = new Set<number>();
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const label = btn.locator('span').nth(1);
      const btnBox = (await btn.boundingBox())!;
      const labelBox = (await label.boundingBox())!;

      const { paddingLeft, paddingRight, scrollWidth, clientWidth } = await btn.evaluate(el => {
        const style = getComputedStyle(el);
        return {
          paddingLeft: parseFloat(style.paddingLeft),
          paddingRight: parseFloat(style.paddingRight),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        };
      });

      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
      expect(btnBox.x).toBeGreaterThanOrEqual(groupBox.x - 0.5);
      expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(groupBox.x + groupBox.width + 0.5);
      expect(labelBox.x).toBeGreaterThanOrEqual(btnBox.x + paddingLeft - 0.5);
      expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(btnBox.x + btnBox.width - paddingRight + 0.5);

      rowXs.add(Math.round(btnBox.x));
    }

    if (width >= 640) {
      expect(rowXs.size).toBe(3);
    } else {
      expect(rowXs.size).toBe(2);
    }
  });
}
