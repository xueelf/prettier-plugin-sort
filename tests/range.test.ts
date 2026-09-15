import { describe, expect, test } from 'bun:test';

import { format } from 'prettier';

import sortPlugin from '../src';

describe('range formatting', () => {
  test.each([
    'typescript',
    'babel',
    'flow',
    'acorn',
    'espree',
    'meriyah',
    'babel-flow',
    'babel-ts',
  ])(
    'preserves imports outside the selected statement with %s',
    async parser => {
      const sourceText = [
        'import { b } from "pkg";',
        'import { a } from "pkg";',
        '',
        'const answer=42;',
        'const untouched=1;',
        '',
      ].join('\n');
      const rangeStart = sourceText.indexOf('const answer');
      const options = {
        parser,
        rangeStart,
        rangeEnd: rangeStart + 'const answer=42;'.length,
      };

      expect(
        await format(sourceText, { ...options, plugins: [sortPlugin] }),
      ).toBe(await format(sourceText, options));
    },
  );

  test('preserves sorting boundaries when Prettier preprocesses the selected imports again', async () => {
    const sourceText =
      'import { b } from "pkg";\nimport { a } from "pkg";\nconst answer=42;\n';
    const options = {
      parser: 'typescript',
      rangeStart: 0,
      rangeEnd: sourceText.indexOf('\nconst answer'),
    };

    expect(
      await format(sourceText, { ...options, plugins: [sortPlugin] }),
    ).toBe(await format(sourceText, options));
  });

  test.each([
    ['json', 'package.json'],
    ['json-stringify', 'package.json'],
    ['json', 'tsconfig.json'],
  ])(
    'preserves the selected JSON context with %s and %s',
    async (parser, filepath) => {
      const sourceText =
        '{"version":"1.0.0","name":"demo","compilerOptions":{"strict":true,"target":"ESNext"}}';
      const rangeStart = sourceText.indexOf('"strict"');
      const options = {
        parser,
        filepath,
        rangeStart,
        rangeEnd: rangeStart + '"strict":true'.length,
      };

      expect(
        await format(sourceText, { ...options, plugins: [sortPlugin] }),
      ).toBe(await format(sourceText, options));
    },
  );

  test('sorts when the range covers the whole file', async () => {
    const sourceText = 'import { b } from "pkg";\nimport { a } from "pkg";\n';
    const options = { parser: 'typescript', plugins: [sortPlugin] };

    expect(
      await format(sourceText, {
        ...options,
        rangeStart: 0,
        rangeEnd: sourceText.length,
      }),
    ).toBe(await format(sourceText, options));
  });

  test('sorts the script block selected by the Vue host parser', async () => {
    const sourceText = [
      '<script setup lang="ts">',
      'import { b } from "pkg";',
      'import { a } from "pkg";',
      'const answer=42;',
      '</script>',
      '<template><div>hello</div></template>',
      '',
    ].join('\n');
    const rangeStart = sourceText.indexOf('const answer');

    expect(
      await format(sourceText, {
        parser: 'vue',
        plugins: [sortPlugin],
        rangeStart,
        rangeEnd: rangeStart + 'const answer=42;'.length,
      }),
    ).toBe(
      [
        '<script setup lang="ts">',
        'import { a, b } from "pkg";',
        '',
        'const answer = 42;',
        '</script>',
        '<template><div>hello</div></template>',
      ].join('\n'),
    );
  });
});
