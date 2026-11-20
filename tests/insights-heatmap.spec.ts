import { test, expect } from '@playwright/test';

for (const populated of [true, false]) {
  test(`activity keyboard navigation with ${populated ? 'completion history' : 'no activity'}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-17T12:00:00'));
    await page.addInitScript((populated) => {
      localStorage.clear();
      localStorage.setItem('todos', JSON.stringify(populated ? [{ id: 'sample', text: 'Ship a feature', completed: true, completedAt: '2026-06-16T12:00:00.000Z', isCluster: false }] : []));
      localStorage.setItem('activeTab', 'dashboard');
    }, populated);
    await page.goto('/');
    await page.locator('button[data-tab="insights"]').click();
    const heatmap = page.getByRole('list', { name: 'Activity per day for the last 26 weeks' });
    const days = heatmap.getByRole('listitem');
    await expect(days).toHaveCount(179);
    await expect(heatmap.locator('[tabindex="0"]')).toHaveCount(1);
    await expect(heatmap.locator('[tabindex="-1"]')).toHaveCount(181);
    const before = page.getByRole('button', { name: /^Play / });
    await before.focus();
    await page.keyboard.press('Tab');
    await expect(days.last()).toBeFocused();
    await expect(days.last()).toHaveAttribute('aria-label', 'Jun 17: No activity');
    const chart = page.getByRole('list', { name: 'Tasks completed per period', exact: true }).getByRole('listitem').first();
    await page.keyboard.press('Tab');
    await expect(chart).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    for (const [key, index, label] of [
      ['ArrowUp', 177, populated ? 'Jun 16: 1 task' : 'Jun 16: No activity'],
      ['ArrowLeft', 170, 'Jun 9: No activity'],
      ['ArrowRight', 177, populated ? 'Jun 16: 1 task' : 'Jun 16: No activity'],
      ['ArrowDown', 178, 'Jun 17: No activity'],
      ['ArrowRight', 178, 'Jun 17: No activity'],
      ['End', 178, 'Jun 17: No activity'],
      ['Home', 0, 'Dec 21: No activity'],
      ['ArrowUp', 0, 'Dec 21: No activity'],
      ['ArrowLeft', 0, 'Dec 21: No activity'],
    ] as const) {
      await page.keyboard.press(key);
      await expect(days.nth(index)).toBeFocused();
      await expect(days.nth(index)).toHaveAttribute('aria-label', label);
      await expect(heatmap.locator('[tabindex="0"]')).toHaveCount(1);
    }
    await page.keyboard.press('Control+End');
    await expect(days.nth(0)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(chart).toBeFocused();
  });
}
