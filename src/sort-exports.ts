import { type ParserOptions } from 'prettier';

import { resolveSortOptions } from './options';
import { splitTopLevel } from './utils';

/**
 * 按字母序排列 `export { … }` 花括号内的命名导出。
 * 不挪动语句位置，不跨语句合并，只针对单条 export 语句的花括号内部。
 *
 * 覆盖：
 *   export { a, b };
 *   export { a, b } from 'mod';
 *   export type { A, B };
 *   export type { A, B } from 'mod';
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

function stripTypePrefix(member: string): string {
  return member.replace(/^type\s+/, '');
}
