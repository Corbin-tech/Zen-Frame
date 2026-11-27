import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('Board card shortcuts ignore modified [ and ] while unmodified keys still move cards', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('activeTab', 'board');
      localStorage.setItem('todos', JSON.stringify([
        { id: 't1', todo: 'Draft release notes', completed: false, parentId: null, isCluster: false, startedAt: new Date().toISOString() },
      ]));
    }
  });

  await page.goto('/');
  const todoCol = page.locator('section.board-column[aria-label^="To do"]');
  const doingCol = page.locator('section.board-column[aria-label^="In progress"]');
  const doneCol = page.locator('section.board-column[aria-label^="Done"]');
  const card = doingCol.getByRole('listitem', { name: 'Draft release notes. Press [ or ] to move it.', exact: true });

  await expect(card).toBeVisible();
  await card.focus();
  await expect(card).toBeFocused();

  await page.evaluate(() => {
    (window as unknown as { __prevented: string[] }).__prevented = [];
    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) {
        (window as unknown as { __prevented: string[] }).__prevented.push(
          `${e.altKey ? 'Alt+' : ''}${e.ctrlKey ? 'Control+' : ''}${e.metaKey ? 'Meta+' : ''}${e.key}`
        );
      }
    });
  });

  for (const combo of ['Control+[', 'Control+]', 'Meta+[', 'Meta+]', 'Alt+[', 'Alt+]']) {
    await page.keyboard.press(combo);
    await expect(card).toBeVisible();
  }

  expect(await page.evaluate(() => (window as unknown as { __prevented: string[] }).__prevented)).toEqual([]);

  // Unmodified ] and [ still move the focused card across columns
  await page.keyboard.press(']');
  await expect(doneCol.locator('.board-card[data-task-id="t1"]')).toBeFocused();
  await page.keyboard.press('[');
  await expect(doingCol.locator('.board-card[data-task-id="t1"]')).toBeFocused();
  await page.keyboard.press('[');
  await expect(todoCol.locator('.board-card[data-task-id="t1"]')).toBeFocused();
});

test('Recap shortcuts ignore modified arrow and Escape keys while unmodified keys still navigate', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-17T12:00:00'));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('activeTab', 'insights');
      localStorage.setItem('todos', JSON.stringify([
        { id: 'c1', todo: 'Ship fix', completed: true, completedAt: '2026-06-16T12:00:00.000Z', parentId: null, isCluster: false },
      ]));
    }
  });

  await page.goto('/');
  await openView(page, 'insights');
  await page.getByRole('button', { name: 'Play Stillpoint', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Stillpoint/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Pause', exact: true }).click();

  // Advance from slide 0 to slide 1 so both ArrowLeft and ArrowRight have destinations
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByText('You got things done')).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __prevented: string[] }).__prevented = [];
    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) {
        (window as unknown as { __prevented: string[] }).__prevented.push(
          `${e.altKey ? 'Alt+' : ''}${e.ctrlKey ? 'Control+' : ''}${e.metaKey ? 'Meta+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`
        );
      }
    });
  });

  for (const combo of [
    'Alt+ArrowLeft',
    'Alt+ArrowRight',
    'Control+ArrowLeft',
    'Control+ArrowRight',
    'Meta+ArrowLeft',
    'Meta+ArrowRight',
    'Shift+ArrowLeft',
    'Shift+ArrowRight',
    'Alt+Escape',
    'Control+Escape',
    'Meta+Escape',
    'Shift+Escape',
  ]) {
    await page.keyboard.press(combo);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('You got things done')).toBeVisible();
  }

  expect(await page.evaluate(() => (window as unknown as { __prevented: string[] }).__prevented)).toEqual([]);

  // Unmodified navigation and Escape still work
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByText('You got things done')).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByText('You got things done')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
