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
