import { test, expect } from '@playwright/test';

test('TaskRow uses one chip-controlled checklist before and after accepting Breakdown', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('assistConsent', 'true');
    localStorage.setItem('todos', JSON.stringify([{
      id: 'steps-fixture', todo: 'Prepare the workshop', completed: false, isCluster: false,
      parentId: null, createdAt: new Date().toISOString(),
      steps: [
        { id: 'first', text: 'Open the workshop notes', done: true, minutes: 5 },
        { id: 'second', text: 'Gather the supplies', done: false, minutes: 5 },
      ],
    }]));
  });
  await page.route('**/api/assist/account/session', route => route.fulfill({ json: {
    email: 'fixture@example.com', tier: 'trial', trialRemaining: 20, billingAvailable: false,
    token: 'fixture-token', expiresAt: Math.floor(Date.now() / 1000) + 300,
  } }));
  const steps = ['Open the materials', 'Place the first item on the desk', 'Write the first action', 'Set a timer'];
  await page.route('**/api/assist/breakdown', route => route.fulfill({ json: {
    steps: steps.map(text => ({ text, minutes: 5 })),
  } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Task Manager', exact: true }).first().click();
  const row = page.locator('.task-item[data-task-id="steps-fixture"]');
  const chip = row.getByRole('button', { name: /^Steps for Prepare the workshop:/ });
  const checklist = row.locator('#steps-steps-fixture');
  await expect(chip).toHaveText('1/2');
  await expect(chip).toHaveAttribute('aria-expanded', 'false');
  await expect(checklist).toBeHidden();
  await expect(row.locator('details')).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Promote steps to cluster' })).toBeVisible();
  await chip.click();
  await expect(checklist.getByRole('checkbox')).toHaveCount(2);
  await expect(checklist.getByRole('checkbox').first()).toBeChecked();
  await expect(checklist.getByText('1 of 2 done')).toBeVisible();
  await row.getByRole('button', { name: 'Break down task Plus', exact: true }).click();
  await row.getByRole('button', { name: 'Find steps', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(chip).toHaveText('0/4');
  await expect(checklist.getByText('0 of 4 done')).toBeVisible();
  await expect(checklist.getByRole('checkbox')).toHaveCount(4);
  await expect(row.locator('details')).toHaveCount(0);
  for (const text of steps) await expect(checklist.getByText(text, { exact: true })).toBeVisible();
  await checklist.getByRole('checkbox').first().check();
  await expect(chip).toHaveText('1/4');
  await expect(checklist.getByText('1 of 4 done')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const task = JSON.parse(localStorage.getItem('todos') ?? '[]').find(task => task.id === 'steps-fixture');
    return task.steps.map(step => ({ text: step.text, done: step.done }));
  })).toEqual(steps.map((text, index) => ({ text, done: index === 0 })));
  await chip.click();
  await expect(checklist).toBeHidden();
});
