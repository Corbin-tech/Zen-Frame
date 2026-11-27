import { test, expect, type Page } from '@playwright/test';

const SEEDED_AT = '2026-11-20T09:00:00.000Z';

async function seedTaskManager(page: Page) {
  await page.addInitScript((seededAt) => {
    if (sessionStorage.getItem('tm-rename-seeded')) return;
    sessionStorage.setItem('tm-rename-seeded', 'true');
    localStorage.clear();
    localStorage.setItem('activeTab', 'taskmanager');
    localStorage.setItem('todos', JSON.stringify([
      {
        id: 'cluster-1',
        todo: 'Launch prep',
        completed: false,
        isCluster: true,
        isPinned: false,
        parentId: null,
        color: 'teal',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
      {
        id: 'task-1',
        todo: 'Review invoices',
        completed: false,
        isCluster: false,
        isPinned: false,
        parentId: 'cluster-1',
        createdAt: seededAt,
        updatedAt: seededAt,
      },
    ]));
  }, SEEDED_AT);
  await page.goto('/');
  await expect(page.locator('.task-item:visible')).toHaveCount(1);
}

test('pressing Escape while renaming a Task Manager task cancels and restores the original title', async ({ page }) => {
  await seedTaskManager(page);

  const input = page.getByRole('textbox', { name: 'Task name', exact: true });
  await input.click();
  await input.fill('Accidental edit');
  await expect(input).toHaveValue('Accidental edit');

  await input.press('Escape');
  await expect(input).not.toBeFocused();
  await expect(input).toHaveValue('Review invoices');

  // Wait past the 250ms store debounce to ensure nothing overwrote the stored task or bumped updatedAt
  await page.waitForTimeout(350);
  const storedAfterCancel = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('todos') ?? '[]').find((t: { id: string }) => t.id === 'task-1')
  );
  expect(storedAfterCancel).toMatchObject({ todo: 'Review invoices', updatedAt: SEEDED_AT });

  await page.reload();
  await expect(input).toHaveValue('Review invoices');

  // Enter still commits a rename
  await input.click();
  await input.fill('Send invoices');
  await input.press('Enter');
  await expect(input).not.toBeFocused();
  await expect(input).toHaveValue('Send invoices');
  await expect.poll(() =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem('todos') ?? '[]').find((t: { id: string }) => t.id === 'task-1')?.todo
    )
  ).toBe('Send invoices');
  await page.reload();
  await expect(input).toHaveValue('Send invoices');
});

test('pressing Escape while renaming a Task Manager cluster cancels and restores the original name', async ({ page }) => {
  await seedTaskManager(page);

  const input = page.getByRole('textbox', { name: 'Cluster name', exact: true });
  await input.click();
  await input.fill('Accidental cluster');
  await expect(input).toHaveValue('Accidental cluster');

  await input.press('Escape');
  await expect(input).not.toBeFocused();
  await expect(input).toHaveValue('Launch prep');

  await page.waitForTimeout(350);
  const storedAfterCancel = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('todos') ?? '[]').find((t: { id: string }) => t.id === 'cluster-1')
  );
  expect(storedAfterCancel).toMatchObject({ todo: 'Launch prep', updatedAt: SEEDED_AT });

  await page.reload();
  await expect(input).toHaveValue('Launch prep');

  // Enter still commits a rename
  await input.click();
  await input.fill('Q4 launch');
  await input.press('Enter');
  await expect(input).not.toBeFocused();
  await expect(input).toHaveValue('Q4 launch');
  await expect.poll(() =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem('todos') ?? '[]').find((t: { id: string }) => t.id === 'cluster-1')?.todo
    )
  ).toBe('Q4 launch');
  await page.reload();
  await expect(input).toHaveValue('Q4 launch');
});

test('an unsaved cluster name draft survives another tab editing the same cluster', async ({ context, page: a }) => {
  await seedTaskManager(a);

  const b = await context.newPage();
  await b.goto('/');
  await expect(b.locator('.task-item:visible')).toHaveCount(1);

  const clusterInputB = b.getByRole('textbox', { name: 'Cluster name', exact: true });
  await clusterInputB.click();
  await clusterInputB.fill('Draft cluster name');
  await expect(clusterInputB).toHaveValue('Draft cluster name');

  // Tab A pins the same cluster, firing a cross-tab storage sync in Tab B
  await a.getByRole('button', { name: 'Pin this cluster', exact: true }).click();
  await expect(b.getByRole('button', { name: 'Unpin this cluster', exact: true })).toBeVisible();
  await expect(clusterInputB).toHaveValue('Draft cluster name');

  // Blurring Tab B commits the draft while keeping Tab A's pin
  await clusterInputB.blur();
  await expect.poll(() =>
    a.evaluate(() =>
      JSON.parse(localStorage.getItem('todos') ?? '[]').find((t: { id: string }) => t.id === 'cluster-1')
    )
  ).toMatchObject({ todo: 'Draft cluster name', isPinned: true });
});

test('a clean cluster name field refreshes from cross-tab edits', async ({ context, page: a }) => {
  await seedTaskManager(a);

  const b = await context.newPage();
  await b.goto('/');
  await expect(b.locator('.task-item:visible')).toHaveCount(1);

  const clusterInputA = a.getByRole('textbox', { name: 'Cluster name', exact: true });
  const clusterInputB = b.getByRole('textbox', { name: 'Cluster name', exact: true });

  await clusterInputA.click();
  await clusterInputA.fill('Q4 launch');
  await clusterInputA.press('Enter');

  await expect(clusterInputB).toHaveValue('Q4 launch');
});
