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
  known.sort(([a], [b]) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
  rest.sort(([a], [b]) => a.localeCompare(b, 'en'));

  return Object.fromEntries([...known, ...rest]);
}

function sortObjectKeysAlpha(value: JsonValue): JsonValue {
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')),
  );
}

function sortStringArrayAlpha(value: string[]): string[] {
  return [...value].sort((a, b) => a.localeCompare(b, 'en'));
}

function uniqStringArray(value: string[]): string[] {
  return [...new Set(value)];
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

// 只去重不排序的字符串数组字段。
const UNIQ_ONLY_FIELDS = new Set([
  'keywords',
  'files',
  'activationEvents',
]);

// 去重并按字母序排列的字符串数组字段。
const UNIQ_AND_SORT_FIELDS = new Set([
  'bundledDependencies',
  'bundleDependencies',
  'extensionPack',
  'extensionDependencies',
]);

// 不排序也不去重的字符串数组字段。
const NO_SORT_ARRAY_FIELDS = new Set(['workspaces']);

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
  let result: Record<string, JsonValue> = parsed;

  // 依赖表始终按字母序排列，与用户选项无关—— npm install 每次都会按字母序写回。
  for (const field of DEPENDENCY_FIELDS) {
    const dependencyMap = result[field];

    if (dependencyMap !== undefined && !exclude.has(field)) {
      result[field] = sortObjectKeysAlpha(dependencyMap);
    }
  }

  if (options.packageJsonOrder) {
    result = sortObjectKeysByOrder(result, PACKAGE_JSON_TOP_LEVEL_ORDER);

    // 字符串数组按字段类别采用不同处理策略，对齐 sort-package-json 行为。
    // keywords、files 等只去重不排序，保留原始语义顺序。
    // bundledDependencies 等去重后按字母序排列。
    // workspaces 数组不排序（脚本可能依赖遍历顺序）。
    // 其余字符串数组按字母序排列。
    for (const [key, value] of Object.entries(result)) {
      if (exclude.has(key)) {
        continue;
      }
      if (!isStringArray(value)) {
        continue;
      }
      if (NO_SORT_ARRAY_FIELDS.has(key)) {
        continue;
      }
      if (UNIQ_ONLY_FIELDS.has(key)) {
        result[key] = uniqStringArray(value);
        continue;
      }
      if (UNIQ_AND_SORT_FIELDS.has(key)) {
        result[key] = sortStringArrayAlpha(uniqStringArray(value));
        continue;
      }
      result[key] = sortStringArrayAlpha(value);
    }
  }
  const indent = detectIndent(text);
  const output = JSON.stringify(result, null, indent);

  return text.endsWith('\n') ? output + '\n' : output;
}
