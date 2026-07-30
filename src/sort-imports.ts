import {
  type ImportGroup,
  type SortOptions,
  type TypeImportStyle,
} from './options';
import {
  type ParserAstComment,
  type ParserAstCommentWithTextRange,
  type ParserAstNode,
  findCommentIndexAtOrAfter,
  getAstCommentText,
  getAstNodeName,
  getAstNodeTextRange,
  isPrettierIgnored,
  isSourceRangeWhitespaceOrComments,
} from './parser-ast';
import {
  type SourceTextEdit,
  type SourceTextRange,
  applySourceTextEdits,
} from './utils/source-text';

const INDEX_MODULE_PATTERN = /^\.\/index(?:\.[^/]+)*$/;
const PRETTIER_FILE_PRAGMA_DIRECTIVES = ['@format', '@prettier'] as const;
const ESLINT_RANGE_DIRECTIVES = ['eslint-disable', 'eslint-enable'] as const;
const ESLINT_GLOBAL_DIRECTIVES = ['global', 'globals'] as const;

/** 只匹配完整指令名，避免把普通说明文字误判为格式化指令。 */
function getCommentDirectiveArguments(
  commentLine: string,
  directive: string,
): string | null {
  if (!commentLine.startsWith(directive)) {
    return null;
  }
  const directiveArguments = commentLine.slice(directive.length);

  if (directiveArguments === '') {
    return '';
  }
  if (directiveArguments[0]?.trim() !== '') {
    return null;
  }
  return directiveArguments.trimStart();
}

function hasCommentDirective(
  commentLine: string,
  directives: readonly string[],
): boolean {
  return directives.some(
    directive => getCommentDirectiveArguments(commentLine, directive) !== null,
  );
}

function isEslintRuleConfiguration(commentLine: string): boolean {
  const ruleConfiguration = getCommentDirectiveArguments(commentLine, 'eslint');

  if (!ruleConfiguration) {
    return false;
  }
  const separatorIndex = ruleConfiguration.indexOf(':');

  if (separatorIndex < 1) {
    return false;
  }
  const ruleName = ruleConfiguration.slice(0, separatorIndex).trimEnd();

  return (
    ruleName.length > 0 &&
    [...ruleName].every(character => character.trim() !== '')
  );
}

function isFixedEslintComment(
  comment: ParserAstComment,
  isBlockComment: boolean,
): boolean {
  if (!isBlockComment) {
    return false;
  }
  const commentText = getAstCommentText(comment)?.trim();

  if (!commentText) {
    return false;
  }
  return (
    hasCommentDirective(commentText, ESLINT_RANGE_DIRECTIVES) ||
    isEslintRuleConfiguration(commentText) ||
    hasCommentDirective(commentText, ESLINT_GLOBAL_DIRECTIVES)
  );
}

function isEslintNextLineComment(comment: ParserAstComment): boolean {
  const commentText = getAstCommentText(comment)?.trim();

  if (!commentText) {
    return false;
  }
  return (
    getCommentDirectiveArguments(commentText, 'eslint-disable-next-line') !==
    null
  );
}

function isFixedEslintParserComment(
  sourceText: string,
  parserComment: ParserAstCommentWithTextRange,
): boolean {
  const { comment, textRange } = parserComment;
  const sourceCommentText = sourceText.slice(textRange.start, textRange.end);

  return isFixedEslintComment(comment, sourceCommentText.startsWith('/*'));
}

function isPositionSensitiveEslintComment(
  sourceText: string,
  parserComment: ParserAstCommentWithTextRange,
): boolean {
  return (
    isEslintNextLineComment(parserComment.comment) ||
    isFixedEslintParserComment(sourceText, parserComment)
  );
}

function getCommentLines(comment: ParserAstComment): string[] {
  const commentText = getAstCommentText(comment);

  if (commentText === null) {
    return [];
  }
  return commentText
    .split(/\r?\n/)
    .map(commentLine => commentLine.replace(/^\s*\*+\s*/, ''));
}

function isFixedFileComment(
  sourceText: string,
  comment: ParserAstComment,
  commentRange: { start: number; end: number },
  prettierFilePragmaComment: ParserAstComment | null,
): boolean {
  const sourceCommentText = sourceText.slice(
    commentRange.start,
    commentRange.end,
  );

  if (sourceCommentText.startsWith('#!')) {
    return true;
  }
  if (comment === prettierFilePragmaComment) {
    return true;
  }
  const isBlockComment = sourceCommentText.startsWith('/*');

  return isFixedEslintComment(comment, isBlockComment);
}

function getPrettierFilePragmaComment(
  sortedComments: readonly ParserAstCommentWithTextRange[],
  isPrettierFilePragmaPresent: boolean,
): ParserAstComment | null {
  if (!isPrettierFilePragmaPresent) {
    return null;
  }
  return (
    sortedComments.find(({ comment }) =>
      getCommentLines(comment).some(commentLine =>
        hasCommentDirective(
          commentLine.trim(),
          PRETTIER_FILE_PRAGMA_DIRECTIVES,
        ),
      ),
    )?.comment ?? null
  );
}

function classifyImportGroup(moduleSpecifier: string): ImportGroup {
  if (
    moduleSpecifier === 'bun' ||
    moduleSpecifier.startsWith('bun:') ||
    moduleSpecifier.startsWith('node:')
  ) {
    return 'builtin';
  }
  if (
    moduleSpecifier === '.' ||
    moduleSpecifier === './' ||
    INDEX_MODULE_PATTERN.test(moduleSpecifier)
  ) {
    return 'index';
  }
  if (moduleSpecifier === '..' || moduleSpecifier.startsWith('../')) {
    return 'parent';
  }
  if (moduleSpecifier.startsWith('./')) {
    return 'sibling';
  }
  if (
    moduleSpecifier.startsWith('/') ||
    moduleSpecifier.startsWith('~') ||
    moduleSpecifier.startsWith('@/') ||
    moduleSpecifier.startsWith('#')
  ) {
    return 'internal';
  }
  return 'external';
}

/**
 * 收集随 import 一起移动的前置注释。
 * 文件级指令、同行代码和空行都会停止向前扩展。
 */
function findLeadingCommentsStart(
  sourceText: string,
  statementStart: number,
  sortedComments: readonly ParserAstCommentWithTextRange[],
  prettierFilePragmaComment: ParserAstComment | null,
): number {
  let attachedTextStart = statementStart;

  for (
    let commentIndex =
      findCommentIndexAtOrAfter(sortedComments, statementStart) - 1;
    commentIndex >= 0;
    commentIndex--
  ) {
    const parserComment = sortedComments[commentIndex];

    if (!parserComment || parserComment.textRange.end > statementStart) {
      continue;
    }
    const { comment, textRange } = parserComment;

    if (
      isFixedFileComment(
        sourceText,
        comment,
        textRange,
        prettierFilePragmaComment,
      )
    ) {
      break;
    }
    const textBetweenCommentAndImport = sourceText.slice(
      textRange.end,
      attachedTextStart,
    );
    const lineBreakCount =
      textBetweenCommentAndImport.match(/\n/g)?.length ?? 0;
    const isEslintNextLineCommentAttached =
      attachedTextStart === statementStart &&
      isEslintNextLineComment(comment) &&
      textBetweenCommentAndImport.trim() === '' &&
      lineBreakCount === 1;

    if (isEslintNextLineCommentAttached) {
      attachedTextStart = textRange.start;
      continue;
    }
    const commentLineStart =
      sourceText.lastIndexOf('\n', textRange.start - 1) + 1;

    if (sourceText.slice(commentLineStart, textRange.start).trim() !== '') {
      break;
    }
    if (textBetweenCommentAndImport.trim() !== '' || lineBreakCount >= 2) {
      break;
    }
    attachedTextStart = textRange.start;
  }
  while (
    attachedTextStart > 0 &&
    /[ \t]/.test(sourceText[attachedTextStart - 1]!)
  ) {
    attachedTextStart--;
  }
  return attachedTextStart;
}

function getRangeEndIncludingLineBreak(
  sourceText: string,
  sourceIndex: number,
): number {
  if (
    sourceText[sourceIndex] === '\r' &&
    sourceText[sourceIndex + 1] === '\n'
  ) {
    return sourceIndex + 2;
  }
  if (sourceText[sourceIndex] === '\n') {
    return sourceIndex + 1;
  }
  return sourceIndex;
}

/**
 * 收集 import 同一行末尾的普通注释。
 * 位置敏感的 ESLint 指令留在原位，并作为当前排序片段的边界。
 */
function getTrailingComments(
  sourceText: string,
  statementEnd: number,
  sortedComments: readonly ParserAstCommentWithTextRange[],
): {
  commentsText: string;
  rangeEnd: number;
  isImportSortingBoundary: boolean;
} {
  let trailingCommentsEnd = statementEnd;
  let isImportSortingBoundary = false;

  const firstTrailingCommentIndex = findCommentIndexAtOrAfter(
    sortedComments,
    statementEnd,
  );

  for (
    let commentIndex = firstTrailingCommentIndex;
    commentIndex < sortedComments.length;
    commentIndex++
  ) {
    const trailingComment = sortedComments[commentIndex];

    if (!trailingComment) {
      break;
    }
    const { textRange } = trailingComment;
    const textBeforeComment = sourceText.slice(
      trailingCommentsEnd,
      textRange.start,
    );

    if (textBeforeComment.includes('\n') || textBeforeComment.trim() !== '') {
      break;
    }
    const commentLineEnd = sourceText.indexOf('\n', textRange.end);

    if (
      !isSourceRangeWhitespaceOrComments(
        sourceText,
        {
          start: textRange.end,
          end: commentLineEnd < 0 ? sourceText.length : commentLineEnd,
        },
        sortedComments,
      )
    ) {
      break;
    }
    if (isFixedEslintParserComment(sourceText, trailingComment)) {
      isImportSortingBoundary = true;
      break;
    }
    if (isEslintNextLineComment(trailingComment.comment)) {
      break;
    }
    trailingCommentsEnd = textRange.end;
  }
  return {
    commentsText: sourceText.slice(statementEnd, trailingCommentsEnd),
    rangeEnd: trailingCommentsEnd,
    isImportSortingBoundary,
  };
}

function parseImportAttributes(
  sourceText: string,
  importDeclarationNode: ParserAstNode,
): { attributesText: string | null; isValid: boolean } {
  const declarationRange = getAstNodeTextRange(importDeclarationNode);
  const moduleSpecifierRange = getAstNodeTextRange(
    importDeclarationNode.source,
  );

  if (!declarationRange || !moduleSpecifierRange) {
    return { attributesText: null, isValid: false };
  }
  const importAttributesText = sourceText
    .slice(moduleSpecifierRange.end, declarationRange.end)
    .replace(/;\s*$/, '')
    .trim();

  if (importAttributesText === '') {
    return { attributesText: null, isValid: true };
  }
  return {
    attributesText: importAttributesText,
    isValid: /^(?:with|assert)\s*\{[\s\S]*\}$/.test(importAttributesText),
  };
}

interface ParsedImportSpecifier {
  importedName: string;
  importedNameText: string;
  localName: string;
  isTypeOnly: boolean;
}

interface ParsedImportDeclaration {
  moduleSpecifier: string;
  moduleSpecifierText: string;
  isTypeOnly: boolean;
  isSideEffectOnly: boolean;
  defaultBinding: string | null;
  namespaceBinding: string | null;
  namedSpecifiers: ParsedImportSpecifier[] | null;
  importAttributes: string | null;
  verbatimDeclaration: string | null;
  leadingCommentsText: string;
  trailingCommentsText: string;
  isMergeBoundary: boolean;
}

interface ImportDeclarationMetadata {
  importDeclarationNode: ParserAstNode;
  declarationRange: SourceTextRange;
  leadingCommentsText: string;
  trailingCommentsText: string;
  hasInternalComments: boolean;
}

/**
 * 从 AST 提取可安全重写的 import 字段。
 * 无法完整识别的语法保留原声明，只参与分组和位置排序。
 */
function parseImportDeclaration(
  importDeclarationMetadata: ImportDeclarationMetadata,
  sourceText: string,
): ParsedImportDeclaration | null {
  const {
    importDeclarationNode,
    declarationRange,
    leadingCommentsText,
    trailingCommentsText,
    hasInternalComments,
  } = importDeclarationMetadata;
  const moduleSpecifierNode = importDeclarationNode.source;
  const moduleSpecifierRange = getAstNodeTextRange(moduleSpecifierNode);
  const moduleSpecifier = getAstNodeName(moduleSpecifierNode);

  if (!moduleSpecifierRange || moduleSpecifier === null) {
    return null;
  }
  let importKind = 'value';

  const declarationText = sourceText.slice(
    declarationRange.start,
    declarationRange.end,
  );

  if (typeof importDeclarationNode.importKind === 'string') {
    importKind = importDeclarationNode.importKind;
  }
  let specifierNodes: readonly ParserAstNode[] = [];
  const isTypeOnly = importKind === 'type';

  if (Array.isArray(importDeclarationNode.specifiers)) {
    specifierNodes = importDeclarationNode.specifiers;
  }
  let importPhase: string | null = null;

  const isSideEffectOnly =
    specifierNodes.length === 0 && importKind === 'value';
  const parsedImportAttributes = parseImportAttributes(
    sourceText,
    importDeclarationNode,
  );

  if (typeof importDeclarationNode.phase === 'string') {
    importPhase = importDeclarationNode.phase;
  }
  let defaultBinding: string | null = null;
  let namespaceBinding: string | null = null;
  let isEverySpecifierSupported = true;

  const namedSpecifiers: ParsedImportSpecifier[] = [];

  for (const specifierNode of specifierNodes) {
    if (specifierNode.type === 'ImportDefaultSpecifier') {
      defaultBinding = getAstNodeName(specifierNode.local);
      isEverySpecifierSupported &&= defaultBinding !== null;
      continue;
    }
    if (specifierNode.type === 'ImportNamespaceSpecifier') {
      namespaceBinding = getAstNodeName(specifierNode.local);
      isEverySpecifierSupported &&= namespaceBinding !== null;
      continue;
    }
    if (specifierNode.type !== 'ImportSpecifier') {
      isEverySpecifierSupported = false;
      continue;
    }
    let specifierKind = 'value';

    const importedNode = specifierNode.imported;
    const importedNameRange = getAstNodeTextRange(importedNode);
    const importedName = getAstNodeName(importedNode);
    const localName = getAstNodeName(specifierNode.local);

    if (typeof specifierNode.importKind === 'string') {
      specifierKind = specifierNode.importKind;
    }
    if (
      !importedNameRange ||
      importedName === null ||
      localName === null ||
      (specifierKind !== 'value' && specifierKind !== 'type')
    ) {
      isEverySpecifierSupported = false;
      continue;
    }
    namedSpecifiers.push({
      importedName,
      importedNameText: sourceText.slice(
        importedNameRange.start,
        importedNameRange.end,
      ),
      localName,
      isTypeOnly: specifierKind === 'type',
    });
  }
  let parsedNamedSpecifiers: ParsedImportSpecifier[] | null = null;

  const isTypeClauseRewriteUnsupported =
    isTypeOnly && (defaultBinding !== null || namespaceBinding !== null);
  const isVerbatimRenderingRequired =
    specifierNodes.length === 0 ||
    hasInternalComments ||
    importPhase !== null ||
    (importKind !== 'value' && importKind !== 'type') ||
    !isEverySpecifierSupported ||
    !parsedImportAttributes.isValid ||
    isTypeClauseRewriteUnsupported ||
    (isTypeOnly && parsedImportAttributes.attributesText !== null);

  if (namedSpecifiers.length > 0) {
    parsedNamedSpecifiers = namedSpecifiers;
  }
  let verbatimDeclaration: string | null = null;

  if (isVerbatimRenderingRequired) {
    verbatimDeclaration = declarationText;
  }
  return {
    moduleSpecifier,
    moduleSpecifierText: sourceText.slice(
      moduleSpecifierRange.start,
      moduleSpecifierRange.end,
    ),
    isTypeOnly,
    isSideEffectOnly,
    defaultBinding,
    namespaceBinding,
    namedSpecifiers: parsedNamedSpecifiers,
    importAttributes: parsedImportAttributes.attributesText,
    verbatimDeclaration,
    leadingCommentsText,
    trailingCommentsText,
    isMergeBoundary:
      leadingCommentsText.trim() !== '' ||
      trailingCommentsText !== '' ||
      hasInternalComments,
  };
}

function renderNamedImportSpecifiers(
  namedSpecifiers: readonly ParsedImportSpecifier[],
): string {
  return namedSpecifiers
    .map(importSpecifier => {
      let renderedSpecifier = importSpecifier.importedNameText;

      const isAliasRequired =
        importSpecifier.importedNameText !== importSpecifier.importedName ||
        importSpecifier.importedName !== importSpecifier.localName;

      if (isAliasRequired) {
        renderedSpecifier = `${importSpecifier.importedNameText} as ${importSpecifier.localName}`;
      }
      if (importSpecifier.isTypeOnly) {
        return `type ${renderedSpecifier}`;
      }
      return renderedSpecifier;
    })
    .join(', ');
}

function renderImportBindings(
  importDeclaration: ParsedImportDeclaration,
): string {
  const renderedBindings: string[] = [];

  if (importDeclaration.defaultBinding) {
    renderedBindings.push(importDeclaration.defaultBinding);
  }
  if (importDeclaration.namespaceBinding) {
    renderedBindings.push(`* as ${importDeclaration.namespaceBinding}`);
  }
  if (importDeclaration.namedSpecifiers) {
    renderedBindings.push(
      `{ ${renderNamedImportSpecifiers(importDeclaration.namedSpecifiers)} }`,
    );
  }
  return renderedBindings.join(', ');
}

function renderImportDeclaration(
  importDeclaration: ParsedImportDeclaration,
): string {
  if (importDeclaration.verbatimDeclaration !== null) {
    return (
      importDeclaration.leadingCommentsText +
      importDeclaration.verbatimDeclaration +
      importDeclaration.trailingCommentsText
    );
  }
  let attributesSuffix = '';

  if (importDeclaration.importAttributes) {
    attributesSuffix = ` ${importDeclaration.importAttributes}`;
  }
  let declarationText = `import ${renderImportBindings(importDeclaration)} from ${importDeclaration.moduleSpecifierText}${attributesSuffix};`;

  if (importDeclaration.isTypeOnly) {
    declarationText = `import type ${renderImportBindings(importDeclaration)} from ${importDeclaration.moduleSpecifierText}${attributesSuffix};`;
  }
  return (
    importDeclaration.leadingCommentsText +
    declarationText +
    importDeclaration.trailingCommentsText
  );
}

function sortNamedImportSpecifiers(
  namedSpecifiers: readonly ParsedImportSpecifier[],
): ParsedImportSpecifier[] {
  return [...namedSpecifiers].sort((left, right) =>
    left.localName.localeCompare(right.localName, 'en', {
      sensitivity: 'base',
    }),
  );
}

function getLocalBindingNames(
  importDeclaration: ParsedImportDeclaration,
): string[] {
  const localBindingNames: string[] = [];

  if (importDeclaration.defaultBinding) {
    localBindingNames.push(importDeclaration.defaultBinding);
  }
  if (importDeclaration.namespaceBinding) {
    localBindingNames.push(importDeclaration.namespaceBinding);
  }
  if (importDeclaration.namedSpecifiers) {
    localBindingNames.push(
      ...importDeclaration.namedSpecifiers.map(
        importSpecifier => importSpecifier.localName,
      ),
    );
  }
  return localBindingNames;
}

interface ImportBindingCounts {
  defaultBindingCount: number;
  namespaceBindingCount: number;
}

function getImportRequestKey(
  importDeclaration: ParsedImportDeclaration,
): string {
  return `${importDeclaration.moduleSpecifier}\0${importDeclaration.importAttributes ?? ''}`;
}

function isImportDeclarationMergeSafe(
  targetImportDeclaration: ParsedImportDeclaration,
  candidateImportDeclaration: ParsedImportDeclaration,
  bindingCounts: ImportBindingCounts,
): boolean {
  if (
    targetImportDeclaration.verbatimDeclaration !== null ||
    candidateImportDeclaration.verbatimDeclaration !== null ||
    targetImportDeclaration.isSideEffectOnly ||
    candidateImportDeclaration.isSideEffectOnly ||
    targetImportDeclaration.moduleSpecifier !==
      candidateImportDeclaration.moduleSpecifier ||
    targetImportDeclaration.importAttributes !==
      candidateImportDeclaration.importAttributes ||
    targetImportDeclaration.isMergeBoundary ||
    candidateImportDeclaration.isMergeBoundary
  ) {
    return false;
  }
  if (
    (bindingCounts.defaultBindingCount > 1 &&
      (targetImportDeclaration.defaultBinding !== null ||
        candidateImportDeclaration.defaultBinding !== null)) ||
    (bindingCounts.namespaceBindingCount > 1 &&
      (targetImportDeclaration.namespaceBinding !== null ||
        candidateImportDeclaration.namespaceBinding !== null)) ||
    (targetImportDeclaration.defaultBinding !== null &&
      candidateImportDeclaration.defaultBinding !== null) ||
    (targetImportDeclaration.namespaceBinding !== null &&
      candidateImportDeclaration.namespaceBinding !== null)
  ) {
    return false;
  }
  const isAnyNamedSpecifierPresent =
    (targetImportDeclaration.namedSpecifiers?.length ?? 0) > 0 ||
    (candidateImportDeclaration.namedSpecifiers?.length ?? 0) > 0;

  if (
    isAnyNamedSpecifierPresent &&
    (targetImportDeclaration.namespaceBinding !== null ||
      candidateImportDeclaration.namespaceBinding !== null)
  ) {
    return false;
  }
  const usedLocalNames = new Set(getLocalBindingNames(targetImportDeclaration));

  return getLocalBindingNames(candidateImportDeclaration).every(
    localName => !usedLocalNames.has(localName),
  );
}

function mergeImportDeclarations(
  targetImportDeclaration: ParsedImportDeclaration,
  candidateImportDeclaration: ParsedImportDeclaration,
): ParsedImportDeclaration {
  let namedSpecifiers: ParsedImportSpecifier[] | null = null;
  const isTypeOnly =
    targetImportDeclaration.isTypeOnly && candidateImportDeclaration.isTypeOnly;

  const mergedNamedSpecifiers = [
    ...getNamedSpecifiersForMerge(targetImportDeclaration, isTypeOnly),
    ...getNamedSpecifiersForMerge(candidateImportDeclaration, isTypeOnly),
  ];

  if (mergedNamedSpecifiers.length > 0) {
    namedSpecifiers = mergedNamedSpecifiers;
  }
  return {
    moduleSpecifier: targetImportDeclaration.moduleSpecifier,
    moduleSpecifierText: targetImportDeclaration.moduleSpecifierText,
    isTypeOnly,
    isSideEffectOnly: false,
    defaultBinding:
      targetImportDeclaration.defaultBinding ??
      candidateImportDeclaration.defaultBinding,
    namespaceBinding:
      targetImportDeclaration.namespaceBinding ??
      candidateImportDeclaration.namespaceBinding,
    namedSpecifiers,
    importAttributes: targetImportDeclaration.importAttributes,
    verbatimDeclaration: null,
    leadingCommentsText: targetImportDeclaration.leadingCommentsText,
    trailingCommentsText: '',
    isMergeBoundary: false,
  };
}

function getNamedSpecifiersForMerge(
  importDeclaration: ParsedImportDeclaration,
  isMergedTypeOnly: boolean,
): ParsedImportSpecifier[] {
  return (importDeclaration.namedSpecifiers ?? []).map(importSpecifier => ({
    ...importSpecifier,
    isTypeOnly:
      !isMergedTypeOnly &&
      (importDeclaration.isTypeOnly || importSpecifier.isTypeOnly),
  }));
}

/**
 * 只合并语义兼容的同源 import。
 * 注释、属性、重复绑定和 namespace 组合都会阻止合并。
 */
function mergeCompatibleImports(
  importDeclarations: readonly ParsedImportDeclaration[],
): ParsedImportDeclaration[] {
  const bindingCountsByImportDeclaration = new Map<
    ParsedImportDeclaration,
    ImportBindingCounts
  >();
  const currentBindingCountsByRequest = new Map<string, ImportBindingCounts>();
  const minimumMergeTargetIndexByRequest = new Map<string, number>();

  for (const importDeclaration of importDeclarations) {
    const importRequestKey = getImportRequestKey(importDeclaration);

    if (importDeclaration.isMergeBoundary) {
      currentBindingCountsByRequest.delete(importRequestKey);
      continue;
    }
    if (
      importDeclaration.verbatimDeclaration !== null ||
      importDeclaration.isSideEffectOnly
    ) {
      continue;
    }
    const bindingCounts = currentBindingCountsByRequest.get(
      importRequestKey,
    ) ?? {
      defaultBindingCount: 0,
      namespaceBindingCount: 0,
    };

    if (importDeclaration.defaultBinding !== null) {
      bindingCounts.defaultBindingCount++;
    }
    if (importDeclaration.namespaceBinding !== null) {
      bindingCounts.namespaceBindingCount++;
    }
    currentBindingCountsByRequest.set(importRequestKey, bindingCounts);
    bindingCountsByImportDeclaration.set(importDeclaration, bindingCounts);
  }
  const mergedImportDeclarations: ParsedImportDeclaration[] = [];

  for (const importDeclaration of importDeclarations) {
    const importRequestKey = getImportRequestKey(importDeclaration);
    const bindingCounts = bindingCountsByImportDeclaration.get(
      importDeclaration,
    ) ?? {
      defaultBindingCount: 0,
      namespaceBindingCount: 0,
    };
    const minimumMergeTargetIndex =
      minimumMergeTargetIndexByRequest.get(importRequestKey) ?? 0;
    const mergeTargetIndex = mergedImportDeclarations.findIndex(
      (existingImportDeclaration, existingImportIndex) =>
        existingImportIndex >= minimumMergeTargetIndex &&
        isImportDeclarationMergeSafe(
          existingImportDeclaration,
          importDeclaration,
          bindingCounts,
        ),
    );

    if (mergeTargetIndex < 0) {
      mergedImportDeclarations.push(importDeclaration);
    } else {
      mergedImportDeclarations[mergeTargetIndex] = mergeImportDeclarations(
        mergedImportDeclarations[mergeTargetIndex]!,
        importDeclaration,
      );
    }
    if (importDeclaration.isMergeBoundary) {
      minimumMergeTargetIndexByRequest.set(
        importRequestKey,
        mergedImportDeclarations.length,
      );
    }
  }
  return mergedImportDeclarations;
}

/**
 * 按配置转换 type import。
 * 仅在保留运行时模块请求时转换声明形式。
 * 带注释或 import attributes 的声明不会被拆分，避免改变注释归属或模块请求。
 */
function applyTypeImportStyle(
  importDeclaration: ParsedImportDeclaration,
  typeImportStyle: TypeImportStyle,
): ParsedImportDeclaration[] {
  if (
    importDeclaration.verbatimDeclaration !== null ||
    !importDeclaration.namedSpecifiers
  ) {
    return [importDeclaration];
  }
  const namedSpecifiers = importDeclaration.namedSpecifiers;

  if (importDeclaration.isTypeOnly) {
    return [
      {
        ...importDeclaration,
        namedSpecifiers: sortNamedImportSpecifiers(namedSpecifiers),
      },
    ];
  }
  if (typeImportStyle === 'separate') {
    const typeSpecifiers = namedSpecifiers.filter(
      importSpecifier => importSpecifier.isTypeOnly,
    );
    const valueSpecifiers = namedSpecifiers.filter(
      importSpecifier => !importSpecifier.isTypeOnly,
    );
    const hasValueBinding =
      valueSpecifiers.length > 0 ||
      importDeclaration.defaultBinding !== null ||
      importDeclaration.namespaceBinding !== null;

    if (
      typeSpecifiers.length > 0 &&
      (!hasValueBinding ||
        importDeclaration.importAttributes !== null ||
        importDeclaration.leadingCommentsText.trim() !== '' ||
        importDeclaration.trailingCommentsText !== '')
    ) {
      return [
        {
          ...importDeclaration,
          namedSpecifiers: sortNamedImportSpecifiers(namedSpecifiers),
        },
      ];
    }
    const styledImportDeclarations: ParsedImportDeclaration[] = [];

    if (typeSpecifiers.length > 0) {
      styledImportDeclarations.push({
        ...importDeclaration,
        isTypeOnly: true,
        defaultBinding: null,
        namespaceBinding: null,
        namedSpecifiers: sortNamedImportSpecifiers(
          typeSpecifiers.map(importSpecifier => ({
            ...importSpecifier,
            isTypeOnly: false,
          })),
        ),
      });
    }
    if (
      valueSpecifiers.length > 0 ||
      importDeclaration.defaultBinding !== null ||
      importDeclaration.namespaceBinding !== null
    ) {
      let namedValueSpecifiers: ParsedImportSpecifier[] | null = null;

      if (valueSpecifiers.length > 0) {
        namedValueSpecifiers = sortNamedImportSpecifiers(valueSpecifiers);
      }
      let leadingCommentsText = importDeclaration.leadingCommentsText;

      if (typeSpecifiers.length > 0) {
        leadingCommentsText = '';
      }
      styledImportDeclarations.push({
        ...importDeclaration,
        namedSpecifiers: namedValueSpecifiers,
        leadingCommentsText,
      });
    }
    return styledImportDeclarations;
  }
  if (typeImportStyle === 'mixed') {
    return [
      {
        ...importDeclaration,
        namedSpecifiers: sortNamedImportSpecifiers(namedSpecifiers),
      },
    ];
  }
  const typeSpecifiers = sortNamedImportSpecifiers(
    namedSpecifiers.filter(importSpecifier => importSpecifier.isTypeOnly),
  );
  const valueSpecifiers = sortNamedImportSpecifiers(
    namedSpecifiers.filter(importSpecifier => !importSpecifier.isTypeOnly),
  );

  let orderedSpecifiers = [...valueSpecifiers, ...typeSpecifiers];

  if (typeImportStyle === 'inline-first') {
    orderedSpecifiers = [...typeSpecifiers, ...valueSpecifiers];
  }
  return [{ ...importDeclaration, namedSpecifiers: orderedSpecifiers }];
}

function getImportBindingShapeRank(
  importDeclaration: ParsedImportDeclaration,
): number {
  if (importDeclaration.defaultBinding !== null) {
    return 0;
  }
  if (importDeclaration.namespaceBinding !== null) {
    return 1;
  }
  return 2;
}

function sortImportSegment(
  importDeclarations: readonly ParsedImportDeclaration[],
  sortOptions: Required<SortOptions>,
  importGroupOrder: ReadonlyMap<ImportGroup, number>,
): string[] {
  let mergedImportDeclarations = [...importDeclarations];

  if (sortOptions.esmImportMerge) {
    mergedImportDeclarations = mergeCompatibleImports(importDeclarations);
  }
  const styledImportDeclarations = mergedImportDeclarations.flatMap(
    importDeclaration =>
      applyTypeImportStyle(importDeclaration, sortOptions.esmImportTypeStyle),
  );
  const unlistedGroupRank = sortOptions.esmImportGroups.length;
  const rankedImportDeclarations = styledImportDeclarations.map(
    (importDeclaration, originalIndex) => ({
      importDeclaration,
      importGroup: classifyImportGroup(importDeclaration.moduleSpecifier),
      originalIndex,
    }),
  );

  rankedImportDeclarations.sort((left, right) => {
    const groupRankDifference =
      (importGroupOrder.get(left.importGroup) ?? unlistedGroupRank) -
      (importGroupOrder.get(right.importGroup) ?? unlistedGroupRank);

    if (groupRankDifference !== 0) {
      return groupRankDifference;
    }
    const moduleSpecifierDifference =
      left.importDeclaration.moduleSpecifier.localeCompare(
        right.importDeclaration.moduleSpecifier,
        'en',
        { sensitivity: 'base' },
      );

    if (moduleSpecifierDifference !== 0) {
      return moduleSpecifierDifference;
    }
    if (
      left.importDeclaration.isTypeOnly !== right.importDeclaration.isTypeOnly
    ) {
      if (left.importDeclaration.isTypeOnly) {
        return -1;
      }
      return 1;
    }
    return (
      getImportBindingShapeRank(left.importDeclaration) -
        getImportBindingShapeRank(right.importDeclaration) ||
      left.originalIndex - right.originalIndex
    );
  });

  let previousImportGroup: ImportGroup | null = null;
  const renderedImportLines: string[] = [];

  for (const { importDeclaration, importGroup } of rankedImportDeclarations) {
    if (
      sortOptions.esmImportSeparation &&
      previousImportGroup !== null &&
      importGroup !== previousImportGroup
    ) {
      renderedImportLines.push('');
    }
    renderedImportLines.push(renderImportDeclaration(importDeclaration));
    previousImportGroup = importGroup;
  }
  return renderedImportLines;
}

/** 副作用 import 保持原顺序，并把普通 import 分隔为独立排序片段。 */
function renderSortedImportLines(
  importDeclarations: readonly ParsedImportDeclaration[],
  sortOptions: Required<SortOptions>,
): string[] {
  let currentSortableImportDeclarations: ParsedImportDeclaration[] = [];

  const importGroupOrder = new Map<ImportGroup, number>(
    sortOptions.esmImportGroups.map((importGroup, groupIndex) => [
      importGroup,
      groupIndex,
    ]),
  );
  const importDeclarationChunks: Array<
    | {
        kind: 'sortable';
        importDeclarations: ParsedImportDeclaration[];
      }
    | {
        kind: 'side-effect';
        importDeclaration: ParsedImportDeclaration;
      }
  > = [];

  for (const importDeclaration of importDeclarations) {
    if (!importDeclaration.isSideEffectOnly) {
      currentSortableImportDeclarations.push(importDeclaration);
      continue;
    }
    if (currentSortableImportDeclarations.length > 0) {
      importDeclarationChunks.push({
        kind: 'sortable',
        importDeclarations: currentSortableImportDeclarations,
      });
      currentSortableImportDeclarations = [];
    }
    importDeclarationChunks.push({ kind: 'side-effect', importDeclaration });
  }
  if (currentSortableImportDeclarations.length > 0) {
    importDeclarationChunks.push({
      kind: 'sortable',
      importDeclarations: currentSortableImportDeclarations,
    });
  }
  let previousChunkKind: 'sortable' | 'side-effect' | null = null;
  const renderedImportLines: string[] = [];

  for (const importChunk of importDeclarationChunks) {
    if (
      sortOptions.esmImportSeparation &&
      previousChunkKind !== null &&
      previousChunkKind !== importChunk.kind
    ) {
      renderedImportLines.push('');
    }
    if (importChunk.kind === 'sortable') {
      renderedImportLines.push(
        ...sortImportSegment(
          importChunk.importDeclarations,
          sortOptions,
          importGroupOrder,
        ),
      );
    } else {
      renderedImportLines.push(
        renderImportDeclaration(importChunk.importDeclaration),
      );
    }
    previousChunkKind = importChunk.kind;
  }
  return renderedImportLines;
}

interface SortableImportEntry {
  importDeclarationNode: ParserAstNode;
  start: number;
  end: number;
  parsedImportDeclaration: ParsedImportDeclaration;
}

function isCommentPresentWithinRange(
  sortedComments: readonly ParserAstCommentWithTextRange[],
  start: number,
  end: number,
): boolean {
  const firstCommentIndex = findCommentIndexAtOrAfter(sortedComments, start);
  const firstComment = sortedComments[firstCommentIndex];

  return firstComment !== undefined && firstComment.textRange.end <= end;
}

function hasPositionSensitiveEslintCommentWithinRange(
  sourceText: string,
  sortedComments: readonly ParserAstCommentWithTextRange[],
  start: number,
  end: number,
): boolean {
  for (
    let commentIndex = findCommentIndexAtOrAfter(sortedComments, start);
    commentIndex < sortedComments.length;
    commentIndex++
  ) {
    const parserComment = sortedComments[commentIndex];

    if (!parserComment || parserComment.textRange.start >= end) {
      return false;
    }
    if (
      parserComment.textRange.end <= end &&
      isPositionSensitiveEslintComment(sourceText, parserComment)
    ) {
      return true;
    }
  }
  return false;
}

function buildImportSegmentEdits(
  sourceText: string,
  importEntries: readonly SortableImportEntry[],
  sortOptions: Required<SortOptions>,
  lineEnding: string,
  isBlankLineRequired: boolean,
): SourceTextEdit[] | null {
  const [firstImportEntry] = importEntries;

  if (!firstImportEntry) {
    return null;
  }
  let trailingLineBreaks = lineEnding;

  const replacementText = renderSortedImportLines(
    importEntries.map(importEntry => importEntry.parsedImportDeclaration),
    sortOptions,
  ).join(lineEnding);
  const removalEdits: SourceTextEdit[] = importEntries
    .slice(1)
    .map(importEntry => ({
      start: importEntry.start,
      end: importEntry.end,
      replacementText: '',
    }));

  if (isBlankLineRequired) {
    const textWithoutLaterImports = applySourceTextEdits(
      sourceText,
      removalEdits,
    );

    if (textWithoutLaterImports === null) {
      return null;
    }
    const isFollowingContentPresent =
      textWithoutLaterImports.slice(firstImportEntry.end).trim() !== '';

    if (isFollowingContentPresent) {
      trailingLineBreaks += lineEnding;
    }
  }
  return [
    {
      start: firstImportEntry.start,
      end: firstImportEntry.end,
      replacementText: replacementText + trailingLineBreaks,
    },
    ...removalEdits,
  ];
}

/**
 * 将顶层 import 划分为可独立排序的片段，并生成基于原文范围的编辑。
 * 被忽略的声明、独立注释和位置敏感指令不会进入编辑范围。
 */
export function buildImportSortingEdits(
  sourceText: string,
  programStatements: readonly ParserAstNode[],
  sortedComments: readonly ParserAstCommentWithTextRange[],
  sortOptions: Required<SortOptions>,
  isPrettierFilePragmaPresent: boolean,
): SourceTextEdit[] {
  const importDeclarationNodes = programStatements.filter(
    statement => statement.type === 'ImportDeclaration',
  );

  if (importDeclarationNodes.length === 0) {
    return [];
  }
  const prettierFilePragmaComment = getPrettierFilePragmaComment(
    sortedComments,
    isPrettierFilePragmaPresent,
  );

  if (isPrettierFilePragmaPresent && !prettierFilePragmaComment) {
    return [];
  }
  let currentSortableSegment: SortableImportEntry[] = [];
  const sortableSegments: SortableImportEntry[][] = [];

  for (const importDeclarationNode of importDeclarationNodes) {
    const declarationRange = getAstNodeTextRange(importDeclarationNode);

    if (!declarationRange) {
      return [];
    }
    if (
      hasPositionSensitiveEslintCommentWithinRange(
        sourceText,
        sortedComments,
        declarationRange.start,
        declarationRange.end,
      )
    ) {
      return [];
    }
    const isImportIgnoredByPrettier = isPrettierIgnored(
      sourceText,
      declarationRange,
      sortedComments,
    );
    const leadingCommentsStart = findLeadingCommentsStart(
      sourceText,
      declarationRange.start,
      sortedComments,
      prettierFilePragmaComment,
    );
    const trailingComments = getTrailingComments(
      sourceText,
      declarationRange.end,
      sortedComments,
    );

    if (isImportIgnoredByPrettier || trailingComments.isImportSortingBoundary) {
      if (currentSortableSegment.length > 0) {
        sortableSegments.push(currentSortableSegment);
        currentSortableSegment = [];
      }
      continue;
    }
    const parsedImportDeclaration = parseImportDeclaration(
      {
        importDeclarationNode,
        declarationRange,
        leadingCommentsText: sourceText.slice(
          leadingCommentsStart,
          declarationRange.start,
        ),
        trailingCommentsText: trailingComments.commentsText,
        hasInternalComments: isCommentPresentWithinRange(
          sortedComments,
          declarationRange.start,
          declarationRange.end,
        ),
      },
      sourceText,
    );

    if (parsedImportDeclaration === null) {
      return [];
    }
    const parsedImportEntry: SortableImportEntry = {
      importDeclarationNode,
      start: leadingCommentsStart,
      end: getRangeEndIncludingLineBreak(sourceText, trailingComments.rangeEnd),
      parsedImportDeclaration,
    };
    const previousImportEntry = currentSortableSegment.at(-1);

    if (
      previousImportEntry &&
      isCommentPresentWithinRange(
        sortedComments,
        previousImportEntry.end,
        parsedImportEntry.start,
      )
    ) {
      sortableSegments.push(currentSortableSegment);
      currentSortableSegment = [];
    }
    currentSortableSegment.push(parsedImportEntry);
  }
  if (currentSortableSegment.length > 0) {
    sortableSegments.push(currentSortableSegment);
  }
  let lineEnding = '\n';

  if (sourceText.includes('\r\n')) {
    lineEnding = '\r\n';
  }
  const sortingEdits: SourceTextEdit[] = [];
  const lastImportDeclarationNode = importDeclarationNodes.at(-1);

  for (const sortableSegment of sortableSegments) {
    const isLastImportSegment =
      sortableSegment.at(-1)?.importDeclarationNode ===
      lastImportDeclarationNode;
    const importSegmentEdits = buildImportSegmentEdits(
      sourceText,
      sortableSegment,
      sortOptions,
      lineEnding,
      isLastImportSegment,
    );

    if (importSegmentEdits === null) {
      return [];
    }
    sortingEdits.push(...importSegmentEdits);
  }
  return sortingEdits;
}
