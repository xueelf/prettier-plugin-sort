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

  test('optionalDependencies and peerDependencies are alphabetised', async () => {
    const input = JSON.stringify(
      {
        optionalDependencies: { b: '1', a: '2' },
        peerDependencies: { z: '1', a: '2' },
      },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(Object.keys(out.optionalDependencies)).toEqual(['a', 'b']);
    expect(Object.keys(out.peerDependencies)).toEqual(['a', 'z']);
  });

  test('workspaces string array is alphabetised', async () => {
    const input = JSON.stringify(
      { workspaces: ['packages/c', 'packages/a', 'packages/b'] },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(out.workspaces).toEqual(['packages/a', 'packages/b', 'packages/c']);
  });

  test('empty object is left untouched', async () => {
    const input = '{}\n';
    expect(await format(input)).toBe(input);
  });

  test('is idempotent: running twice yields the same result', async () => {
    const input = JSON.stringify(
      {
        version: '1.0.0',
        name: 'pkg',
        keywords: ['b', 'a'],
        dependencies: { b: '1', a: '2' },
      },
      null,
      2,
    );
    const once = await format(input);
    const twice = await format(once);
    expect(twice).toBe(once);
  });

  test('unknown top-level keys are sorted alphabetically after known ones', async () => {
    const input = JSON.stringify(
      { zcustom: 1, acustom: 2, name: 'pkg', version: '1.0.0' },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(Object.keys(out)).toEqual(['name', 'version', 'acustom', 'zcustom']);
  });
});
