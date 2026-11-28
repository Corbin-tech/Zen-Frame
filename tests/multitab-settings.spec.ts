import { test, expect } from '@playwright/test';

test('a name survives another tab changing the color scheme', async ({ context, page: a }) => {
  await a.goto('/');
  await a.getByRole('button', { name: 'Open settings' }).first().click();
  const b = await context.newPage();
  await b.goto('/');
  await b.getByRole('button', { name: 'Open settings' }).first().click();
  await a.getByRole('textbox', { name: 'Your name', exact: true }).fill('Alex');
  await b.getByRole('button', { name: 'More ways to personalize' }).click();
  await b.getByRole('button', { name: 'Rose', exact: true }).click();
  await a.reload();
  await a.getByRole('button', { name: 'Open settings' }).first().click();
  await expect(a.getByRole('textbox', { name: 'Your name', exact: true })).toHaveValue('Alex');
  await expect(a.locator('html')).toHaveAttribute('data-accent', 'rose');
  await expect(b.getByRole('textbox', { name: 'Your name', exact: true })).toHaveValue('Alex');
});
