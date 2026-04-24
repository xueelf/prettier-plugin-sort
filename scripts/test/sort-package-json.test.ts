import { describe, expect, test } from 'bun:test';

import prettier from 'prettier';

import plugin from '../../src';

const format = (source: string, opts: Record<string, unknown> = {}) =>
  prettier.format(source, {
    plugins: [plugin],
    parser: 'json-stringify',
    filepath: '/tmp/package.json',
    ...opts,
  });

describe('sort package.json', () => {
  test('reorders top-level keys to the canonical order', async () => {
    const input = JSON.stringify(
      {
        scripts: { build: 'tsc' },
        name: 'pkg',
        version: '1.0.0',
        devDependencies: { b: '1', a: '2' },
      },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(Object.keys(out)).toEqual([
      'name',
      'version',
      'scripts',
      'devDependencies',
    ]);
  });

  test('dependency maps are always alphabetised, even with packageJsonOrder=false', async () => {
    const input = JSON.stringify(
      { dependencies: { b: '1', a: '2', c: '3' } },
      null,
      2,
    );
    const out = await format(input, { packageJsonOrder: false });
    expect(Object.keys(JSON.parse(out).dependencies)).toEqual(['a', 'b', 'c']);
  });

  test('auto-detects string arrays and alphabetises them', async () => {
    const input = JSON.stringify(
      { keywords: ['c', 'a', 'b'], files: ['z.js', 'a.js'] },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(out.keywords).toEqual(['a', 'b', 'c']);
    expect(out.files).toEqual(['a.js', 'z.js']);
  });

  test('non-string arrays are left untouched', async () => {
    const input = JSON.stringify({ keywords: [1, 3, 2] }, null, 2);
    const out = JSON.parse(await format(input));
    expect(out.keywords).toEqual([1, 3, 2]);
  });

  test('packageJsonOrderExcludeKeys opts specific keys out', async () => {
    const input = JSON.stringify(
      {
        keywords: ['c', 'a', 'b'],
        dependencies: { b: '1', a: '2' },
      },
      null,
      2,
    );
    const out = JSON.parse(
      await format(input, {
        packageJsonOrderExcludeKeys: ['keywords', 'dependencies'],
      }),
    );
    expect(out.keywords).toEqual(['c', 'a', 'b']);
    expect(Object.keys(out.dependencies)).toEqual(['b', 'a']);
  });

  test('non-package.json json files are untouched', async () => {
    const input = JSON.stringify({ b: 1, a: 2 }, null, 2) + '\n';
    const out = await format(input, {
      parser: 'json',
      filepath: '/tmp/other.json',
    });
    expect(out).toMatch(/"b": 1/);
  });
});
