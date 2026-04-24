import { type ParserOptions } from 'prettier';

import { resolveSortOptions } from './options';

/**
 * 按字母序排列 `export { … }` 花括号内的命名导出。
 * 不挪动语句位置，不跨语句合并——只针对单条 export 语句的花括号内部。
 *
 * 覆盖：
 *   export { a, b };
 *   export { a, b } from 'mod';
 *   export type { A, B };
 *   export type { A, B } from 'mod';
 *
 * 故意保持正则驱动，和 sort-imports 一样让插件与解析器无关、零依赖。
 */
export function sortExports(text: string, rawOptions: ParserOptions): string {
  const options = resolveSortOptions(rawOptions);

  if (!options.exportOrder) {
    return text;
  }
  return text.replace(
    /export(\s+type)?\s*\{([^}]*)\}/g,
    (match, typeKeyword: string | undefined, inner: string) => {
      const members = splitTopLevel(inner, ',');

      if (members.length <= 1) {
        return match;
      }
      const sorted = [...members].sort((a, b) =>
        stripTypePrefix(a).localeCompare(stripTypePrefix(b), 'en', {
          sensitivity: 'base',
        }),
      );
      const same = sorted.every((m, i) => m === members[i]);

      if (same) {
        return match;
      }
      const prefix = typeKeyword ? `export${typeKeyword}` : 'export';
      return `${prefix} { ${sorted.join(', ')} }`;
    },
  );
}

function splitTopLevel(input: string, separator: string): string[] {
  const out: string[] = [];

  let buf = '';
  let depth = 0;

  for (const ch of input) {
    if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ')' || ch === ']') {
      depth--;
    }

    if (ch === separator && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }

  if (buf.length > 0) {
    out.push(buf);
  }
  return out.map(s => s.trim()).filter(s => s.length > 0);
}

function stripTypePrefix(member: string): string {
  return member.replace(/^type\s+/, '');
}
