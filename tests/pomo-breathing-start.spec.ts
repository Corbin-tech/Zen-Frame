import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('breathing start is off by default and starts focus immediately', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('activeTab', 'pomodoro');
    }
  });

  await page.goto('/');
  await page.locator('[data-pomo-timer="pomodoro"]').getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Breathe|Take three slow breaths/ })).toBeHidden();
  await expect(page.locator('[data-pomo-timer="pomodoro"]').getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('breathing start runs 3 breaths, supports skip/cancel, traps focus, and works on mobile', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('activeTab', 'pomodoro');
      localStorage.setItem('todos', JSON.stringify([
        { id: 't1', todo: 'Write essay outline', completed: false, parentId: null, isCluster: false, status: 'todo' },
      ]));
    }
  });

  await page.goto('/');

  // Enable Breathing start in Settings > Timer
  await page.getByRole('button', { name: 'Open settings' }).click();
  const breathingSwitch = page.getByRole('switch', { name: /Breathing start/ });
  await expect(breathingSwitch).not.toBeChecked();
  await page.locator('label[for="settings-breathing-start"]').click();
  await expect(breathingSwitch).toBeChecked();
  await page.getByRole('button', { name: 'Close settings' }).click();

  // Start focus -> opens breathing dialog and traps focus
  const startBtn = page.locator('[data-pomo-timer="pomodoro"]').getByRole('button', { name: 'Start', exact: true });
  await startBtn.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Breath 1 of 3');
  await expect(dialog).toContainText('Breathe in');
  await expect(dialog).toContainText('Just this, for now.');
  await expect(dialog).toContainText('Write essay outline');

  const skipBtn = dialog.getByRole('button', { name: 'Skip to focus' });
  const cancelBtn = dialog.getByRole('button', { name: 'Cancel' });
  await expect(skipBtn).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(cancelBtn).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(skipBtn).toBeFocused();

  // Escape cancels without starting the timer and restores focus
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(startBtn).toBeFocused();
  await expect(startBtn).toBeVisible();

  // Start again and let all 3 breaths complete (24s total)
  await startBtn.click();
  await expect(dialog).toBeVisible();
  await page.clock.runFor(4000);
  await expect(dialog).toContainText('Breathe out');
  await page.clock.runFor(4000);
  await expect(dialog).toContainText('Breath 2 of 3');
  await expect(dialog).toContainText('Breathe in');
  await page.clock.runFor(16000);
  await expect(dialog).toBeHidden();

  // Timer is now running
  const pauseBtn = page.locator('[data-pomo-timer="pomodoro"]').getByRole('button', { name: 'Pause', exact: true });
  await expect(pauseBtn).toBeVisible();

  // Pause and resume skips breathing
  await page.clock.runFor(2000);
  await pauseBtn.click();
  await page.locator('[data-pomo-timer="pomodoro"]').getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(pauseBtn).toBeVisible();

  // Reset and verify Skip to focus from Next step + 320px mobile width
  await page.locator('[data-pomo-timer="pomodoro"]').getByRole('button', { name: 'Reset' }).click();
  await page.setViewportSize({ width: 320, height: 640 });
  await openView(page, 'zenmode');
  await page.getByRole('button', { name: /Begin focus/ }).click();
  await expect(dialog).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
  await dialog.getByRole('button', { name: 'Skip to focus' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('breathing start shows a static prompt under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('activeTab', 'pomodoro');
      localStorage.setItem('settings', JSON.stringify({ pomoBreathingStart: true }));
    }
  });

  await page.goto('/');
  await page.locator('[data-pomo-timer="pomodoro"]').getByRole('button', { name: 'Start', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Before you begin');
  await expect(dialog).toContainText('Take three slow breaths.');
  await expect(dialog).toContainText('Just this, for now.');

  const beginBtn = dialog.getByRole('button', { name: 'Begin focus' });
  await expect(beginBtn).toBeFocused();

  // Does not auto-advance under reduced motion
  await page.clock.runFor(30000);
  await expect(dialog).toBeVisible();

  await beginBtn.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-pomo-timer="pomodoro"]').getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});
