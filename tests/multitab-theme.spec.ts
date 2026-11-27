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
