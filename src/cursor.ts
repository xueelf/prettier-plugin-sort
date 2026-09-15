import { type ParserOptions } from 'prettier';

import {
  type ParserAstComment,
  type ParserAstNode,
  getAstNodeName,
  getAstNodeTextRange,
  getProgramComments,
  getProgramStatements,
  isParserAstNode,
} from '#/parser-ast';
import { type SourceTextRange } from '#/utils/source-text';

interface CursorAnchor extends SourceTextRange {
  key: string;
}

type AnchorPath = readonly (number | string)[];

/** 只为排序会移动的结构建立身份，普通声明整体保留即可。 */
function collectCursorAnchors(
  parserAst: ParserAstNode,
  sourceText: string,
): CursorAnchor[] {
  const anchors: CursorAnchor[] = [];

  function addAnchor(
    path: AnchorPath,
    node?: ParserAstNode | ParserAstComment | null,
  ): void {
    const range = getAstNodeTextRange(node);

    if (!range || range.end > sourceText.length) {
      return;
    }
    anchors.push({
      ...range,
      key: JSON.stringify([...path, node?.type ?? 'comment']),
    });
  }

  function collectJsonAnchors(node: ParserAstNode, path: AnchorPath): void {
    addAnchor(path, node);

    if (node.type === 'ObjectExpression') {
      for (const property of node.properties ?? []) {
        const name = getAstNodeName(property.key);

        if (name === null || !isParserAstNode(property.value)) {
          continue;
        }
        const propertyPath = [...path, 'property', name];

        addAnchor(propertyPath, property);
        addAnchor([...propertyPath, 'key'], property.key);
        collectJsonAnchors(property.value, [...propertyPath, 'value']);
      }
    } else if (node.type === 'ArrayExpression') {
      for (const [index, element] of (node.elements ?? []).entries()) {
        if (!element) {
          continue;
        }
        // 字符串列表可能排序或去重，其他数组只会整理元素内部的字段。
        const elementPath =
          typeof element.value === 'string'
            ? [...path, 'string', element.value]
            : [...path, 'index', index];

        collectJsonAnchors(element, elementPath);
      }
    }
  }

  const jsonRoot = parserAst.type === 'JsonRoot' ? parserAst.node : undefined;

  if (jsonRoot) {
    collectJsonAnchors(jsonRoot, ['json']);
  } else {
    let statementIndex = 0;

    for (const statement of getProgramStatements(parserAst)) {
      if (statement.type === 'ImportDeclaration') {
        const sourceName = getAstNodeName(statement.source);

        if (sourceName === null) {
          continue;
        }
        const importPath = [
          'import',
          sourceName,
          typeof statement.phase === 'string' ? statement.phase : '',
        ];

        addAnchor([...importPath, 'declaration'], statement);
        addAnchor([...importPath, 'source'], statement.source);

        for (const specifier of statement.specifiers ?? []) {
          const localName = getAstNodeName(specifier.local);

          if (localName === null) {
            continue;
          }
          const specifierPath = [...importPath, 'binding', localName];

          addAnchor(specifierPath, specifier);
          addAnchor([...specifierPath, 'local'], specifier.local);
          addAnchor([...specifierPath, 'imported'], specifier.imported);
        }
        continue;
      }
      const statementPath = ['statement', statementIndex++];

      addAnchor(statementPath, statement);

      if (statement.type === 'ExportNamedDeclaration') {
        addAnchor([...statementPath, 'source'], statement.source);

        for (const specifier of statement.specifiers ?? []) {
          const exportedName = getAstNodeName(specifier.exported);

          if (exportedName === null) {
            continue;
          }
          const specifierPath = [...statementPath, 'specifier', exportedName];

          addAnchor(specifierPath, specifier);
          addAnchor([...specifierPath, 'local'], specifier.local);
          addAnchor([...specifierPath, 'exported'], specifier.exported);
        }
      }
    }
  }

  for (const comment of getProgramComments(parserAst)) {
    const range = getAstNodeTextRange(comment);

    if (range) {
      addAnchor(['comment', sourceText.slice(range.start, range.end)], comment);
    }
  }
  return anchors;
}

/** 在 Prettier 根据新 AST 定位光标之前，先跟随源码未变的唯一节点移动。 */
export function updateCursorOffset(
  sourceText: string,
  sortedText: string,
  originalAst: ParserAstNode,
  sortedAst: ParserAstNode,
  prettierOptions: ParserOptions,
): boolean {
  const cursorOffset = prettierOptions.cursorOffset;

  if (
    typeof cursorOffset !== 'number' ||
    cursorOffset < 0 ||
    sourceText === sortedText
  ) {
    return true;
  }
  if (!Number.isSafeInteger(cursorOffset) || cursorOffset > sourceText.length) {
    return false;
  }
  if (cursorOffset === 0 || cursorOffset === sourceText.length) {
    prettierOptions.cursorOffset = cursorOffset === 0 ? 0 : sortedText.length;
    return true;
  }
  const originalAnchors = collectCursorAnchors(originalAst, sourceText)
    .filter(
      anchor => anchor.start <= cursorOffset && cursorOffset <= anchor.end,
    )
    .sort(
      (left, right) =>
        left.end - left.start - (right.end - right.start) ||
        right.start - left.start,
    );
  const sortedAnchors = collectCursorAnchors(sortedAst, sortedText);

  for (const originalAnchor of originalAnchors) {
    const originalNodeText = sourceText.slice(
      originalAnchor.start,
      originalAnchor.end,
    );
    const matches = sortedAnchors.filter(
      anchor =>
        anchor.key === originalAnchor.key &&
        sortedText.slice(anchor.start, anchor.end) === originalNodeText,
    );
    const [matchingAnchor] = matches;

    if (matches.length === 1 && matchingAnchor) {
      prettierOptions.cursorOffset =
        matchingAnchor.start + cursorOffset - originalAnchor.start;
      return true;
    }
  }
  // 相同字面量可能属于不同节点，不能用全文搜索猜测新的归属。
  return false;
}
