import { describe, expect, test } from 'bun:test';

import { applySourceTextEdits } from '../src/utils/source-text';

describe('apply source text edits', () => {
  test('applies valid edits regardless of input order', () => {
    expect(
      applySourceTextEdits('abcdef', [
        { start: 4, end: 6, replacementText: 'E' },
        { start: 1, end: 3, replacementText: 'B' },
      ]),
    ).toBe('aBdE');
  });

  test('returns the original text when there are no edits', () => {
    expect(applySourceTextEdits('abcdef', [])).toBe('abcdef');
  });

  test.each([
    [
      'overlapping',
      [
        { start: 1, end: 3, replacementText: 'B' },
        { start: 2, end: 4, replacementText: 'C' },
      ],
    ],
    ['fractional', [{ start: 1.5, end: 3, replacementText: 'B' }]],
    ['negative', [{ start: -1, end: 3, replacementText: 'B' }]],
    ['reversed', [{ start: 3, end: 1, replacementText: 'B' }]],
    ['out-of-bounds', [{ start: 1, end: 7, replacementText: 'B' }]],
  ])('rejects %s ranges', (_caseName, sourceTextEdits) => {
    expect(applySourceTextEdits('abcdef', sourceTextEdits)).toBeNull();
  });
});
