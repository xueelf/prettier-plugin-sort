import path from 'node:path';

import { type ParserOptions } from 'prettier';

import { resolveSortOptions } from './options';
import {
  DEPENDENCY_FIELDS,
  PACKAGE_JSON_TOP_LEVEL_ORDER,
} from './order-package';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item): item is string => typeof item === 'string')
  );
}

function sortObjectKeysByOrder(
  record: Record<string, JsonValue>,
  order: readonly string[],
): Record<string, JsonValue> {
  const orderIndex = new Map<string, number>(
    order.map((key, index): [string, number] => [key, index]),
  );
  const known: Array<[string, JsonValue]> = [];
  const rest: Array<[string, JsonValue]> = [];

  for (const entry of Object.entries(record)) {
    const [key] = entry;

    if (orderIndex.has(key)) {
      known.push(entry);
    } else {
      rest.push(entry);
    }
  }
  known.sort(
    ([left], [right]) =>
      (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0),
  );
  rest.sort(([left], [right]) => left.localeCompare(right, 'en'));

  return Object.fromEntries([...known, ...rest]);
}

function sortObjectKeysAlpha(value: JsonValue): JsonValue {
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right, 'en'),
    ),
  );
}

function sortStringArrayAlpha(value: string[]): string[] {
  return [...value].sort((a, b) => a.localeCompare(b, 'en'));
}

function isPackageJson(filepath: string | undefined): boolean {
  if (!filepath) {
    return false;
  }
  return path.basename(filepath) === 'package.json';
}

function detectIndent(source: string): string {
  const match = /\n([ \t]+)\S/.exec(source);
  return match ? (match[1] ?? '  ') : '  ';
}

export function sortPackageJson(
  text: string,
  rawOptions: ParserOptions,
): string {
  if (!isPackageJson(rawOptions.filepath)) {
    return text;
  }

  const options = resolveSortOptions(rawOptions);
  const exclude = new Set(options.packageJsonOrderExcludeKeys);

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (!isPlainObject(parsed)) {
    return text;
  }
  let result: Record<string, JsonValue> = { ...parsed };

  // 依赖表始终按字母序排列，与用户选项无关—— npm install 每次都会按字母序写回。
  for (const field of DEPENDENCY_FIELDS) {
    const dependencyMap = result[field];

    if (dependencyMap !== undefined && !exclude.has(field)) {
      result[field] = sortObjectKeysAlpha(dependencyMap);
    }
  }

  if (options.packageJsonOrder) {
    result = sortObjectKeysByOrder(result, PACKAGE_JSON_TOP_LEVEL_ORDER);

    // 自动识别纯字符串数组并按字母序排列。
    // 嵌套对象不递归排序，因为 scripts、exports、imports 等字段的键顺序有运行时语义。
    for (const [key, value] of Object.entries(result)) {
      if (exclude.has(key)) {
        continue;
      }
      if (isStringArray(value)) {
        result[key] = sortStringArrayAlpha(value);
      }
    }
  }
  const indent = detectIndent(text);
  const output = JSON.stringify(result, null, indent);

  return text.endsWith('\n') ? output + '\n' : output;
}
