import { test, expect } from '@playwright/test';

test('saved Quiet desk becomes Zen garden and the picker persists it', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('settings')) {
      localStorage.setItem('settings', JSON.stringify({ zenBackground: 'desk' }));
    }
  });
  await page.goto('/#zenmode');
  const garden = page.locator('svg.zen-garden');
  await expect(garden).toBeVisible();
  await expect.poll(() => garden.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);

  await page.getByRole('button', { name: 'Open settings' }).first().click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const choice = settings.getByRole('button', { name: 'Zen garden' });
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect(garden).toHaveJSProperty('nodeName', 'svg');
  expect(await garden.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);

  await settings.getByRole('button', { name: 'None Just the card' }).click();
  await expect(garden).toHaveCount(0);
  await choice.click();
  await expect(garden).toHaveCount(1);
  expect(await garden.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => garden.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);

  await page.reload();
  await expect(garden).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')!).zenBackground)).toBe('desk');
});

for (const theme of ['light', 'dark']) {
  test(`garden stays still with reduced motion on a narrow ${theme} screen`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((savedTheme) => {
      localStorage.setItem('theme', savedTheme);
      localStorage.setItem('settings', JSON.stringify({ zenBackground: 'desk' }));
    }, theme);
    await page.goto('/#zenmode');
    const garden = page.locator('svg.zen-garden');
    await expect(garden).toBeVisible();
    expect(await garden.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
    const time = await garden.evaluate((svg: SVGSVGElement) => svg.getCurrentTime());
    // Let the shared backdrop finish warming up: it must not unpause reduced-motion scenes.
    await page.waitForTimeout(250);
    expect(await garden.evaluate((svg: SVGSVGElement) => svg.getCurrentTime())).toBe(time);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
