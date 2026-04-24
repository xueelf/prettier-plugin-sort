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

describe('sort type imports', () => {
  test('separate (default): splits mixed into type-only + value', async () => {
    const input = "import { a, type B } from 'mod';\n";
    const out = await format(input);
    expect(out).toBe(
      ["import type { B } from 'mod';", "import { a } from 'mod';", ''].join(
        '\n',
      ),
    );
  });

  test('inline-first: types before values inside braces', async () => {
    const input = "import { a, type B, c } from 'mod';\n";
    const out = await format(input, { importOrderTypeImports: 'inline-first' });
    expect(out).toBe("import { type B, a, c } from 'mod';\n");
  });

  test('inline-last: types after values inside braces', async () => {
    const input = "import { a, type B, c } from 'mod';\n";
    const out = await format(input, { importOrderTypeImports: 'inline-last' });
    expect(out).toBe("import { a, c, type B } from 'mod';\n");
  });

  test('mixed: alphabetical without distinguishing type from value', async () => {
    const input = "import { c, type B, a, type D } from 'mod';\n";
    const out = await format(input, { importOrderTypeImports: 'mixed' });
    expect(out).toBe("import { a, type B, c, type D } from 'mod';\n");
  });

  test('import type { … } is preserved on its own statement', async () => {
    const input = [
      "import type { B } from 'mod';",
      "import { a } from 'mod';",
      '',
    ].join('\n');
    const out = await format(input);
    expect(out).toBe(input);
  });

  test('inline-first: merges two imports from the same source into one', async () => {
    const input = [
      "import Plugin from './dist/index.js';",
      "import type { SortOptions } from './dist/index.js';",
      '',
    ].join('\n');
    const out = await format(input, { importOrderTypeImports: 'inline-first' });
    expect(out).toBe(
      "import Plugin, { type SortOptions } from './dist/index.js';\n",
    );
  });

  test('inline-last: merges two imports from the same source into one', async () => {
    const input = [
      "import { a } from 'mod';",
      "import { type B } from 'mod';",
      '',
    ].join('\n');
    const out = await format(input, { importOrderTypeImports: 'inline-last' });
    expect(out).toBe("import { a, type B } from 'mod';\n");
  });

  test('mixed: merges two imports from the same source into one', async () => {
    const input = [
      "import { c } from 'mod';",
      "import type { A } from 'mod';",
      '',
    ].join('\n');
    const out = await format(input, { importOrderTypeImports: 'mixed' });
    expect(out).toBe("import { type A, c } from 'mod';\n");
  });

  test('separate: keeps type and value imports from the same source separate', async () => {
    const input = [
      "import Plugin from './dist/index.js';",
      "import type { SortOptions } from './dist/index.js';",
      '',
    ].join('\n');
    const out = await format(input);
    expect(out).toBe(
      [
        "import type { SortOptions } from './dist/index.js';",
        "import Plugin from './dist/index.js';",
        '',
      ].join('\n'),
    );
  });

  test('importOrderMergeDuplicates=false: keeps same-source imports as separate statements', async () => {
    const input = [
      "import { a } from 'mod';",
      "import { b } from 'mod';",
      '',
    ].join('\n');
    const out = await format(input, {
      importOrderTypeImports: 'mixed',
      importOrderMergeDuplicates: false,
    });
    expect(out).toBe(
      ["import { a } from 'mod';", "import { b } from 'mod';", ''].join('\n'),
    );
  });

  test('preserves `import type X` (default type import)', async () => {
    const input = "import type X from 'mod';\n";
    expect(await format(input)).toBe(input);
  });

  test('preserves `import type * as ns` (namespace type import)', async () => {
    const input = "import type * as T from 'mod';\n";
    expect(await format(input)).toBe(input);
  });

  test('does not clobber `import type X` when merged with named type import', async () => {
    const input = [
      "import type X from 'mod';",
      "import type { A } from 'mod';",
      '',
    ].join('\n');
    const expected = [
      "import type X from 'mod';",
      "import type { A } from 'mod';",
      '',
    ].join('\n');
    expect(await format(input)).toBe(expected);
  });
});
