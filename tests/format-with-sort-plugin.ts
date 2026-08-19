import prettier, { type Options } from 'prettier';

import sortPlugin, { type SortOptions } from '../src';

type SortPluginFormatOptions = Options & SortOptions;

export function formatTypeScriptWithSortPlugin(
  sourceText: string,
  prettierOptions: SortPluginFormatOptions = {},
): Promise<string> {
  return prettier.format(sourceText, {
    plugins: [sortPlugin],
    singleQuote: true,
    parser: 'typescript',
    ...prettierOptions,
  });
}

export function formatPackageJsonWithSortPlugin(
  sourceText: string,
  prettierOptions: SortPluginFormatOptions = {},
): Promise<string> {
  return prettier.format(sourceText, {
    plugins: [sortPlugin],
    parser: 'json-stringify',
    filepath: 'package.json',
    ...prettierOptions,
  });
}

export function formatTsconfigWithSortPlugin(
  sourceText: string,
  prettierOptions: SortPluginFormatOptions = {},
): Promise<string> {
  return prettier.format(sourceText, {
    plugins: [sortPlugin],
    parser: 'json',
    filepath: 'tsconfig.json',
    ...prettierOptions,
  });
}
