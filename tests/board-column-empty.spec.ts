import { test, expect, type Page } from '@playwright/test';
import { openView } from './nav';

// The three board columns' empty states ("Finished tasks land here." included) are the same size,
// and the new-card composer keeps its draft and closes on an empty submit.

async function openEmptyBoard(page: Page, seed: object[] = [], wipLimit?: number) {
  await page.addInitScript(({ data, wip }) => {
    if (sessionStorage.getItem('board-empty-seeded')) return;
    sessionStorage.setItem('board-empty-seeded', '1');
    localStorage.clear();
    localStorage.setItem('todos', JSON.stringify(data));
    if (wip) localStorage.setItem('boardWipLimit', String(wip));
  }, { data: seed, wip: wipLimit });
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

async function assertHeaderButtonsInsideColumns(page: Page) {
  const overflows = await page.locator('.board-column').evaluateAll(cols =>
    cols.flatMap((col, index) => {
      const colRect = col.getBoundingClientRect();
      return Array.from(col.querySelectorAll('.board-column-header button'))
        .filter(btn => (btn as HTMLElement).offsetParent !== null)
        .map(btn => {
          const btnRect = btn.getBoundingClientRect();
          return {
            column: index,
            label: btn.getAttribute('aria-label') || btn.textContent?.trim(),
            btnRight: Math.round(btnRect.right * 100) / 100,
            colRight: Math.round(colRect.right * 100) / 100,
            overflow: Math.round((btnRect.right - colRect.right) * 100) / 100,
          };
        })
        .filter(item => item.overflow > 0.5);
    })
  );
  expect(overflows).toEqual([]);
}

test('touch-tablet 768px keeps header buttons inside columns and equal empty states', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await openEmptyBoard(page);
    await assertHeaderButtonsInsideColumns(page);
    const heights = await emptyBoxHeights(page);
    expect(heights).toHaveLength(3);
    expect(new Set(heights).size).toBe(1);
  } finally {
    await context.close();
  }
});

for (const { label, width, height, hasTouch } of [
  { label: '768px fine pointer', width: 768, height: 1024, hasTouch: false },
  { label: '768px coarse pointer', width: 768, height: 1024, hasTouch: true },
  { label: '320px phone', width: 320, height: 700, hasTouch: true },
]) {
  test(`WIP limit badge stays single-line, inside column, and keeps equal empty states at ${label}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch });
    const page = await context.newPage();
    try {
      await openEmptyBoard(page, [], 2);
      const col = page.locator('.board-column').nth(1);
      const badge = col.getByText('0 / 2', { exact: true });
      await expect(badge).toBeVisible();
      const badgeBox = (await badge.boundingBox())!;
      expect(badgeBox.height).toBeLessThanOrEqual(24);
      const heading = col.locator('.board-column-header h2');
      const headingFit = await heading.evaluate(el => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        right: el.getBoundingClientRect().right,
      }));
      expect(headingFit.scrollWidth).toBeLessThanOrEqual(headingFit.clientWidth + 1);
      expect(headingFit.right).toBeLessThanOrEqual(badgeBox.x + 0.5);
      const wipBox = (await col.getByRole('button', { name: 'Set a limit for In progress', exact: true }).boundingBox())!;
      const plusBox = (await col.getByRole('button', { name: 'Add a task to In progress', exact: true }).boundingBox())!;
      expect(wipBox.x + wipBox.width).toBeLessThanOrEqual(plusBox.x + 0.5);
      await assertHeaderButtonsInsideColumns(page);
      const heights = await emptyBoxHeights(page);
      expect(heights).toHaveLength(3);
      expect(new Set(heights).size).toBe(1);
    } finally {
      await context.close();
    }
  });
}
