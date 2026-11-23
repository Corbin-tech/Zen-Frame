import { test, expect } from '@playwright/test';

for (const kind of ['goal', 'note'] as const) {
  test(`a draft ${kind} survives another tab saving a different ${kind}`, async ({ context, page: a }) => {
    await a.goto('/');
    await a.locator('button[data-tab="goals"]').click();
    const inputName = kind === 'goal' ? 'New goal' : 'New note';
    const fieldName = kind === 'goal' ? 'Goal' : 'Note';
    const addName = kind === 'goal' ? 'Add' : 'Add note';
    await a.getByRole('textbox', { name: inputName, exact: true }).fill('Original');
    await a.getByRole('button', { name: addName, exact: true }).click();
    const b = await context.newPage();
    await b.goto('/');
    await b.locator('button[data-tab="goals"]').click();
    const draft = b.getByRole('textbox', { name: fieldName, exact: true }).first();
    await draft.fill('Unsaved draft');
    await a.getByRole('textbox', { name: inputName, exact: true }).fill('Another item');
    await a.getByRole('button', { name: addName, exact: true }).click();
    await expect(b.getByRole('textbox', { name: fieldName, exact: true })).toHaveCount(2);
    await expect.poll(() => b.getByRole('textbox', { name: fieldName, exact: true }).evaluateAll(elements => elements.map(el => (el as HTMLInputElement).value).sort())).toEqual(['Another item', 'Unsaved draft']);
  });
}
