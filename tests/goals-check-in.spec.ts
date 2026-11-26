import { test, expect } from '@playwright/test';
import { openView } from './nav';

test('an open weekly check-in refreshes answers saved in another tab', async ({ context, page: a }) => {
  await a.goto('/');
  await openView(a, 'goals');
  const b = await context.newPage();
  await b.goto('/');
  await openView(b, 'goals');
  await a.getByLabel('What went well this week?').fill('Finished the milestone');
  await a.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(b.getByLabel('What went well this week?')).toHaveValue('Finished the milestone');
  await b.getByLabel('What got in the way?').fill('Waiting for feedback');
  await b.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await a.reload();
  await openView(a, 'goals');
  await expect(a.getByLabel('What went well this week?')).toHaveValue('Finished the milestone');
  await expect(a.getByLabel('What got in the way?')).toHaveValue('Waiting for feedback');
});

test('a different week saved in another tab does not reset the open draft', async ({ context, page: a }) => {
  await a.goto('/');
  await openView(a, 'goals');
  const b = await context.newPage();
  await b.goto('/');
  await openView(b, 'goals');
  await b.getByLabel('What went well this week?').fill('Still drafting');
  await a.getByRole('button', { name: 'Previous week' }).click();
  await a.getByLabel('What went well this week?').fill('Last week');
  await a.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(b.getByRole('button', { name: /Week of/ })).toBeVisible();
  await expect(b.getByLabel('What went well this week?')).toHaveValue('Still drafting');
});

test('an unsaved answer survives another tab saving the same week', async ({ context, page: a }) => {
  await a.goto('/');
  await openView(a, 'goals');
  const b = await context.newPage();
  await b.goto('/');
  await openView(b, 'goals');
  await b.getByLabel('What went well this week?').fill('My unsaved answer');
  await a.getByLabel('What got in the way?').fill('Remote answer');
  await a.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(b.getByRole('button', { name: /Week of/ })).toBeVisible();
  await expect(b.getByLabel('What went well this week?')).toHaveValue('My unsaved answer');
  await expect(b.getByText('Unsaved changes', { exact: true })).toBeVisible();
});

test('saving a local answer preserves a different answer saved remotely', async ({ context, page: a }) => {
  await a.goto('/');
  await openView(a, 'goals');
  const b = await context.newPage();
  await b.goto('/');
  await openView(b, 'goals');
  await b.getByLabel('What went well this week?').fill('Local win');
  await a.getByLabel('What got in the way?').fill('Remote blocker');
  await a.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect(b.getByRole('button', { name: /Week of/ })).toBeVisible();
  await b.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await a.reload();
  await openView(a, 'goals');
  await expect(a.getByLabel('What went well this week?')).toHaveValue('Local win');
  await expect(a.getByLabel('What got in the way?')).toHaveValue('Remote blocker');
});

test('weekly check-in shows a dash when there are no goals', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'goals');

  const checkIn = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Weekly check-in', exact: true }),
  });
  const progressCard = checkIn.getByText('current goal progress', { exact: true }).locator('..');
  await expect(progressCard.locator('p').first()).toHaveText('–');
});

test('weekly check-in labels the live goals count as current progress', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'goals');
  await page.getByRole('textbox', { name: 'New goal', exact: true }).fill('Finish certification');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  const checkIn = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Weekly check-in', exact: true }),
  });
  const progressLabel = checkIn.getByText('current goal progress', { exact: true });
  const progressCard = progressLabel.locator('..');
  await expect(progressCard.getByText('0/1', { exact: true })).toBeVisible();

  await checkIn.getByRole('button', { name: 'Previous week' }).click();
  const thisWeek = checkIn.getByRole('button', { name: 'This week', exact: true });
  await expect(thisWeek).toBeEnabled();
  await expect(progressCard.getByText('0/1', { exact: true })).toBeVisible();

  await page.getByRole('checkbox', { name: 'Mark Finish certification reached', exact: true }).check();
  await expect(thisWeek).toBeEnabled();
  await expect(progressCard.getByText('1/1', { exact: true })).toBeVisible();
});
