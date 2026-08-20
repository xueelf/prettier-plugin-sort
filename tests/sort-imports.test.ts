import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { join } from 'node:path';

import * as getTsconfigModule from 'get-tsconfig';
import { format } from 'prettier';
import htmlPlugin from 'prettier/plugins/html';

import sortPlugin from '../src/index';

import { formatTypeScriptWithSortPlugin } from './format-with-sort-plugin';

afterEach(() => mock.restore());

describe('sort imports — grouping', () => {
  test('default order: builtin / external / internal / parent / sibling / index', async () => {
    const sourceText = [
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

    const expectedText = [
      "import { readFile } from 'node:fs/promises';",
      '',
      "import lodash from 'lodash';",
      "import path from 'path';",
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

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('treats bare Node.js module names as external', async () => {
    const sourceText = [
      "import builtin from 'node:fs';",
      "import path from 'path';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportGroups: ['external', 'builtin'],
    });

    expect(formattedText).toBe(
      [
        "import path from 'path';",
        '',
        "import builtin from 'node:fs';",
        '',
      ].join('\n'),
    );
  });

  test('recognizes index modules with multi-part extensions', async () => {
    const sourceText = [
      "import sibling from './local';",
      "import index from './index.native.js';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportGroups: ['index', 'sibling'],
    });

    expect(formattedText).toBe(
      [
        "import index from './index.native.js';",
        '',
        "import sibling from './local';",
        '',
      ].join('\n'),
    );
  });

  test('does not infer internal aliases without tsconfig paths', async () => {
    const sourceText = [
      "import a from '@/utils';",
      "import b from 'lodash';",
      "import c from './local';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportGroups: ['external', 'internal', 'sibling'],
    });

    expect(formattedText).toBe(
      [
        "import a from '@/utils';",
        "import b from 'lodash';",
        '',
        "import c from './local';",
        '',
      ].join('\n'),
    );
  });

  test('uses paths from the referenced project that includes the current file', async () => {
    const projectRoot = join(import.meta.dir, 'virtual');
    const rootConfigPath = join(projectRoot, 'tsconfig.json');
    const vueFilePath = join(projectRoot, 'src', 'App.vue');
    const configSources = new Map([
      [
        rootConfigPath,
        '{"files":[],"references":[{"path":"./tsconfig.node.json"},{"path":"./tsconfig.app.json"}]}',
      ],
      [
        join(projectRoot, 'tsconfig.node.json'),
        '{"include":["*.config.ts"],"compilerOptions":{"paths":{"@node/*":["./build/*"]}}}',
      ],
      [
        join(projectRoot, 'tsconfig.app.json'),
        '{"include":["src/**/*.vue"],"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
      ],
    ]);
    const parseConfig = (configPath: string) =>
      JSON.parse(configSources.get(configPath) ?? '');
    const rootProject = {
      path: rootConfigPath,
      config: parseConfig(rootConfigPath),
    };

    spyOn(getTsconfigModule, 'getTsconfig').mockImplementation(searchPath =>
      searchPath === vueFilePath ? rootProject : null,
    );
    spyOn(getTsconfigModule, 'parseTsconfig').mockImplementation(parseConfig);

    const sourceText = [
      '<script setup lang="ts">',
      'import request from "@/utils/request";',
      'import nodeConfig from "@node/config";',
      'import axios from "axios";',
      '</script>',
      '',
    ].join('\n');

    expect(
      await format(sourceText, {
        filepath: vueFilePath,
        parser: 'vue',
        plugins: [htmlPlugin, sortPlugin],
      }),
    ).toBe(
      [
        '<script setup lang="ts">',
        'import nodeConfig from "@node/config";',
        'import axios from "axios";',
        '',
        'import request from "@/utils/request";',
        '</script>',
        '',
      ].join('\n'),
    );
  });

  test('esmImportSort=false leaves statements untouched', async () => {
    const sourceText = [
      "import Foo from './foo';",
      "import lodash from 'lodash';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportSort: false,
    });

    expect(formattedText).toBe(sourceText);
  });

  test('esmImportSeparation=false keeps groups flush', async () => {
    const sourceText = [
      "import a from 'lodash';",
      "import b from 'node:fs';",
      "import c from './c';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportSeparation: false,
    });

    expect(formattedText).toBe(
      [
        "import b from 'node:fs';",
        "import a from 'lodash';",
        "import c from './c';",
        '',
      ].join('\n'),
    );
  });

  test('esmImportGroups reorders groups', async () => {
    const sourceText = [
      "import a from 'lodash';",
      "import b from 'node:fs';",
      "import c from './c';",
      '',
    ].join('\n');
    const formattedText = await formatTypeScriptWithSortPlugin(sourceText, {
      esmImportGroups: ['sibling', 'external', 'builtin'],
    });

    expect(formattedText).toBe(
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
    const sourceText = [
      "import lodash from 'lodash';",
      '// keep this note',
      "import { readFile } from 'node:fs';",
      '',
    ].join('\n');

    const expectedText = [
      '// keep this note',
      "import { readFile } from 'node:fs';",
      '',
      "import lodash from 'lodash';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });
});

describe('sort imports — edge cases', () => {
  test('sorts a Vue script through its embedded TypeScript parser', async () => {
    const sourceText = [
      '<script setup lang="ts">',
      'import z from "z"',
      'import a from "a"',
      '</script>',
      '',
    ].join('\n');

    expect(
      await format(sourceText, {
        filepath: 'Component.vue',
        parser: 'vue',
        plugins: [htmlPlugin, sortPlugin],
      }),
    ).toBe(
      [
        '<script setup lang="ts">',
        'import a from "a";',
        'import z from "z";',
        '</script>',
        '',
      ].join('\n'),
    );
  });

  test('sorts a Markdown block through its embedded TypeScript parser', async () => {
    const sourceText = [
      '```typescript',
      'import z from "z";',
      'import a from "a";',
      '```',
      '',
    ].join('\n');

    expect(
      await format(sourceText, {
        parser: 'markdown',
        plugins: [sortPlugin],
        singleQuote: true,
      }),
    ).toBe(
      [
        '```typescript',
        "import a from 'a';",
        "import z from 'z';",
        '```',
        '',
      ].join('\n'),
    );
  });

  test('no space between closing brace and from keyword is handled', async () => {
    const sourceText = "import {z,type FC,a}from 'react';\n";
    const expectedText = [
      "import type { FC } from 'react';",
      "import { a, z } from 'react';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('blank line is inserted between last import and following code', async () => {
    const sourceText = [
      "import { useState } from 'react';",
      'const x = 1;',
      '',
    ].join('\n');
    const expectedText = [
      "import { useState } from 'react';",
      '',
      'const x = 1;',
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('side-effect imports act as barriers: each segment sorted independently', async () => {
    const sourceText = [
      "import B from 'b';",
      "import A from 'a';",
      "import 'side-effect';",
      "import D from 'd';",
      "import C from 'c';",
      '',
    ].join('\n');
    const expectedText = [
      "import A from 'a';",
      "import B from 'b';",
      '',
      "import 'side-effect';",
      '',
      "import C from 'c';",
      "import D from 'd';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('consecutive side-effect imports stay adjacent without blank lines between them', async () => {
    const sourceText = [
      "import z from 'z';",
      "import 'reset.css';",
      "import 'normalize.css';",
      "import 'theme.css';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import z from 'z';",
      '',
      "import 'reset.css';",
      "import 'normalize.css';",
      "import 'theme.css';",
      '',
      "import a from 'a';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('side-effect imports stay in place and are not moved across the barrier', async () => {
    const sourceText = [
      "import z from 'z';",
      "import 'polyfill';",
      "import a from 'a';",
      '',
      'export const x = 1;',
      '',
    ].join('\n');
    const expectedText = [
      "import z from 'z';",
      '',
      "import 'polyfill';",
      '',
      "import a from 'a';",
      '',
      'export const x = 1;',
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('preserves ES2023 import attributes (with clause)', async () => {
    const sourceText = [
      "import b from 'b';",
      "import data from './data.json' with { type: 'json' };",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      "import b from 'b';",
      '',
      "import data from './data.json' with { type: 'json' };",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('preserves import attributes on side-effect import', async () => {
    const sourceText = "import './config.json' with { type: 'json' };\n";

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('is idempotent: already-sorted source text stays unchanged', async () => {
    const sourceText = [
      "import { readFile } from 'node:fs/promises';",
      '',
      "import lodash from 'lodash';",
      '',
      "import App from './App';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('handles multi-line block comment above import', async () => {
    const sourceText = [
      '/**',
      ' * important doc',
      ' */',
      "import z from 'z';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      '/**',
      ' * important doc',
      ' */',
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('merges default import and namespace import from the same source', async () => {
    const sourceText = [
      "import Foo from 'mod';",
      "import * as ns from 'mod';",
      '',
    ].join('\n');
    const expectedText = "import Foo, * as ns from 'mod';\n";

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('empty file is untouched', async () => {
    expect(await formatTypeScriptWithSortPlugin('')).toBe('');
  });

  test('file with only comments is untouched', async () => {
    const sourceText = '// just a note\n/* nothing here */\n';

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('does not misparse top-level import.meta as an import statement', async () => {
    const sourceText = [
      "import a from 'a';",
      'console.log(import.meta.url);',
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      '',
      'console.log(import.meta.url);',
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('does not merge same-source imports when import attributes differ', async () => {
    const sourceText = [
      "import data from './x.json' with { type: 'json' };",
      "import other from './x.json';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('treats bare `bun` specifier as builtin', async () => {
    const sourceText = [
      "import lodash from 'lodash';",
      "import { build } from 'bun';",
      '',
    ].join('\n');
    const expectedText = [
      "import { build } from 'bun';",
      '',
      "import lodash from 'lodash';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('hoists non-contiguous top-level static imports to the first import position', async () => {
    const sourceText = [
      "import b from 'b';",
      'const x = 1;',
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      "import b from 'b';",
      '',
      'const x = 1;',
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('does not treat dynamic import() as a static import declaration', async () => {
    const sourceText = [
      "import b from 'b';",
      'const m = import("a");',
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      "import b from 'b';",
      '',
      "const m = import('a');",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('keeps multiple default imports from the same source (no swallow)', async () => {
    const sourceText = [
      "import A from 'mod';",
      "import B from 'mod';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('does not merge namespace import with named imports from the same source', async () => {
    const sourceText = [
      "import * as ns from 'mod';",
      "import { a } from 'mod';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('keeps conflicting local bindings instead of deduping them away', async () => {
    const sourceText = [
      "import { a } from 'mod';",
      "import { a as a2 } from 'mod';",
      "import { a } from 'mod';",
      '',
    ].join('\n');
    const expectedText = [
      "import { a, a as a2 } from 'mod';",
      "import { a } from 'mod';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('preserves assert attributes syntax (not rewritten to with)', async () => {
    const sourceText = [
      "import data from './x.json' assert { type: 'json' };",
      "import b from 'b';",
      '',
    ].join('\n');
    const expectedText = [
      "import b from 'b';",
      '',
      "import data from './x.json' assert { type: 'json' };",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('keeps a blank-line-separated file header above sorted imports', async () => {
    const sourceText = [
      '/** File overview. */',
      '',
      "import z from 'z';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      '/** File overview. */',
      '',
      "import a from 'a';",
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('does not merge same-source imports when trailing one has a leading comment', async () => {
    const sourceText = [
      "import { a } from 'mod';",
      '// important',
      "import { b } from 'mod';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('does not merge another import into a commented declaration', async () => {
    const sourceText = [
      '// important',
      "import { a } from 'mod';",
      "import { b } from 'mod';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('scopes conflicting binding counts to each comment merge region', async () => {
    const sourceText = [
      "import First from 'mod';",
      '// keep a separate',
      "import { a } from 'mod';",
      "import Second from 'mod';",
      "import { b } from 'mod';",
      '',
    ].join('\n');
    const expectedText = [
      "import First from 'mod';",
      "import Second, { b } from 'mod';",
      '// keep a separate',
      "import { a } from 'mod';",
      '',
    ].join('\n');

    expect(
      await formatTypeScriptWithSortPlugin(sourceText, {
        esmImportTypeStyle: 'mixed',
      }),
    ).toBe(expectedText);
  });

  test('does not split an import controlled by a leading comment', async () => {
    const sourceText = [
      '// eslint-disable-next-line import/no-unresolved',
      "import { type Foo, value } from 'missing';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('keeps conflicting default imports and merges named imports separately', async () => {
    const sourceText = [
      "import A from 'mod';",
      "import { x } from 'mod';",
      "import B from 'mod';",
      "import { y } from 'mod';",
      '',
    ].join('\n');
    const expectedText = [
      "import A from 'mod';",
      "import B from 'mod';",
      "import { x, y } from 'mod';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('keeps conflicting namespace imports and merges named imports separately', async () => {
    const sourceText = [
      "import * as A from 'mod';",
      "import { x } from 'mod';",
      "import * as B from 'mod';",
      "import { y } from 'mod';",
      '',
    ].join('\n');
    const expectedText = [
      "import * as A from 'mod';",
      "import * as B from 'mod';",
      "import { x, y } from 'mod';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('preserves comments inside an import declaration without reattaching them', async () => {
    const sourceText = [
      "import z from 'z';",
      "import { /* keep with b */ b, a } from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import { /* keep with b */ b, a } from 'a';",
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('moves a trailing line comment with its import declaration', async () => {
    const sourceText = [
      "import z from 'z'; // z binding",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      "import z from 'z'; // z binding",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('moves a multiline trailing block comment with its import declaration', async () => {
    const sourceText = [
      "import z from 'z'; /* keep with z",
      'continued */',
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      "import z from 'z'; /* keep with z",
      'continued */',
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('sorts named specifiers before an ordinary trailing comment', async () => {
    const sourceText = "import { z, a } from 'mod'; // note\n";
    const expectedText = "import { a, z } from 'mod'; // note\n";

    expect(
      await formatTypeScriptWithSortPlugin(sourceText, {
        esmImportTypeStyle: 'mixed',
      }),
    ).toBe(expectedText);
  });

  test('treats a trailing prettier-ignore comment as a sorting boundary', async () => {
    const sourceText = [
      'import z from "z"; // prettier-ignore',
      "import c from 'c';",
      "import b from 'b';",
      '',
    ].join('\n');
    const expectedText = [
      'import z from "z"; // prettier-ignore',
      "import b from 'b';",
      "import c from 'c';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('finds a trailing prettier-ignore after unrelated earlier comments', async () => {
    const sourceText = [
      '// earlier',
      'const value = 1;',
      'import z from "z"; // prettier-ignore',
      "import c from 'c';",
      "import b from 'b';",
      '',
    ].join('\n');
    const expectedText = [
      '// earlier',
      'const value = 1;',
      'import z from "z"; // prettier-ignore',
      "import b from 'b';",
      "import c from 'c';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('is idempotent when a comment separates same-source type and value imports', async () => {
    const sourceText = [
      '// note',
      "import { z, a } from '../y';",
      "import { type T, v } from '../y';",
      '',
    ].join('\n');
    const firstFormattedText = await formatTypeScriptWithSortPlugin(sourceText);

    expect(firstFormattedText).toBe(
      [
        "import type { T } from '../y';",
        '// note',
        "import { a, z } from '../y';",
        "import { v } from '../y';",
        '',
      ].join('\n'),
    );
    expect(await formatTypeScriptWithSortPlugin(firstFormattedText)).toBe(
      firstFormattedText,
    );
  });

  test('handles type-as-value specifier `type as foo` with type-only members', async () => {
    const sourceText = "import { type as foo, type Bar, z } from 'mod';\n";
    const expectedText = [
      "import type { Bar } from 'mod';",
      "import { type as foo, z } from 'mod';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('preserves source-phase imports without rewriting their phase', async () => {
    const sourceText = 'import source z from "./z.wasm";\n';

    expect(
      await formatTypeScriptWithSortPlugin(sourceText, { parser: 'babel' }),
    ).toBe("import source z from './z.wasm';\n");
  });

  test('preserves deferred imports without rewriting their phase', async () => {
    const sourceText = 'import defer * as z from "./z.js";\n';

    expect(
      await formatTypeScriptWithSortPlugin(sourceText, { parser: 'babel' }),
    ).toBe("import defer * as z from './z.js';\n");
  });

  test.each(['source', 'defer'])(
    'does not treat the default binding %s as an import phase',
    async defaultBinding => {
      const sourceText = `import ${defaultBinding}, { z, a } from 'mod';\n`;
      const expectedText = `import ${defaultBinding}, { a, z } from 'mod';\n`;

      expect(
        await formatTypeScriptWithSortPlugin(sourceText, {
          esmImportTypeStyle: 'mixed',
        }),
      ).toBe(expectedText);
    },
  );

  test('keeps assert and with requests separate even when attributes match', async () => {
    const sourceText = [
      "import { a } from 'mod' assert { type: 'json' };",
      "import { b } from 'mod' with { type: 'json' };",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('does not turn an empty type import into a runtime side-effect import', async () => {
    const sourceText = "import type {} from 'mod';\n";

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test('does not inline a Flow default binding from a type-only declaration', async () => {
    const sourceText = "import type Foo, { Bar } from 'mod';\n";

    expect(
      await formatTypeScriptWithSortPlugin(sourceText, {
        esmImportTypeStyle: 'inline-first',
        parser: 'babel-flow',
      }),
    ).toBe(sourceText);
  });

  test('preserves Flow typeof imports accepted by the babel-flow parser', async () => {
    const sourceText = [
      "import z from 'z';",
      "import typeof Foo from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import typeof Foo from 'a';",
      "import z from 'z';",
      '',
    ].join('\n');

    expect(
      await formatTypeScriptWithSortPlugin(sourceText, {
        parser: 'babel-flow',
      }),
    ).toBe(expectedText);
  });

  test('leaves an ignored import byte-for-byte intact and does not merge into it', async () => {
    const sourceText = [
      "import zed from 'z';",
      "import { z } from 'mod';",
      "import alpha from 'a';",
      '// prettier-ignore',
      'import { b,a } from "mod";',
      "import delta from 'd';",
      "import charlie from 'c';",
      '',
    ].join('\n');
    const expectedText = [
      "import alpha from 'a';",
      "import { z } from 'mod';",
      "import zed from 'z';",
      '// prettier-ignore',
      'import { b,a } from "mod";',
      "import charlie from 'c';",
      "import delta from 'd';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('does not treat prose mentioning prettier-ignore as a directive', async () => {
    const sourceText = [
      '// Explain prettier-ignore behavior.',
      "import z from 'z';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      '// Explain prettier-ignore behavior.',
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test.each([
    '/* Copyright (c) 2026 */',
    '/*! SPDX-License-Identifier: MIT */',
    '/* @generated */',
  ])('moves the import-attached comment %s with its import', async comment => {
    const sourceText = [
      comment,
      "import z from 'z';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      comment,
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('keeps a Prettier pragma in the first docblock', async () => {
    const sourceText = [
      '/** @format */',
      "import z from 'z';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      '/** @format */',
      "import a from 'a';",
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test.each(['// @format', '/** @FORMAT */', '/* ESLINT-DISABLE */'])(
    'moves the non-directive comment %s with its import',
    async comment => {
      const sourceText = [
        comment,
        "import z from 'z';",
        "import a from 'a';",
        '',
      ].join('\n');
      const expectedText = [
        "import a from 'a';",
        comment,
        "import z from 'z';",
        '',
      ].join('\n');

      expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(
        expectedText,
      );
    },
  );

  test.each([
    '// eslint-disable',
    '// eslint import/order: "off"',
    '// globals browser',
    '/** eslint-disable */',
    '/*\n * eslint-disable\n */',
  ])(
    'moves the unsupported ESLint comment %s with its import',
    async comment => {
      const sourceText = [
        comment,
        "import z from 'z';",
        "import a from 'a';",
        '',
      ].join('\n');
      const expectedText = [
        "import a from 'a';",
        comment,
        "import z from 'z';",
        '',
      ].join('\n');

      expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(
        expectedText,
      );
    },
  );

  test('does not treat a mid-file Prettier marker as a file pragma', async () => {
    const sourceText = [
      "import z from 'z';",
      '/* @format */',
      "import b from 'b';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      '/* @format */',
      "import b from 'b';",
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('keeps shebang and an ESLint directive before sorted imports', async () => {
    const sourceText = [
      '#!/usr/bin/env node',
      '/* eslint-disable */',
      "import z from 'z';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      '#!/usr/bin/env node',
      '/* eslint-disable */',
      "import a from 'a';",
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('treats standalone comments as sorting segment boundaries', async () => {
    const sourceText = [
      "import z from 'z';",
      '// section: local imports',
      '',
      "import b from 'b';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import z from 'z';",
      '// section: local imports',
      '',
      "import a from 'a';",
      "import b from 'b';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('keeps every same-line trailing block comment with its import', async () => {
    const sourceText = [
      "import z from 'z'; /* first */ /* second */",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      "import z from 'z'; /* first */ /* second */",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test.each(['/* note */', '/* prettier-ignore */'])(
    'does not attach an inter-statement comment %s to the previous import',
    async comment => {
      const sourceText = `import z from "z"; ${comment} import { b,a } from "a";\n`;
      const expectedText =
        comment === '/* prettier-ignore */'
          ? `import z from 'z';\n${comment} import { b,a } from "a";\n`
          : `import z from 'z';\n${comment} import { a, b } from 'a';\n`;

      expect(
        await formatTypeScriptWithSortPlugin(sourceText, {
          esmImportTypeStyle: 'mixed',
        }),
      ).toBe(expectedText);
    },
  );

  test('treats a file-level eslint directive between imports as a boundary', async () => {
    const sourceText = [
      "import z from 'z';",
      '/* eslint-disable */',
      "import b from 'b';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import z from 'z';",
      '/* eslint-disable */',
      "import a from 'a';",
      "import b from 'b';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('keeps an eslint rule configuration fixed between import sections', async () => {
    const sourceText = [
      "import z from 'z';",
      '/* eslint import/order: "off" */',
      "import b from 'b';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import z from 'z';",
      '/* eslint import/order: "off" */',
      "import a from 'a';",
      "import b from 'b';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('keeps an eslint global directive fixed', async () => {
    const eslintGlobalDirective = '/* globals browser */';
    const sourceText = [
      "import z from 'z';",
      eslintGlobalDirective,
      "import b from 'b';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import z from 'z';",
      eslintGlobalDirective,
      "import a from 'a';",
      "import b from 'b';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('does not treat prose beginning with ESLint as a directive', async () => {
    const sourceText = [
      '// ESLint handles this rule elsewhere.',
      "import z from 'z';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      '// ESLint handles this rule elsewhere.',
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('moves eslint-disable-next-line with the import it controls', async () => {
    const sourceText = [
      "import z from 'z';",
      '// eslint-disable-next-line import/no-unresolved',
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      '// eslint-disable-next-line import/no-unresolved',
      "import a from 'a';",
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('moves a trailing eslint-disable-next-line with the import it controls', async () => {
    const sourceText = [
      "import z from 'z'; // eslint-disable-next-line import/no-unresolved",
      "import b from 'b';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import a from 'a';",
      '// eslint-disable-next-line import/no-unresolved',
      "import b from 'b';",
      "import z from 'z';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('keeps a trailing eslint range directive fixed', async () => {
    const sourceText = [
      "import z from 'z'; /* eslint-disable import/no-unresolved */",
      "import b from 'b';",
      "import a from 'a';",
      '',
    ].join('\n');
    const expectedText = [
      "import z from 'z'; /* eslint-disable import/no-unresolved */",
      "import a from 'a';",
      "import b from 'b';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(expectedText);
  });

  test('does not move an import containing a position-sensitive eslint directive', async () => {
    const sourceText = [
      "import { /* eslint-disable import/no-unresolved */ z } from 'z';",
      "import b from 'b';",
      "import a from 'a';",
      '',
    ].join('\n');

    expect(await formatTypeScriptWithSortPlugin(sourceText)).toBe(sourceText);
  });

  test.each([
    'acorn',
    'babel',
    'babel-flow',
    'babel-ts',
    'espree',
    'flow',
    'meriyah',
  ])(
    'registers the non-default %s parser and keeps file directives fixed',
    async parserName => {
      const sourceText = [
        '#!/usr/bin/env node',
        '/* eslint-disable */',
        "import z from 'z';",
        "import a from 'a';",
        '',
      ].join('\n');
      const expectedText = [
        '#!/usr/bin/env node',
        '/* eslint-disable */',
        "import a from 'a';",
        "import z from 'z';",
        '',
      ].join('\n');

      expect(
        await formatTypeScriptWithSortPlugin(sourceText, {
          parser: parserName,
        }),
      ).toBe(expectedText);
    },
  );
});
