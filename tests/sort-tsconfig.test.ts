import { describe, expect, test } from 'bun:test';

import { formatTsconfigWithSortPlugin } from './format-with-sort-plugin';

describe('sort tsconfig.json', () => {
  test('sorts compilerOptions without changing nested values', async () => {
    const sourceText = JSON.stringify({
      watchOptions: {
        watchFile: 'useFsEvents',
        excludeFiles: ['temp.ts'],
      },
      compilerOptions: {
        zUnknown: true,
        ignoreDeprecations: '5.0',
        assumeChangesOnlyAffectDirectDependencies: true,
        skipLibCheck: true,
        pretty: true,
        incremental: true,
        diagnostics: true,
        target: 'ESNext',
        charset: 'utf8',
        verbatimModuleSyntax: true,
        plugins: [],
        allowJs: true,
        sourceMap: true,
        module: 'Preserve',
        strict: true,
        paths: {
          '~/*': ['./*'],
          '@/*': ['./src/*'],
        },
        stableTypeOrdering: true,
        deduplicatePackages: true,
        aUnknown: true,
      },
      references: [{ path: './z' }, { path: './a' }],
    });
    const sortedTsconfig = JSON.parse(
      await formatTsconfigWithSortPlugin(sourceText),
    );

    expect(Object.keys(sortedTsconfig.compilerOptions)).toEqual([
      'incremental',
      'target',
      'module',
      'paths',
      'allowJs',
      'sourceMap',
      'verbatimModuleSyntax',
      'strict',
      'skipLibCheck',
      'pretty',
      'diagnostics',
      'assumeChangesOnlyAffectDirectDependencies',
      'charset',
      'plugins',
      'zUnknown',
      'ignoreDeprecations',
      'stableTypeOrdering',
      'deduplicatePackages',
      'aUnknown',
    ]);
    expect(Object.keys(sortedTsconfig.compilerOptions.paths)).toEqual([
      '~/*',
      '@/*',
    ]);
    expect(Object.keys(sortedTsconfig.watchOptions)).toEqual([
      'watchFile',
      'excludeFiles',
    ]);
    expect(sortedTsconfig.references).toEqual([
      { path: './z' },
      { path: './a' },
    ]);
  });

  test('moves file selection fields last without reordering other fields', async () => {
    const formattedText = await formatTsconfigWithSortPlugin(
      JSON.stringify({
        include: ['src'],
        watchOptions: {},
        files: ['index.ts'],
        compilerOptions: {},
        exclude: ['dist'],
        extends: './base',
        $schema: 'https://json.schemastore.org/tsconfig',
        references: [{ path: './shared' }],
      }),
    );

    expect(Object.keys(JSON.parse(formattedText))).toEqual([
      '$schema',
      'extends',
      'watchOptions',
      'compilerOptions',
      'references',
      'files',
      'include',
      'exclude',
    ]);
  });

  test('keeps commented compilerOptions and nested objects in place', async () => {
    const sourceText = `{
  "files": ["index.ts"],
  "compilerOptions": {
    // Keep this section in place.
    "strict": true,
    "target": "ESNext",
    "paths": {
      "~/*": ["./*"],
      "@/*": ["./src/*"]
    }
  },
  "extends": "./base"
}`;
    const formattedText = await formatTsconfigWithSortPlugin(sourceText);

    expect(formattedText.indexOf('"strict"')).toBeLessThan(
      formattedText.indexOf('"target"'),
    );
    expect(formattedText.indexOf('"~/*"')).toBeLessThan(
      formattedText.indexOf('"@/*"'),
    );
    expect(formattedText).toContain('// Keep this section in place.');
    expect(formattedText.indexOf('"extends"')).toBeLessThan(
      formattedText.indexOf('"files"'),
    );
  });

  test('keeps commented root fields in place while sorting compilerOptions', async () => {
    const sourceText = `{
  "files": ["index.ts"],
  // Keep this section in place.
  "extends": "./base",
  "compilerOptions": {
    "strict": true,
    "target": "ESNext"
  }
}`;
    const formattedText = await formatTsconfigWithSortPlugin(sourceText);

    expect(formattedText.indexOf('"files"')).toBeLessThan(
      formattedText.indexOf('"extends"'),
    );
    expect(formattedText.indexOf('"target"')).toBeLessThan(
      formattedText.indexOf('"strict"'),
    );
  });

  test('separates populated compilerOptions categories by default', async () => {
    const formattedText = await formatTsconfigWithSortPlugin(
      JSON.stringify({
        compilerOptions: {
          sourceMap: true,
          module: 'Preserve',
          strict: true,
          noImplicitAny: true,
        },
      }),
    );

    expect(formattedText).toContain(`"module": "Preserve",

    "sourceMap": true,

    "strict": true,
    "noImplicitAny": true`);
  });

  test('tsconfigSeparation=false removes category blank lines', async () => {
    const formattedText = await formatTsconfigWithSortPlugin(
      JSON.stringify({
        compilerOptions: {
          sourceMap: true,
          module: 'Preserve',
          strict: true,
        },
      }),
      { tsconfigSeparation: false },
    );

    expect(formattedText).toBe(
      '{\n  "compilerOptions": { "module": "Preserve", "sourceMap": true, "strict": true }\n}\n',
    );
  });

  test('preserves comments outside the root object', async () => {
    const sourceText = `// Generated config.
{"files":["index.ts"],"extends":"./base"}
// End config.
`;
    const formattedText = await formatTsconfigWithSortPlugin(sourceText);

    expect(formattedText).toStartWith('// Generated config.');
    expect(formattedText).toContain('// End config.');
    expect(formattedText.indexOf('"extends"')).toBeLessThan(
      formattedText.indexOf('"files"'),
    );
  });

  test('respects prettier-ignore before the root object', async () => {
    const sourceText = `// prettier-ignore
{"files":["index.ts"],"extends":"./base"}
`;
    const formattedText = await formatTsconfigWithSortPlugin(sourceText);

    expect(formattedText.indexOf('"files"')).toBeLessThan(
      formattedText.indexOf('"extends"'),
    );
  });

  test('respects prettier-ignore before known nested objects', async () => {
    const sourceText = `{
  // prettier-ignore
  "compilerOptions": {"strict":true,"target":"ESNext"},
  "watchOptions": {
    "watchFile": "useFsEvents"
  }
}`;
    const formattedText = await formatTsconfigWithSortPlugin(sourceText);

    expect(formattedText).toContain(
      '"compilerOptions": {"strict":true,"target":"ESNext"}',
    );
  });

  test('supports tsconfig.*.json and Windows paths', async () => {
    const formattedText = await formatTsconfigWithSortPlugin(
      '{"extends":"./base","compilerOptions":{"strict":true,"target":"ESNext"}}',
      {
        filepath: String.raw`C:\project\tsconfig.build.json`,
      },
    );
    const tsconfig = JSON.parse(formattedText);

    expect(Object.keys(tsconfig)).toEqual(['extends', 'compilerOptions']);
    expect(Object.keys(tsconfig.compilerOptions)).toEqual(['target', 'strict']);
  });

  test('does not sort with the explicit json-stringify parser', async () => {
    const formattedText = await formatTsconfigWithSortPlugin(
      '{"files":["index.ts"],"extends":"./base"}',
      {
        parser: 'json-stringify',
      },
    );

    expect(Object.keys(JSON.parse(formattedText))).toEqual([
      'files',
      'extends',
    ]);
  });

  test.each(['settings.json', 'jsconfig.json'])(
    'does not sort %s',
    async filepath => {
      const sourceText =
        '{\n  "files": ["index.ts"],\n  "extends": "./base"\n}\n';

      expect(await formatTsconfigWithSortPlugin(sourceText, { filepath })).toBe(
        sourceText,
      );
    },
  );

  test('tsconfigSort=false leaves field order untouched', async () => {
    const sourceText =
      '{\n  "files": ["index.ts"],\n  "extends": "./base"\n}\n';

    expect(
      await formatTsconfigWithSortPlugin(sourceText, {
        tsconfigSort: false,
      }),
    ).toBe(sourceText);
  });

  test('does not collapse duplicate compilerOptions fields', async () => {
    const formattedText = await formatTsconfigWithSortPlugin(
      '{"compilerOptions":{"strict":true,"strict":false,"target":"ESNext"}}',
    );

    expect(formattedText.match(/"strict"/g)).toHaveLength(2);
    expect(formattedText.indexOf('"strict"')).toBeLessThan(
      formattedText.indexOf('"target"'),
    );
  });

  test('keeps duplicate root fields in place while sorting compilerOptions', async () => {
    const formattedText = await formatTsconfigWithSortPlugin(
      '{"files":["index.ts"],"extends":"first","extends":"last","compilerOptions":{"strict":true,"target":"ESNext"}}',
    );

    expect(formattedText.match(/"extends"/g)).toHaveLength(2);
    expect(formattedText.indexOf('"files"')).toBeLessThan(
      formattedText.indexOf('"extends"'),
    );
    expect(formattedText.indexOf('"target"')).toBeLessThan(
      formattedText.indexOf('"strict"'),
    );
  });

  test('preserves escaped literals while sorting fields', async () => {
    const sourceText = String.raw`{"files":["index.ts"],"compilerOptions":{"strict":true,"\u0074arget":"ESNext","paths":{"\u007a/*":["\/z"],"\u0061/*":["\/a"]}},"\u0065xtends":"./base"}`;
    const formattedText = await formatTsconfigWithSortPlugin(sourceText);

    expect(formattedText).toContain(String.raw`"\u0065xtends": "./base"`);
    expect(formattedText).toContain(String.raw`"\u0074arget": "ESNext"`);
    expect(formattedText).toContain(String.raw`"\u0061/*": ["\/a"]`);
    expect(formattedText).toContain(String.raw`"\u007a/*": ["\/z"]`);
    expect(formattedText.indexOf(String.raw`"\u0074arget"`)).toBeLessThan(
      formattedText.indexOf('"paths"'),
    );
    expect(formattedText.indexOf(String.raw`"\u007a/*"`)).toBeLessThan(
      formattedText.indexOf(String.raw`"\u0061/*"`),
    );
    expect(formattedText.indexOf(String.raw`"\u0065xtends"`)).toBeLessThan(
      formattedText.indexOf('"files"'),
    );
  });

  test('sorts safe root fields when compilerOptions has an invalid value', async () => {
    const formattedText = await formatTsconfigWithSortPlugin(
      '{"files":["index.ts"],"compilerOptions":null,"extends":"./base"}',
    );

    expect(Object.keys(JSON.parse(formattedText))).toEqual([
      'extends',
      'compilerOptions',
      'files',
    ]);
  });

  test('is idempotent', async () => {
    const sourceText = JSON.stringify({
      compilerOptions: { target: 'ESNext', strict: true },
      extends: './base',
      files: ['index.ts'],
    });
    const firstPassText = await formatTsconfigWithSortPlugin(sourceText);
    const firstPassTsconfig = JSON.parse(firstPassText);

    expect(Object.keys(firstPassTsconfig)).toEqual([
      'extends',
      'compilerOptions',
      'files',
    ]);
    expect(Object.keys(firstPassTsconfig.compilerOptions)).toEqual([
      'target',
      'strict',
    ]);
    expect(await formatTsconfigWithSortPlugin(firstPassText)).toBe(
      firstPassText,
    );
  });

  test('lets Prettier report malformed JSON', async () => {
    await expect(formatTsconfigWithSortPlugin('{"files":')).rejects.toThrow();
  });
});
