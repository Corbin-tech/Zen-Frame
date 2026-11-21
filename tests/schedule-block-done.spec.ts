import { test, expect } from '@playwright/test';
import { openView } from './nav';

for (const repeating of [false, true]) {
  test(`${repeating ? 'repeating' : 'one-off'} block completion is only applied on Save`, async ({ page }) => {
    const title = 'Review project brief';
    await page.clock.setFixedTime(new Date(2026, 10, 20, 10));
    await page.addInitScript(({ title, repeating }) => {
      localStorage.setItem('todos', JSON.stringify([{
        id: 'task', todo: title, completed: false, isCluster: false, isPinned: false,
        parentId: null, createdAt: '2026-11-20T09:00:00.000Z', dueDate: repeating ? null : '2026-11-20',
      }]));
      localStorage.setItem('scheduledItems', JSON.stringify([{
        id: 'block', taskId: 'task', date: '2026-11-20', startTimeMinutes: 600, endTimeMinutes: 660,
        repeat: repeating ? { weekdays: [5, 6], until: null, doneDates: [] } : undefined,
      }]));
    }, { title, repeating });
    await page.goto('/');
    const block = page.getByRole('button', { name: /^Review project brief, / });
    const editor = page.getByRole('dialog', { name: 'Edit block' });
    const done = editor.getByRole('checkbox', { name: 'Done', exact: true });
    const cancel = editor.getByRole('button', { name: 'Cancel' });
    const save = editor.getByRole('button', { name: 'Save', exact: true });
    const history = () => page.evaluate(() => JSON.parse(localStorage.getItem('history') ?? '[]'));
    const boardTask = (column: RegExp) => page.getByRole('region', { name: column }).getByText(title, { exact: true });

    await openView(page, 'schedule');
    await block.press('Enter');
    await expect(done).not.toBeChecked();
    await done.check();
    await cancel.click();
    await expect(editor).toBeHidden();

    await block.press('Enter');
    await expect(done).not.toBeChecked();
    expect(await history()).toEqual([]);
    await cancel.click();
    await openView(page, 'board');
    await expect(boardTask(/^To do,/)).toBeVisible();

    await openView(page, 'schedule');
    await block.press('Enter');
    await done.check();
    await save.click();
    await expect(editor).toBeHidden();
    await expect(block.getByRole('checkbox')).toBeChecked();
    await expect.poll(history).toEqual([expect.objectContaining({ taskId: 'task' })]);
    expect((await history())[0].blockId).toBe(repeating ? 'block' : undefined);

    await openView(page, 'board');
    await expect(boardTask(repeating ? /^To do,/ : /^Done,/)).toBeVisible();
    await openView(page, 'schedule');
    if (repeating) {
      await page.getByRole('button', { name: 'Next day' }).click();
      await expect(block.getByRole('checkbox')).not.toBeChecked();
      await page.getByRole('button', { name: 'Previous day' }).click();
    }
    await block.press('Enter');
    await expect(done).toBeChecked();
    await done.uncheck();
    await cancel.click();
    await expect(editor).toBeHidden();
    await expect(block.getByRole('checkbox')).toBeChecked();

    await block.press('Enter');
    await done.uncheck();
    await save.click();
    await expect(block.getByRole('checkbox')).not.toBeChecked();
    await expect.poll(history).toEqual([]);
  });
}
