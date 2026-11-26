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
