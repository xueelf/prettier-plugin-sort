import { describe, expect, test } from 'bun:test';

import { formatPackageJsonWithSortPlugin } from './format-with-sort-plugin';

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
        aUnknown: true,
      },
      null,
      2,
    );
    const sortedPackageJson = JSON.parse(
      await formatPackageJsonWithSortPlugin(sourceText),
    );

    expect(Object.keys(sortedPackageJson)).toEqual([
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

  test('applies the documented nested field rules', async () => {
    const sourceText = JSON.stringify({
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
      devEngines: {
        packageManager: { onFail: 'warn', version: '1', name: 'bun' },
      },
      volta: { yarn: '1', npm: '1', node: '1' },
      dependenciesMeta: {
        'pkg@2': { z: true, a: true },
        'pkg@1': {},
        a: {},
      },
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
      workspaces: {
        catalog: { z: '1', a: '1' },
        packages: ['z', 'a', 'z'],
      },
      directories: { test: 'test', bin: 'bin', lib: 'lib' },
      contributors: [{ url: 'url', email: 'email', name: 'name' }],
      author: { url: 'url', email: 'email', name: 'name' },
      bugs: { email: 'email', url: 'url' },
      version: '1.0.0',
      name: 'pkg',
    });
    const sortedPackageJson = JSON.parse(
      await formatPackageJsonWithSortPlugin(sourceText),
    );

    expect(Object.keys(sortedPackageJson.bugs)).toEqual(['url', 'email']);
    expect(Object.keys(sortedPackageJson.author)).toEqual([
      'name',
      'email',
      'url',
    ]);
    expect(Object.keys(sortedPackageJson.contributors[0])).toEqual([
      'name',
      'email',
      'url',
    ]);
    expect(Object.keys(sortedPackageJson.directories)).toEqual([
      'lib',
      'bin',
      'test',
    ]);
    expect(sortedPackageJson.workspaces.packages).toEqual(['a', 'z']);
    expect(Object.keys(sortedPackageJson.workspaces.catalog)).toEqual([
      'a',
      'z',
    ]);
    expect(Object.keys(sortedPackageJson['simple-git-hooks'])).toEqual([
      'pre-commit',
      'pre-push',
    ]);
    expect(Object.keys(sortedPackageJson.prettier)).toEqual([
      'a',
      'z',
      'overrides',
    ]);
    expect(
      Object.keys(sortedPackageJson.prettier.overrides[0].options),
    ).toEqual(['a', 'z']);
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
    expect(Object.keys(sortedPackageJson.volta)).toEqual([
      'node',
      'npm',
      'yarn',
    ]);
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
    expect(Object.keys(sortedPackageJson.devEngines.packageManager)).toEqual([
      'name',
      'version',
      'onFail',
    ]);
    expect(Object.keys(sortedPackageJson.pnpm)).toEqual([
      'neverBuiltDependencies',
      'overrides',
      'packageExtensions',
    ]);
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
          'pkg@^2.0.0': '2',
          'pkg@^10.0.0': '10',
          'pkg@^15.invalid': 'invalid',
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
        filepath: '/tmp/settings.json',
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

    expect(formattedText).toContain('"name": "pkg"');
    expect(formattedText).toContain('"unsafe": 9007199254740993');
    expect(formattedText).toContain('"negativeZero": -0');
    expect(formattedText).toContain('"overflow": 1e400');
  });

  test('does not collapse duplicate object fields', async () => {
    const sourceText =
      '{"scripts":{"test":"first","test":"last"},"name":"first","name":"last"}';
    const formattedText = await formatPackageJsonWithSortPlugin(sourceText);

    expect(formattedText.match(/"name"/g)).toHaveLength(2);
    expect(formattedText.match(/"test"/g)).toHaveLength(2);
  });

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

    expect(await formatPackageJsonWithSortPlugin(firstPassText)).toBe(
      firstPassText,
    );
  });

  test('lets Prettier report malformed JSON', async () => {
    await expect(formatPackageJsonWithSortPlugin('{"name":')).rejects.toThrow();
  });
});
