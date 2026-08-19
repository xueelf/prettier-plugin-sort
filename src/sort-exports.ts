import {
  type ParserAstCommentWithTextRange,
  type ParserAstNode,
  findCommentIndexAtOrAfter,
  getAstNodeName,
  getAstNodeTextRange,
  isPrettierIgnored,
} from '#/parser-ast';
import { type SourceTextEdit } from '#/utils/source-text';

interface SortableExportSpecifier {
  originalIndex: number;
  sortName: string;
  specifierText: string;
}

/**
 * 为无注释的 `export { ... }` 生成 specifier 排序编辑。
 *
 * 注释位于逗号两侧时，仅靠 parser 暴露的裸 AST 无法可靠判断它属于前一项还是后一项。
 * 遇到这种声明时保持原样，避免为了排序改变注释语义。
 */
export function buildExportSortingEdits(
  sourceText: string,
  programStatements: readonly ParserAstNode[],
  sortedComments: readonly ParserAstCommentWithTextRange[],
): SourceTextEdit[] {
  const sortingEdits: SourceTextEdit[] = [];

  for (const exportDeclarationNode of programStatements) {
    if (
      exportDeclarationNode.type !== 'ExportNamedDeclaration' ||
      exportDeclarationNode.declaration
    ) {
      continue;
    }
    const declarationRange = getAstNodeTextRange(exportDeclarationNode);
    const specifierNodes = exportDeclarationNode.specifiers;

    if (
      !declarationRange ||
      !specifierNodes ||
      specifierNodes.length <= 1 ||
      isPrettierIgnored(sourceText, declarationRange, sortedComments) ||
      specifierNodes.some(
        specifierNode => specifierNode.type !== 'ExportSpecifier',
      )
    ) {
      continue;
    }
    const firstSpecifierRange = getAstNodeTextRange(specifierNodes[0]);
    const lastSpecifierRange = getAstNodeTextRange(specifierNodes.at(-1));

    if (!firstSpecifierRange || !lastSpecifierRange) {
      continue;
    }
    const openingBraceIndex = sourceText.lastIndexOf(
      '{',
      firstSpecifierRange.start,
    );
    const closingBraceIndex = sourceText.indexOf('}', lastSpecifierRange.end);

    if (
      openingBraceIndex < declarationRange.start ||
      closingBraceIndex < lastSpecifierRange.end ||
      closingBraceIndex >= declarationRange.end
    ) {
      continue;
    }
    const firstInternalCommentIndex = findCommentIndexAtOrAfter(
      sortedComments,
      openingBraceIndex + 1,
    );
    const firstInternalComment = sortedComments[firstInternalCommentIndex];
    const isInternalCommentPresent =
      firstInternalComment !== undefined &&
      firstInternalComment.textRange.start < closingBraceIndex;

    if (isInternalCommentPresent) {
      continue;
    }
    let isEverySpecifierValid = true;
    const sortableSpecifiers: SortableExportSpecifier[] = [];

    for (const [originalIndex, specifierNode] of specifierNodes.entries()) {
      const specifierRange = getAstNodeTextRange(specifierNode);
      const exportedName = getAstNodeName(specifierNode.exported);
      const localName = getAstNodeName(specifierNode.local);
      const sortName = exportedName ?? localName;

      if (!specifierRange || !sortName) {
        isEverySpecifierValid = false;
        break;
      }
      sortableSpecifiers.push({
        originalIndex,
        sortName,
        specifierText: sourceText.slice(
          specifierRange.start,
          specifierRange.end,
        ),
      });
    }
    if (!isEverySpecifierValid) {
      continue;
    }
    const sortedSpecifiers = [...sortableSpecifiers].sort(
      (left, right) =>
        left.sortName.localeCompare(right.sortName, 'en', {
          sensitivity: 'base',
        }) || left.originalIndex - right.originalIndex,
    );
    const isSpecifierOrderUnchanged = sortedSpecifiers.every(
      (specifier, sortedIndex) => specifier.originalIndex === sortedIndex,
    );

    if (isSpecifierOrderUnchanged) {
      continue;
    }
    sortingEdits.push({
      start: openingBraceIndex,
      end: closingBraceIndex + 1,
      replacementText: `{ ${sortedSpecifiers
        .map(specifier => specifier.specifierText)
        .join(', ')} }`,
    });
  }
  return sortingEdits;
}
