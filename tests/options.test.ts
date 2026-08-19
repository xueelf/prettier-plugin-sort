import { expect, test } from 'bun:test';

import { type ParserOptions } from 'prettier';

import {
  type SortOptions,
  isPackageSortEnabled,
  resolveEsmOptions,
  resolveTsconfigOptions,
} from '../src/options';

test('normalizes invalid and duplicate option values', () => {
  const invalidOptions = {
    esmImportSort: 'invalid',
    esmImportGroups: ['external', 'invalid', 'external'],
    esmImportSeparation: null,
    esmImportTypeStyle: 'invalid',
    esmImportMerge: 0,
    esmExportSpecifierSort: {},
    packageSort: 'invalid',
    tsconfigSort: 'invalid',
    tsconfigSeparation: 'invalid',
  } satisfies Record<keyof SortOptions, unknown>;
  const prettierOptions = invalidOptions as unknown as ParserOptions &
    SortOptions;

  expect(resolveEsmOptions(prettierOptions)).toEqual({
    esmImportSort: true,
    esmImportGroups: [
      'external',
      'builtin',
      'internal',
      'parent',
      'sibling',
      'index',
    ],
    esmImportSeparation: true,
    esmImportTypeStyle: 'separate',
    esmImportMerge: true,
    esmExportSpecifierSort: true,
  });
  expect(isPackageSortEnabled(prettierOptions)).toBe(true);
  expect(resolveTsconfigOptions(prettierOptions)).toEqual({
    tsconfigSort: true,
    tsconfigSeparation: true,
  });
});
