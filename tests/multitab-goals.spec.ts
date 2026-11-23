import { test, expect } from '@playwright/test';

for (const kind of ['goal', 'note'] as const) {
  test(`a draft ${kind} survives another tab saving a different ${kind}`, async ({ context, page: a }) => {
    await a.goto('/');
    await a.locator('button[data-tab="goals"]').click();
    const inputName = kind === 'goal' ? 'New goal' : 'New note';
    const fieldName = kind === 'goal' ? 'Goal' : 'Note';
    const addName = kind === 'goal' ? 'Add' : 'Add note';
    await a.getByRole('textbox', { name: inputName, exact: true }).fill('Original');
    await a.getByRole('button', { name: addName, exact: true }).click();
    const b = await context.newPage();
    await b.goto('/');
    await b.locator('button[data-tab="goals"]').click();
    const draft = b.getByRole('textbox', { name: fieldName, exact: true }).first();
    await draft.fill('Unsaved draft');
    await a.getByRole('textbox', { name: inputName, exact: true }).fill('Another item');
    await a.getByRole('button', { name: addName, exact: true }).click();
    await expect(b.getByRole('textbox', { name: fieldName, exact: true })).toHaveCount(2);
    await expect.poll(() => b.getByRole('textbox', { name: fieldName, exact: true }).evaluateAll(elements => elements.map(el => (el as HTMLInputElement).value).sort())).toEqual(['Another item', 'Unsaved draft']);
  });
}

test('an unsaved goal-note draft survives another tab editing the same goal', async ({ context, page: a }) => {
  await a.goto('/');
  await a.locator('button[data-tab="goals"]').click();
  await a.getByRole('textbox', { name: 'New goal', exact: true }).fill('Ship release');
  await a.getByRole('button', { name: 'Add', exact: true }).click();

  const b = await context.newPage();
  await b.goto('/');
  await b.locator('button[data-tab="goals"]').click();
  await b.getByRole('button', { name: 'Add notes & settings', exact: true }).click();
  const goalNotes = b.locator('textarea[name="goal-notes"]');
  await goalNotes.fill('Draft why this matters');

  await a.getByRole('checkbox', { name: 'Mark Ship release reached', exact: true }).check();
  await expect(b.getByRole('checkbox', { name: 'Mark Ship release not reached', exact: true })).toBeChecked();
  await expect(goalNotes).toHaveValue('Draft why this matters');

  await goalNotes.blur();
  await expect.poll(async () => {
    const goals = await a.evaluate(() => JSON.parse(localStorage.getItem('goals') || '[]'));
    return goals[0];
  }).toMatchObject({ title: 'Ship release', done: true, why: 'Draft why this matters' });
});

test('an unsaved goal-title draft survives another tab editing the same goal', async ({ context, page: a }) => {
  await a.goto('/');
  await a.locator('button[data-tab="goals"]').click();
  await a.getByRole('textbox', { name: 'New goal', exact: true }).fill('Original title');
  await a.getByRole('button', { name: 'Add', exact: true }).click();

  const b = await context.newPage();
  await b.goto('/');
  await b.locator('button[data-tab="goals"]').click();
  const goalTitle = b.getByRole('textbox', { name: 'Goal', exact: true });
  await goalTitle.fill('Draft title');

  await a.getByRole('checkbox', { name: 'Mark Original title reached', exact: true }).check();
  await expect(b.getByRole('checkbox', { name: 'Mark Original title not reached', exact: true })).toBeChecked();
  await expect(goalTitle).toHaveValue('Draft title');

  await goalTitle.blur();
  await expect.poll(async () => {
    const goals = await a.evaluate(() => JSON.parse(localStorage.getItem('goals') || '[]'));
    return goals[0];
  }).toMatchObject({ title: 'Draft title', done: true });
});

test('an unsaved note draft survives another tab pinning the same note', async ({ context, page: a }) => {
  await a.goto('/');
  await a.locator('button[data-tab="goals"]').click();
  await a.getByRole('textbox', { name: 'New note', exact: true }).fill('Original note');
  await a.getByRole('button', { name: 'Add note', exact: true }).click();

  const b = await context.newPage();
  await b.goto('/');
  await b.locator('button[data-tab="goals"]').click();
  const note = b.getByRole('textbox', { name: 'Note', exact: true });
  await note.fill('Unsaved note draft');

  await a.getByRole('button', { name: 'Pin note', exact: true }).click();
  await expect(b.getByRole('button', { name: 'Unpin note', exact: true })).toBeVisible();
  await expect(note).toHaveValue('Unsaved note draft');

  await note.blur();
  await expect.poll(async () => {
    const notes = await a.evaluate(() => JSON.parse(localStorage.getItem('notes') || '[]'));
    return notes[0];
  }).toMatchObject({ text: 'Unsaved note draft', pinned: true });
});

test('clean goal and note fields still refresh from cross-tab edits', async ({ context, page: a }) => {
  await a.goto('/');
  await a.locator('button[data-tab="goals"]').click();
  await a.getByRole('textbox', { name: 'New goal', exact: true }).fill('Original title');
  await a.getByRole('button', { name: 'Add', exact: true }).click();
  await a.getByRole('textbox', { name: 'New note', exact: true }).fill('Original note');
  await a.getByRole('button', { name: 'Add note', exact: true }).click();

  const b = await context.newPage();
  await b.goto('/');
  await b.locator('button[data-tab="goals"]').click();
  await b.getByRole('button', { name: 'Add notes & settings', exact: true }).click();

  await a.getByRole('textbox', { name: 'Goal', exact: true }).fill('Updated title');
  await a.getByRole('textbox', { name: 'Goal', exact: true }).blur();
  await a.getByRole('button', { name: 'Add notes & settings', exact: true }).click();
  await a.locator('textarea[name="goal-notes"]').fill('Updated why');
  await a.locator('textarea[name="goal-notes"]').blur();
  await a.getByRole('textbox', { name: 'Note', exact: true }).fill('Updated note');
  await a.getByRole('textbox', { name: 'Note', exact: true }).blur();

  await expect(b.getByRole('textbox', { name: 'Goal', exact: true })).toHaveValue('Updated title');
  await expect(b.locator('textarea[name="goal-notes"]')).toHaveValue('Updated why');
  await expect(b.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('Updated note');
});

test('undoing a draft after a remote edit catches up on blur', async ({ context, page: a }) => {
  await a.goto('/');
  await a.locator('button[data-tab="goals"]').click();
  await a.getByRole('textbox', { name: 'New goal', exact: true }).fill('Ship release');
  await a.getByRole('button', { name: 'Add', exact: true }).click();
  await a.getByRole('button', { name: 'Add notes & settings', exact: true }).click();
  await a.locator('textarea[name="goal-notes"]').fill('Original why');
  await a.locator('textarea[name="goal-notes"]').blur();

  const b = await context.newPage();
  await b.goto('/');
  await b.locator('button[data-tab="goals"]').click();
  await b.getByRole('button', { name: 'Notes & settings', exact: true }).click();
  const bNotes = b.locator('textarea[name="goal-notes"]');
  await expect(bNotes).toHaveValue('Original why');

  // Start a local draft in Tab B, then save a remote edit in Tab A
  await bNotes.fill('Temporary draft');
  await a.locator('textarea[name="goal-notes"]').fill('Remote why');
  await a.locator('textarea[name="goal-notes"]').blur();
  await expect(bNotes).toHaveValue('Temporary draft');

  // Undo back to the pre-focus value and blur (browser fires blur without change)
  await bNotes.fill('Original why');
  await bNotes.blur();
  await expect(bNotes).toHaveValue('Remote why');
});
