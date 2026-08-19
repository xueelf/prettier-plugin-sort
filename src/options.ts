import { type ParserOptions, type SupportOptions } from 'prettier';

/** import 声明分组。 */
export type ImportGroup =
  'builtin' | 'external' | 'internal' | 'parent' | 'sibling' | 'index';

/** type import 的声明形式与成员顺序。 */
export type TypeImportStyle =
  'separate' | 'inline-first' | 'inline-last' | 'mixed';

/** 插件排序配置。 */
export interface SortOptions {
  esmImportSort?: boolean;
  esmImportGroups?: ImportGroup[];
  esmImportSeparation?: boolean;
  esmImportTypeStyle?: TypeImportStyle;
  esmImportMerge?: boolean;
  esmExportSpecifierSort?: boolean;
  packageSort?: boolean;
  tsconfigSort?: boolean;
  tsconfigSeparation?: boolean;
}

export type ResolvedEsmOptions = Required<
  Pick<
    SortOptions,
    | 'esmExportSpecifierSort'
    | 'esmImportGroups'
    | 'esmImportMerge'
    | 'esmImportSeparation'
    | 'esmImportSort'
    | 'esmImportTypeStyle'
  >
>;

export type ResolvedTsconfigOptions = Required<
  Pick<SortOptions, 'tsconfigSeparation' | 'tsconfigSort'>
>;

const DEFAULT_SORT_OPTIONS: Required<SortOptions> = {
  esmImportSort: true,
  esmImportGroups: [
    'builtin',
    'external',
    'internal',
    'parent',
    'sibling',
    'index',
  ],
  esmImportSeparation: true,
  esmImportTypeStyle: 'separate',
  esmImportMerge: true,
  esmExportSpecifierSort: true,
  packageSort: true,
  tsconfigSort: true,
  tsconfigSeparation: true,
};

const VALID_IMPORT_GROUPS: ReadonlySet<string> = new Set<ImportGroup>([
  'builtin',
  'external',
  'internal',
  'parent',
  'sibling',
  'index',
]);

const VALID_TYPE_IMPORT_STYLES: ReadonlySet<string> = new Set<TypeImportStyle>([
  'separate',
  'inline-first',
  'inline-last',
  'mixed',
]);

const isValidImportGroup = (
  candidateValue: unknown,
): candidateValue is ImportGroup =>
  typeof candidateValue === 'string' && VALID_IMPORT_GROUPS.has(candidateValue);

const isValidTypeImportStyle = (
  candidateValue: unknown,
): candidateValue is TypeImportStyle =>
  typeof candidateValue === 'string' &&
  VALID_TYPE_IMPORT_STYLES.has(candidateValue);

type SortPluginParserOptions = ParserOptions & SortOptions;
type BooleanSortOptionName = Exclude<
  keyof SortOptions,
  'esmImportGroups' | 'esmImportTypeStyle'
>;

function resolveBooleanSortOption(
  prettierOptions: SortPluginParserOptions,
  optionName: BooleanSortOptionName,
): boolean {
  const configuredValue = prettierOptions[optionName];

  if (typeof configuredValue === 'boolean') {
    return configuredValue;
  }
  return DEFAULT_SORT_OPTIONS[optionName];
}

export function resolveEsmOptions(
  prettierOptions: SortPluginParserOptions,
): ResolvedEsmOptions {
  const configuredImportGroups = Array.isArray(prettierOptions.esmImportGroups)
    ? [...new Set(prettierOptions.esmImportGroups.filter(isValidImportGroup))]
    : [];
  const remainingDefaultImportGroups =
    DEFAULT_SORT_OPTIONS.esmImportGroups.filter(
      importGroup => !configuredImportGroups.includes(importGroup),
    );
  const resolvedImportGroups =
    configuredImportGroups.length > 0
      ? [...configuredImportGroups, ...remainingDefaultImportGroups]
      : [...DEFAULT_SORT_OPTIONS.esmImportGroups];
  const resolvedTypeImportStyle = isValidTypeImportStyle(
    prettierOptions.esmImportTypeStyle,
  )
    ? prettierOptions.esmImportTypeStyle
    : DEFAULT_SORT_OPTIONS.esmImportTypeStyle;

  return {
    esmImportSort: resolveBooleanSortOption(prettierOptions, 'esmImportSort'),
    esmImportGroups: resolvedImportGroups,
    esmImportSeparation: resolveBooleanSortOption(
      prettierOptions,
      'esmImportSeparation',
    ),
    esmImportTypeStyle: resolvedTypeImportStyle,
    esmImportMerge: resolveBooleanSortOption(prettierOptions, 'esmImportMerge'),
    esmExportSpecifierSort: resolveBooleanSortOption(
      prettierOptions,
      'esmExportSpecifierSort',
    ),
  };
}

export function isPackageSortEnabled(
  prettierOptions: SortPluginParserOptions,
): boolean {
  return resolveBooleanSortOption(prettierOptions, 'packageSort');
}

export function resolveTsconfigOptions(
  prettierOptions: SortPluginParserOptions,
): ResolvedTsconfigOptions {
  return {
    tsconfigSort: resolveBooleanSortOption(prettierOptions, 'tsconfigSort'),
    tsconfigSeparation: resolveBooleanSortOption(
      prettierOptions,
      'tsconfigSeparation',
    ),
  };
}

export const options = {
  esmImportSort: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.esmImportSort,
    category: 'ES Module Imports',
    description:
      'Sort top-level ES module import declarations and named specifiers.',
  },
  esmImportGroups: {
    type: 'string',
    array: true,
    default: [{ value: [...DEFAULT_SORT_OPTIONS.esmImportGroups] }],
    category: 'ES Module Imports',
    description:
      'Set import group order. Valid groups: "builtin", "external", "internal", "parent", "sibling", and "index". Unlisted groups sort after listed groups.',
  },
  esmImportSeparation: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.esmImportSeparation,
    category: 'ES Module Imports',
    description:
      'Add blank lines between import groups and around side-effect import boundaries.',
  },
  esmImportTypeStyle: {
    type: 'choice',
    default: DEFAULT_SORT_OPTIONS.esmImportTypeStyle,
    category: 'ES Module Imports',
    description:
      'Format named type imports as separate declarations or inline specifiers without changing runtime module requests.',
    choices: [
      {
        value: 'separate',
        description: 'Use a separate import type declaration.',
      },
      {
        value: 'inline-first',
        description: 'Place inline type specifiers before value specifiers.',
      },
      {
        value: 'inline-last',
        description: 'Place inline type specifiers after value specifiers.',
      },
      {
        value: 'mixed',
        description:
          'Use inline type specifiers and sort all specifiers together.',
      },
    ],
  },
  esmImportMerge: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.esmImportMerge,
    category: 'ES Module Imports',
    description: 'Merge compatible import declarations from the same module.',
  },
  esmExportSpecifierSort: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.esmExportSpecifierSort,
    category: 'ES Module Exports',
    description:
      'Sort named export specifiers without reordering export declarations.',
  },
  packageSort: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.packageSort,
    category: 'package.json',
    description: 'Sort fields in package.json.',
  },
  tsconfigSort: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.tsconfigSort,
    category: 'tsconfig.json',
    description: 'Sort fields in tsconfig.json.',
  },
  tsconfigSeparation: {
    type: 'boolean',
    default: DEFAULT_SORT_OPTIONS.tsconfigSeparation,
    category: 'tsconfig.json',
    description:
      'Add blank lines between TypeScript 5.8 compilerOptions categories.',
  },
} satisfies Record<keyof SortOptions, SupportOptions[string]>;
