# Copilot 指引 — `prettier-plugin-sort`

> 目的：让自动化编程 Agent 第一次就能做对，给出所有必须掌握的关键事实。

## 这个包是什么

一个零运行时依赖的 [Prettier](https://prettier.io/) 插件，覆盖两个功能域：

- **对 JS/TS 文件中的 `import` 声明排序。**
- **对 `package.json`** 的顶层字段、字符串数组和依赖表排序。

发布为单一入口（`./dist/index.js`，ESM，Node target）。类型从源码导出
（`./src/index.ts`），因为构建器不产出 `.d.ts`。

## 不可逾越的约束

1. **运行时：仅 Bun。** `bun run build` 使用 `Bun.build`；`bun test` 跑测试；
   `bun` 通过 `devEngines` 声明。`tsc` **仅用于类型检查**（`noEmit: true`）。
   不要把 `tsc` 加入构建流程，不要引入 webpack / rollup / tsup / vite。
2. **TS 相对导入不加 `.js` 后缀。** `tsconfig.json` 对配置文件启用了
   `allowImportingTsExtensions`；源码使用裸相对路径（`'../options'`）。
   不要加 `.js` 或 `.ts` 后缀。
3. **零运行时依赖。** 永远不要添加 `dependencies`。`sort-package-json`
   等库明确**不是**运行时依赖——其规范字段顺序已内联到源码（见
   `src/order-package.ts`）。
4. **Prettier 插件 API 禁止嵌套对象选项。** `SupportOption.type` 只接受标量
   类型（`boolean | int | string | choice | path | array`）。选项命名空间通过
   **功能名词前缀**实现，不使用嵌套对象。见下方"选项命名"。
5. **输出目录为 `dist/`**（不是 `build`，不是 `lib`）。现代 npm 库惯例。
6. **Scripts 固定为五个：** `build`、`format`、`lint`、`prepare`、`test`。
   除非用户明确要求，不要添加 `check`、`ci`、`typecheck`、`release` 等。

## 选项命名惯例

遵循 Prettier 生态中占主导地位的排序插件惯例
（`@trivago/@ianvs/prettier-plugin-sort-imports`，合计周下载 ~700 万）：

- 功能名词前缀：`importOrder*` 用于 import 排序，`packageJsonOrder*` 用于
  `package.json` 排序。
- 与 Prettier 自身命名（`singleQuote`、`trailingComma`）保持一致——
  描述性名词，不是动词。
- **不要**使用 `sort*` 或 `sortOrder*` 前缀——那不是社区惯例。

当前公开选项：

| 选项 | 类型 | 默认值 |
| --- | --- | --- |
| `importOrder` | `boolean` | `true` |
| `importOrderGroups` | `ImportGroup[]` | `['builtin','external','parent','sibling','index']` |
| `importOrderSeparation` | `boolean` | `true` |
| `importOrderTypeImports` | `'separate' \| 'inline-first' \| 'inline-last' \| 'mixed'` | `'separate'` |
| `importOrderMergeDuplicates` | `boolean` | `true` |
| `exportOrder` | `boolean` | `true` |
| `packageJsonOrder` | `boolean` | `true` |
| `packageJsonOrderExcludeKeys` | `string[]` | `[]` |

## Import 分组（支持 6 个，默认启用 5 个）

镜像 `eslint-plugin-import` 的 `import/order` 算法
（https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md）。
**不要**合并为更粗粒度的分组。

- `builtin` — `node:*`、`bun:*`、裸 `bun`（Bun 暴露 `Bun.build` API 的官方裸名），以及无前缀 Node 内置模块（`fs`、`path`）。Deno 通过全局 `Deno` 对象暴露 API，没有 `deno:` 导入方案。
- `external` — npm 包（默认兜底）。
- `internal` — 绝对路径和别名（`/`、`~`、`@/`）。**默认不在 `importOrderGroups` 中**，用户需显式添加。
- `parent` — `../`。
- `sibling` — `./`（非 index）。
- `index` — `.`、`./`、`./index`、`./index.<ext>`。

分类逻辑在 `detectGroup()` 中，位于
[src/sort-imports.ts](src/sort-imports.ts)。分类器自顶向下遍历规则，编辑时保持顺序不变。

## Type-import 风格（4 种模式）

镜像 `@typescript-eslint/consistent-type-imports.fixStyle` +
`eslint-plugin-import` 的 `named.types`：

- `separate` — 独立 `import type { … }` 语句（默认）。
- `inline-first` — `import { type T, a } from 'mod'`。
- `inline-last` — `import { a, type T } from 'mod'`。
- `mixed` — 纯字母序，type 关键字按需内联：
  `import { a, type B, c } from 'mod'`。

## `package.json` 排序语义

- **依赖表始终按字母序排列**，与 `packageJsonOrder` 无关——`npm install`
  每次都会重写它们。硬编码列表在 `DEPENDENCY_FIELDS`（`src/order-package.ts`）。
- **顶层字段顺序**遵循 `PACKAGE_JSON_TOP_LEVEL_ORDER`，镜像自 `sort-package-json`
  （https://github.com/keithamus/sort-package-json/blob/main/src/index.js）。
- **字符串数组自动识别**（无硬编码白名单），`packageJsonOrder` 为 true 时按字母序排列。
- **嵌套对象不递归排序**（依赖表除外），因为 `scripts`、`exports`、`imports`
  等字段的键顺序有运行时语义。
- `packageJsonOrderExcludeKeys` 是逐字段的退出开关。

## 目录布局

```
src/
  index.ts          # 插件注册 + parser 包装（wrap）
  options.ts        # SupportOptions 定义 + resolveSortOptions()
  utils.ts          # 共享工具（splitTopLevel 等）
  order-package.ts  # PACKAGE_JSON_TOP_LEVEL_ORDER、DEPENDENCY_FIELDS
  sort-imports.ts   # import 块提取 + 分类 + 渲染
  sort-exports.ts   # `export { … }` 花括号内部排序
  sort-package.ts   # package.json JSON 变换
scripts/
  build/index.ts    # Bun.build 入口
  test/
    sort-imports.test.ts
    sort-type-imports.test.ts
    sort-exports.test.ts
    sort-package-json.test.ts
```

目录采用扇形布局，不嵌套子目录。如果插件增加新的排序器（如 CSS 属性顺序），
在 `src/order-<domain>.ts` 中放数据，`src/sort-<domain>.ts` 中实现逻辑，
并在 `src/options.ts` 中注册选项。

## 架构不变式

- 插件通过 `parser.preprocess` 钩子（字符串输入，字符串输出）运行。
  基于正则而非 AST 是刻意选择：
  - 保持零运行时依赖（无需引入 `@babel/parser` 等解析器）。
  - 避免为 `babel` / `babel-ts` / `typescript` / `meriyah` 等多种 parser 写适配层。
  - 原始格式（引号、注释附着位置、import attributes 语法）天然保留。
  代价：复杂语义（模板字符串里的伪 `export`、条件 import 等）不处理——
  这是架构层面的已知取舍，引入 AST 前必须先审视"零依赖"前提是否放弃。
- 紧贴 `import` 语句上方的行/块注释会被捕获并在排序后重新附加。
  已有回归测试——不要破坏这个约定。
- 副作用 import（`import 'foo'`）不会被移动——它们将 import 块切割为若干独立排序的 chunk，自身保持原位。内部实现中的类型标识是 `kind: 'side-effect'`。
- ES2023 import attributes（`import x from 'm' with { type: 'json' }`）在解析时保留，
  并在渲染时原样输出。修改 `parseImport` / `extractImportBlock` / `renderImport` 正则时需保持这个能力。
- Prettier 会在调用 `parser.preprocess(text, options)` 前删除未注册的顶层选项键——
  每个插件选项**必须**在 `options.ts` 中注册。

## 验证清单（Agent 声称"完成"前必须全部运行）

```sh
bun run build            # 必须产出 dist/index.js + .js.map
bun test scripts/test    # 所有测试必须通过
bun run lint             # ESLint：0 个警告
bunx tsc --noEmit        # 0 个错误
bun run format           # 幂等（只输出 "unchanged"）
```

## Agent 代码风格规则

- 不要引入缩写（`cfg`、`opts` 是现有代码中可接受的；不要新增如 `deps` 这类缩写）。
- 注释必须解释**为什么**，而不是**是什么**。`detectGroup()` 中的注释是好例子。
- 不要添加 `sort*`/`sortOrder*` 选项名——见选项命名规则。
- 不要创建 `build/` 或 `lib/` 目录。
- 不要在 TS 相对导入中重新引入 `.js` 后缀。

## Release notes 格式（固定模板，用户让写 release notes 时严格按此输出）

- 输出**原始 markdown 源码**（放在代码块里便于复制），不要渲染后的富文本。
- 语言：中文。简短直接，一句话讲清楚一条变更，不堆技术细节。
- 标题不需要强调版本号，因为 tag 已经包含了。
- 分类固定按以下顺序，只保留实际存在的分类，其他省略：
  1. `## New`
  2. `## Added`
  3. `## Fixed`
  4. `## Improved`
  5. `## Removed`
- 每条变更一行，格式 `- 简述。`。不要加粗面向用户的关键词，不要加 emoji。
- 不要写"零行为变更、零选项变化，用户可无感升级"之类的套话——没内容就省略。

示例（复制这个骨架）：

    ## Improved

    - import 块扫描改为线性时间。
    - 合并重复的选项解析逻辑。
