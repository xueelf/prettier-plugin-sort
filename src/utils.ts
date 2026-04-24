/**
 * 按 `separator` 分割字符串，忽略嵌套在 `{}` / `()` / `[]` 中的分隔符。
 * 仅在 top-level（depth === 0）处切分。返回结果会 trim 并剔除空段。
 *
 * 为什么手写而不用简单的 split：import / export 的花括号内可能出现形如
 * `{ a, b as c }`，包裹结构内的逗号不应被当作分隔符。
 */
export function splitTopLevel(input: string, separator: string): string[] {
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
