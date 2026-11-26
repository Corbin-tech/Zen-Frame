import { test, expect } from '@playwright/test';
import { openView } from './nav';

for (const populated of [true, false]) {
  test(`activity card matches chart cards with ${populated ? 'activity' : 'no activity'}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-17T12:00:00'));
    await page.addInitScript((populated) => {
      localStorage.clear();
      localStorage.setItem('activeTab', 'insights');
      localStorage.setItem('todos', JSON.stringify(populated ? [{ id: 'sample', text: 'Ship a feature', completed: true, completedAt: '2026-06-16T12:00:00.000Z', isCluster: false }] : []));
      localStorage.setItem('pomoSessions', JSON.stringify(populated ? [{ completedAt: '2026-06-16T12:00:00.000Z', minutes: 25 }] : []));
    }, populated);
    await page.goto('/');
    const card = (name: string) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(page.getByRole('list', { name: 'Activity per day for the last 26 weeks' }).getByRole('listitem')).toHaveCount(179);
    const activity = await card('Activity').boundingBox();
    for (const name of ['Tasks completed', 'Focus time']) {
      const chart = await card(name).boundingBox();
      expect(activity).not.toBeNull();
      expect(chart).not.toBeNull();
      expect(Math.abs(activity!.width - chart!.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(activity!.height - chart!.height)).toBeLessThanOrEqual(2);
      expect(Math.abs(activity!.y - chart!.y)).toBeLessThanOrEqual(2);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const name of ['Activity', 'Tasks completed', 'Focus time']) {
      const bounds = await card(name).boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    }
  });
}

for (const populated of [true, false]) {
  test(`activity keyboard navigation with ${populated ? 'completion history' : 'no activity'}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-06-17T12:00:00'));
    await page.addInitScript((populated) => {
      localStorage.clear();
      localStorage.setItem('todos', JSON.stringify(populated ? [{ id: 'sample', text: 'Ship a feature', completed: true, completedAt: '2026-06-16T12:00:00.000Z', isCluster: false }] : []));
      localStorage.setItem('activeTab', 'dashboard');
    }, populated);
    await page.goto('/');
    await openView(page, 'insights');
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
