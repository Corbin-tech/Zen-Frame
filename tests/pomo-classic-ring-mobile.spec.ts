import { test, expect } from '@playwright/test';

for (const width of [320, 390, 1280]) {
  test(`Pomodoro Classic ring fits inside card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('pomo-ring-mobile-seeded')) return;
      sessionStorage.setItem('pomo-ring-mobile-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'pomodoro');
      localStorage.setItem('todos', JSON.stringify([
        {
          id: 't1',
          todo: 'Finalize release notes',
          completed: false,
          isCluster: false,
          isPinned: false,
          parentId: null,
          createdAt: '2026-11-20T09:00:00.000Z',
        },
      ]));
    });
    await page.goto('/');

    const ring = page.getByRole('progressbar', { name: 'Pomodoro progress' });
    await expect(ring).toBeVisible();

    const panel = ring.locator('xpath=ancestor::div[contains(@class, "panel")][1]');
    const ringWrapper = ring.locator('xpath=..');
    const digits = ringWrapper.getByText('25:00', { exact: true });
    const statusLabel = ringWrapper.getByText(/Next:/);

    const panelBox = (await panel.boundingBox())!;
    const ringBox = (await ring.boundingBox())!;
    const digitsBox = (await digits.boundingBox())!;
    const statusBox = (await statusLabel.boundingBox())!;

    const { paddingLeft, paddingRight, scrollWidth, clientWidth } = await panel.evaluate(el => {
      const style = getComputedStyle(el);
      return {
        paddingLeft: parseFloat(style.paddingLeft),
        paddingRight: parseFloat(style.paddingRight),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    });

    const contentLeft = panelBox.x + paddingLeft;
    const contentRight = panelBox.x + panelBox.width - paddingRight;

    // Card does not overflow horizontally
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Ring stays square and fits completely inside the card's padded content box
    expect(Math.abs(ringBox.width - ringBox.height)).toBeLessThanOrEqual(1);
    expect(ringBox.x).toBeGreaterThanOrEqual(contentLeft - 0.5);
    expect(ringBox.x + ringBox.width).toBeLessThanOrEqual(contentRight + 0.5);

    // Ring keeps its full 288px (18rem) diameter whenever the card has room
    if (width >= 390) {
      expect(Math.abs(ringBox.width - 288)).toBeLessThanOrEqual(1);
    } else {
      expect(ringBox.width).toBeLessThanOrEqual(288.5);
    }

    // Inner digits and status label stay inside the minute-tick inner circle (r = 36% of ring width)
    const innerDiameter = ringBox.width * 0.72;
    expect(digitsBox.width).toBeLessThan(innerDiameter);
    expect(statusBox.width).toBeLessThan(innerDiameter);
  });
}
