import { type Parser, type ParserOptions, type Plugin } from 'prettier';
import acornPlugin from 'prettier/plugins/acorn';
import babelPlugin from 'prettier/plugins/babel';
import flowPlugin from 'prettier/plugins/flow';
import meriyahPlugin from 'prettier/plugins/meriyah';
import typescriptPlugin from 'prettier/plugins/typescript';

import { options } from '#/options';
import { preprocessPackageJson } from '#/sort-package';
import { preprocessTsconfig } from '#/sort-tsconfig';
import { sortTypeScript } from '#/sort-typescript';

type ParserPreprocessTransform = (
  sourceText: string,
  prettierOptions: ParserOptions,
  parser: Parser,
) => string | Promise<string>;

/** 保留原 parser 的预处理流程，再对其结果执行排序。 */
function wrapParserPreprocess(
  parser: Parser,
  preprocessTransform: ParserPreprocessTransform,
): Parser {
  return {
    ...parser,
    async preprocess(sourceText, prettierOptions) {
      let transformedText = sourceText;

      if (parser.preprocess) {
        transformedText = await parser.preprocess(sourceText, prettierOptions);
      }
      return preprocessTransform(transformedText, prettierOptions, parser);
    },
  };
}

async function preprocessJson(
  sourceText: string,
  prettierOptions: ParserOptions,
  parser: Parser,
): Promise<string> {
  const packagePreprocessedText = await preprocessPackageJson(
    sourceText,
    prettierOptions,
    parser,
  );

  return preprocessTsconfig(packagePreprocessedText, prettierOptions, parser);
}

const sortPlugin: Plugin = {
  options,
  parsers: {
    acorn: wrapParserPreprocess(acornPlugin.parsers.acorn, sortTypeScript),
    babel: wrapParserPreprocess(babelPlugin.parsers.babel, sortTypeScript),
    'babel-flow': wrapParserPreprocess(
      babelPlugin.parsers['babel-flow'],
      sortTypeScript,
    ),
    'babel-ts': wrapParserPreprocess(
      babelPlugin.parsers['babel-ts'],
      sortTypeScript,
    ),
    espree: wrapParserPreprocess(acornPlugin.parsers.espree, sortTypeScript),
    flow: wrapParserPreprocess(flowPlugin.parsers.flow, sortTypeScript),
    json: wrapParserPreprocess(babelPlugin.parsers.json, preprocessJson),
    'json-stringify': wrapParserPreprocess(
      babelPlugin.parsers['json-stringify'],
      preprocessPackageJson,
    ),
    meriyah: wrapParserPreprocess(
      meriyahPlugin.parsers.meriyah,
      sortTypeScript,
    ),
    typescript: wrapParserPreprocess(
      typescriptPlugin.parsers.typescript,
      sortTypeScript,
    ),
  },
};

export default sortPlugin;
export { options } from '#/options';
export type { ImportGroup, SortOptions, TypeImportStyle } from '#/options';
