import { test, expect } from '@playwright/test';
import { openView } from './nav';

declare global {
  interface Window {
    __clipboardWrites: string[];
    Alpine?: { $data: (el: Element) => { copySummary: () => Promise<void> } };
  }
}

test('hides Copy summary and avoids empty clipboard writes on an empty month', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-17T12:00:00'));
  await page.addInitScript(() => {
    window.__clipboardWrites = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          window.__clipboardWrites.push(text);
        }
      },
      configurable: true
    });
  });

  await page.goto('/');
  await openView(page, 'insights');
  await page.getByRole('button', { name: 'Play Stillpoint', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Stillpoint/ });
  await dialog.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.keyboard.press('ArrowRight');

  await expect(dialog.getByRole('button', { name: 'Watch again' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy summary' })).toBeHidden();

  await page.evaluate(() => {
    const root = document.querySelector('[x-data="recap"]');
    return root ? window.Alpine?.$data(root).copySummary() : undefined;
  });
  expect(await page.evaluate(() => window.__clipboardWrites)).toEqual([]);
  await expect(page.getByText('Summary copied')).toBeHidden();
});

test('copies summary and shows toast on a month with activity', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-17T12:00:00'));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('todos', JSON.stringify([
        { id: 'sample', text: 'Ship a feature', completed: true, completedAt: '2026-06-16T12:00:00.000Z', isCluster: false }
      ]));
    }
    window.__clipboardWrites = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          window.__clipboardWrites.push(text);
        }
      },
      configurable: true
    });
  });

  await page.goto('/');
  await openView(page, 'insights');
  await page.getByRole('button', { name: 'Play Stillpoint', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Stillpoint/ });
  await dialog.getByRole('button', { name: 'Pause', exact: true }).click();

  const watchAgain = dialog.getByRole('button', { name: 'Watch again' });
  for (let i = 0; i < 10 && !(await watchAgain.isVisible()); i++) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(watchAgain).toBeVisible();

  const copySummary = dialog.getByRole('button', { name: 'Copy summary' });
  await expect(copySummary).toBeVisible();
  await copySummary.click();

  await expect(page.getByText('Summary copied')).toBeVisible();
  const writes = await page.evaluate(() => window.__clipboardWrites);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain('My June on Zen Frame:');
  expect(writes[0]).toContain('1 task finished');
});
