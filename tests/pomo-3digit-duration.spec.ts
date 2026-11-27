import { test, expect } from '@playwright/test';
import { openView } from './nav';

async function seedCustom180(page: import('@playwright/test').Page, tab = 'pomodoro') {
  await page.addInitScript(({ initialTab }) => {
    if (sessionStorage.getItem('pomo-3digit-seeded')) return;
    sessionStorage.setItem('pomo-3digit-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('activeTab', initialTab);
    localStorage.setItem('pomoState', JSON.stringify({
      preset: 'custom',
      isBreak: false,
      cycle: 0,
      isLongBreak: false,
      custom: { work: 180, break: 5, longBreak: 15 },
      selectedTaskId: null,
    }));
    localStorage.setItem('settings', JSON.stringify({
      dashboardLayout: { top: ['stats'], main: ['focus'], side: [] },
    }));
    localStorage.setItem('todos', JSON.stringify([
      { id: 't1', todo: 'Write tests', parentId: null, completed: false, isCluster: false },
    ]));
  }, { initialTab: tab });
}

test('3-digit custom Pomodoro duration renders cleanly across Focus input, title, all timer faces, Zen mode, and Dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedCustom180(page, 'pomodoro');
  await page.goto('/');

  // Focus input shows all 3 digits without horizontal clipping
  const focusInput = page.locator('#pomo-custom-work');
  await expect(focusInput).toHaveValue('180');
  const inputOverflow = await focusInput.evaluate(el => el.scrollWidth > el.clientWidth);
  expect(inputOverflow).toBe(false);

  // Classic face displays 180:00 (not 18:000) and fits inside the minute-tick circle
  const ring = page.getByRole('progressbar', { name: 'Pomodoro progress' });
  const ringWrapper = ring.locator('xpath=..');
  const classicDigits = ringWrapper.getByText('180:00', { exact: true });
  await expect(classicDigits).toBeVisible();
  const ringBox = (await ring.boundingBox())!;
  const digitsBox = (await classicDigits.boundingBox())!;
  expect(digitsBox.width).toBeLessThan(ringBox.width * 0.72);

  // Document title shows 180:00 / 179:59 while running
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveTitle(/^(180:00|179:59) · Focus · /);
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.evaluate(() => {
    (window as unknown as { Alpine: { store: (k: string) => { resetTimer: () => void } } }).Alpine.store('pomoState').resetTimer();
  });

  // Digital face shows 5 seven-segment digits (1, 8, 0, 0, 0)
  await page.evaluate(() => {
    (window as unknown as { Alpine: { store: (k: string) => Record<string, unknown> } }).Alpine.store('settings').timerStyle = 'digital';
  });
  const digitalDigits = page.locator('[data-pomo-timer="pomodoro"] svg g[transform*="skewX"]');
  await expect(digitalDigits).toHaveCount(5);
  // Check exact lit segment counts for 1 (2), 8 (7), 0 (6), 0 (6), 0 (6)
  const litCounts = await digitalDigits.evaluateAll(groups =>
    groups.map(g => Array.from(g.querySelectorAll('polygon')).filter(p => Number(p.getAttribute('opacity')) === 1).length)
  );
  expect(litCounts).toEqual([2, 7, 6, 6, 6]);

  // Nixie face shows 5 tubes with digits 1, 8, 0, 0, 0
  await page.evaluate(() => {
    (window as unknown as { Alpine: { store: (k: string) => Record<string, unknown> } }).Alpine.store('settings').timerStyle = 'nixie';
  });
  const nixieLit = page.locator('[data-pomo-timer="pomodoro"] .tf-nixie-lit text:last-child');
  await expect(nixieLit).toHaveText(['1', '8', '0', '0', '0']);

  // Flip face shows 180 on MIN card and 00 on SEC card, fitting inside the card
  await page.evaluate(() => {
    (window as unknown as { Alpine: { store: (k: string) => Record<string, unknown> } }).Alpine.store('settings').timerStyle = 'flip';
  });
  const flipTops = page.locator('[data-pomo-timer="pomodoro"] .tf-flip-top:not(.tf-flap) span');
  await expect(flipTops).toHaveText(['180', '00']);
  const minCardFits = await page.locator('[data-pomo-timer="pomodoro"] .tf-flip-card').first().evaluate(card => {
    const span = card.querySelector('.tf-flip-top:not(.tf-flap) span') as HTMLElement;
    return span.scrollWidth <= card.clientWidth + 1;
  });
  expect(minCardFits).toBe(true);

  // Apple, Cat, Hourglass, Bloom faces all show 180:00
  for (const style of ['apple', 'cat', 'hourglass', 'bloom']) {
    await page.evaluate((s) => {
      (window as unknown as { Alpine: { store: (k: string) => Record<string, unknown> } }).Alpine.store('settings').timerStyle = s;
    }, style);
    await expect(page.locator('[data-pomo-timer="pomodoro"]').getByText('180:00', { exact: true })).toBeVisible();
  }

  // Zen mode ring shows 180:00
  await openView(page, 'zenmode');
  await expect(page.locator('[data-pomo-timer="zenmode"]').getByText('180:00', { exact: true })).toBeVisible();

  // Dashboard Focus timer widget shows 180:00
  await openView(page, 'dashboard');
  await expect(page.locator('section', { hasText: 'Focus timer' }).getByText('180:00', { exact: true })).toBeVisible();
});
