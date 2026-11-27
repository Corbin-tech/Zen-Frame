import { test, expect, type Locator } from '@playwright/test';

async function typeAndCommit(input: Locator, text: string) {
  await input.focus();
  await input.press('ControlOrMeta+a');
  if (text === '') {
    await input.press('Backspace');
  } else {
    await input.pressSequentially(text);
  }
  await input.blur();
}

test('Custom Focus and Break inputs snap back to stored durations on invalid or unchanged clamped values', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded_pomo_custom')) {
      localStorage.clear();
      sessionStorage.clear();
      sessionStorage.setItem('__seeded_pomo_custom', '1');
      localStorage.setItem('activeTab', 'pomodoro');
    }
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Custom', exact: true }).click();

  const work = page.locator('#pomo-custom-work');
  const brk = page.locator('#pomo-custom-break');
  await expect(work).toHaveValue('30');
  await expect(brk).toHaveValue('5');

  // Invalid inputs (0, negative, blank, junk) must resync back to the stored duration
  for (const invalid of ['0', '-5', '', 'e']) {
    await typeAndCommit(work, invalid);
    await expect(work).toHaveValue('30');
    expect(await work.evaluate(el => (el as HTMLInputElement).validity.badInput)).toBe(false);
    expect(await page.evaluate(() => (window as any).Alpine.store('pomoState').timeLeft)).toBe(30 * 60);
  }

  for (const invalid of ['0', '-3', '', '--']) {
    await typeAndCommit(brk, invalid);
    await expect(brk).toHaveValue('5');
    expect(await brk.evaluate(el => (el as HTMLInputElement).validity.badInput)).toBe(false);
  }

  // Values that clamp or round to the already-stored duration must also resync
  await typeAndCommit(work, '180');
  await expect(work).toHaveValue('180');
  await typeAndCommit(work, '999');
  await expect(work).toHaveValue('180');
  await typeAndCommit(work, '180.4');
  await expect(work).toHaveValue('180');

  await typeAndCommit(brk, '60');
  await expect(brk).toHaveValue('60');
  await typeAndCommit(brk, '99');
  await expect(brk).toHaveValue('60');

  // Valid edits still update both the input and the timer
  await typeAndCommit(work, '40');
  await expect(work).toHaveValue('40');
  expect(await page.evaluate(() => (window as any).Alpine.store('pomoState').timeLeft)).toBe(40 * 60);

  await typeAndCommit(brk, '8');
  await expect(brk).toHaveValue('8');
  await page.getByRole('button', { name: 'Break', exact: true }).click();
  expect(await page.evaluate(() => (window as any).Alpine.store('pomoState').timeLeft)).toBe(8 * 60);
});
