# prettier-plugin-sort

一个专注于代码、配置文件排序的 [Prettier](https://prettier.io/) 插件。

- 排序 JavaScript、TypeScript 和 Flow 中的顶层 `import` 和 `export { ... }`
- 排序 `package.json` 字段
- 排序 `tsconfig.json` 字段

使用其他语言阅读：[English](./README.md) | 中文

## 效果预览

插件会在 Prettier 格式化文件时同时整理内容顺序。以 `import` 为例：

<!-- prettier-ignore -->
```javascript
import App from './App';
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
```

格式化后会变成：

```javascript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
```

## 安装

要求 Prettier 3.9 或更高版本。

```shell
npm i -D prettier prettier-plugin-sort
```

在 Prettier 配置中启用插件：

```json
{
  "plugins": ["prettier-plugin-sort"]
}
```

之后照常运行 Prettier 即可。各项排序默认开启，可以通过配置项分别调整。

## `import` 排序

文件顶层的静态 `import` 会先集中到第一条 `import` 所在的位置，再按模块来源分组排序。花括号内的具名导入也会按名称排列，使用 `as` 时按本地名称排序。

动态 `import()` 以及字符串、注释中形似 `import` 的内容都不会改动。将 `esmImportSort` 设为 `false` 可关闭全部 `import` 排序。

### 分组

`esmImportGroups` 支持以下分组：

| 分组       | 匹配范围                                                  |
| ---------- | --------------------------------------------------------- |
| `builtin`  | 以 `node:`、`bun:` 开头的模块，以及 `bun`                 |
| `external` | 第三方包，以及没有匹配其他分组的模块路径                  |
| `internal` | `tsconfig.json` 中 `compilerOptions.paths` 定义的路径别名 |
| `parent`   | `../utils` 这类指向上级目录的相对路径                     |
| `sibling`  | `./Button` 这类指向同级目录的相对路径                     |
| `index`    | `.`、`./`、`./index` 及带扩展名的 `./index`               |

现代 Node.js 代码应使用 [`node:` URL](https://nodejs.org/api/esm.html#node-imports) 显式引用内置模块。本插件也只把带 `node:` 前缀的内置模块归入 `builtin`。`fs`、`path` 等未带前缀的模块归入 `external`。

默认顺序就是表中的顺序。配置数组会自动去重，遗漏的默认分组则按默认顺序补到末尾。

插件会从当前文件所在目录向上查找最近的 `tsconfig.json`，并根据解析后的 `compilerOptions.paths` 识别 `internal`。继承配置中的 `paths` 同样有效。没有在 `paths` 中声明的非相对路径仍归入 `external`。`*` 无法区分项目代码和第三方包，因此不会用于判断 `internal`。

将 `esmImportSeparation` 设为 `false` 后，分组之间和副作用 `import` 上下两侧都不再留空行。

### 类型 `import` 写法

`esmImportTypeStyle` 控制类型 `import` 的写法和顺序，支持以下四种值：

| 配置值         | 输入 `import { c, type B, a } from 'mod'` 后的结果               |
| -------------- | ---------------------------------------------------------------- |
| `separate`     | `import type { B } from 'mod';`<br>`import { a, c } from 'mod';` |
| `inline-first` | `import { type B, a, c } from 'mod';`                            |
| `inline-last`  | `import { a, c, type B } from 'mod';`                            |
| `mixed`        | `import { a, type B, c } from 'mod';`                            |

默认值是 `separate`。`import type T from 'mod'` 和 `import type * as ns from 'mod'` 会保留原写法。

启用 [`verbatimModuleSyntax`](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html) 后，`import type { T }` 和 `import { type T }` 的运行时行为并不相同。只有同一模块还存在值导入时，插件才会在两种写法之间转换，以免意外改变模块加载行为。

### 合并

启用 `esmImportMerge` 后，同一模块的 `import` 会在安全的前提下合并。

`import` 属性不同、注释无法安全移动，或默认导入与命名空间导入发生冲突时，都不会合并。副作用 `import` 始终保持独立。

## `export` 排序

`esmExportSpecifierSort` 按名称排列顶层 `export { ... }` 和 `export type { ... }`。使用 `as` 时，以导出后的名称为准。

排序前：

<!-- prettier-ignore -->
```typescript
export { useState, useEffect, type FC } from 'react';
```

排序后：

```typescript
export { type FC, useEffect, useState } from 'react';
```

`export` 声明本身不会移动或合并。

## `package.json` 排序

`$schema` 按 JSON Schema 的通行写法放在最前。其他字段遵循 [sort-package-json 4.0.0](https://github.com/keithamus/sort-package-json/blob/v4.0.0/defaultRules.md) 的默认规则，`scripts` 和 `exports` 的内部顺序也由这套规则决定。

npm 使用 `String.prototype.localeCompare(..., 'en')` 排列 dependency name，pnpm 使用 `Array.prototype.sort()` 的默认顺序，Yarn 则通过 `<` 和 `>` 比较字符串。后两种方式都采用 UTF-16 code unit order，因此包含 `-`、`_` 等符号的 dependency name 可能得到不同结果。例如 npm 将 `a_b` 排在 `a-b` 前，pnpm 和 Yarn 的顺序相反。由于 `package.json` 由 npm 定义，本插件以 npm 的排序行为为基准。`sort-package-json` 会根据 package manager 切换 dependency comparator，本插件则固定使用 npm comparator。这是本插件与 `sort-package-json` 排序规则的唯一差异。

排序前：

<!-- prettier-ignore -->
```json
{
  "version": "1.0.0",
  "name": "example",
  "dependencies": {
    "typescript": "^7.0.0",
    "prettier": "^3.9.0"
  },
  "$schema": "https://json.schemastore.org/package.json"
}
```

排序后：

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "example",
  "version": "1.0.0",
  "dependencies": {
    "prettier": "^3.9.0",
    "typescript": "^7.0.0"
  }
}
```

将 `packageSort` 设为 `false` 可关闭字段排序，不影响 Prettier 本身的排版。

## `tsconfig.json` 排序

[TypeScript Handbook 的继承示例](https://www.typescriptlang.org/docs/handbook/tsconfig-json#tsconfig-bases) 将 `extends` 写在其他配置之前，[文件配置示例](https://www.typescriptlang.org/docs/handbook/tsconfig-json#examples) 则将 `files`、`include` 和 `exclude` 写在 `compilerOptions` 之后。本插件沿用这种布局，并按 JSON Schema 的通行写法将 `$schema` 放在最前。最终顺序为 `$schema`、`extends`、其他顶层字段、`files`、`include`、`exclude`，其他顶层字段之间的顺序不变。

`compilerOptions` 里的配置项按照 [TypeScript 5.8.3 的 `tsc --init` 模板](https://github.com/microsoft/TypeScript/blob/v5.8.3/src/compiler/commandLineParser.ts) 分组排序。配置项内的对象和数组保持原有顺序。

排序前：

<!-- prettier-ignore -->
```json
{
  "exclude": ["dist"],
  "files": ["index.ts"],
  "include": ["src"],
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "target": "ESNext",
    "noEmit": true,
    "module": "Preserve",
    "lib": ["ESNext"],
    "outDir": "dist",
    "noUncheckedIndexedAccess": true
  },
  "extends": "./base.json",
  "$schema": "https://json.schemastore.org/tsconfig"
}
```

排序后：

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],

    "module": "Preserve",
    "moduleResolution": "bundler",

    "noEmit": true,
    "outDir": "dist",

    "strict": true,
    "noUncheckedIndexedAccess": true,

    "skipLibCheck": true
  },
  "files": ["index.ts"],
  "include": ["src"],
  "exclude": ["dist"]
}
```

不同分组之间默认留一个空行。将 `tsconfigSeparation` 设为 `false` 可去掉这些空行。

TypeScript 6.0 新增的 `stableTypeOrdering` 和 TypeScript 7.0 新增的 `deduplicatePackages` 不在 5.8.3 模板中，因此排在最后。其他未收录的配置项也按同样方式处理，彼此之间保留原有顺序。

将 `tsconfigSort` 设为 `false` 可关闭字段排序，不影响 Prettier 本身的排版。

## 配置项

所有配置项及其默认值如下：

| 配置项                   | 类型              | 默认值                                                              | 作用                                                |
| ------------------------ | ----------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| `esmImportSort`          | `boolean`         | `true`                                                              | 分组并排序顶层静态 `import`，同时排列其中的具名导入 |
| `esmImportGroups`        | `ImportGroup[]`   | `["builtin", "external", "internal", "parent", "sibling", "index"]` | 指定 `import` 分组顺序                              |
| `esmImportSeparation`    | `boolean`         | `true`                                                              | 在不同分组之间及副作用 `import` 的上下两侧留出空行  |
| `esmImportTypeStyle`     | `TypeImportStyle` | `"separate"`                                                        | 控制类型 `import` 的写法与顺序                      |
| `esmImportMerge`         | `boolean`         | `true`                                                              | 安全合并来自同一模块的 `import`                     |
| `esmExportSpecifierSort` | `boolean`         | `true`                                                              | 按名称排列 `export { ... }` 形式的导出列表          |
| `packageSort`            | `boolean`         | `true`                                                              | 排序 `package.json` 字段                            |
| `tsconfigSort`           | `boolean`         | `true`                                                              | 排序 `tsconfig.json` 字段                           |
| `tsconfigSeparation`     | `boolean`         | `true`                                                              | 在 `compilerOptions` 分类之间留出空行               |

## 注释与排序边界

为了避免改变运行时语义或注释归属，以下内容会将前后的 `import` 分成独立的排序片段：

- 副作用 `import` 具有执行语义，不参与排序，并分隔前后的排序片段。
- 带有 `prettier-ignore` 的声明不会改动，其前后的 `import` 分别排序。
- 独立注释会分隔前后的 `import`，紧跟某条 `import` 的注释则随该声明一起移动。

文件开头的 `#!`、Prettier 文件级指令和位置敏感的 ESLint 指令会留在原位。`import source`、`import defer`、Flow `import typeof` 等特殊声明可以随所在片段整体移动，但不会改写或合并。

`export { ... }` 内有注释时，整条声明保持原样。`tsconfig.json` 中的注释只会阻止同一层的字段排序。顶层注释不会影响 `compilerOptions`，`compilerOptions` 中的注释也不会影响顶层字段。

## 支持范围

以下 Prettier 解析器支持 ES 模块排序：

- `babel`
- `babel-flow`
- `babel-ts`
- `typescript`
- `flow`
- `acorn`
- `espree`
- `meriyah`

Vue、Markdown 等文件中的 JavaScript 和 TypeScript 的**嵌入式代码**也会通过这些解析器参与排序。

插件只处理 ES 模块语法，不会改动 CommonJS 的 `require()`、`module.exports` 或 TypeScript 的 `export =`。

`package.json` 排序支持 `json` 和 `json-stringify` 解析器，只对文件名为 `package.json` 的文件生效。

`tsconfig.json` 排序支持 `json` 解析器，文件名必须是 `tsconfig.json` 或 `tsconfig.*.json`。

## TypeScript 配置

插件还导出 `SortOptions`、`ImportGroup` 和 `TypeImportStyle` 类型，可直接用于 TypeScript 配置文件：

```typescript
import { type Config } from 'prettier';
import { type SortOptions } from 'prettier-plugin-sort';

export default {
  plugins: ['prettier-plugin-sort'],
  esmImportTypeStyle: 'inline-last',
} satisfies Config & SortOptions;
```
