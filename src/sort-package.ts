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

// npm 内置的 lifecycle scripts。
const DEFAULT_NPM_SCRIPTS = new Set([
  'install',
  'pack',
  'prepare',
  'publish',
  'restart',
  'shrinkwrap',
  'start',
  'stop',
  'test',
  'uninstall',
  'version',
]);

// 检测 run-s / npm-run-all --sequential 等顺序执行命令。
const RUN_S_PATTERN =
  /(?<=^|[\s&;<>|(])(?:run-s|npm-run-all2? .*(?:--sequential|--serial|-s))(?=$|[\s&;<>|)])/;

function hasSequentialScript(pkg: Record<string, JsonValue>): boolean {
  const devDeps = pkg['devDependencies'];
  if (
    !isPlainObject(devDeps) ||
    (!Object.hasOwn(devDeps, 'npm-run-all') &&
      !Object.hasOwn(devDeps, 'npm-run-all2'))
  ) {
    return false;
  }
  const scripts = (['scripts', 'betterScripts'] as const).flatMap(field => {
    const obj = pkg[field];
    return isPlainObject(obj) ? Object.values(obj) : [];
  });
  return scripts.some(
    script =>
      typeof script === 'string' &&
      script.includes('*') &&
      RUN_S_PATTERN.test(script),
  );
}

/**
 * 将脚本名按 `:` 前缀递归分组并排序。
 * `build:ts` 和 `build:css` 会被分在 `build` 组下并各自排序。
 */
function sortScriptNames(keys: string[], prefix = ''): string[] {
  const groupMap = new Map<string, string[]>();

  for (const key of keys) {
    const rest = prefix ? key.slice(prefix.length + 1) : key;
    const colonIndex = rest.indexOf(':');

    if (colonIndex > 0) {
      const base = key.slice(0, (prefix ? prefix.length + 1 : 0) + colonIndex);
      let group = groupMap.get(base);
      if (!group) {
        group = [];
        groupMap.set(base, group);
      }
      group.push(key);
    } else {
      let group = groupMap.get(key);
      if (!group) {
        group = [];
        groupMap.set(key, group);
      }
      group.push(key);
    }
  }

  return [...groupMap.keys()]
    .sort((a, b) => a.localeCompare(b, 'en'))
    .flatMap(groupKey => {
      const children = groupMap.get(groupKey)!;
      if (
        children.length > 1 &&
        children.some(key => key !== groupKey && key.startsWith(groupKey + ':'))
      ) {
        const direct = children
          .filter(key => key === groupKey || !key.startsWith(groupKey + ':'))
          .sort((a, b) => a.localeCompare(b, 'en'));
        const nested = children.filter(key => key.startsWith(groupKey + ':'));
        return [...direct, ...sortScriptNames(nested, groupKey)];
      }
      return children.sort((a, b) => a.localeCompare(b, 'en'));
    });
}

/**
 * 排序 scripts 字段的键名，对齐 sort-package-json 行为：
 * - `pre`/`post` 前缀的脚本名围绕其基础名分组（prebuild / build / postbuild）
 * - `:` 作为子命名空间分隔符（build:ts / build:css 分组在 build 下）
 * - 如果检测到顺序执行的 run-s 命令，保留原始顺序
 */
function sortScripts(
  scripts: Record<string, JsonValue>,
  pkg: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const names = Object.keys(scripts);
  const prefixable = new Set<string>();

  // 将 pre/post 前缀脚本映射到基础名。
  const normalized = names.map(name => {
    const base = name.replace(/^(?:pre|post)/, '');
    if (DEFAULT_NPM_SCRIPTS.has(base) || names.includes(base)) {
      prefixable.add(base);
      return base;
    }
    return name;
  });

  // 如果使用了 run-s 顺序执行，保持原有顺序否则按命名空间排序。
  let sortedNames: string[];
  if (hasSequentialScript(pkg)) {
    sortedNames = [...new Set(normalized)];
  } else {
    sortedNames = sortScriptNames(normalized);
  }

  // 展开 pre/post 前缀。
  const orderedNames = sortedNames.flatMap(key =>
    prefixable.has(key) ? [`pre${key}`, key, `post${key}`] : [key],
  );

  return Object.fromEntries(
    orderedNames
      .filter(name => Object.hasOwn(scripts, name))
      .map(name => [name, scripts[name]!]),
  );
}

/**
 * 排序 exports 字段的键名，对齐 sort-package-json 行为：
 * - `.` 开头的路径优先，按字母序排列
 * - 条件名（import、require、node 等）在后，其中 default 移至末尾
 * - 递归排序嵌套的 export 对象
 */
function sortExportsField(
  exports: Record<string, JsonValue>,
): Record<string, JsonValue> {
  const keys = Object.keys(exports);
  const paths = keys.filter(key => key.startsWith('.')).sort();
  const conditions = keys.filter(key => !key.startsWith('.')).sort();
  const defaultIndex = conditions.indexOf('default');

  if (defaultIndex >= 0) {
    conditions.splice(defaultIndex, 1);
    conditions.push('default');
  }

  const orderedKeys = [...paths, ...conditions];

  return Object.fromEntries(
    orderedKeys.map(key => {
      const value = exports[key]!;
      return [key, isPlainObject(value) ? sortExportsField(value) : value] as const;
    }),
  );
}

// 只去重不排序的字符串数组字段。
const UNIQ_ONLY_FIELDS = new Set(['keywords', 'files', 'activationEvents']);

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

    // scripts / betterScripts 键名按命名空间分组排序。
    for (const field of ['scripts', 'betterScripts'] as const) {
      const scripts = result[field];
      if (
        scripts !== undefined &&
        isPlainObject(scripts) &&
        !exclude.has(field)
      ) {
        result[field] = sortScripts(scripts, result);
      }
    }

    // exports 字段键名按路径优先排序。
    const exportsValue = result['exports'];
    if (
      exportsValue !== undefined &&
      isPlainObject(exportsValue) &&
      !exclude.has('exports')
    ) {
      result['exports'] = sortExportsField(exportsValue);
    }

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
