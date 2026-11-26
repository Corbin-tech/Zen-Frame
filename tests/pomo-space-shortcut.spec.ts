import { test, expect } from '@playwright/test';
import { openView } from './nav';

async function isPomoRunning(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const alpine = (window as unknown as { Alpine: { store: (name: string) => { isRunning: boolean } } }).Alpine;
    return alpine.store('pomoState').isRunning;
  });
}

test('Space on /principles scrolls and does not start hidden Pomodoro', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('activeTab', 'pomodoro');
    }
  });

  await page.goto('/principles');
  await expect(page.locator('#principles-heading')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await isPomoRunning(page)).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('pomoRunningTimer'))).toBeNull();
});

test('Space on /principles with Next step saved scrolls and does not start hidden Pomodoro', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('activeTab', 'zenmode');
    }
  });

  await page.goto('/principles');
  await expect(page.locator('#principles-heading')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await isPomoRunning(page)).toBe(false);
});

test('Space toggles Pomodoro when visible on / and ignores hidden tabs', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('activeTab', 'pomodoro');
      localStorage.setItem('todos', JSON.stringify([
        { id: 't1', todo: 'Focus task', completed: false, parentId: null, isCluster: false, status: 'todo' },
      ]));
    }
  });

  await page.goto('/');
  await expect(page.locator('button[data-tab="pomodoro"]')).toHaveAttribute('aria-current', 'page');

  // Visible on the Timer view: Space starts and pauses
  await expect(page.locator('[data-pomo-timer]:visible')).toHaveCount(1);
  await page.keyboard.press('Space');
  expect(await isPomoRunning(page)).toBe(true);
  await page.keyboard.press('Space');
  expect(await isPomoRunning(page)).toBe(false);

  // Visible in Next step with a current task: Space starts focus on it and pauses
  await openView(page, 'zenmode');
  await expect(page.locator('[data-pomo-timer]:visible')).toHaveCount(1);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  expect(await isPomoRunning(page)).toBe(true);
  await page.keyboard.press('Space');
  expect(await isPomoRunning(page)).toBe(false);

  // Hidden on the Overview: Space does not start the timer
  await openView(page, 'dashboard');
  await expect(page.locator('[data-pomo-timer]:visible')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Space');
  expect(await isPomoRunning(page)).toBe(false);
});
