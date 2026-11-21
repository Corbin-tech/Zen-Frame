import { test, expect, type Page } from '@playwright/test';
import { openView } from './nav';

async function addTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add a task to To do', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'New task', exact: true }).filter({ visible: true });
  await input.fill(title);
  await input.press('Enter');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('todos') ?? '[]').map((task: { todo: string }) => task.todo))).toContain(title);
}

test('tasks survive writes and reloads across two tabs', async ({ context, page: a }) => {
  await a.goto('/');
  await openView(a, 'board');
  const b = await context.newPage();
  await b.goto('/');
  await openView(b, 'board');
  await addTask(a, 'Task from tab A');
  await addTask(b, 'Task from tab B');
  await a.reload();
  for (const page of [a, b]) {
    await expect(page.getByRole('listitem', { name: 'Task from tab A. Press [ or ] to move it.', exact: true })).toBeVisible();
    await expect(page.getByRole('listitem', { name: 'Task from tab B. Press [ or ] to move it.', exact: true })).toBeVisible();
  }
});
