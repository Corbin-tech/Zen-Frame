import { test, expect } from '@playwright/test';

// The store method runs through Alpine's reactive proxy, as the Focus and Break buttons do.
for (const fromBreak of [false, true]) {
  const from = fromBreak ? 'break' : 'focus';
  const to = fromBreak ? 'focus' : 'break';
  test(`Undo after a switch from ${from} to ${to} restores ${from}`, async ({ page }) => {
    await page.clock.install();
    await page.goto('/');
    await page.clock.pauseAt(Date.now() + 60_000);
    await page.evaluate((startOnBreak) => {
      const pomo = (window as any).Alpine.store('pomoState');
      pomo.selectedTaskId = '';
      if (startOnBreak) pomo.toggleBreak();
      pomo.startTimer();
    }, fromBreak);
    await page.clock.runFor(3000);
    const before = await page.evaluate(() => {
      const pomo = (window as any).Alpine.store('pomoState');
      return { isBreak: pomo.isBreak, timeLeft: pomo.timeLeft, totalTime: pomo.totalTime };
    });
    expect(before.isBreak).toBe(fromBreak);
    expect(before.timeLeft).toBeLessThan(before.totalTime);

    await page.evaluate(() => (window as any).Alpine.store('pomoState').toggleBreak());
    await expect(page.getByText(`Switched to ${to}`, { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();

    expect(await page.evaluate(() => {
      const pomo = (window as any).Alpine.store('pomoState');
      return { isBreak: pomo.isBreak, timeLeft: pomo.timeLeft, totalTime: pomo.totalTime, isRunning: pomo.isRunning };
    })).toEqual({ ...before, isRunning: true });
  });
}
