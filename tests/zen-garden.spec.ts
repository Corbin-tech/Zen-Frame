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
      localStorage.setItem('todos', JSON.stringify([{
        id: 'garden-task', todo: 'Sketch the next design concept', completed: false,
        isCluster: false, isPinned: false, parentId: null, createdAt: new Date().toISOString(),
      }]));
    }, theme);
    await page.goto('/#zenmode');
    const garden = page.locator('svg.zen-garden');
    await expect(garden).toBeVisible();
    await expect(page.getByRole('button', { name: 'Begin focus' })).toBeVisible();
    expect(await garden.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
    const time = await garden.evaluate((svg: SVGSVGElement) => svg.getCurrentTime());
    // Let the shared backdrop finish warming up: it must not unpause reduced-motion scenes.
    await page.waitForTimeout(250);
    expect(await garden.evaluate((svg: SVGSVGElement) => svg.getCurrentTime())).toBe(time);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Landmarks must remain in the canvas, not disappear into a center-cropped wide scene.
    for (const landmark of ['.zen-garden-stones', '.zen-garden-pine', '.zen-garden-steps']) {
      const visibleFraction = await garden.locator(landmark).evaluate((element) => {
        const box = element.getBoundingClientRect();
        const canvas = element.ownerSVGElement!.getBoundingClientRect();
        const width = Math.max(0, Math.min(box.right, canvas.right) - Math.max(box.left, canvas.left));
        const height = Math.max(0, Math.min(box.bottom, canvas.bottom) - Math.max(box.top, canvas.top));
        return width * height / (box.width * box.height);
      });
      // A little edge bleed is intentional, but most of each landmark must be visible.
      expect(visibleFraction).toBeGreaterThan(0.7);
    }
  });
}
