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
});
