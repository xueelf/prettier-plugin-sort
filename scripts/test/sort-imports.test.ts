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

describe('sort imports — grouping', () => {
  test('default order: builtin / external / parent / sibling / index', async () => {
    const input = [
      "import Foo from './foo';",
      "import lodash from 'lodash';",
      "import { readFile } from 'node:fs/promises';",
      "import Bar from '../bar';",
      "import path from 'path';",
      "import index from './';",
      '',
      'export const x = 1;',
      '',
    ].join('\n');

    const expected = [
      "import { readFile } from 'node:fs/promises';",
      "import path from 'path';",
      '',
      "import lodash from 'lodash';",
      '',
      "import Bar from '../bar';",
      '',
      "import Foo from './foo';",
      '',
      "import index from './';",
      '',
      'export const x = 1;',
      '',
    ].join('\n');
    expect(await format(input)).toBe(expected);
  });

  test('internal group (path aliases) sorts between external and parent by default', async () => {
    const input = [
      "import a from '@/utils';",
      "import b from 'lodash';",
      "import c from './local';",
      '',
    ].join('\n');
    const out = await format(input, {
      importOrderGroups: ['external', 'internal', 'sibling'],
    });
    expect(out).toBe(
      [
        "import b from 'lodash';",
        '',
        "import a from '@/utils';",
        '',
        "import c from './local';",
        '',
      ].join('\n'),
    );
  });

  test('importOrder=false leaves statements untouched', async () => {
    const input = [
      "import Foo from './foo';",
      "import lodash from 'lodash';",
      '',
    ].join('\n');
    const out = await format(input, { importOrder: false });
    expect(out).toBe(input);
  });

  test('importOrderSeparation=false keeps groups flush', async () => {
    const input = [
      "import a from 'lodash';",
      "import b from 'node:fs';",
      "import c from './c';",
      '',
    ].join('\n');
    const out = await format(input, { importOrderSeparation: false });
    expect(out).toBe(
      [
        "import b from 'node:fs';",
        "import a from 'lodash';",
        "import c from './c';",
        '',
      ].join('\n'),
    );
  });

  test('importOrderGroups reorders groups', async () => {
    const input = [
      "import a from 'lodash';",
      "import b from 'node:fs';",
      "import c from './c';",
      '',
    ].join('\n');
    const out = await format(input, {
      importOrderGroups: ['sibling', 'external', 'builtin'],
    });
    expect(out).toBe(
      [
        "import c from './c';",
        '',
        "import a from 'lodash';",
        '',
        "import b from 'node:fs';",
        '',
      ].join('\n'),
    );
  });

  test('leading line comment on an import is preserved', async () => {
    const input = [
      "import lodash from 'lodash';",
      '// keep this note',
      "import { readFile } from 'node:fs';",
      '',
    ].join('\n');

    const expected = [
      '// keep this note',
      "import { readFile } from 'node:fs';",
      '',
      "import lodash from 'lodash';",
      '',
    ].join('\n');
    expect(await format(input)).toBe(expected);
  });
});

describe('sort imports — edge cases', () => {
  test('no space between closing brace and from keyword is handled', async () => {
    const input = "import {type FC}from 'react';\n";
    // default importOrderTypeImports='separate' splits type into its own statement
    const expected = "import type { FC } from 'react';\n";
    expect(await format(input)).toBe(expected);
  });

  test('blank line is inserted between last import and following code', async () => {
    const input = [
      "import { useState } from 'react';",
      'const x = 1;',
      '',
    ].join('\n');
    const expected = [
      "import { useState } from 'react';",
      '',
      'const x = 1;',
      '',
    ].join('\n');
    expect(await format(input)).toBe(expected);
  });

  test('side-effect imports act as barriers: each segment sorted independently', async () => {
    const input = [
      "import B from 'b';",
      "import A from 'a';",
      "import 'side-effect';",
      "import D from 'd';",
      "import C from 'c';",
      '',
    ].join('\n');
    const expected = [
      "import A from 'a';",
      "import B from 'b';",
      '',
      "import 'side-effect';",
      '',
      "import C from 'c';",
      "import D from 'd';",
      '',
    ].join('\n');
    expect(await format(input)).toBe(expected);
  });

  test('side-effect imports stay in place and are not moved across the barrier', async () => {
    const input = [
      "import z from 'z';",
      "import 'polyfill';",
      "import a from 'a';",
      '',
      'export const x = 1;',
      '',
    ].join('\n');
    const expected = [
      "import z from 'z';",
      '',
      "import 'polyfill';",
      '',
      "import a from 'a';",
      '',
      'export const x = 1;',
      '',
    ].join('\n');
    expect(await format(input)).toBe(expected);
  });

  test('preserves ES2023 import attributes (with clause)', async () => {
    const input = [
      "import b from 'b';",
      "import data from './data.json' with { type: 'json' };",
      "import a from 'a';",
      '',
    ].join('\n');
    const expected = [
      "import a from 'a';",
      "import b from 'b';",
      '',
      "import data from './data.json' with { type: 'json' };",
      '',
    ].join('\n');
    expect(await format(input)).toBe(expected);
  });

  test('preserves import attributes on side-effect import', async () => {
    const input = "import './config.json' with { type: 'json' };\n";
    expect(await format(input)).toBe(input);
  });

  test('is idempotent: already-sorted input stays unchanged', async () => {
    const input = [
      "import { readFile } from 'node:fs/promises';",
      '',
      "import lodash from 'lodash';",
      '',
      "import App from './App';",
      '',
    ].join('\n');
    expect(await format(input)).toBe(input);
    expect(await format(await format(input))).toBe(input);
  });

  test('handles multi-line block comment above import', async () => {
    const input = [
      '/**',
      ' * important doc',
      ' */',
      "import z from 'z';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expected = [
      "import a from 'a';",
      '/**',
      ' * important doc',
      ' */',
      "import z from 'z';",
      '',
    ].join('\n');
    expect(await format(input)).toBe(expected);
  });

  test('merges default import and namespace import from the same source', async () => {
    const input = [
      "import Foo from 'mod';",
      "import * as ns from 'mod';",
      '',
    ].join('\n');
    const expected = "import Foo, * as ns from 'mod';\n";
    expect(await format(input)).toBe(expected);
  });

  test('empty file is untouched', async () => {
    expect(await format('')).toBe('');
  });

  test('file with only comments is untouched', async () => {
    const input = '// just a note\n/* nothing here */\n';
    expect(await format(input)).toBe(input);
  });
});
