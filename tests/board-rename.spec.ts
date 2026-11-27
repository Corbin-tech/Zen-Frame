import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('a filtered Board card can be renamed and saves on blur', async ({ page }) => {
  const original = 'Review invoices';
  const renamed = 'file invoices';

  await page.goto('/');
  await openView(page, 'board');
  await page.getByRole('button', { name: 'Add a task to To do', exact: true }).click();
  const newTask = page.getByRole('textbox', { name: 'New task', exact: true });
  await newTask.fill(original);
  await newTask.press('Enter');

  const search = page.getByRole('searchbox', { name: 'Search the board' });
  await search.fill(original);
  await page.getByRole('listitem', { name: `${original}. Press [ or ] to move it.`, exact: true })
    .getByText(original, { exact: true }).dblclick();

  const editor = page.getByRole('textbox', { name: 'Task name', exact: true });
  await expect(editor).toBeFocused();
  await editor.selectText();
  await page.keyboard.type(renamed[0]);
  await expect(editor).toBeFocused();
  await page.keyboard.type(renamed.slice(1));
  await expect(editor).toHaveValue(renamed);

  await page.getByRole('heading', { name: "What's moving" }).click();
  await expect(page.getByText(`No cards match "${original}".`, { exact: true })).toBeVisible();
  await search.clear();
  const renamedCard = page.getByRole('listitem', { name: `${renamed}. Press [ or ] to move it.`, exact: true });
  await expect(renamedCard).toBeVisible();
  await page.reload();
  await expect(renamedCard).toBeVisible();
});

test('pressing Escape while renaming a Board card cancels and restores the original title', async ({ page }) => {
  const original = 'Review invoices';
  const draft = 'Accidental edit';

  await page.goto('/');
  await openView(page, 'board');
  await page.getByRole('button', { name: 'Add a task to To do', exact: true }).click();
  const newTask = page.getByRole('textbox', { name: 'New task', exact: true });
  await newTask.fill(original);
  await newTask.press('Enter');

  const card = page.getByRole('listitem', { name: `${original}. Press [ or ] to move it.`, exact: true });
  await card.getByText(original, { exact: true }).dblclick();

  const editor = page.getByRole('textbox', { name: 'Task name', exact: true });
  await expect(editor).toBeFocused();
  await editor.fill(draft);
  await expect(editor).toHaveValue(draft);

  await editor.press('Escape');
  await expect(editor).toBeHidden();
  await expect(card).toBeVisible();
  await expect(card.getByText(original, { exact: true })).toBeVisible();
  await expect(page.getByText(draft, { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(card).toBeVisible();

  // Re-opening rename starts from the original title and Enter still commits
  const committed = 'Send invoices';
  await card.getByText(original, { exact: true }).dblclick();
  await expect(editor).toHaveValue(original);
  await editor.fill(committed);
  await editor.press('Enter');
  await expect(editor).toBeHidden();
  const committedCard = page.getByRole('listitem', { name: `${committed}. Press [ or ] to move it.`, exact: true });
  await expect(committedCard).toBeVisible();
  await page.reload();
  await expect(committedCard).toBeVisible();
});
