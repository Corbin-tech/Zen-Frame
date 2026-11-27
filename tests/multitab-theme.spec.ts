import { test, expect } from '@playwright/test';

test('toggling theme in one tab updates other open tabs', async ({ context, page: a }) => {
  await a.goto('/');
  const b = await context.newPage();
  await b.goto('/');

  await expect(a.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(b.locator('html')).toHaveAttribute('data-theme', 'light');

  await a.getByRole('button', { name: 'Toggle dark mode' }).click();

  await expect(a.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(b.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(b.locator('html')).toHaveClass(/\bdark\b/);
  await expect(b.locator('#theme-toggle-light-icon')).toBeVisible();

  await b.getByRole('button', { name: 'Toggle dark mode' }).click();

  await expect(a.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(a.locator('html')).not.toHaveClass(/\bdark\b/);
  await expect(a.locator('#theme-toggle-dark-icon')).toBeVisible();
});

test('rapid pointer clicks still reach the toggle during a crossfade', async ({ page }) => {
  await page.goto('/principles');
  const toggle = page.getByRole('button', { name: 'Toggle dark mode' });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bounds = (await toggle.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  for (const theme of ['light', 'dark', 'light']) {
    await page.mouse.click(x, y);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(theme);
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#theme-toggle-dark-icon')).toBeVisible();
  await expect(page.locator('#theme-toggle-light-icon')).toBeHidden();
});

test('a theme press during a crossfade still toggles when released after it', async ({ page }) => {
  await page.goto('/principles');
  await page.addStyleTag({ content: '::view-transition-group(root) { animation-duration: 800ms; }' });
  const toggle = page.getByRole('button', { name: 'Toggle dark mode' });
  await toggle.click();
  const bounds = (await toggle.boundingBox())!;
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.waitForFunction(({ x, y }) => document.elementFromPoint(x, y) === document.documentElement, point);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForFunction(({ x, y }) => document.getElementById('theme-toggle')!.contains(document.elementFromPoint(x, y)), point);
  await page.mouse.up();

  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
