import { expect, test } from 'bun:test';

import { applySourceTextEdits } from '../src/utils/source-text';

test('applies valid source text edits and rejects invalid ranges', () => {
  expect(
    applySourceTextEdits('abcdef', [
      { start: 1, end: 3, replacementText: 'B' },
      { start: 4, end: 6, replacementText: 'E' },
    ]),
  ).toBe('aBdE');
  expect(
    applySourceTextEdits('abcdef', [
      { start: 1, end: 3, replacementText: 'B' },
      { start: 2, end: 4, replacementText: 'C' },
    ]),
  ).toBeNull();
  expect(
    applySourceTextEdits('abcdef', [
      { start: 1.5, end: 3, replacementText: 'B' },
    ]),
  ).toBeNull();
});
