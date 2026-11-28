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
    await page.getByRole('button', { name: 'Details', exact: true }).click();
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
    const details = page.getByRole('button', { name: 'Details', exact: true });
    await details.click();
    const heatmap = page.getByRole('list', { name: 'Activity per day for the last 26 weeks' });
    const days = heatmap.getByRole('listitem');
    await expect(days).toHaveCount(179);
    await expect(heatmap.locator('[tabindex="0"]')).toHaveCount(1);
    await expect(heatmap.locator('[tabindex="-1"]')).toHaveCount(181);
    // The heatmap is the first stop inside Details
    await details.focus();
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

test('activity heatmap tooltip stays inside its card and viewport', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-17T12:00:00'));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('activeTab', 'insights');
    localStorage.setItem('todos', JSON.stringify([
      { id: 'first', text: 'First day task', completed: true, completedAt: '2025-12-21T12:00:00.000Z', isCluster: false },
      { id: 'mid', text: 'Middle day task', completed: true, completedAt: '2026-03-18T12:00:00.000Z', isCluster: false },
      { id: 'last', text: 'Latest day task', completed: true, completedAt: '2026-06-17T12:00:00.000Z', isCluster: false },
    ]));
    localStorage.setItem('pomoSessions', JSON.stringify([
      { completedAt: '2025-12-21T12:00:00.000Z', minutes: 25 },
      { completedAt: '2026-03-18T12:00:00.000Z', minutes: 25 },
      { completedAt: '2026-06-17T12:00:00.000Z', minutes: 25 },
    ]));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Details', exact: true }).click();

  const activityCard = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Activity', exact: true }) });
  const days = activityCard.getByRole('list', { name: 'Activity per day for the last 26 weeks' }).getByRole('listitem');
  const tooltip = activityCard.locator('[x-show="hovered"]');
  await expect(days).toHaveCount(179);

  const targets = [
    { index: 0, date: 'Sun, Dec 21' },
    { index: 87, date: 'Wed, Mar 18' },
    { index: 178, date: 'Wed, Jun 17' },
  ];

  for (const viewport of [
    { width: 320, height: 640 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);

    for (const { index, date } of targets) {
      await days.nth(index).focus();
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('1 task · 25m focus');
      await expect(tooltip).toContainText(date);
      const card = await activityCard.boundingBox();
      const tip = await tooltip.boundingBox();
      expect(card).not.toBeNull();
      expect(tip).not.toBeNull();
      expect(tip!.x, `left edge at ${viewport.width}px col index ${index}`).toBeGreaterThanOrEqual(card!.x);
      expect(tip!.x + tip!.width, `right edge at ${viewport.width}px col index ${index}`).toBeLessThanOrEqual(card!.x + card!.width);
      expect(tip!.x, `viewport left at ${viewport.width}px col index ${index}`).toBeGreaterThanOrEqual(0);
      expect(tip!.x + tip!.width, `viewport right at ${viewport.width}px col index ${index}`).toBeLessThanOrEqual(viewport.width);
      expect(tip!.y, `top edge at ${viewport.width}px col index ${index}`).toBeGreaterThanOrEqual(card!.y);
      expect(tip!.y + tip!.height, `bottom edge at ${viewport.width}px col index ${index}`).toBeLessThanOrEqual(card!.y + card!.height);
    }
  }

  // Also exercise pointer hover on both edge columns
  await days.nth(178).blur();
  await expect(tooltip).toBeHidden();
  for (const { index, date } of [targets[0], targets[2]]) {
    await days.nth(index).hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('1 task · 25m focus');
    await expect(tooltip).toContainText(date);
    const card = await activityCard.boundingBox();
    const tip = await tooltip.boundingBox();
    expect(tip!.x).toBeGreaterThanOrEqual(card!.x);
    expect(tip!.x + tip!.width).toBeLessThanOrEqual(card!.x + card!.width);
  }
});
