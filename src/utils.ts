/**
 * 按 `separator` 分割字符串，忽略嵌套在 `{}` / `()` / `[]` 中的分隔符。
 * 仅在顶层（深度为 0 的位置）分隔。返回结果会 trim 并剔除空段。
 *
 * 不使用 `String.prototype.split` 直接分隔，因为 import / export 的花括号内可能
 * 出现形如 `{ a, b as c }`，其中嵌套结构内的逗号不应被当作分隔符。
 */
export function splitTopLevel(input: string, separator: string): string[] {
  const segments: string[] = [];

  let current = '';
  let depth = 0;

  for (const char of input) {
    if (char === '{' || char === '(' || char === '[') {
      depth++;
    } else if (char === '}' || char === ')' || char === ']') {
      depth--;
    }

    if (char === separator && depth === 0) {
      segments.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    segments.push(current);
  }
  return segments
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
}
