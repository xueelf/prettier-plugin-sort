import { type SourceTextRange } from './utils/source-text';

/**
 * 已注册 Prettier parser 的源码偏移字段。
 *
 * `start`/`end` 是 Babel AST 使用的绝对偏移。
 * `range` 是 typescript-estree 等 ESTree 兼容 AST 使用的 `[start, end]` 偏移元组。
 *
 * @see {@link https://babeljs.io/docs/babel-parser#options | Babel parser 位置选项}
 * @see {@link https://typescript-eslint.io/packages/typescript-estree/#api | typescript-estree 的 range 选项}
 */
interface ParserAstLocation extends Record<string, unknown> {
  readonly start?: number;
  readonly end?: number;
  readonly range?: readonly [number, number];
}

/**
 * 排序逻辑使用的跨 parser AST 字段。
 *
 * 字段均来自已注册 parser 的上游 AST：
 *
 * - `type`、`name`、`value`、`body` 来自 ESTree 基础节点
 * - `declaration`、`specifiers`、`source`、`imported`、`local`、`exported` 来自 ESTree ES2015 module 节点
 * - `program`、`comments` 来自 Babel `File` 包装节点及 Prettier 的顶层注释约定
 * - `importKind`、`phase` 来自 Babel/typescript-estree 的 import 扩展
 *
 * 不同 parser 的字段结构存在差异，因此属性均为可选，并在使用处收窄类型。
 *
 * @see {@link https://github.com/estree/estree/blob/master/es5.md#node-objects | ESTree 基础节点}
 * @see {@link https://github.com/estree/estree/blob/master/es2015.md#modules | ESTree module 节点}
 * @see {@link https://babeljs.io/docs/babel-types#file | Babel File 节点}
 * @see {@link https://babeljs.io/docs/babel-types#importdeclaration | Babel ImportDeclaration 节点}
 * @see {@link https://typescript-eslint.io/packages/typescript-estree/ast-spec/#importdeclaration | typescript-estree ImportDeclaration 节点}
 * @see {@link https://prettier.io/docs/plugins#handling-comments-in-a-printer | Prettier 顶层注释约定}
 */
export interface ParserAstNode extends ParserAstLocation {
  readonly type: string;
  readonly name?: unknown;
  readonly value?: unknown;
  readonly body?: ParserAstNode[];
  readonly comments?: ParserAstComment[];
  readonly program?: ParserAstNode;
  readonly declaration?: ParserAstNode | null;
  readonly specifiers?: ParserAstNode[];
  readonly source?: ParserAstNode | null;
  readonly imported?: ParserAstNode | null;
  readonly local?: ParserAstNode | null;
  readonly exported?: ParserAstNode | null;
  readonly importKind?: unknown;
  readonly phase?: unknown;
}

/**
 * 排序逻辑使用的 parser 注释字段。
 *
 * `value` 是不含注释分隔符的正文；源码偏移来自 parser 节点的 `start`/`end` 或 `range`。
 *
 * @see {@link https://prettier.io/docs/plugins#handling-comments-in-a-printer | Prettier 注释节点约定}
 */
export interface ParserAstComment extends ParserAstLocation {
  readonly value?: unknown;
}

export interface ParserAstCommentWithTextRange {
  readonly comment: ParserAstComment;
  readonly textRange: SourceTextRange;
}

export function getAstNodeTextRange(
  node: ParserAstNode | ParserAstComment | undefined | null,
): SourceTextRange | null {
  if (!node) {
    return null;
  }
  const [start = NaN, end = NaN] = node.range ?? [node.start, node.end];
  const isOffsetRangeValid =
    [start, end].every(Number.isSafeInteger) && start >= 0 && end >= start;

  if (!isOffsetRangeValid) {
    return null;
  }
  return { start, end };
}

export function getSortedAstCommentsWithTextRanges(
  comments: readonly ParserAstComment[],
): ParserAstCommentWithTextRange[] {
  return comments
    .flatMap(comment => {
      const textRange = getAstNodeTextRange(comment);

      return textRange ? [{ comment, textRange }] : [];
    })
    .sort(
      (left, right) =>
        left.textRange.start - right.textRange.start ||
        left.textRange.end - right.textRange.end,
    );
}

/** 使用二分查找定位指定源码位置之后的第一条注释。 */
export function findCommentIndexAtOrAfter(
  sortedComments: readonly ParserAstCommentWithTextRange[],
  sourceIndex: number,
): number {
  let searchStartIndex = 0;
  let searchEndIndex = sortedComments.length;

  while (searchStartIndex < searchEndIndex) {
    const middleIndex = Math.floor((searchStartIndex + searchEndIndex) / 2);
    const middleCommentStart = sortedComments[middleIndex]!.textRange.start;

    if (middleCommentStart < sourceIndex) {
      searchStartIndex = middleIndex + 1;
    } else {
      searchEndIndex = middleIndex;
    }
  }
  return searchStartIndex;
}

export function getAstNodeName(
  node: ParserAstNode | undefined | null,
): string | null {
  if (!node) {
    return null;
  }
  if (typeof node.name === 'string') {
    return node.name;
  }
  switch (typeof node.value) {
    case 'string':
    case 'number':
    case 'boolean':
      return String(node.value);
    default:
      return null;
  }
}

export function getAstCommentText(comment: ParserAstComment): string | null {
  return typeof comment.value === 'string' ? comment.value : null;
}

export function getProgramStatements(
  parserAst: ParserAstNode,
): readonly ParserAstNode[] {
  if (Array.isArray(parserAst.body)) {
    return parserAst.body;
  }
  const programNode = parserAst.program;

  if (!programNode || !Array.isArray(programNode.body)) {
    return [];
  }
  return programNode.body;
}

export function getProgramComments(
  parserAst: ParserAstNode,
): readonly ParserAstComment[] {
  if (Array.isArray(parserAst.comments)) {
    return parserAst.comments;
  }
  const programNode = parserAst.program;

  if (!programNode || !Array.isArray(programNode.comments)) {
    return [];
  }
  return programNode.comments;
}

export function isSourceRangeWhitespaceOrComments(
  sourceText: string,
  sourceRange: SourceTextRange,
  sortedComments: readonly ParserAstCommentWithTextRange[],
): boolean {
  let sourceIndex = sourceRange.start;
  let commentIndex = Math.max(
    findCommentIndexAtOrAfter(sortedComments, sourceRange.start) - 1,
    0,
  );

  for (; commentIndex < sortedComments.length; commentIndex++) {
    const parserComment = sortedComments[commentIndex];

    if (!parserComment || parserComment.textRange.start >= sourceRange.end) {
      break;
    }
    if (parserComment.textRange.end <= sourceIndex) {
      continue;
    }
    const commentStart = Math.max(
      parserComment.textRange.start,
      sourceRange.start,
    );

    if (sourceText.slice(sourceIndex, commentStart).trim() !== '') {
      return false;
    }
    sourceIndex = Math.min(parserComment.textRange.end, sourceRange.end);
  }
  return sourceText.slice(sourceIndex, sourceRange.end).trim() === '';
}

/**
 * Prettier 会在解析器预处理之后才附着 `prettier-ignore` 注释，因此文本变换必须先自行识别。
 */
export function isPrettierIgnored(
  sourceText: string,
  statementRange: SourceTextRange,
  sortedComments: readonly ParserAstCommentWithTextRange[],
): boolean {
  let leadingCommentsStart = statementRange.start;

  for (
    let commentIndex =
      findCommentIndexAtOrAfter(sortedComments, statementRange.start) - 1;
    commentIndex >= 0;
    commentIndex--
  ) {
    const parserComment = sortedComments[commentIndex];

    if (!parserComment || parserComment.textRange.end > statementRange.start) {
      continue;
    }
    const { comment, textRange } = parserComment;
    const followingText = sourceText.slice(textRange.end, leadingCommentsStart);

    if (followingText.trim() !== '') {
      break;
    }
    if (followingText.includes('\n')) {
      const commentLineStart =
        sourceText.lastIndexOf('\n', textRange.start - 1) + 1;
      const isCommentLinePrefixEmpty = isSourceRangeWhitespaceOrComments(
        sourceText,
        { start: commentLineStart, end: textRange.start },
        sortedComments,
      );

      if (!isCommentLinePrefixEmpty) {
        break;
      }
    }
    const commentText = getAstCommentText(comment);
    const isPrettierIgnoreComment = commentText?.trim() === 'prettier-ignore';

    if (isPrettierIgnoreComment) {
      return true;
    }
    leadingCommentsStart = textRange.start;
  }
  let trailingCommentsEnd = statementRange.end;

  for (
    let commentIndex = findCommentIndexAtOrAfter(
      sortedComments,
      statementRange.end,
    );
    commentIndex < sortedComments.length;
    commentIndex++
  ) {
    const parserComment = sortedComments[commentIndex];

    if (!parserComment) {
      break;
    }
    const { comment, textRange } = parserComment;
    const textBeforeComment = sourceText.slice(
      trailingCommentsEnd,
      textRange.start,
    );

    if (textBeforeComment.includes('\n') || textBeforeComment.trim() !== '') {
      break;
    }
    const commentLineEnd = sourceText.indexOf('\n', textRange.end);
    const isCommentLastOnLine = isSourceRangeWhitespaceOrComments(
      sourceText,
      {
        start: textRange.end,
        end: commentLineEnd < 0 ? sourceText.length : commentLineEnd,
      },
      sortedComments,
    );
    const commentText = getAstCommentText(comment);

    if (isCommentLastOnLine && commentText?.trim() === 'prettier-ignore') {
      return true;
    }
    trailingCommentsEnd = textRange.end;
  }
  return false;
}
