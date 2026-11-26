import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('focus history updates across tabs without changing the receiving countdown', async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto('/');
  await second.goto('/');
  await openView(second, 'insights');
  await second.evaluate(() => {
    const pomo = (window as any).Alpine.store('pomoState');
    pomo.selectedTaskId = '';
    pomo.startTimer();
  });
  const deadline = await second.evaluate(() => (window as any).Alpine.store('pomoState').endsAt);
  await first.evaluate(() => (window as any).Alpine.store('pomoState').completeTimer());
  await expect.poll(() => second.evaluate(() => (window as any).Alpine.store('pomoState').sessions.length)).toBe(1);
  await expect(second.locator('main')).toContainText('25m');
  expect(await second.evaluate(() => {
    const pomo = (window as any).Alpine.store('pomoState');
    return { endsAt: pomo.endsAt, isRunning: pomo.isRunning, focusTask: pomo.focusTask };
  })).toEqual({ endsAt: deadline, isRunning: true, focusTask: null });
  await second.evaluate(() => (window as any).Alpine.store('pomoState').completeTimer(Date.now() + 1000));
  await expect.poll(() => first.evaluate(() => (window as any).Alpine.store('pomoState').sessions.length)).toBe(2);
  await first.evaluate(() => localStorage.removeItem('pomoSessions'));
  await expect.poll(() => second.evaluate(() => (window as any).Alpine.store('pomoState').sessions.length)).toBe(0);
  await first.evaluate(() => localStorage.setItem('pomoSessions', '{invalid'));
  await expect.poll(() => second.evaluate(() => (window as any).Alpine.store('pomoState').sessions.length)).toBe(0);
});
