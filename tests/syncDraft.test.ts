import { describe, expect, it } from 'vitest';
import { resetDraft, syncDraft } from '../src/lib/syncDraft';

describe('syncDraft', () => {
  it('initializes an input and refreshes it when clean', () => {
    const el = { value: '' };
    syncDraft(el, 'First');
    expect(el.value).toBe('First');

    syncDraft(el, 'Second');
    expect(el.value).toBe('Second');
  });

  it('preserves an unsaved draft when the store re-renders or updates remotely', () => {
    const el = { value: '' };
    syncDraft(el, 'Original');
    el.value = 'Unsaved draft';

    // Another tab changes an unrelated field, re-syncing the same value
    syncDraft(el, 'Original');
    expect(el.value).toBe('Unsaved draft');

    // Another tab changes this field while the local draft is still unsaved
    syncDraft(el, 'Remote edit');
    expect(el.value).toBe('Unsaved draft');
  });

  it('resumes refreshing once the local draft is saved back to the store', () => {
    const el = { value: '' };
    syncDraft(el, 'Original');
    el.value = 'Saved locally';
    syncDraft(el, 'Original');
    expect(el.value).toBe('Saved locally');

    syncDraft(el, 'Saved locally');
    syncDraft(el, 'Later remote edit');
    expect(el.value).toBe('Later remote edit');
  });

  it('catches up to remote edits when a canceled draft blurs without firing change', () => {
    const el = { value: '' };
    syncDraft(el, 'Original');
    el.value = 'Draft';
    syncDraft(el, 'Remote edit');
    expect(el.value).toBe('Draft');

    // User undoes back to Original and blurs (no change event fires)
    el.value = 'Original';
    resetDraft(el, 'Remote edit');
    expect(el.value).toBe('Remote edit');

    syncDraft(el, 'Next remote edit');
    expect(el.value).toBe('Next remote edit');
  });
});
