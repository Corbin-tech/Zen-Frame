import { test, expect, type Page } from '@playwright/test';
import { openView } from './nav';

// The three board columns' empty states ("Finished tasks land here." included) are the same size,
// and the new-card composer keeps its draft and closes on an empty submit.

async function openEmptyBoard(page: Page, seed: object[] = []) {
  await page.addInitScript(data => {
    localStorage.clear();
    localStorage.setItem('todos', JSON.stringify(data));
  }, seed);
  await page.goto('/');
  await openView(page, 'board');
  await expect(page.locator('.board-column').first()).toBeVisible();
}

async function emptyBoxHeights(page: Page) {
  return page.locator('li.board-empty').evaluateAll(els =>
    els.filter(el => el.offsetParent !== null).map(el => Math.round(el.getBoundingClientRect().height))
  );
}

test('all three empty board columns are the same size on desktop', async ({ page }) => {
  await openEmptyBoard(page);
  const heights = await emptyBoxHeights(page);
  expect(heights).toHaveLength(3);
  expect(new Set(heights).size).toBe(1);
});

test('all three empty board columns are the same size on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEmptyBoard(page);
  const heights = await emptyBoxHeights(page);
  expect(heights).toHaveLength(3);
  expect(new Set(heights).size).toBe(1);
});

test('the empty Done column matches the card list height of the other columns', async ({ page }) => {
  const now = new Date().toISOString();
  await openEmptyBoard(page, [
    { id: 't1', todo: 'One open task', completed: false, isCluster: false, isPinned: false, parentId: null, createdAt: now },
    { id: 'd1', todo: 'One started task', completed: false, isCluster: false, isPinned: false, parentId: null, createdAt: now, startedAt: now },
  ]);
  const doneEmpty = page.locator('.board-column').nth(2).locator('li.board-empty');
  await expect(doneEmpty).toBeVisible();
  const doneH = Math.round((await doneEmpty.boundingBox())!.height);
  const listHeights = await page.locator('.board-column ol').evaluateAll(els =>
    els.map(el => Math.round(el.getBoundingClientRect().height))
  );
  // The Done empty state fills its list area exactly like the other columns' list areas
  expect(doneH).toBe(listHeights[2]);
  expect(Math.abs(listHeights[0] - listHeights[2])).toBeLessThanOrEqual(2);
  expect(Math.abs(listHeights[1] - listHeights[2])).toBeLessThanOrEqual(2);
});

test('the board composer keeps the draft when + is re-clicked and closes on empty Enter', async ({ page }) => {
  await openEmptyBoard(page);
  const plus = page.getByRole('button', { name: 'Add a task to To do', exact: true });
  await plus.click();
  const composer = page.locator('#board-new-todo');
  await expect(composer).toBeFocused();
  await composer.fill('draft task');
  await plus.click();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue('draft task');

  await composer.fill('');
  await composer.press('Enter');
  await expect(composer).toBeHidden();

  await plus.click();
  await composer.fill('a real task');
  await composer.press('Enter');
  await expect(page.getByRole('listitem', { name: 'a real task. Press [ or ] to move it.', exact: true })).toBeVisible();
  // The composer stays open for rapid entry after a successful add
  await expect(composer).toBeVisible();
});
