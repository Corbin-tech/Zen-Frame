import { expect, test } from 'vitest';
import { plural } from '../src/lib/plural';

test.each(['task', 'day', 'active day'])('%s counts use singular only for one', word => {
  expect(plural(0, word)).toBe(`0 ${word}s`);
  expect(plural(1, word)).toBe(`1 ${word}`);
  expect(plural(2, word)).toBe(`2 ${word}s`);
});
