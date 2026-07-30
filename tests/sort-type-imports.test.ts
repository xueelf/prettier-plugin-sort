import { describe, expect, test } from 'bun:test';

import { formatTypeScriptWithSortPlugin } from './format-with-sort-plugin';

describe('sort type imports', () => {
  test('separate (default): splits mixed into type-only + value', async () => {
    const sourceText = "import { a, type B } from 'mod';\n";
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(formattedText).toBe(
      ["import type { B } from 'mod';", "import { a } from 'mod';", ''].join(
        '\n',
      ),
    );
  });

  test('inline-first: types before values inside braces', async () => {
    const sourceText = "import { a, type B, c } from 'mod';\n";
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'inline-first',
    });

    expect(formattedText).toBe("import { type B, a, c } from 'mod';\n");
  });

  test('inline-last: types after values inside braces', async () => {
    const sourceText = "import { a, type B, c } from 'mod';\n";
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'inline-last',
    });

    expect(formattedText).toBe("import { a, c, type B } from 'mod';\n");
  });

  test('mixed: alphabetical without distinguishing type from value', async () => {
    const sourceText = "import { c, type B, a, type D } from 'mod';\n";
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'mixed',
    });

    expect(formattedText).toBe("import { a, type B, c, type D } from 'mod';\n");
  });

  test('import type { … } is preserved on its own statement', async () => {
    const sourceText = [
      "import type { B } from 'mod';",
      "import { a } from 'mod';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(formattedText).toBe(sourceText);
  });

  test.each(['inline-first', 'inline-last', 'mixed'] as const)(
    '%s preserves a standalone declaration-level type import',
    async esmImportTypeStyle => {
      const sourceText = "import type { T } from './module';\n";

      expect(
        await formatTypeScriptWithSortPlugin(sourceText, {
          esmImportTypeStyle,
        }),
      ).toBe(sourceText);
    },
  );

  test.each(['inline-first', 'inline-last', 'mixed'] as const)(
    '%s preserves declaration-level type imports when merging is disabled',
    async esmImportTypeStyle => {
      const sourceText = [
        "import type { Type } from './module';",
        "import { value } from './module';",
        '',
      ].join('\n');

      expect(
        await formatTypeScriptWithSortPlugin(sourceText, {
          esmImportMerge: false,
          esmImportTypeStyle,
        }),
      ).toBe(sourceText);
    },
  );

  test.each(['inline-first', 'inline-last', 'mixed'] as const)(
    '%s keeps merged declaration-level type imports type-only',
    async esmImportTypeStyle => {
      const sourceText = [
        "import type { B } from './module';",
        "import type { A } from './module';",
        '',
      ].join('\n');

      expect(
        await formatTypeScriptWithSortPlugin(sourceText, {
          esmImportTypeStyle,
        }),
      ).toBe("import type { A, B } from './module';\n");
    },
  );

  test.each([
    ['inline-first', "import { type Type, value } from './module';\n"],
    ['inline-last', "import { value, type Type } from './module';\n"],
    ['mixed', "import { type Type, value } from './module';\n"],
  ] as const)(
    '%s safely merges declaration-level type and value imports',
    async (esmImportTypeStyle, expectedText) => {
      const sourceText = [
        "import { value } from './module';",
        "import type { Type } from './module';",
        '',
      ].join('\n');

      expect(
        await formatTypeScriptWithSortPlugin(sourceText, {
          esmImportTypeStyle,
        }),
      ).toBe(expectedText);
    },
  );

  test('separate preserves an inline-only import', async () => {
    const sourceText = "import { type Type } from './module';\n";

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('inline-first: merges two imports from the same source into one', async () => {
    const sourceText = [
      "import Plugin from './dist/index.js';",
      "import type { SortOptions } from './dist/index.js';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'inline-first',
    });

    expect(formattedText).toBe(
      "import Plugin, { type SortOptions } from './dist/index.js';\n",
    );
  });

  test('inline-last: merges two imports from the same source into one', async () => {
    const sourceText = [
      "import { a } from 'mod';",
      "import { type B } from 'mod';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'inline-last',
    });

    expect(formattedText).toBe("import { a, type B } from 'mod';\n");
  });

  test('mixed: merges two imports from the same source into one', async () => {
    const sourceText = [
      "import { c } from 'mod';",
      "import type { A } from 'mod';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'mixed',
    });

    expect(formattedText).toBe("import { type A, c } from 'mod';\n");
  });

  test('separate: keeps type and value imports from the same source separate', async () => {
    const sourceText = [
      "import Plugin from './dist/index.js';",
      "import type { SortOptions } from './dist/index.js';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(formattedText).toBe(
      [
        "import type { SortOptions } from './dist/index.js';",
        "import Plugin from './dist/index.js';",
        '',
      ].join('\n'),
    );
  });

  test('esmImportMerge=false: keeps same-source imports as separate statements', async () => {
    const sourceText = [
      "import { a } from 'mod';",
      "import { b } from 'mod';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'mixed',
      esmImportMerge: false,
    });

    expect(formattedText).toBe(
      ["import { a } from 'mod';", "import { b } from 'mod';", ''].join('\n'),
    );
  });

  test('preserves `import type X` (default type import)', async () => {
    const sourceText = "import type X from 'mod';\n";

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('preserves `import type * as ns` (namespace type import)', async () => {
    const sourceText = "import type * as T from 'mod';\n";

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test.each([
    "import type DefaultType from './module';",
    "import type * as Namespace from './module';",
  ])(
    'does not merge `%s` with a value import in inline mode',
    async typeImport => {
      const sourceText = [
        typeImport,
        "import { value } from './module';",
        '',
      ].join('\n');

      expect(
        await formatTypeScriptWithSortPlugin(sourceText, {
          esmImportTypeStyle: 'inline-first',
        }),
      ).toBe(sourceText);
    },
  );

  test('does not clobber `import type X` when merged with named type import', async () => {
    const sourceText = [
      "import type X from 'mod';",
      "import type { A } from 'mod';",
      '',
    ].join('\n');
    const expectedText = [
      "import type X from 'mod';",
      "import type { A } from 'mod';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('inline-first: preserves `type as foo` (value import of name type) vs type-only Bar', async () => {
    const sourceText = "import { z, type as foo, type Bar } from 'mod';\n";
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'inline-first',
    });

    expect(formattedText).toBe(
      "import { type Bar, type as foo, z } from 'mod';\n",
    );
  });

  test('inline-last: four-style mix keeps type keyword semantics', async () => {
    const sourceText =
      "import { type as foo, type Bar, z, type type as t } from 'mod';\n";
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'inline-last',
    });

    expect(formattedText).toBe(
      "import { type as foo, z, type Bar, type type as t } from 'mod';\n",
    );
  });

  test('mixed: alphabetical sort key uses local binding (type as foo sorts under foo)', async () => {
    const sourceText = "import { z, type as foo, type Bar } from 'mod';\n";
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportTypeStyle: 'mixed',
    });

    expect(formattedText).toBe(
      "import { type Bar, type as foo, z } from 'mod';\n",
    );
  });
});
