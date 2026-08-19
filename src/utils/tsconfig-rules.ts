/**
 * 顶层只固定广泛采用的元信息、继承声明和输入文件字段。
 * 其余字段保持原有相对顺序，不从示例推导完整规则。
 *
 * @see {@link https://www.typescriptlang.org/docs/handbook/tsconfig-json#tsconfig-bases | TypeScript TSConfig Bases}
 * @see {@link https://www.typescriptlang.org/docs/handbook/tsconfig-json#examples | TypeScript TSConfig Examples}
 */
export const TS_CONFIG_ROOT_FIRST_FIELDS = ['$schema', 'extends'] as const;

export const TS_CONFIG_ROOT_LAST_FIELDS = [
  'files',
  'include',
  'exclude',
] as const;

/**
 * TypeScript 5.8.3 `tsc --init` 使用的 compiler option 分类和声明顺序。
 * 默认模板隐藏的分类仍按生成器遍历 `optionDeclarations` 时的顺序接在后面。
 *
 * @see {@link https://github.com/microsoft/TypeScript/blob/v5.8.3/src/compiler/commandLineParser.ts | TypeScript 5.8.3 tsconfig 生成器}
 */
export const COMPILER_OPTION_FIELD_GROUPS = [
  // 项目
  [
    'incremental',
    'composite',
    'tsBuildInfoFile',
    'disableSourceOfProjectReferenceRedirect',
    'disableSolutionSearching',
    'disableReferencedProjectLoad',
  ],

  // 语言与环境
  [
    'target',
    'lib',
    'jsx',
    'libReplacement',
    'experimentalDecorators',
    'emitDecoratorMetadata',
    'jsxFactory',
    'jsxFragmentFactory',
    'jsxImportSource',
    'reactNamespace',
    'noLib',
    'useDefineForClassFields',
    'moduleDetection',
  ],

  // 模块
  [
    'module',
    'rootDir',
    'moduleResolution',
    'baseUrl',
    'paths',
    'rootDirs',
    'typeRoots',
    'types',
    'allowUmdGlobalAccess',
    'moduleSuffixes',
    'allowImportingTsExtensions',
    'rewriteRelativeImportExtensions',
    'resolvePackageJsonExports',
    'resolvePackageJsonImports',
    'customConditions',
    'noUncheckedSideEffectImports',
    'resolveJsonModule',
    'allowArbitraryExtensions',
    'noResolve',
  ],

  // JavaScript 支持
  ['allowJs', 'checkJs', 'maxNodeModuleJsDepth'],

  // 输出
  [
    'declaration',
    'declarationMap',
    'emitDeclarationOnly',
    'sourceMap',
    'inlineSourceMap',
    'noEmit',
    'outFile',
    'outDir',
    'removeComments',
    'importHelpers',
    'downlevelIteration',
    'sourceRoot',
    'mapRoot',
    'inlineSources',
    'emitBOM',
    'newLine',
    'stripInternal',
    'noEmitHelpers',
    'noEmitOnError',
    'preserveConstEnums',
    'declarationDir',
  ],

  // 互操作约束
  [
    'isolatedModules',
    'verbatimModuleSyntax',
    'isolatedDeclarations',
    'erasableSyntaxOnly',
    'allowSyntheticDefaultImports',
    'esModuleInterop',
    'preserveSymlinks',
    'forceConsistentCasingInFileNames',
  ],

  // 类型检查
  [
    'strict',
    'noImplicitAny',
    'strictNullChecks',
    'strictFunctionTypes',
    'strictBindCallApply',
    'strictPropertyInitialization',
    'strictBuiltinIteratorReturn',
    'noImplicitThis',
    'useUnknownInCatchVariables',
    'alwaysStrict',
    'noUnusedLocals',
    'noUnusedParameters',
    'exactOptionalPropertyTypes',
    'noImplicitReturns',
    'noFallthroughCasesInSwitch',
    'noUncheckedIndexedAccess',
    'noImplicitOverride',
    'noPropertyAccessFromIndexSignature',
    'allowUnusedLabels',
    'allowUnreachableCode',
  ],

  // 完整性
  ['skipDefaultLibCheck', 'skipLibCheck'],

  // 输出格式
  ['preserveWatchOutput', 'pretty', 'noErrorTruncation'],

  // 编译器诊断
  [
    'listFiles',
    'explainFiles',
    'listEmittedFiles',
    'traceResolution',
    'diagnostics',
    'extendedDiagnostics',
    'generateCpuProfile',
    'generateTrace',
    'noCheck',
  ],

  // 监听与构建模式
  ['assumeChangesOnlyAffectDirectDependencies'],

  // 向后兼容
  [
    'importsNotUsedAsValues',
    'out',
    'charset',
    'noImplicitUseStrict',
    'suppressExcessPropertyErrors',
    'suppressImplicitAnyIndexErrors',
    'noStrictGenericChecks',
    'preserveValueImports',
    'keyofStringsOnly',
  ],

  // 编辑器支持
  ['disableSizeLimit', 'plugins'],
] as const;
