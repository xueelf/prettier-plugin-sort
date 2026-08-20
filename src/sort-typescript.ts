import { type Parser, type ParserOptions } from 'prettier';

import { resolveEsmOptions } from '#/options';
import {
  type ParserAstNode,
  getProgramComments,
  getProgramStatements,
  getSortedAstCommentsWithTextRanges,
} from '#/parser-ast';
import { buildExportSortingEdits } from '#/sort-exports';
import { buildImportSortingEdits } from '#/sort-imports';
import { type SourceTextEdit, applySourceTextEdits } from '#/utils/source-text';

const SCRIPT_FILE_EXTENSION_PATTERN = /\.[cm]?[jt]sx?$/i;

/** 按需动态加载 Node.js 依赖，避免浏览器加载插件时初始化，失败时静默回退。 */
async function getTsconfigPathPatterns(filePath?: string): Promise<string[]> {
  if (!filePath) {
    return [];
  }
  try {
    const { createFilesMatcher, getTsconfig, parseTsconfig } =
      await import('get-tsconfig');
    const { dirname, extname, join, resolve } = await import('node:path');
    const cache = new Map();
    const absoluteFilePath = resolve(filePath);
    const isFileSystemCaseSensitive = !['darwin', 'win32'].includes(
      process.platform,
    );
    const nearestProject = getTsconfig(
      absoluteFilePath,
      'tsconfig.json',
      cache,
    );

    if (!nearestProject) {
      return [];
    }
    type TsConfigResult = NonNullable<typeof nearestProject>;

    const visitedConfigPaths = new Set<string>();

    function isFileIncluded(project: TsConfigResult): boolean {
      try {
        if (
          createFilesMatcher(
            project,
            isFileSystemCaseSensitive,
          )(absoluteFilePath)
        ) {
          return true;
        }
        const fileExtension = extname(absoluteFilePath);

        if (
          !fileExtension ||
          SCRIPT_FILE_EXTENSION_PATTERN.test(fileExtension)
        ) {
          return false;
        }
        // createFilesMatcher 只识别 TS/JS 扩展名，嵌入式代码通过虚拟 .ts 路径复用相同规则。
        const virtualExtension = '.ts';
        const normalizedFileExtension = isFileSystemCaseSensitive
          ? fileExtension
          : fileExtension.toLowerCase();
        const addVirtualExtension = (
          patterns?: string[],
        ): string[] | undefined =>
          patterns?.map(pattern => {
            const normalizedPattern = isFileSystemCaseSensitive
              ? pattern
              : pattern.toLowerCase();

            return normalizedPattern.endsWith(normalizedFileExtension)
              ? `${pattern}${virtualExtension}`
              : pattern;
          });
        const virtualConfig = {
          ...project.config,
          files: addVirtualExtension(project.config.files),
          include: addVirtualExtension(project.config.include),
          exclude: addVirtualExtension(project.config.exclude),
        };

        return Boolean(
          createFilesMatcher(
            { path: project.path, config: virtualConfig },
            isFileSystemCaseSensitive,
          )(`${absoluteFilePath}${virtualExtension}`),
        );
      } catch {
        return false;
      }
    }

    function findProjectForFile(
      project: TsConfigResult,
    ): TsConfigResult | undefined {
      if (visitedConfigPaths.has(project.path)) {
        return undefined;
      }
      visitedConfigPaths.add(project.path);

      if (isFileIncluded(project)) {
        return project;
      }

      for (const reference of project.config.references ?? []) {
        if (typeof reference.path !== 'string') {
          continue;
        }
        let referencedProject: TsConfigResult;

        try {
          const referencePath = resolve(dirname(project.path), reference.path);
          const configPath =
            extname(referencePath).toLowerCase() === '.json'
              ? referencePath
              : join(referencePath, 'tsconfig.json');

          referencedProject = {
            path: configPath,
            config: parseTsconfig(configPath, cache),
          };
        } catch {
          continue;
        }

        const selectedProject = findProjectForFile(referencedProject);

        if (selectedProject) {
          return selectedProject;
        }
      }
      return undefined;
    }

    let currentProject: TsConfigResult | null = nearestProject;

    while (currentProject) {
      const selectedProject = findProjectForFile(currentProject);

      if (selectedProject) {
        const paths = selectedProject.config.compilerOptions?.paths;

        return paths ? Object.keys(paths) : [];
      }
      const configDirectory = dirname(currentProject.path);
      const parentDirectory = dirname(configDirectory);

      if (parentDirectory === configDirectory) {
        break;
      }
      currentProject = getTsconfig(parentDirectory, 'tsconfig.json', cache);
    }

    return [];
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
    const pathPatterns = programStatements.some(
      statement => statement.type === 'ImportDeclaration',
    )
      ? await getTsconfigPathPatterns(prettierOptions.filepath)
      : [];

    sortingEdits.push(
      ...buildImportSortingEdits(
        sourceText,
        programStatements,
        sortedComments,
        sortOptions,
        pathPatterns,
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
