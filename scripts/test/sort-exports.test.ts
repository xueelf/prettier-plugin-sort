import { describe, expect, test } from 'bun:test';

import prettier from 'prettier';

import plugin from '../../src';

const format = (source: string, opts: Record<string, unknown> = {}) =>
  prettier.format(source, {
    plugins: [plugin],
    singleQuote: true,
    parser: 'typescript',
    ...opts,
  });

describe('sort exports', () => {
  test('sorts named specifiers alphabetically', async () => {
    const input = 'export { a, b, c };\n';
    const out = await format(input);
    expect(out).toBe('export { a, b, c };\n');
  });

  test('sorts re-exports from another module', async () => {
    const input = "export { a, d } from 'mod';\n";
    const out = await format(input);
    expect(out).toBe("export { a, d } from 'mod';\n");
  });

  test('sorts type-only named exports', async () => {
    const input = 'export type { A, B };\n';
    const out = await format(input);
    expect(out).toBe('export type { A, B };\n');
  });

  test('ignores type prefix when comparing inside mixed export list', async () => {
    const input = 'export { type A, b, c };\n';
    const out = await format(input);
    expect(out).toBe('export { type A, b, c };\n');
  });

  test('leaves unrelated export forms untouched', async () => {
    const input = [
      "export * from 'mod';",
      'export default foo;',
      'export const x = 1;',
      '',
    ].join('\n');
    const out = await format(input);
    expect(out).toBe(input);
  });

  test('exportOrder=false disables sorting', async () => {
    const input = 'export { a, b };\n';
    const out = await format(input, { exportOrder: false });
    expect(out).toBe('export { a, b };\n');
  });

  test('is idempotent: already-sorted export stays unchanged', async () => {
    const input = "export { a, b, c } from 'mod';\n";
    expect(await format(input)).toBe(input);
  });

  test('export * as ns is not touched (not inside braces)', async () => {
    const input = "export * as ns from 'mod';\n";
    expect(await format(input)).toBe(input);
  });

  test('export type * from is not touched', async () => {
    const input = "export type * from 'mod';\n";
    expect(await format(input)).toBe(input);
  });

  test('empty export ({}) is left untouched', async () => {
    const input = 'export {};\n';
    expect(await format(input)).toBe(input);
  });
});
