import { test, expect, type Page } from '@playwright/test';
import { openView } from './nav';

// Insights leads with the monthly reflection and keeps the dense charts under "Details".
// Settings keeps the everyday choices up front and folds the playful ones under
// "More ways to personalize". Both remember whether they were left open.

async function seed(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date(2026, 10, 22, 12));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('disclosures-seeded')) return;
    sessionStorage.setItem('disclosures-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('todos', JSON.stringify([
      { id: 'c1', todo: 'Biology', isCluster: true, completed: false, isPinned: false, parentId: null, createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 't1', todo: 'Lab write-up', isCluster: false, completed: true, isPinned: false, parentId: 'c1', createdAt: '2026-11-01T09:00:00.000Z', completedAt: '2026-11-20T10:00:00.000Z' },
      { id: 't2', todo: 'Read chapter 4', isCluster: false, completed: true, isPinned: false, parentId: 'c1', createdAt: '2026-11-01T09:00:00.000Z', completedAt: '2026-11-21T15:00:00.000Z' },
      { id: 't3', todo: 'Email advisor', isCluster: false, completed: true, isPinned: false, parentId: null, createdAt: '2026-11-01T09:00:00.000Z', completedAt: '2026-11-22T09:00:00.000Z' }
    ]));
    localStorage.setItem('pomoSessions', JSON.stringify([
      { completedAt: '2026-11-21T11:00:00.000Z', minutes: 25 },
      { completedAt: '2026-11-22T11:00:00.000Z', minutes: 50 }
    ]));
    localStorage.setItem('activeTab', 'dashboard');
  });
  await page.goto('/');
}

const insightsHeight = (page: Page) => page.locator('[x-data="insights"]:visible').evaluate(el => el.getBoundingClientRect().height);

test('Insights leads with the monthly reflection and keeps charts under a remembered Details disclosure', async ({ page }) => {
  await seed(page);
  await openView(page, 'insights');
  const insights = page.locator('[x-data="insights"]:visible');

  // The lead summary and the four calm tiles show without opening anything
  await expect(insights.getByRole('heading', { name: 'Your November in review' })).toBeVisible();
  await expect(insights.locator('[x-text="recapTeaser"]')).toHaveText('3 finished tasks and 1h 15m of focus, across 3 days. Biology came up most. Play it for the whole story.');
  await expect(insights.locator('[x-text="tile.label"]')).toHaveText(['Tasks completed', 'Focus time', 'Days active', 'Focus moments']);
  const lead = await insights.getByRole('heading', { name: 'Your November in review' }).boundingBox();
  const glance = await insights.getByRole('heading', { name: 'At a glance' }).boundingBox();
  expect(lead!.y).toBeLessThan(glance!.y);

  // Details starts closed, wired with aria-expanded and aria-controls
  const toggle = insights.getByRole('button', { name: 'Details', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAttribute('aria-controls', 'insights-details');
  await expect(toggle).toHaveAccessibleDescription(/activity map, charts, clusters and rhythm/);
  const details = page.locator('#insights-details');
  await expect(details).toBeHidden();
  for (const name of ['Activity', 'Tasks completed', 'Focus time', 'By cluster', 'Your rhythm']) {
    await expect(insights.getByRole('heading', { name, exact: true })).toHaveCount(0);
  }

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(details).toBeVisible();
  for (const name of ['Activity', 'Tasks completed', 'Focus time', 'By cluster', 'Your rhythm']) {
    await expect(details.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(details.getByText('A pattern to notice, not a target to meet.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('insightsDetails'))).toBe('open');

  // Remembered across a reload, and closing is remembered too
  await page.reload();
  await expect(page.locator('#insights-details')).toBeVisible();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('#insights-details')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('insightsDetails'))).toBe('closed');
});

for (const width of [320, 390]) {
  test(`phone Insights is much shorter with Details closed at ${width}px`, async ({ page }) => {
    await seed(page, width);
    await openView(page, 'insights');
    const toggle = page.getByRole('button', { name: 'Details', exact: true });
    const closed = await insightsHeight(page);
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    await expect(page.locator('#insights-details')).toBeVisible();
    const open = await insightsHeight(page);
    expect(closed).toBeLessThan(open * 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Settings keeps everyday choices up front and folds the playful ones away', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Open settings' }).filter({ visible: true }).first().click();
  const panel = page.getByRole('dialog', { name: 'Settings' });

  for (const group of ['Theme', 'Font', 'Text size', 'Navigation']) {
    await expect(panel.getByRole('group', { name: group, exact: true })).toBeVisible();
  }
  await expect(panel.getByRole('button', { name: 'Export backup' })).toBeAttached();

  const more = panel.getByRole('button', { name: 'More ways to personalize' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toHaveAttribute('aria-controls', 'settings-more');
  const playful = [
    panel.getByRole('group', { name: 'Color scheme' }),
    panel.getByRole('group', { name: 'Next step background' }),
    panel.getByRole('group', { name: 'Timer style' }),
    panel.getByRole('switch', { name: /Confetti/ }),
  ];
  for (const control of playful) await expect(control).toBeHidden();

  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  for (const control of playful) await expect(control).toBeAttached();
  await expect(panel.getByRole('group', { name: 'Color scheme' }).getByRole('button')).toHaveCount(9);
  await panel.getByRole('button', { name: 'Rose', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'rose');

  // Still open the next time Settings opens
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'More ways to personalize' })).toHaveAttribute('aria-expanded', 'true');
});

test('the timer face link opens More ways to personalize at Timer style', async ({ page }) => {
  await seed(page, 390);
  await openView(page, 'pomodoro');
  await page.getByRole('button', { name: 'Change timer face in Settings' }).click();
  const panel = page.getByRole('dialog', { name: 'Settings' });
  await expect(panel.getByRole('button', { name: 'More ways to personalize' })).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByRole('group', { name: 'Timer style' })).toBeInViewport();
});

for (const width of [320, 390]) {
  test(`every control under More ways to personalize has a 44px target at ${width}px`, async ({ page }) => {
    await seed(page, width);
    await page.getByRole('button', { name: 'Open settings' }).filter({ visible: true }).first().click();
    const panel = page.getByRole('dialog', { name: 'Settings' });
    const more = panel.getByRole('button', { name: 'More ways to personalize' });
    expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await more.click();
    await expect(page.locator('#settings-more')).toBeVisible();
    const small = await page.locator('#settings-more').evaluate(root => [...root.querySelectorAll<HTMLElement>('button, input')].flatMap(el => {
      const target = el.matches('input[type=checkbox]') ? (el.closest('label') ?? el) : el;
      const height = target.getBoundingClientRect().height;
      return height >= 43.5 ? [] : [`${Math.round(height)}px ${(el.getAttribute('aria-label') || target.textContent || '').trim().slice(0, 30)}`];
    }));
    expect(small).toEqual([]);
    const box = (await page.locator('#settings-more').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
  });
}
