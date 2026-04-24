import { builtinModules } from 'node:module';

import { type ParserOptions } from 'prettier';

import {
  type ImportGroup,
  type SortOptions,
  type TypeImportsStyle,
  resolveSortOptions,
} from './options';
import { splitTopLevel } from './utils';

const NODE_BUILTINS = new Set<string>(builtinModules);

/** 将 import 遵循 eslint-plugin-import import/order 的算法进行分类。 */
function detectGroup(source: string): ImportGroup {
  // 1. 带运行时前缀的内置模块，以及无前缀的 Node 内核模块。
  if (
    source.startsWith('node:') ||
    source.startsWith('bun:') ||
    source.startsWith('deno:')
  ) {
    return 'builtin';
  }
  const slashIndex = source.indexOf('/');
  const head = slashIndex === -1 ? source : source.slice(0, slashIndex);

  if (head && NODE_BUILTINS.has(head)) {
    return 'builtin';
  }

  // 2. 当前目录的 index 模块。
  if (
    source === '.' ||
    source === './' ||
    /^\.\/index(\.[a-z]+)?$/.test(source)
  ) {
    return 'index';
  }

  // 3. 向上跳级的相对路径。
  if (source.startsWith('../') || source === '..') {
    return 'parent';
  }

  // 4. 同级相对路径。
  if (source.startsWith('./')) {
    return 'sibling';
  }

  // 5. 绝对路径和路径别名。
  if (
    source.startsWith('/') ||
    source.startsWith('~') ||
    source.startsWith('@/')
  ) {
    return 'internal';
  }
  // 6. 剩余的均为 npm 包。
  return 'external';
}

interface Member {
  /** 本地绑定名称，如 `foo` 或 `foo as Foo`。 */
  name: string;
  isType: boolean;
}

interface ParsedImport {
  source: string;
  /** 整条语句是 `import type { … }`。 */
  typeClause: boolean;
  /** `import 'mod'` 无任何导出符。 */
  sideEffect: boolean;
  defaultSpec: string | null;
  /** 命名空间导入，如 `* as ns`。 */
  namespaceSpec: string | null;
  /** `null` 表示没有命名导入块。 */
  members: Member[] | null;
  /** ES2023 import attributes，如 `with { type: 'json' }`。`null` 表示无。 */
  attributes: string | null;
  /** 紧贴在 import 上方的注释，包含末尾换行符。 */
  leadingComments: string;
}

const TYPE_PREFIX = /^type\s+(.+)$/s;

function splitMembers(inner: string): Member[] {
  return splitTopLevel(inner, ',').map<Member>(part => {
    const match = TYPE_PREFIX.exec(part);

    return match
      ? { name: match[1]!.trim(), isType: true }
      : { name: part, isType: false };
  });
}

interface RawStatement {
  raw: string;
  leadingComments: string;
}

function parseImport(statement: RawStatement): ParsedImport | null {
  const trimmed = statement.raw.trim();
  const leadingComments = statement.leadingComments;
  const sideEffect =
    /^import\s*(['"])([^'"]+)\1(?:\s+with\s*(\{[^}]*\}))?\s*;?$/.exec(trimmed);

  if (sideEffect) {
    return {
      source: sideEffect[2] ?? '',
      typeClause: false,
      sideEffect: true,
      defaultSpec: null,
      namespaceSpec: null,
      members: null,
      attributes: sideEffect[3] ?? null,
      leadingComments,
    };
  }
  const match =
    /^import\s+(type\s+)?([\s\S]+?)\s*from\s*(['"])([^'"]+)\3(?:\s+with\s*(\{[^}]*\}))?\s*;?$/.exec(
      trimmed,
    );

  if (!match) {
    return null;
  }
  const typeClause = Boolean(match[1]);
  const clause = (match[2] ?? '').trim();
  const source = match[4] ?? '';
  const attributes = match[5] ?? null;

  let defaultSpec: string | null = null;
  let namespaceSpec: string | null = null;
  let members: Member[] | null = null;

  for (const part of splitTopLevel(clause, ',')) {
    if (part.startsWith('{')) {
      const inner = part.slice(1, part.lastIndexOf('}')).trim();
      members = inner ? splitMembers(inner) : [];
    } else if (part.startsWith('*')) {
      namespaceSpec = part;
    } else {
      defaultSpec = part;
    }
  }

  return {
    source,
    typeClause,
    sideEffect: false,
    defaultSpec,
    namespaceSpec,
    members,
    attributes,
    leadingComments,
  };
}

interface ImportBlock {
  start: number;
  end: number;
  statements: RawStatement[];
}

/**
 * 提取源文本开头的连续 import 块，不走 AST。
 *
 * 使用带 `y` 标志的 sticky 正则从游标处逐段推进，避免每轮循环对剩余文本 `slice`。
 * 将 O(N²) 的字符串复制降为 O(N)。
 */
function extractImportBlock(text: string): ImportBlock | null {
  const firstRe =
    /(?:^|\n)(?:[ \t]*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)[ \t]*\n)*[ \t]*import\b/;
  const first = firstRe.exec(text);

  if (!first) {
    return null;
  }
  const start = first.index + (text[first.index] === '\n' ? 1 : 0);
  const statements: RawStatement[] = [];

  // 消耗语句间区域（空行和独立注释）
  // 第一个空行以内紧贴在下一个 import 上方的注释会被捕获并重新附加，避免排序后丢失。
  const skipRe = /(?:[ \t]*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)?[ \t]*\n)*/y;
  const importRe =
    /[ \t]*(import\b[\s\S]*?(?:from\s*(['"])[^'"]+\2|(['"])[^'"]+\3)(?:\s+with\s*\{[^}]*\})?\s*;?)/y;

  let cursor = start;

  while (cursor < text.length) {
    skipRe.lastIndex = cursor;
    const skipMatch = skipRe.exec(text);
    const skipped = skipMatch ? skipMatch[0] : '';
    const afterSkip = cursor + skipped.length;

    importRe.lastIndex = afterSkip;
    const importMatch = importRe.exec(text);

    if (!importMatch) {
      break;
    }
    const normalised = skipped.endsWith('\n') ? skipped.slice(0, -1) : skipped;
    const commentLines = normalised.length > 0 ? normalised.split('\n') : [];
    const leadingLines: string[] = [];

    for (let i = commentLines.length - 1; i >= 0; i--) {
      const line = commentLines[i];

      if (line === undefined) {
        continue;
      }
      if (line.trim() === '') {
        break;
      }
      leadingLines.unshift(line);
    }
    const leadingComments =
      leadingLines.length > 0 ? leadingLines.join('\n') + '\n' : '';

    const statement = importMatch[1];

    if (!statement) {
      break;
    }
    statements.push({ raw: statement.trim(), leadingComments });
    cursor = afterSkip + importMatch[0].length;
  }

  if (statements.length === 0) {
    return null;
  }
  return { start, end: cursor, statements };
}

function renderMembers(members: Member[]): string {
  return members
    .map(member => (member.isType ? `type ${member.name}` : member.name))
    .join(', ');
}

/** 组装 `default, * as ns, { members }` 形式的导出符列表。 */
function renderSpecifiers(importDecl: ParsedImport): string {
  const parts: string[] = [];

  if (importDecl.defaultSpec) {
    parts.push(importDecl.defaultSpec);
  }
  if (importDecl.namespaceSpec) {
    parts.push(importDecl.namespaceSpec);
  }
  if (importDecl.members) {
    parts.push(`{ ${renderMembers(importDecl.members)} }`);
  }
  return parts.join(', ');
}

function renderImport(importDecl: ParsedImport): string {
  const suffix = importDecl.attributes ? ` with ${importDecl.attributes}` : '';
  const source = `'${importDecl.source}'`;
  const body = importDecl.sideEffect
    ? `import ${source}${suffix};`
    : importDecl.typeClause
      ? `import type ${renderSpecifiers(importDecl)} from ${source}${suffix};`
      : `import ${renderSpecifiers(importDecl)} from ${source}${suffix};`;

  return importDecl.leadingComments + body;
}

function sortMembersAlpha<T extends Member>(members: T[]): T[] {
  return [...members].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
  );
}

/**
 * 将 `import type { … }` 改写为 `import { type … }`，让后续合并与 applyTypeImports 只需处理一种形式。
 * `import type Foo` 与 `import type * as ns` 无法在花括号内表达 type 修饰，保持原样。
 */
function normalizeTypeClause(importDecl: ParsedImport): ParsedImport {
  if (!importDecl.typeClause || importDecl.members === null) {
    return importDecl;
  }
  return {
    ...importDecl,
    typeClause: false,
    members: importDecl.members.map(member => ({ ...member, isType: true })),
  };
}

/**
 * 将来源相同的多条 import 合并为一条。
 * 副作用导入（`import 'mod'`）顺序有语义，永不参与合并。
 * 合并后再交给 applyTypeImports，separate 模式下依然会把 type 和值拆回两条。
 */
function mergeImportsFromSameSource(imports: ParsedImport[]): ParsedImport[] {
  const indexBySource = new Map<string, number>();
  const result: ParsedImport[] = [];

  for (const rawImport of imports) {
    const importDecl = normalizeTypeClause(rawImport);

    // 副作用导入以及 `import type X` / `import type * as X` 这类无法与普通 import 在同一语句里
    // 表达 type 修饰的形式，保持独立，不参与合并。
    if (importDecl.sideEffect || importDecl.typeClause) {
      result.push(importDecl);
      continue;
    }
    const existingIndex = indexBySource.get(importDecl.source);

    if (existingIndex === undefined) {
      indexBySource.set(importDecl.source, result.length);
      result.push(importDecl);
      continue;
    }
    const existing = result[existingIndex]!;

    // 两条中最多只有一条能合法地带 defaultSpec / namespaceSpec / attributes，冲突时以首条为准。
    result[existingIndex] = {
      source: existing.source,
      typeClause: false,
      sideEffect: false,
      defaultSpec: existing.defaultSpec ?? importDecl.defaultSpec,
      namespaceSpec: existing.namespaceSpec ?? importDecl.namespaceSpec,
      members:
        existing.members === null && importDecl.members === null
          ? null
          : [...(existing.members ?? []), ...(importDecl.members ?? [])],
      attributes: existing.attributes ?? importDecl.attributes,
      // 后续重复条目的注释静默丢弃。
      leadingComments: existing.leadingComments,
    };
  }
  return result;
}

/** members 非空的 ParsedImport，用于需要操作命名导入块的内部函数。 */
type ImportWithMembers = ParsedImport & { members: Member[] };

/**
 * 根据 importOrderTypeImports 策略改写单条 import，依模式返回 1～2 条。
 */
function applyTypeImports(
  importDecl: ParsedImport,
  style: TypeImportsStyle,
): ParsedImport[] {
  // 副作用 import 和没有命名导入块的语句无需转换。
  if (importDecl.sideEffect || !importDecl.members) {
    return [importDecl];
  }

  // separate 模式：`import type { … }` 保持独立语句。
  if (style === 'separate') {
    if (importDecl.typeClause) {
      return [importDecl];
    }
    const typeMembers = importDecl.members.filter(member => member.isType);
    const valueMembers = importDecl.members.filter(member => !member.isType);
    const out: ParsedImport[] = [];

    if (typeMembers.length > 0) {
      out.push({
        source: importDecl.source,
        typeClause: true,
        sideEffect: false,
        defaultSpec: null,
        namespaceSpec: null,
        members: sortMembersAlpha(
          typeMembers.map(member => ({ ...member, isType: false })),
        ),
        attributes: importDecl.attributes,
        leadingComments: importDecl.leadingComments,
      });
    }
    const hasValueBody =
      valueMembers.length > 0 ||
      importDecl.defaultSpec !== null ||
      importDecl.namespaceSpec !== null;

    if (hasValueBody) {
      out.push({
        ...importDecl,
        members:
          valueMembers.length > 0 ? sortMembersAlpha(valueMembers) : null,
        // 避免在两半部分都复制相同的首行注释。
        leadingComments:
          typeMembers.length > 0 ? '' : importDecl.leadingComments,
      });
    }
    return out.length > 0 ? out : [importDecl];
  }

  // inline 模式：将 `import type { X, Y }` 改写为 `import { type X, type Y }`。
  // 所有成员标记为 type 后，inline-first / inline-last 的内部排序逻辑一致。
  const inlineBase: ImportWithMembers = importDecl.typeClause
    ? {
        ...importDecl,
        typeClause: false,
        members: importDecl.members.map(member => ({
          ...member,
          isType: true,
        })),
      }
    : { ...importDecl, members: importDecl.members };

  if (style === 'mixed') {
    return [{ ...inlineBase, members: sortMembersAlpha(inlineBase.members) }];
  }

  const typeMembers = inlineBase.members.filter(member => member.isType);
  const valueMembers = inlineBase.members.filter(member => !member.isType);
  const sortedTypes = sortMembersAlpha(typeMembers);
  const sortedValues = sortMembersAlpha(valueMembers);
  const ordered =
    style === 'inline-first'
      ? [...sortedTypes, ...sortedValues]
      : [...sortedValues, ...sortedTypes];

  return [{ ...inlineBase, members: ordered }];
}

/**
 * 对一段不含副作用导入的 import 列表进行排序并渲染为行数组。
 * 副作用导入在 sortImports 层面已被拆分到各自的 chunk，此处只处理同一 chunk 内的普通 import。
 */
function sortSegment(
  imports: ParsedImport[],
  options: Required<SortOptions>,
  groupIndex: Map<ImportGroup, number>,
  fallback: number,
): string[] {
  if (imports.length === 0) {
    return [];
  }
  const style = options.importOrderTypeImports;
  const deduped = options.importOrderMergeDuplicates
    ? mergeImportsFromSameSource(imports)
    : imports;
  const rewritten = deduped.flatMap(importDecl =>
    applyTypeImports(importDecl, style),
  );
  const decorated = rewritten.map((importDecl, index) => ({
    importDecl,
    group: detectGroup(importDecl.source),
    originalIndex: index,
  }));

  decorated.sort((a, b) => {
    const groupOrderA = groupIndex.get(a.group) ?? fallback;
    const groupOrderB = groupIndex.get(b.group) ?? fallback;

    if (groupOrderA !== groupOrderB) {
      return groupOrderA - groupOrderB;
    }
    const sourceA = a.importDecl.source.toLowerCase();
    const sourceB = b.importDecl.source.toLowerCase();

    if (sourceA !== sourceB) {
      return sourceA < sourceB ? -1 : 1;
    }
    // 同一来源内，type-only 部分优先。
    if (a.importDecl.typeClause !== b.importDecl.typeClause) {
      return a.importDecl.typeClause ? -1 : 1;
    }
    return a.originalIndex - b.originalIndex;
  });

  const lines: string[] = [];
  let previousGroup: ImportGroup | null = null;

  for (const item of decorated) {
    if (
      options.importOrderSeparation &&
      previousGroup !== null &&
      item.group !== previousGroup
    ) {
      lines.push('');
    }
    lines.push(renderImport(item.importDecl));
    previousGroup = item.group;
  }
  return lines;
}

export function sortImports(text: string, rawOptions: ParserOptions): string {
  const options = resolveSortOptions(rawOptions);

  if (!options.importOrder) {
    return text;
  }
  const block = extractImportBlock(text);

  if (!block || block.statements.length === 0) {
    return text;
  }
  const parsed = block.statements
    .map(rawStatement => parseImport(rawStatement))
    .filter((importDecl): importDecl is ParsedImport => importDecl !== null);

  if (parsed.length === 0) {
    return text;
  }

  const groupIndex = new Map<ImportGroup, number>(
    options.importOrderGroups.map((group, index): [ImportGroup, number] => [
      group,
      index,
    ]),
  );
  const fallback = options.importOrderGroups.length;

  // 副作用导入将 import 块切割为若干 chunk，每个 chunk 独立排序。
  // 副作用导入本身保持原位不移动，遵循社区关于副作用 import 顺序有语义的共识。
  type Chunk =
    | { kind: 'segment'; imports: ParsedImport[] }
    | { kind: 'side-effect'; importDecl: ParsedImport };

  const chunks: Chunk[] = [];
  let currentSegment: ParsedImport[] = [];

  for (const importDecl of parsed) {
    if (importDecl.sideEffect) {
      chunks.push({ kind: 'segment', imports: currentSegment });
      chunks.push({ kind: 'side-effect', importDecl });
      currentSegment = [];
    } else {
      currentSegment.push(importDecl);
    }
  }
  chunks.push({ kind: 'segment', imports: currentSegment });

  const allLines: string[] = [];
  // 追踪上一个写入的 chunk 类型，用于判断是否插入空行：
  // 连续的副作用导入之间保持相邻，不插入空行。
  // 副作用导入与前后的 segment 之间才受 importOrderSeparation 控制。
  let previousKind: 'segment' | 'side-effect' | null = null;

  for (const chunk of chunks) {
    if (chunk.kind === 'segment') {
      if (chunk.imports.length === 0) {
        continue;
      }
      const segmentLines = sortSegment(
        chunk.imports,
        options,
        groupIndex,
        fallback,
      );

      if (previousKind !== null && options.importOrderSeparation) {
        allLines.push('');
      }
      allLines.push(...segmentLines);
      previousKind = 'segment';
    } else {
      if (previousKind === 'segment' && options.importOrderSeparation) {
        allLines.push('');
      }
      allLines.push(renderImport(chunk.importDecl));
      previousKind = 'side-effect';
    }
  }

  const replacement = allLines.join('\n');
  const trailing = text.slice(block.end);
  // 当 import 块后还有其他代码时，保证两者之间始终有一个空行。
  const suffix = trailing.trim() ? '\n\n' + trailing.trimStart() : trailing;

  return text.slice(0, block.start) + replacement + suffix;
}
