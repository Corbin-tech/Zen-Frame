import { test, expect, type Page } from '@playwright/test';

// Each empty state offers one action. These tests start with no saved data.

async function openEmpty(page: Page, settings?: object) {
  await page.addInitScript(saved => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (saved) localStorage.setItem('settings', JSON.stringify(saved));
  }, settings);
  await page.goto('/');
}

const quickAdd = (page: Page) => page.getByRole('dialog', { name: /^New (task|cluster)$/ });

test('Overview empty states open Quick Add for a task or a cluster, and Set a goal opens Goals', async ({ page }) => {
  await openEmpty(page, { dashboardLayout: { top: ['stats'], main: ['clusters'], side: ['upnext', 'goals'] } });

  const upNext = page.locator('section').filter({ hasText: 'Add the next thing when it comes up.' });
  await upNext.getByRole('button', { name: 'New task' }).click();
  await expect(quickAdd(page)).toHaveAccessibleName('New task');
  await page.keyboard.press('Escape');
  await expect(quickAdd(page)).toBeHidden();

  const clusters = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Clusters' }) });
  await clusters.getByRole('button', { name: 'New cluster' }).click();
  await expect(quickAdd(page)).toHaveAccessibleName('New cluster');
  await page.keyboard.press('Escape');
  await expect(quickAdd(page)).toBeHidden();

  const goals = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Goals' }) });
  await goals.getByRole('button', { name: 'Set a goal' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('activeTab'))).toBe('goals');
});

test('Tasks empty state opens Quick Add for a task', async ({ page }) => {
  await openEmpty(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('change-tab', { detail: { tab: 'taskmanager' } })));
  const empty = page.locator('div').filter({ has: page.getByText('Add your first task.', { exact: true }) }).last();
  await empty.getByRole('button', { name: 'New task', exact: true }).click();
  await expect(quickAdd(page)).toHaveAccessibleName('New task');
});

test('Board empty To do column opens the new card field', async ({ page }) => {
  await openEmpty(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('change-tab', { detail: { tab: 'board' } })));
  await page.locator('li.board-empty').getByRole('button', { name: 'Add a task', exact: true }).click();
  await expect(page.locator('#board-new-todo')).toBeFocused();
});

test('Insights empty state opens Tasks', async ({ page }) => {
  await openEmpty(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('change-tab', { detail: { tab: 'insights' } })));
  await page.getByRole('button', { name: 'Open tasks', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('activeTab'))).toBe('taskmanager');
});
