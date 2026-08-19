import { type Parser, type ParserOptions } from 'prettier';

import { resolveEsmOptions } from './options';
import {
  type ParserAstNode,
  getProgramComments,
  getProgramStatements,
  getSortedAstCommentsWithTextRanges,
} from './parser-ast';
import { buildExportSortingEdits } from './sort-exports';
import { buildImportSortingEdits } from './sort-imports';
import { type SourceTextEdit, applySourceTextEdits } from './utils/source-text';

/** 从当前文件最近的 tsconfig.json 读取 paths，失败时不影响格式化。 */
async function getTsconfigInternalPatterns(
  filePath?: string,
): Promise<string[]> {
  if (!filePath) {
    return [];
  }
  try {
    const { getTsconfig } = await import('get-tsconfig');
    const paths = getTsconfig(filePath)?.config.compilerOptions?.paths;

    return paths ? Object.keys(paths) : [];
  } catch {
    return [];
  }
}

/**
 * 顶层 ES module 排序事务：原文只解析一次，所有编辑都基于同一份 AST 范围生成。
 * 编辑应用后再次解析；范围冲突或无效语法都会让整次变换返回原文。
 */
export async function sortTypeScript(
  sourceText: string,
  prettierOptions: ParserOptions,
  parser: Parser,
): Promise<string> {
  const sortOptions = resolveEsmOptions(prettierOptions);

  if (!sortOptions.esmImportSort && !sortOptions.esmExportSpecifierSort) {
    return sourceText;
  }
  let parserAst: ParserAstNode;

  try {
    parserAst = (await parser.parse(
      sourceText,
      prettierOptions,
    )) as ParserAstNode;
  } catch {
    return sourceText;
  }
  const programStatements = getProgramStatements(parserAst);
  const sortedComments = getSortedAstCommentsWithTextRanges(
    getProgramComments(parserAst),
  );
  const sortingEdits: SourceTextEdit[] = [];

  if (sortOptions.esmImportSort) {
    const isPrettierFilePragmaPresent = parser.hasPragma?.(sourceText) ?? false;
    const internalPatterns = programStatements.some(
      statement => statement.type === 'ImportDeclaration',
    )
      ? await getTsconfigInternalPatterns(prettierOptions.filepath)
      : [];

    sortingEdits.push(
      ...buildImportSortingEdits(
        sourceText,
        programStatements,
        sortedComments,
        sortOptions,
        internalPatterns,
        isPrettierFilePragmaPresent,
      ),
    );
  }
  if (sortOptions.esmExportSpecifierSort) {
    sortingEdits.push(
      ...buildExportSortingEdits(sourceText, programStatements, sortedComments),
    );
  }
  const sortedText = applySourceTextEdits(sourceText, sortingEdits);

  if (sortedText === null || sortedText === sourceText) {
    return sourceText;
  }
  try {
    await parser.parse(sortedText, prettierOptions);
    return sortedText;
  } catch {
    return sourceText;
  }
}
