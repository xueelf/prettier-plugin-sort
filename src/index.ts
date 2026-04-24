import { type Parser, type ParserOptions, type Plugin } from 'prettier';
import { parsers as babelParsers } from 'prettier/plugins/babel';
import { parsers as typescriptParsers } from 'prettier/plugins/typescript';

import { options } from './options';
import { sortExports } from './sort-exports';
import { sortImports } from './sort-imports';
import { sortPackageJson } from './sort-package';

type PreprocessFn = (text: string, options: ParserOptions) => string;

function wrap(parser: Parser, ...transforms: PreprocessFn[]): Parser {
  return {
    ...parser,
    async preprocess(text, parserOptions) {
      let source = parser.preprocess
        ? await parser.preprocess(text, parserOptions)
        : text;

      for (const fn of transforms) {
        source = fn(source, parserOptions);
      }
      return source;
    },
  };
}

const plugin: Plugin = {
  options,
  parsers: {
    babel: wrap(babelParsers.babel, sortImports, sortExports),
    'babel-ts': wrap(babelParsers['babel-ts'], sortImports, sortExports),
    typescript: wrap(typescriptParsers.typescript, sortImports, sortExports),
    'json-stringify': wrap(babelParsers['json-stringify'], sortPackageJson),
  },
};

export default plugin;
export { options } from './options';
export type { ImportGroup, SortOptions, TypeImportsStyle } from './options';
