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

  test('dedupes keywords, files, activationEvents — keeps original order', async () => {
    const input = JSON.stringify(
      { keywords: ['c', 'a', 'b', 'a', 'b'], files: ['z.js', 'a.js', 'z.js'] },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(out.keywords).toEqual(['c', 'a', 'b']);
    expect(out.files).toEqual(['z.js', 'a.js']);
  });

  test('bundledDependencies and extensionPack are deduped and sorted', async () => {
    const input = JSON.stringify(
      {
        bundledDependencies: ['c', 'a', 'b', 'a'],
        extensionPack: ['d', 'b', 'c', 'b'],
      },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(out.bundledDependencies).toEqual(['a', 'b', 'c']);
    expect(out.extensionPack).toEqual(['b', 'c', 'd']);
  });

  test('workspaces array is not sorted', async () => {
    const input = JSON.stringify(
      { workspaces: ['packages/c', 'packages/a', 'packages/b'] },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(out.workspaces).toEqual(['packages/c', 'packages/a', 'packages/b']);
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

  test('scripts keys are sorted with pre/post grouping and colon namespacing', async () => {
    const input = JSON.stringify(
      {
        name: 'pkg',
        scripts: {
          postbuild: 'echo done',
          'build:css': 'postcss',
          start: 'node .',
          build: 'tsc',
          prebuild: 'clean',
          'build:ts': 'tsc',
          test: 'vitest',
          'test:unit': 'vitest unit',
        },
      },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(Object.keys(out.scripts)).toEqual([
      'prebuild',
      'build',
      'postbuild',
      'build:css',
      'build:ts',
      'start',
      'test',
      'test:unit',
    ]);
  });

  test('betterScripts keys are sorted the same way as scripts', async () => {
    const input = JSON.stringify(
      {
        name: 'pkg',
        betterScripts: {
          test: 'vitest',
          build: 'tsc',
          prebuild: 'clean',
        },
      },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(Object.keys(out.betterScripts)).toEqual([
      'prebuild',
      'build',
      'test',
    ]);
  });

  test('exports keys: paths first, conditions after, default last, recursive', async () => {
    const input = JSON.stringify(
      {
        name: 'pkg',
        exports: {
          './foo': './dist/foo.js',
          import: './dist/index.mjs',
          default: './dist/index.js',
          require: './dist/index.cjs',
          './bar': './dist/bar.js',
        },
      },
      null,
      2,
    );
    const out = JSON.parse(await format(input));
    expect(Object.keys(out.exports)).toEqual([
      './bar',
      './foo',
      'import',
      'require',
      'default',
    ]);
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

  test('preserves CRLF line endings when endOfLine is crlf', async () => {
    const input = JSON.stringify(
      { name: 'pkg', version: '1.0.0' },
      null,
      2,
    );
    const out = await format(input, { endOfLine: 'crlf' });
    expect(out.endsWith('\r\n')).toBe(true);
  });
});
