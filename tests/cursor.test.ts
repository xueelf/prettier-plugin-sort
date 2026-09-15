import { expect, test } from 'bun:test';

import prettier, { type Options } from 'prettier';

import sortPlugin, { type SortOptions } from '../src';

async function expectCursor(
  sourceWithCursor: string,
  expectedWithCursor: string,
  options: Options & SortOptions = {},
): Promise<void> {
  const cursorOffset = sourceWithCursor.indexOf('|');
  const sourceText = sourceWithCursor.replace('|', '');
  const expectedOffset = expectedWithCursor.indexOf('|');
  const expectedText = expectedWithCursor.replace('|', '');
  const result = await prettier.formatWithCursor(sourceText, {
    parser: 'typescript',
    plugins: [sortPlugin],
    singleQuote: true,
    ...options,
    cursorOffset,
  });

  expect(result.formatted).toBe(expectedText);
  expect(result.cursorOffset).toBe(expectedOffset);
}

test('keeps the cursor in code after imports are merged', async () => {
  await expectCursor(
    'import { b } from "pkg";\nimport { a } from "pkg";\n\nconst ans|wer=42;\nconst untouched=1;\n',
    "import { a, b } from 'pkg';\n\nconst ans|wer = 42;\nconst untouched = 1;\n",
  );
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
])('follows a moved import binding with the %s parser', async parser => {
  await expectCursor(
    "import zeb|ra from 'z';\nimport alpha from 'a';\n",
    "import alpha from 'a';\nimport zeb|ra from 'z';\n",
    { parser },
  );
});

test('follows a type binding into a separate declaration', async () => {
  await expectCursor(
    "import { alpha, type Ze|bra } from 'pkg';\n",
    "import type { Ze|bra } from 'pkg';\nimport { alpha } from 'pkg';\n",
  );
});

test('distinguishes an imported name from the local alias', async () => {
  await expectCursor(
    "import { zebra as ze|braAlias, alpha as zebra } from 'pkg';\n",
    "import { alpha as zebra, zebra as ze|braAlias } from 'pkg';\n",
  );
});

test('follows reordered export specifiers by exported name', async () => {
  await expectCursor(
    "export { zebra as ze|braAlias, alpha } from 'pkg';\n",
    "export { alpha, zebra as ze|braAlias } from 'pkg';\n",
  );
});

test('distinguishes equal JSON values by their property paths', async () => {
  await expectCursor(
    '{"dependencies":{"zebra":"sa|me","alpha":"same"},"name":"example"}',
    '{\n  "name": "example",\n  "dependencies": {\n    "alpha": "same",\n    "zebra": "sa|me"\n  }\n}\n',
    { parser: 'json-stringify', filepath: 'package.json' },
  );
});

test('follows string array values when package fields are sorted', async () => {
  await expectCursor(
    '{"bundledDependencies":["ze|bra","alpha"],"name":"example"}',
    '{\n  "name": "example",\n  "bundledDependencies": [\n    "alpha",\n    "ze|bra"\n  ]\n}\n',
    { parser: 'json-stringify', filepath: 'package.json' },
  );
});

test('keeps the cursor in escaped JSON literals', async () => {
  await expectCursor(
    '{"version":"1.0.0","na\\u006de":"exa|mple"}',
    '{\n  "na\\u006de": "exa|mple",\n  "version": "1.0.0"\n}\n',
    { parser: 'json-stringify', filepath: 'package.json' },
  );
});

test('distinguishes repeated booleans while sorting compiler options', async () => {
  await expectCursor(
    '{"compilerOptions":{"strict":tr|ue,"skipLibCheck":true,"target":"ESNext"}}',
    '{\n  "compilerOptions": {\n    "target": "ESNext",\n\n    "strict": tr|ue,\n\n    "skipLibCheck": true\n  }\n}\n',
    { parser: 'json', filepath: 'tsconfig.json' },
  );
});

test('moves the cursor with an import comment', async () => {
  await expectCursor(
    "// ze|bra import\nimport zebra from 'z';\nimport alpha from 'a';\n",
    "import alpha from 'a';\n// ze|bra import\nimport zebra from 'z';\n",
  );
});

test('preserves the source order when a cursor comment has no unique match', async () => {
  const sourceWithCursor =
    "// note\nimport zebra from 'z';\n// no|te\nimport alpha from 'a';\n";
  const sourceText = sourceWithCursor.replace('|', '');
  const sortedText = await prettier.format(sourceText, {
    parser: 'typescript',
    plugins: [sortPlugin],
    singleQuote: true,
  });

  expect(sortedText).not.toBe(sourceText);
  await expectCursor(sourceWithCursor, sourceWithCursor);
});

test('keeps normalized BOM and CRLF offsets aligned', async () => {
  await expectCursor(
    '\uFEFFimport { b } from "pkg";\r\nimport { a } from "pkg";\r\nconst ans|wer=42;\r\n',
    "\uFEFFimport { a, b } from 'pkg';\r\n\r\nconst ans|wer = 42;\r\n",
    { endOfLine: 'crlf' },
  );
});

test.each(['start', 'end'] as const)(
  'preserves the cursor at the %s of the file',
  async boundary => {
    const sourceText = "import zebra from 'z';\nimport alpha from 'a';\n";
    const expectedText = "import alpha from 'a';\nimport zebra from 'z';\n";

    await expectCursor(
      boundary === 'start' ? `|${sourceText}` : `${sourceText}|`,
      boundary === 'start' ? `|${expectedText}` : `${expectedText}|`,
    );
  },
);
