import { describe, expect, test } from 'bun:test';

import { formatTypeScriptWithSortPlugin } from './format-with-sort-plugin';

describe('sort exports', () => {
  test('sorts named specifiers alphabetically', async () => {
    const sourceText = 'export { a, b, c };\n';
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(formattedText).toBe('export { a, b, c };\n');
  });

  test('sorts re-exports from another module', async () => {
    const sourceText = "export { d, a } from 'mod';\n";
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(formattedText).toBe("export { a, d } from 'mod';\n");
  });

  test('sorts type-only named exports', async () => {
    const sourceText = 'export type { A, B };\n';
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(formattedText).toBe('export type { A, B };\n');
  });

  test('ignores type prefix when comparing inside mixed export list', async () => {
    const sourceText = 'export { type A, b, c };\n';
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(formattedText).toBe('export { type A, b, c };\n');
  });

  test('leaves unrelated export forms untouched', async () => {
    const sourceText = [
      "export * from 'mod';",
      'export default foo;',
      'export const x = 1;',
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(formattedText).toBe(sourceText);
  });

  test('esmExportSpecifierSort=false disables sorting', async () => {
    const sourceText = 'export { a, b };\n';
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmExportSpecifierSort: false,
    });

    expect(formattedText).toBe('export { a, b };\n');
  });

  test('is idempotent: already-sorted export stays unchanged', async () => {
    const sourceText = "export { a, b, c } from 'mod';\n";

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('export * as ns is not touched (not inside braces)', async () => {
    const sourceText = "export * as ns from 'mod';\n";

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('export type * from is not touched', async () => {
    const sourceText = "export type * from 'mod';\n";

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('sorts mixed type and value specifiers', async () => {
    const sourceText = 'export { b, type A };\n';
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(formattedText).toBe('export { type A, b };\n');
  });

  test('empty export ({}) is left untouched', async () => {
    const sourceText = 'export {};\n';

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('does not rewrite export-like text inside strings', async () => {
    const sourceText = [
      "const s = 'export { z, a }';",
      'export { z, a };',
      '',
    ].join('\n');
    const expectedText = [
      "const s = 'export { z, a }';",
      'export { a, z };',
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('does not rewrite export-like text inside template literals', async () => {
    const sourceText = [
      'const s = `export { z, a }`;',
      'export { z, a };',
      '',
    ].join('\n');
    const expectedText = [
      'const s = `export { z, a }`;',
      'export { a, z };',
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('does not rewrite export-like text inside comments', async () => {
    const sourceText = [
      '// export { z, a }',
      '/* export { z, a } */',
      'export { z, a };',
      '',
    ].join('\n');
    const expectedText = [
      '// export { z, a }',
      '/* export { z, a } */',
      'export { a, z };',
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('leaves a specifier list unchanged when it contains line comments', async () => {
    const sourceText = [
      'export {',
      '  // keep b',
      '  b,',
      '  a,',
      '};',
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('leaves a specifier list unchanged when it contains block comments', async () => {
    const sourceText = 'export { b, /* cmt */ a };\n';

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('does not guess whether an inline comment belongs to the previous or next member', async () => {
    const sourceText = 'export { b /* belongs to b */, a };\n';

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('preserves a block comment immediately before the closing brace', async () => {
    const sourceText = 'export { b, a /* keep */};\n';
    const expectedText = 'export { b, a /* keep */ };\n';

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('leaves a prettier-ignore export byte-for-byte intact', async () => {
    const sourceText = '// prettier-ignore\nexport { z,a } from "mod";\n';

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test.each([
    'export { z,a }; // prettier-ignore\n',
    '/* note */ /* prettier-ignore */ export { z,a };\n',
  ])('respects an attached prettier-ignore comment', async sourceText => {
    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('finds a trailing prettier-ignore after unrelated earlier comments', async () => {
    const sourceText =
      '// earlier\nconst value = 1;\nexport { z,a }; // prettier-ignore\n';
    const expectedText =
      '// earlier\nconst value = 1;\nexport { z,a }; // prettier-ignore\n';

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test.each([
    'acorn',
    'babel',
    'babel-flow',
    'babel-ts',
    'espree',
    'flow',
    'meriyah',
    'typescript',
  ])('sorts export specifiers with the %s parser', async parserName => {
    expect(
      await formatTypeScriptWithSortPlugin("export { z, a } from 'mod';\n", {
        parser: parserName,
      }),
    ).toBe("export { a, z } from 'mod';\n");
  });
});
