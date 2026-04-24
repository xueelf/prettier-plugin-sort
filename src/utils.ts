/**
 * 按 `separator` 分割字符串，忽略嵌套在 `{}` / `()` / `[]` 中的分隔符。
 * 仅在 top-level（depth === 0）处切分。返回结果会 trim 并剔除空段。
 *
 * 为什么手写而不用简单的 split：import / export 的花括号内可能出现形如
 * `{ a, b as c }`，包裹结构内的逗号不应被当作分隔符。
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
