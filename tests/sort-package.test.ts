import { describe, expect, test } from 'bun:test';

import { formatPackageJsonWithSortPlugin } from './format-with-sort-plugin';

async function sortPackageJson<T>(packageJson: T): Promise<T> {
  return JSON.parse(
    await formatPackageJsonWithSortPlugin(JSON.stringify(packageJson)),
  ) as T;
}

describe('sort package.json', () => {
  test('follows the canonical top-level and nested field order', async () => {
    const sourceText = JSON.stringify(
      {
        _private: true,
        version: '1.0.0',
        name: 'pkg',
        keywords: ['b', 'a', 'b'],
        scripts: {
          postbuild: 'done',
          'build:css': 'postcss',
          build: 'tsc',
          prebuild: 'clean',
        },
        exports: {
          default: './dist/index.js',
          import: './dist/index.mjs',
          './z': './dist/z.js',
          './a': './dist/a.js',
        },
        dependencies: { zod: '1', axios: '1' },
        zUnknown: true,
        $schema: 'https://json.schemastore.org/package.json',
        aUnknown: true,
      },
      null,
      2,
    );
    const sortedPackageJson = JSON.parse(
      await formatPackageJsonWithSortPlugin(sourceText),
    );

    expect(Object.keys(sortedPackageJson)).toEqual([
      '$schema',
      'name',
      'version',
      'keywords',
      'exports',
      'scripts',
      'dependencies',
      'aUnknown',
      'zUnknown',
      '_private',
    ]);
    expect(sortedPackageJson.keywords).toEqual(['b', 'a']);
    expect(Object.keys(sortedPackageJson.scripts)).toEqual([
      'prebuild',
      'build',
      'postbuild',
      'build:css',
    ]);
    expect(Object.keys(sortedPackageJson.exports)).toEqual([
      './z',
      './a',
      'import',
      'default',
    ]);
    expect(Object.keys(sortedPackageJson.dependencies)).toEqual([
      'axios',
      'zod',
    ]);
  });

  test('always sorts dependencies like npm', async () => {
    const sourceText = JSON.stringify({
      packageManager: 'pnpm@10.0.0',
      dependencies: { 'a-b': '1', a_b: '1' },
    });
    const sortedPackageJson = JSON.parse(
      await formatPackageJsonWithSortPlugin(sourceText),
    );

    expect(Object.keys(sortedPackageJson.dependencies)).toEqual(['a_b', 'a-b']);
  });

  test('sorts nested package metadata', async () => {
    const sortedPackageJson = await sortPackageJson({
      workspaces: {
        catalog: { z: '1', a: '1' },
        packages: ['z', 'a', 'z'],
      },
      directories: { test: 'test', bin: 'bin', lib: 'lib' },
      contributors: [{ url: 'url', email: 'email', name: 'name' }],
      author: { url: 'url', email: 'email', name: 'name' },
      bugs: { email: 'email', url: 'url' },
    });

    expect(Object.keys(sortedPackageJson.bugs)).toEqual(['url', 'email']);
    expect(Object.keys(sortedPackageJson.author)).toEqual([
      'name',
      'email',
      'url',
    ]);
    expect(Object.keys(sortedPackageJson.contributors[0]!)).toEqual([
      'name',
      'email',
      'url',
    ]);
    expect(Object.keys(sortedPackageJson.directories)).toEqual([
      'lib',
      'bin',
      'test',
    ]);
    expect(Object.keys(sortedPackageJson.workspaces)).toEqual([
      'packages',
      'catalog',
    ]);
    expect(sortedPackageJson.workspaces.packages).toEqual(['a', 'z']);
    expect(Object.keys(sortedPackageJson.workspaces.catalog)).toEqual([
      'a',
      'z',
    ]);
  });

  test('sorts nested tool configurations', async () => {
    const sortedPackageJson = await sortPackageJson({
      devEngines: {
        packageManager: { onFail: 'warn', version: '1', name: 'bun' },
      },
      volta: { yarn: '1', npm: '1', node: '1' },
      eslintConfig: {
        globals: { z: true, a: true },
        rules: { 'plugin/z': 'error', z: 'error', a: 'error' },
        parser: 'parser',
      },
      prettier: {
        overrides: [{ options: { z: true, a: true }, z: true, files: '*.ts' }],
        z: true,
        a: true,
      },
      'simple-git-hooks': {
        'pre-push': 'push',
        'pre-commit': 'commit',
      },
    });
    const prettierOverride = sortedPackageJson.prettier.overrides[0]!;

    expect(Object.keys(sortedPackageJson['simple-git-hooks'])).toEqual([
      'pre-commit',
      'pre-push',
    ]);
    expect(Object.keys(sortedPackageJson.prettier)).toEqual([
      'a',
      'z',
      'overrides',
    ]);
    expect(Object.keys(prettierOverride)).toEqual(['files', 'options', 'z']);
    expect(Object.keys(prettierOverride.options)).toEqual(['a', 'z']);
    expect(Object.keys(sortedPackageJson.eslintConfig)).toEqual([
      'parser',
      'rules',
      'globals',
    ]);
    expect(Object.keys(sortedPackageJson.eslintConfig.rules)).toEqual([
      'a',
      'z',
      'plugin/z',
    ]);
    expect(Object.keys(sortedPackageJson.eslintConfig.globals)).toEqual([
      'a',
      'z',
    ]);
    expect(Object.keys(sortedPackageJson.devEngines.packageManager)).toEqual([
      'name',
      'version',
      'onFail',
    ]);
    expect(Object.keys(sortedPackageJson.volta)).toEqual([
      'node',
      'npm',
      'yarn',
    ]);
  });

  test('sorts nested dependency configurations', async () => {
    const sortedPackageJson = await sortPackageJson({
      pnpm: {
        packageExtensions: {
          z: { dependencies: { z: '1', a: '1' } },
          a: {},
        },
        overrides: { z: '1', a: '1' },
        neverBuiltDependencies: ['z', 'a'],
      },
      engineStrict: { z: true, a: true },
      resolutions: { Z: '1', a: '1' },
      dependenciesMeta: {
        'pkg@2': { z: true, a: true },
        'pkg@1': {},
        a: {},
      },
    });

    expect(Object.keys(sortedPackageJson.resolutions)).toEqual(['Z', 'a']);
    expect(Object.keys(sortedPackageJson.engineStrict)).toEqual(['a', 'z']);
    expect(Object.keys(sortedPackageJson.dependenciesMeta)).toEqual([
      'a',
      'pkg@2',
      'pkg@1',
    ]);
    expect(Object.keys(sortedPackageJson.dependenciesMeta['pkg@2'])).toEqual([
      'a',
      'z',
    ]);
    expect(Object.keys(sortedPackageJson.pnpm)).toEqual([
      'neverBuiltDependencies',
      'overrides',
      'packageExtensions',
    ]);
    expect(Object.keys(sortedPackageJson.pnpm.overrides)).toEqual(['a', 'z']);
    expect(Object.keys(sortedPackageJson.pnpm.packageExtensions)).toEqual([
      'a',
      'z',
    ]);
    expect(
      Object.keys(sortedPackageJson.pnpm.packageExtensions.z.dependencies),
    ).toEqual(['a', 'z']);
  });

  test('sorts versioned pnpm override selectors by minimum SemVer', async () => {
    const sourceText = JSON.stringify({
      pnpm: {
        overrides: {
          'pkg@^10.0.0': '10',
          'pkg@^2.0.0': '2',
          'pkg@^1.0.0': '1',
          'pkg@^1.0.0-beta.10': 'beta.10',
          'pkg@^1.0.0-beta.2': 'beta.2',
          pkg: 'latest',
        },
      },
    });
    const sortedPackageJson = JSON.parse(
      await formatPackageJsonWithSortPlugin(sourceText),
    );

    expect(Object.keys(sortedPackageJson.pnpm.overrides)).toEqual([
      'pkg',
      'pkg@^1.0.0-beta.2',
      'pkg@^1.0.0-beta.10',
      'pkg@^1.0.0',
      'pkg@^2.0.0',
      'pkg@^10.0.0',
    ]);
  });

  test.each([
    ['^x', '^1.0.0'],
    ['~*', '^1.0.0'],
    ['>1.2', '^2.0.0'],
    ['>1', '^3.0.0'],
  ])(
    'sorts pnpm override range %s before %s by its minimum SemVer',
    async (lowerRange, higherRange) => {
      const sourceText = JSON.stringify({
        pnpm: {
          overrides: {
            [`pkg@${higherRange}`]: 'higher',
            [`pkg@${lowerRange}`]: 'lower',
          },
        },
      });
      const sortedPackageJson = JSON.parse(
        await formatPackageJsonWithSortPlugin(sourceText),
      );

      expect(Object.keys(sortedPackageJson.pnpm.overrides)).toEqual([
        `pkg@${lowerRange}`,
        `pkg@${higherRange}`,
      ]);
    },
  );

  test.each([
    ['pkg@>10.0.0', ['pkg@^2.0.0', 'pkg@>10.0.0']],
    ['pkg@>=10 <20', ['pkg@^2.0.0', 'pkg@>=10 <20']],
    ['pkg@^1 || >10', ['pkg@^1 || >10', 'pkg@^2']],
    ['pkg@^20 || >1', ['pkg@^20 || >1', 'pkg@^3']],
    ['pkg@^1 >10', ['pkg@^3', 'pkg@^1 >10']],
  ] as const)(
    'distinguishes the SemVer comparator in %s from a pnpm selector separator',
    async (_selector, expectedSelectors) => {
      const sourceText = JSON.stringify({
        pnpm: {
          overrides: Object.fromEntries(
            [...expectedSelectors]
              .reverse()
              .map(selector => [selector, selector]),
          ),
        },
      });
      const sortedPackageJson = JSON.parse(
        await formatPackageJsonWithSortPlugin(sourceText),
      );

      expect(Object.keys(sortedPackageJson.pnpm.overrides)).toEqual([
        ...expectedSelectors,
      ]);
    },
  );

  test.each([
    ['parent@2>child', 'parent@1>child', ['parent@1>child', 'parent@2>child']],
    [
      'parent@>10>child',
      'parent@^2>child',
      ['parent@^2>child', 'parent@>10>child'],
    ],
    [
      'parent@1>child@>10',
      'parent>child@>10',
      ['parent>child@>10', 'parent@1>child@>10'],
    ],
    [
      '@scope/parent@>10>@scope/child',
      '@scope/parent@^2>@scope/child',
      ['@scope/parent@^2>@scope/child', '@scope/parent@>10>@scope/child'],
    ],
  ] as const)(
    'sorts pnpm parent selectors in %s and %s',
    async (leftSelector, rightSelector, expectedSelectors) => {
      const sourceText = JSON.stringify({
        pnpm: {
          overrides: {
            [leftSelector]: 'left',
            [rightSelector]: 'right',
          },
        },
      });
      const sortedPackageJson = JSON.parse(
        await formatPackageJsonWithSortPlugin(sourceText),
      );

      expect(Object.keys(sortedPackageJson.pnpm.overrides)).toEqual([
        ...expectedSelectors,
      ]);
    },
  );

  test('falls back to lexical ordering for invalid pnpm override ranges', async () => {
    const sourceText = JSON.stringify({
      pnpm: {
        overrides: {
          'pkg@workspace:*': 'workspace',
          'pkg@catalog:': 'catalog',
        },
      },
    });
    const sortedPackageJson = JSON.parse(
      await formatPackageJsonWithSortPlugin(sourceText),
    );

    expect(Object.keys(sortedPackageJson.pnpm.overrides)).toEqual([
      'pkg@catalog:',
      'pkg@workspace:*',
    ]);
  });

  test('keeps pnpm override ordering transitive with invalid ranges', async () => {
    const sourceText = JSON.stringify({
      pnpm: {
        overrides: {
          'pkg@^15.invalid': 'invalid',
          'pkg@^10.0.0': '10',
          'pkg@^2.0.0': '2',
        },
      },
    });
    const sortedPackageJson = JSON.parse(
      await formatPackageJsonWithSortPlugin(sourceText),
    );

    expect(Object.keys(sortedPackageJson.pnpm.overrides)).toEqual([
      'pkg@^2.0.0',
      'pkg@^10.0.0',
      'pkg@^15.invalid',
    ]);
  });

  test('supports the explicit json parser for package.json', async () => {
    const sourceText = '{"version":"1.0.0","name":"pkg"}';
    const formattedText = await formatPackageJsonWithSortPlugin(sourceText, {
      parser: 'json',
    });

    expect(Object.keys(JSON.parse(formattedText))).toEqual(['name', 'version']);
  });

  test('packageSort=false leaves package.json untouched', async () => {
    const sourceText =
      JSON.stringify(
        {
          dependencies: { b: '1', a: '2' },
          name: 'pkg',
        },
        null,
        2,
      ) + '\n';

    expect(
      await formatPackageJsonWithSortPlugin(sourceText, {
        packageSort: false,
      }),
    ).toBe(sourceText);
  });

  test('does not sort ordinary JSON files', async () => {
    const sourceText = '{\n  "b": 1,\n  "a": 2\n}\n';

    expect(
      await formatPackageJsonWithSortPlugin(sourceText, {
        parser: 'json',
        filepath: 'settings.json',
      }),
    ).toBe(sourceText);
  });

  test('recognizes Windows package.json paths without Node path APIs', async () => {
    const formattedText = await formatPackageJsonWithSortPlugin(
      '{"version":"1.0.0","name":"pkg"}',
      {
        filepath: String.raw`C:\project\package.json`,
      },
    );

    expect(Object.keys(JSON.parse(formattedText))).toEqual(['name', 'version']);
  });

  test('preserves the configured line ending', async () => {
    const formattedText = await formatPackageJsonWithSortPlugin(
      '{"version":"1.0.0","name":"pkg"}',
      {
        endOfLine: 'crlf',
      },
    );

    expect(formattedText.endsWith('\r\n')).toBe(true);
    expect(formattedText.replaceAll('\r\n', '')).not.toContain('\n');
  });

  test('preserves numeric literals exactly while sorting fields', async () => {
    const sourceText =
      '{"unsafe":9007199254740993,"negativeZero":-0,"overflow":1e400,"name":"pkg"}';
    const formattedText = await formatPackageJsonWithSortPlugin(sourceText);

    expect(formattedText).toBe(
      '{\n  "name": "pkg",\n  "negativeZero": -0,\n  "overflow": 1e400,\n  "unsafe": 9007199254740993\n}\n',
    );
  });

  test.each(['json', 'json-stringify'] as const)(
    'preserves escaped strings and field names with the %s parser',
    async parser => {
      const sourceText = String.raw`{"version":"1.0.0","name":"p\u006bg","dependencies":{"z":"1","\u0061":"\u0031"},"path":"\/pkg"}`;
      const formattedText = await formatPackageJsonWithSortPlugin(sourceText, {
        parser,
      });

      expect(formattedText).toContain(String.raw`"name": "p\u006bg"`);
      expect(formattedText).toContain(String.raw`"\u0061": "\u0031"`);
      expect(formattedText).toContain(String.raw`"path": "\/pkg"`);
      expect(formattedText.indexOf(String.raw`"\u0061"`)).toBeLessThan(
        formattedText.indexOf('"z"'),
      );
    },
  );

  test.each([
    [
      'root',
      '{"version":"1.0.0","name":"first","name":"last"}',
      '{\n  "version": "1.0.0",\n  "name": "first",\n  "name": "last"\n}\n',
    ],
    [
      'nested',
      '{"scripts":{"test":"first","test":"last"},"version":"1.0.0","name":"pkg"}',
      '{\n  "scripts": {\n    "test": "first",\n    "test": "last"\n  },\n  "version": "1.0.0",\n  "name": "pkg"\n}\n',
    ],
  ])(
    'returns the original field order when %s object fields are duplicated',
    async (_location, sourceText, expectedText) => {
      expect(await formatPackageJsonWithSortPlugin(sourceText)).toBe(
        expectedText,
      );
    },
  );

  test.each([
    'toString',
    'constructor',
    'valueOf',
    'hasOwnProperty',
    '__proto__',
  ])('preserves the unknown field %s', async fieldName => {
    const sourceText = `{"version":"1.0.0","${fieldName}":{"keep":true},"name":"pkg"}`;
    const sortedPackageJson = JSON.parse(
      await formatPackageJsonWithSortPlugin(sourceText),
    );

    expect(Object.keys(sortedPackageJson)).toEqual([
      'name',
      'version',
      fieldName,
    ]);
    expect(
      Object.getOwnPropertyDescriptor(sortedPackageJson, fieldName)?.value,
    ).toEqual({ keep: true });
  });

  test('is idempotent', async () => {
    const sourceText = JSON.stringify({
      version: '1.0.0',
      name: 'pkg',
      dependencies: { b: '1', a: '2' },
    });
    const firstPassText = await formatPackageJsonWithSortPlugin(sourceText);
    const firstPassPackageJson = JSON.parse(firstPassText);

    expect(Object.keys(firstPassPackageJson)).toEqual([
      'name',
      'version',
      'dependencies',
    ]);
    expect(Object.keys(firstPassPackageJson.dependencies)).toEqual(['a', 'b']);
    expect(await formatPackageJsonWithSortPlugin(firstPassText)).toBe(
      firstPassText,
    );
  });

  test('lets Prettier report malformed JSON', async () => {
    await expect(formatPackageJsonWithSortPlugin('{"name":')).rejects.toThrow();
  });
});
