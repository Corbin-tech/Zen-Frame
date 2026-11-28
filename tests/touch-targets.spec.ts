import { test, expect, type Page } from '@playwright/test';
import { openView } from './nav';
import type { ViewId } from '../src/lib/nav';

// On phone widths every control offers a 44px target: its own box, or the invisible
// .hit-area around it (a text link, a round check button, a checkbox's label).
// Inline title editors sit inside a row that is already the target, so they are skipped.

const VIEWS: ViewId[] = ['dashboard', 'schedule', 'taskmanager', 'board', 'goals', 'insights', 'pomodoro', 'zenmode'];

async function seed(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date(2026, 10, 22, 12));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('touch-seeded')) return;
    sessionStorage.setItem('touch-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('todos', JSON.stringify([
      { id: 'c1', todo: 'Biology', isCluster: true, completed: false, isPinned: false, parentId: null, createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 't1', todo: 'Read chapter 4', isCluster: false, completed: false, isPinned: false, parentId: 'c1', createdAt: '2026-11-01T09:00:00.000Z', dueDate: '2026-11-21' },
      { id: 't3', todo: 'Email advisor', isCluster: false, completed: false, isPinned: false, parentId: null, createdAt: '2026-11-01T09:00:00.000Z' },
      { id: 't2', todo: 'Lab write-up', isCluster: false, completed: true, isPinned: false, parentId: 'c1', createdAt: '2026-11-01T09:00:00.000Z', completedAt: '2026-11-22T10:00:00.000Z' }
    ]));
    localStorage.setItem('scheduledItems', JSON.stringify([{ id: 's1', taskId: 't3', date: '2026-11-22', startTimeMinutes: 780, endTimeMinutes: 840 }]));
    localStorage.setItem('activeTab', 'dashboard');
  });
  await page.goto('/');
}

// Controls in <main> (or another root) whose hit area is under 44px tall
const undersized = (page: Page, root = 'main') => page.locator(root).filter({ visible: true }).first().evaluate(main => {
  const controls = [...main.querySelectorAll<HTMLElement>('button, select, textarea, input:not([type=hidden]):not([type=file]):not([type=range])')];
  return controls.flatMap(el => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (!box.width || !box.height || style.visibility === 'hidden' || el.closest('.sr-only, [aria-hidden="true"], .inline-edit') || el.matches('.inline-edit')) return [];
    // A checkbox counts its wrapping label; anything counts its ::after hit area
    const target = el.matches('input[type=checkbox], input[type=radio]') ? (el.closest('label') ?? el) : el;
    const after = getComputedStyle(target, '::after');
    const hitHeight = Math.max(target.getBoundingClientRect().height, after.content !== 'none' ? parseFloat(after.height) || 0 : 0);
    if (hitHeight >= 43.5) return [];
    return [`${Math.round(hitHeight)}px ${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`];
  });
});

for (const width of [320, 390]) {
  test(`every control in the core views has a 44px touch target at ${width}px`, async ({ page }) => {
    await seed(page, width);
    for (const view of VIEWS) {
      await openView(page, view);
      expect(await undersized(page), `${view} at ${width}px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${view} overflows at ${width}px`).toBe(true);
    }
    await page.getByRole('button', { name: 'Open settings' }).filter({ visible: true }).first().click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    expect(await undersized(page, '[role="dialog"][aria-labelledby="settings-title"]'), `Settings at ${width}px`).toEqual([]);
  });
}

test('the small hit area catches a tap just outside a round check button', async ({ page }) => {
  await seed(page, 390);
  await openView(page, 'board');
  const check = page.getByRole('button', { name: 'Mark Email advisor done' }).filter({ visible: true });
  const box = (await check.boundingBox())!;
  expect(box.height).toBeLessThan(24); // The visible circle stays small
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 14);
  await expect(page.getByRole('button', { name: 'Mark Email advisor not done' }).filter({ visible: true })).toBeVisible();
});

test('desktop keeps its compact control rhythm', async ({ page }) => {
  await seed(page, 1280);
  const closeDay = page.getByRole('button', { name: 'Close the day' }).filter({ visible: true });
  expect((await closeDay.boundingBox())!.height).toBeLessThan(40);
  await openView(page, 'insights');
  const range = page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: '30 days' });
  expect((await range.boundingBox())!.height).toBeLessThan(36);
  expect(await range.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');
});
