import { test, expect } from '@playwright/test';

for (const path of ['/principles', '/roadmap']) {
  test(`${path} has no sidebar gutter and skips workspace stores with sidebar nav`, async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('settings', JSON.stringify({ navLayout: 'side' }));
    });

    await page.goto(path);

    await expect(page.locator('html')).toHaveAttribute('data-nav', 'side');
    await expect(page.locator('body')).not.toHaveAttribute('data-workspace');

    const paddingLeft = await page.evaluate(() => getComputedStyle(document.body).paddingLeft);
    expect(paddingLeft).toBe('0px');

    const centeringOffset = await page.evaluate(() => {
      const container = document.querySelector('main > div');
      if (!container) return Infinity;
      const bodyRect = document.body.getBoundingClientRect();
      const rect = container.getBoundingClientRect();
      return Math.abs((rect.left - bodyRect.left) - (bodyRect.right - rect.right));
    });
    expect(centeringOffset).toBeLessThanOrEqual(1);

    const stores = await page.evaluate(() => {
      const alpine = (window as any).Alpine;
      return {
        theme: Boolean(alpine.store('theme')),
        settings: Boolean(alpine.store('settings')),
        todos: Boolean(alpine.store('todos')),
        goals: Boolean(alpine.store('goals')),
        pomoState: Boolean(alpine.store('pomoState')),
      };
    });
    expect(stores).toEqual({
      theme: true,
      settings: true,
      todos: false,
      goals: false,
      pomoState: false,
    });
  });
}

test('workspace page keeps sidebar gutter when sidebar nav is open or collapsed', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('settings', JSON.stringify({ navLayout: 'side', sidebarCollapsed: false }));
  });

  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-nav', 'side');
  await expect(page.locator('body')).toHaveAttribute('data-workspace', '');
  expect(await page.evaluate(() => getComputedStyle(document.body).paddingLeft)).toBe('236px');

  await page.evaluate(() => (window as any).Alpine.store('settings').update({ sidebarCollapsed: true }));
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
  expect(await page.evaluate(() => getComputedStyle(document.body).paddingLeft)).toBe('76px');
});
