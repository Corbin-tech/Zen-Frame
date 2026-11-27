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

test('weekly check-in saves connection, recharge, and rotating mindful prompt and creates a check-in task', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'goals');

  await page.getByLabel('Someone to check in on this week').fill('Maya');
  await page.getByRole('button', { name: 'Add as a task', exact: true }).click();
  await expect(page.getByText('Added to tasks', { exact: true })).toBeVisible();

  // Switching to another person allows adding them, while switching back to Maya recognizes the existing open task
  await page.getByLabel('Someone to check in on this week').fill('Noah');
  await page.getByRole('button', { name: 'Add as a task', exact: true }).click();
  await expect(page.getByText('Added to tasks', { exact: true })).toBeVisible();
  await page.getByLabel('Someone to check in on this week').fill('Maya');
  await expect(page.getByText('Added to tasks', { exact: true })).toBeVisible();

  await page.getByLabel('How will you recharge this week?').fill('Long walk on Sunday');

  const mindfulTextarea = page.locator('textarea[name="checkin-mindful"]');
  const initialPrompt = await mindfulTextarea.locator('..').locator('span').textContent();
  await page.getByRole('button', { name: 'Another', exact: true }).click();
  const nextPrompt = await mindfulTextarea.locator('..').locator('span').textContent();
  expect(nextPrompt).not.toBe(initialPrompt);
  await mindfulTextarea.fill('Letting go of perfectionism');

  await page.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await page.reload();
  await openView(page, 'goals');

  await expect(page.getByLabel('Someone to check in on this week')).toHaveValue('Maya');
  await expect(page.getByText('Added to tasks', { exact: true })).toBeVisible();
  await expect(page.getByLabel('How will you recharge this week?')).toHaveValue('Long walk on Sunday');
  await expect(page.locator('textarea[name="checkin-mindful"]')).toHaveValue('Letting go of perfectionism');
  await expect(page.locator('textarea[name="checkin-mindful"]').locator('..').locator('span')).toHaveText(nextPrompt!);

  await openView(page, 'taskmanager');
  await expect(page.getByRole('checkbox', { name: 'Mark Check in on Maya done', exact: true })).toBeVisible();
});

test('optional rotating mindful prompt can be hidden and restored', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'goals');

  await expect(page.locator('textarea[name="checkin-mindful"]')).toBeVisible();
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(page.locator('textarea[name="checkin-mindful"]')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Show mindful prompt', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await page.reload();
  await openView(page, 'goals');

  await expect(page.locator('textarea[name="checkin-mindful"]')).toBeHidden();
  await page.getByRole('button', { name: 'Show mindful prompt', exact: true }).click();
  await expect(page.locator('textarea[name="checkin-mindful"]')).toBeVisible();
});

test('cycling onto the prompt another tab saved keeps that tab’s answer', async ({ context, page: a }) => {
  await a.goto('/');
  await openView(a, 'goals');
  await a.locator('textarea[name="checkin-mindful"]').fill('Original answer');
  await a.getByRole('button', { name: 'Save check-in', exact: true }).click();

  const b = await context.newPage();
  await b.goto('/');
  await openView(b, 'goals');

  // Both tabs cycle to the same next prompt; tab B answers and saves first
  await a.getByRole('button', { name: 'Another', exact: true }).click();
  await b.getByRole('button', { name: 'Another', exact: true }).click();
  await b.locator('textarea[name="checkin-mindful"]').fill('Answer from tab B');
  await b.getByRole('button', { name: 'Save check-in', exact: true }).click();

  // Tab A cycled onto the same prompt, which cleared its local answer — the remote answer must survive
  await expect(a.locator('textarea[name="checkin-mindful"]')).toHaveValue('Answer from tab B');
  await a.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await a.reload();
  await openView(a, 'goals');
  await expect(a.locator('textarea[name="checkin-mindful"]')).toHaveValue('Answer from tab B');
});

test('switching back to a person links their existing task when saving', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'goals');
  const person = page.getByLabel('Someone to check in on this week');
  await person.fill('Maya');
  await page.getByRole('button', { name: 'Add as a task', exact: true }).click();
  await person.fill('Noah');
  await page.getByRole('button', { name: 'Add as a task', exact: true }).click();
  await person.fill('Maya');
  await expect(page.getByText('Added to tasks', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('todos') ?? '[]').filter(t => t.todo === 'Check in on Maya').length
  )).toBe(1);
  await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('checkIns') ?? '{}')).length)).toBeGreaterThan(0);
  const saved = await page.evaluate(() => {
    const todos = JSON.parse(localStorage.getItem('todos') ?? '[]');
    const checkIns = JSON.parse(localStorage.getItem('checkIns') ?? '{}');
    const maya = todos.filter(t => t.todo === 'Check in on Maya');
    return { mayaCount: maya.length, mayaId: maya[0]?.id ?? null, linked: Object.values(checkIns).map(c => c.checkInPersonTaskId) };
  });
  expect(saved.mayaCount).toBe(1);
  expect(saved.linked).toEqual([saved.mayaId]);
});

test('a check-in task gets a mid-week due date this week and none for past weeks', async ({ page }) => {
  await page.goto('/');
  await openView(page, 'goals');
  await page.getByLabel('Someone to check in on this week').fill('Maya');
  await page.getByRole('button', { name: 'Add as a task', exact: true }).click();

  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const wednesday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 2);
  const expected = key(wednesday) >= key(today) ? key(wednesday) : key(today);
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('todos') ?? '[]').find(t => t.todo === 'Check in on Maya')?.dueDate ?? null
  )).toBe(expected);

  await page.getByRole('button', { name: 'Save check-in', exact: true }).click();
  await page.getByRole('button', { name: 'Previous week' }).click();
  await page.getByLabel('Someone to check in on this week').fill('Sam');
  await page.getByRole('button', { name: 'Add as a task', exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('todos') ?? '[]').some(t => t.todo === 'Check in on Sam')
  )).toBe(true);
  const pastWeekDue = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('todos') ?? '[]').find(t => t.todo === 'Check in on Sam')?.dueDate ?? null);
  expect(pastWeekDue).toBeNull();
});
