import { type Parser, type ParserOptions, type Plugin } from 'prettier';
import { parsers as babelParsers } from 'prettier/plugins/babel';
import { parsers as typescriptParsers } from 'prettier/plugins/typescript';

import { options } from './options';
import { sortExports } from './sort-exports';
import { sortImports } from './sort-imports';
import { sortPackageJson } from './sort-package';

type PreprocessFn = (text: string, options: ParserOptions) => string;

// /**
//  * Prettier 格式化 markdown 等文档文件时，会把嵌入的代码块交给对应语言的 parser 处理。
//  * 但文档中的代码块通常不需要排序，且排序可能干扰示例代码等元素的正确归属。
//  * 其实可以使用 <!-- prettier-ignore --> 解决这个问题，不应该由插件控制。
//  */
// function isEmbeddedInDoc(parserOptions: ParserOptions): boolean {
//   const parent = (parserOptions as Record<string, unknown>).parentParser;
//
//   return (
//     typeof parent === 'string' && /^(markdown|mdx|html|vue)$/i.test(parent)
//   );
// }

function wrap(parser: Parser, ...transforms: PreprocessFn[]): Parser {
  return {
    ...parser,
    async preprocess(text, parserOptions) {
      let source = parser.preprocess
        ? await parser.preprocess(text, parserOptions)
        : text;

      // if (isEmbeddedInDoc(parserOptions)) {
      //   return source;
      // }
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
