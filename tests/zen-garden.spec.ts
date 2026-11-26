import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('saved Quiet desk becomes Zen garden and the picker persists it', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('settings')) {
      localStorage.setItem('settings', JSON.stringify({ zenBackground: 'desk' }));
    }
  });
  await page.goto('/#zenmode');
  const garden = page.locator('svg.zen-garden');
  const animation = garden.locator('animateTransform').locator('xpath=../..');
  await expect(garden).toBeVisible();
  await expect.poll(() => animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);

  await page.getByRole('button', { name: 'Open settings' }).first().click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const choice = settings.getByRole('button', { name: 'Zen garden' });
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  expect(await animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);

  await settings.getByRole('button', { name: 'None Just the card' }).click();
  await expect(garden).toHaveCount(0);
  await choice.click();
  await expect(garden).toHaveCount(1);
  expect(await animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);

  await page.reload();
  await expect(garden).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')!).zenBackground)).toBe('desk');
});

const mobileCases = [320, 390].flatMap(width =>
  ['light', 'dark'].map(theme => ({ width, theme }))
);
for (const { width, theme } of mobileCases) {
  test(`garden stays still with reduced motion on a ${width}px ${theme} screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
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
    const animation = garden.locator('animateTransform').locator('xpath=../..');
    await expect(garden).toBeVisible();
    await expect(page.getByRole('button', { name: 'Begin focus' })).toBeVisible();
    expect(await animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
    const time = await animation.evaluate((svg: SVGSVGElement) => svg.getCurrentTime());
    // Let the shared backdrop finish warming up: it must not unpause reduced-motion scenes.
    await page.waitForTimeout(250);
    expect(await animation.evaluate((svg: SVGSVGElement) => svg.getCurrentTime())).toBe(time);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await garden.locator('animateTransform').evaluate(element => getComputedStyle(element.parentElement!).stroke)).toBe('none');
    expect(await garden.locator('.zen-garden-grain').evaluate(element => getComputedStyle(element).fill)).toContain('#zg-grain');
    // Landmarks must remain in the canvas, not disappear into a center-cropped wide scene.
    for (const landmark of ['.zen-garden-stones', '.zen-garden-pine', '.zen-garden-steps']) {
      const visibleFraction = await garden.locator(landmark).evaluate((element) => {
        const box = element.getBoundingClientRect();
        const canvas = (element as SVGElement).ownerSVGElement!.getBoundingClientRect();
        const width = Math.max(0, Math.min(box.right, canvas.right) - Math.max(box.left, canvas.left));
        const height = Math.max(0, Math.min(box.bottom, canvas.bottom) - Math.max(box.top, canvas.top));
        return width * height / (box.width * box.height);
      });
      // A little edge bleed is intentional, but most of each landmark must be visible.
      expect(visibleFraction).toBeGreaterThan(0.7);
    }
    const landmarksBottom = await garden.locator('.zen-garden-stones').evaluate(element => element.getBoundingClientRect().bottom);
    const taskTop = await page.locator('[x-data="zenTodoList"] > div').evaluate(element => element.getBoundingClientRect().top);
    expect(landmarksBottom).toBeLessThanOrEqual(taskTop);
  });
}

test('garden honors live reduced-motion changes without overriding other pauses', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    localStorage.setItem('settings', JSON.stringify({ zenBackground: 'desk' }));
  });
  await page.goto('/#zenmode');
  const garden = page.locator('svg.zen-garden');
  const animation = garden.locator('animateTransform').locator('xpath=../..');
  await expect(garden).toBeVisible();
  await expect.poll(() => animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
  const time = await animation.evaluate((svg: SVGSVGElement) => svg.getCurrentTime());
  await page.waitForTimeout(250);
  expect(await animation.evaluate((svg: SVGSVGElement) => svg.getCurrentTime())).toBe(time);

  await page.getByRole('button', { name: 'Open settings' }).first().click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Disabling reduced motion must not resume a scene held by Settings.
  expect(await animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);

  await openView(page, 'dashboard');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(true);
  await openView(page, 'zenmode');
  await expect.poll(() => animation.evaluate((svg: SVGSVGElement) => svg.animationsPaused())).toBe(false);
});
