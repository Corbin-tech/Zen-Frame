import { test, expect } from '@playwright/test';

const WIDGET_LINKS = [
  'Open schedule →',
  'Manage →',
  'Open timer →',
  'Open goals →',
  'All notes →',
  'Insights →',
];

for (const width of [320, 390, 1280]) {
  test(`dashboard widget header links stay on one line with their arrow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date(2026, 10, 20, 10));
    await page.addInitScript(() => {
      if (sessionStorage.getItem('dashboard-header-links-seeded')) return;
      sessionStorage.setItem('dashboard-header-links-seeded', 'true');
      localStorage.clear();
      localStorage.setItem('activeTab', 'dashboard');
      localStorage.setItem('todos', JSON.stringify([
        {
          id: 'c1', todo: 'Deep Work', isCluster: true, completed: false,
          isPinned: false, parentId: null, color: '#0d9488', createdAt: '2026-11-20T08:00:00.000Z',
        },
        {
          id: 't1', todo: 'Draft architecture notes', isCluster: false, completed: false,
          isPinned: false, parentId: 'c1', createdAt: '2026-11-20T08:05:00.000Z',
        },
      ]));
      localStorage.setItem('scheduledItems', JSON.stringify([
        { id: 's1', taskId: 't1', date: '2026-11-20', startTimeMinutes: 600, endTimeMinutes: 690 },
      ]));
      localStorage.setItem('settings', JSON.stringify({
        dashboardLayout: {
          top: ['stats'],
          main: ['plan', 'clusters', 'completed'],
          // 'streak' is the retired widget id; it loads as "This month"
          side: ['focus', 'goals', 'notes', 'streak'],
        },
      }));
    });

    await page.goto('/');
    const dashboard = page.locator('[x-data="dashboard"]:visible');

    for (const label of WIDGET_LINKS) {
      const button = dashboard.getByRole('button', { name: label, exact: true });
      await expect(button).toBeVisible();

      const metrics = await button.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const range = document.createRange();
        range.selectNodeContents(el);
        const lineCount = range.getClientRects().length;
        const header = el.parentElement!;
        const headerRect = header.getBoundingClientRect();
        const headingEl = el.previousElementSibling!;
        const headingRect = headingEl.getBoundingClientRect();
        return {
          lineCount,
          height: rect.height,
          lineHeight: parseFloat(style.lineHeight),
          right: rect.right,
          left: rect.left,
          headerRight: headerRect.right,
          headingRight: headingRect.right,
        };
      });

      expect(metrics.lineCount, `${label} wrapped at ${width}px`).toBe(1);
      expect(metrics.height, `${label} taller than one line at ${width}px`).toBeLessThanOrEqual(metrics.lineHeight + 1);
      expect(metrics.right, `${label} overflows header at ${width}px`).toBeLessThanOrEqual(metrics.headerRight + 0.5);
      expect(metrics.right, `${label} overflows viewport at ${width}px`).toBeLessThanOrEqual(width + 0.5);
      expect(metrics.left - metrics.headingRight, `${label} crowds heading at ${width}px`).toBeGreaterThanOrEqual(7.5);
    }
  });
}
