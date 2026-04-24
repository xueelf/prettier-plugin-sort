import { type ParserOptions, type SupportOptions } from 'prettier';

/** import 分组，参考 eslint-plugin-import 的 import/order 规则。 */
export type ImportGroup =
  | 'builtin'
  | 'external'
  | 'internal'
  | 'parent'
  | 'sibling'
  | 'index';

/** `import type` 内联风格，参考 @typescript-eslint/consistent-type-imports 的 fixStyle 选项。 */
export type TypeImportsStyle =
  | 'separate'
  | 'inline-first'
  | 'inline-last'
  | 'mixed';

/** 插件排序配置。 */
export interface SortOptions {
  importOrder?: boolean;
  importOrderGroups?: ImportGroup[];
  importOrderSeparation?: boolean;
  importOrderTypeImports?: TypeImportsStyle;
  importOrderMergeDuplicates?: boolean;
  exportOrder?: boolean;
  packageJsonOrder?: boolean;
  packageJsonOrderExcludeKeys?: string[];
}

/** 默认排序配置。 */
export const DEFAULT_SORT_OPTIONS: Required<SortOptions> = {
  importOrder: true,
  importOrderGroups: ['builtin', 'external', 'parent', 'sibling', 'index'],
  importOrderSeparation: true,
  importOrderTypeImports: 'separate',
  importOrderMergeDuplicates: true,
  exportOrder: true,
  packageJsonOrder: true,
  packageJsonOrderExcludeKeys: [],
};

/** import 分组。 */
const VALID_IMPORT_GROUPS: ReadonlySet<string> = new Set<ImportGroup>([
  'builtin',
  'external',
  'internal',
  'parent',
  'sibling',
  'index',
]);

/** `import type` 内联风格。 */
const VALID_TYPE_STYLES: ReadonlySet<string> = new Set<TypeImportsStyle>([
  'separate',
  'inline-first',
  'inline-last',
  'mixed',
]);

const isValidImportGroup = (g: unknown): g is ImportGroup =>
  typeof g === 'string' && VALID_IMPORT_GROUPS.has(g);

const isValidTypeStyle = (s: unknown): s is TypeImportsStyle =>
  typeof s === 'string' && VALID_TYPE_STYLES.has(s);

type RawSortOptions = ParserOptions & Partial<SortOptions>;

/**
 * 从 Prettier 选项中提取插件配置，为缺失或非法的参数补上默认值。
 */
export function resolveSortOptions(
  rawOptions: RawSortOptions,
): Required<SortOptions> {
  const groups = Array.isArray(rawOptions.importOrderGroups)
    ? rawOptions.importOrderGroups.filter(isValidImportGroup)
    : [];

  const excludeKeys = Array.isArray(rawOptions.packageJsonOrderExcludeKeys)
    ? rawOptions.packageJsonOrderExcludeKeys.filter(
        (k): k is string => typeof k === 'string',
      )
    : [];

  const importOrder =
    typeof rawOptions.importOrder === 'boolean'
      ? rawOptions.importOrder
      : DEFAULT_SORT_OPTIONS.importOrder;

  const importOrderGroups =
    groups.length > 0 ? groups : [...DEFAULT_SORT_OPTIONS.importOrderGroups];

  const importOrderSeparation =
    typeof rawOptions.importOrderSeparation === 'boolean'
      ? rawOptions.importOrderSeparation
      : DEFAULT_SORT_OPTIONS.importOrderSeparation;

  const importOrderTypeImports = isValidTypeStyle(
    rawOptions.importOrderTypeImports,
  )
    ? rawOptions.importOrderTypeImports
    : DEFAULT_SORT_OPTIONS.importOrderTypeImports;

  const importOrderMergeDuplicates =
    typeof rawOptions.importOrderMergeDuplicates === 'boolean'
      ? rawOptions.importOrderMergeDuplicates
      : DEFAULT_SORT_OPTIONS.importOrderMergeDuplicates;

  const exportOrder =
    typeof rawOptions.exportOrder === 'boolean'
      ? rawOptions.exportOrder
      : DEFAULT_SORT_OPTIONS.exportOrder;

  const packageJsonOrder =
    typeof rawOptions.packageJsonOrder === 'boolean'
      ? rawOptions.packageJsonOrder
      : DEFAULT_SORT_OPTIONS.packageJsonOrder;

  return {
    importOrder,
    importOrderGroups,
    importOrderSeparation,
    importOrderTypeImports,
    importOrderMergeDuplicates,
    exportOrder,
    packageJsonOrder,
    packageJsonOrderExcludeKeys: excludeKeys,
  };
}

/** 向 Prettier 注册的选项。使用功能名词前缀命名，因为 Prettier API 不支持嵌套选项对象。 */
export const options: SupportOptions = {
  importOrder: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.importOrder,
    category: 'SortImports',
    description: 'Sort `import` declarations in JS/TS files.',
  },
  importOrderGroups: {
    type: 'string',
    array: true,
    default: [{ value: [...DEFAULT_SORT_OPTIONS.importOrderGroups] }],
    category: 'SortImports',
    description:
      'Ordered list of import groups. Valid values: "builtin", "external", "internal", "parent", "sibling", "index". Each group is sorted alphabetically; unknown groups are ignored.',
  },
  importOrderSeparation: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.importOrderSeparation,
    category: 'SortImports',
    description: 'Insert a blank line between adjacent import groups.',
  },
  importOrderTypeImports: {
    type: 'choice',
    default: DEFAULT_SORT_OPTIONS.importOrderTypeImports,
    category: 'SortImports',
    description: 'How to place `type` imports relative to value imports.',
    choices: [
      {
        value: 'separate',
        description: 'Keep `import type { … }` as its own statement.',
      },
      {
        value: 'inline-first',
        description:
          'Inline inside braces, type specifiers before value specifiers.',
      },
      {
        value: 'inline-last',
        description:
          'Inline inside braces, type specifiers after value specifiers.',
      },
      {
        value: 'mixed',
        description:
          'Inline inside braces, alphabetical without distinguishing type from value.',
      },
    ],
  },
  importOrderMergeDuplicates: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.importOrderMergeDuplicates,
    category: 'SortImports',
    description:
      'Merge multiple `import` statements from the same source into one. Side-effect imports are never merged.',
  },
  exportOrder: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.exportOrder,
    category: 'SortExports',
    description:
      'Sort named specifiers inside `export { … }` alphabetically. Does not reorder export statements.',
  },
  packageJsonOrder: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.packageJsonOrder,
    category: 'SortPackageJson',
    description:
      'Sort top-level keys and string-array values inside `package.json`. Dependency maps are always alphabetised regardless of this option.',
  },
  packageJsonOrderExcludeKeys: {
    type: 'string',
    array: true,
    default: [{ value: [...DEFAULT_SORT_OPTIONS.packageJsonOrderExcludeKeys] }],
    category: 'SortPackageJson',
    description:
      'Top-level `package.json` keys to leave untouched (no key reordering or array sorting). Takes priority over `packageJsonOrder`.',
  },
};
