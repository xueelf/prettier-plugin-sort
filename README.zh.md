# prettier-plugin-sort

一个专注于排序的 [Prettier](https://prettier.io/) 插件。

- 排序 JavaScript、TypeScript 和 Flow 中的顶层 `import` 和 `export { ... }`
- 排序 `package.json` 字段

使用其他语言阅读：[English](./README.md) | 中文

## 安装

需要 Prettier 3.9 或更高版本。

```shell
npm i -D prettier prettier-plugin-sort
```

在 Prettier 配置中启用插件：

```json
{
  "plugins": ["prettier-plugin-sort"]
}
```

## 作用范围

ES 模块排序支持以下 Prettier 解析器：

- `babel`
- `babel-flow`
- `babel-ts`
- `typescript`
- `flow`
- `acorn`
- `espree`
- `meriyah`

上述排序同样适用于这些解析器处理的**嵌入式**代码，例如 Vue 或 Markdown 中的 JavaScript 或 TypeScript 内容。

插件只处理 ES 模块语法。CommonJS 的 `require()`、`module.exports` 和 TypeScript `export =` 会保持不变。

`package.json` 排序支持以下 Prettier 解析器：

- `json`
- `json-stringify`

仅当文件名为 `package.json` 时，才会启用排序。

## 配置项

| 配置项                   | 类型              | 默认值                                                  | 作用                                                |
| ------------------------ | ----------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `esmImportSort`          | `boolean`         | `true`                                                  | 分组并排序顶层静态 `import`，同时排列其中的具名导入 |
| `esmImportGroups`        | `ImportGroup[]`   | `["builtin", "external", "parent", "sibling", "index"]` | 指定 `import` 分组顺序                              |
| `esmImportSeparation`    | `boolean`         | `true`                                                  | 在不同分组之间及副作用 `import` 的上下两侧留出空行  |
| `esmImportTypeStyle`     | `TypeImportStyle` | `"separate"`                                            | 控制仅类型 `import` 的写法与顺序                    |
| `esmImportMerge`         | `boolean`         | `true`                                                  | 安全合并来自同一模块的 `import`                     |
| `esmExportSpecifierSort` | `boolean`         | `true`                                                  | 按名称排列 `export { ... }` 形式的导出列表          |
| `packageSort`            | `boolean`         | `true`                                                  | 排序 `package.json` 字段                            |

## `import` 排序

插件会分组并排序文件顶层的静态 `import`，同时排列其中的具名导入。带 `as` 的具名导入按本地名称排序。

插件不会处理动态 `import()`，也不会处理字符串和注释中类似 `import` 的内容。将 `esmImportSort` 设为 `false`，可以关闭所有 `import` 排序功能。

插件会把分散在其他顶层语句之间的静态 `import` 集中到第一条 `import` 所在位置，再进行排序。

排序前：

<!-- prettier-ignore -->
```typescript
import App from './App';
import fs from 'node:fs';
import react from 'react';
```

排序后：

```typescript
import fs from 'node:fs';

import react from 'react';

import App from './App';
```

### 分组

`esmImportGroups` 支持以下分组：

| 分组       | 匹配范围                                    |
| ---------- | ------------------------------------------- |
| `builtin`  | 以 `node:`、`bun:` 开头的模块，以及 `bun`   |
| `external` | 第三方包，以及没有匹配其他分组的模块路径    |
| `internal` | 以 `/`、`~`、`@/` 或 `#` 开头的模块路径     |
| `parent`   | `../utils` 这类指向上级目录的相对路径       |
| `sibling`  | `./Button` 这类指向同级目录的相对路径       |
| `index`    | `.`、`./`、`./index` 及带扩展名的 `./index` |

现代 Node.js 代码应使用 [`node:` URL](https://nodejs.org/api/esm.html#node-imports) 显式引用内置模块。本插件也只把带 `node:` 前缀的 Node.js 内置模块归入 `builtin`。`fs`、`path` 等未带前缀的内置模块名称归入 `external`。

插件会移除配置数组中的重复项，并按默认顺序追加未列出的默认分组。默认配置不包含 `internal`，因此它在未显式加入时排在最后。

项目使用上述路径别名时，可以手动加入 `internal`：

```json
{
  "plugins": ["prettier-plugin-sort"],
  "esmImportGroups": [
    "builtin",
    "external",
    "internal",
    "parent",
    "sibling",
    "index"
  ]
}
```

插件不会读取 `compilerOptions.paths`，也不会解析构建工具的别名配置。

如果不希望不同分组之间及副作用 `import` 的上下两侧留出空行，可以将 `esmImportSeparation` 设为 `false`。

### 仅类型 `import` 写法

`esmImportTypeStyle` 用来控制仅类型 `import` 的写法，共有四种取值：

| 配置值         | 输入 `import { c, type B, a } from 'mod'` 后的结果               |
| -------------- | ---------------------------------------------------------------- |
| `separate`     | `import type { B } from 'mod';`<br>`import { a, c } from 'mod';` |
| `inline-first` | `import { type B, a, c } from 'mod';`                            |
| `inline-last`  | `import { a, c, type B } from 'mod';`                            |
| `mixed`        | `import { a, type B, c } from 'mod';`                            |

默认值为 `separate`。包含默认导入或命名空间导入的仅类型 `import` 会保留原有形式。

### 合并与排序边界

启用 `esmImportMerge` 后，来自同一模块的 `import` 会在安全的情况下合并。

当 `import` 属性不同、注释无法安全移动，或者默认导入和命名空间导入存在冲突时，插件不会合并这些 `import`。副作用 `import` 也不会合并。

排序不会跨越以下边界：

- 副作用 `import` 的顺序可能影响 CSS 层叠或兼容性补丁的加载，因此不会参与排序。它们会保持相对位置，并分隔前后的排序片段。
- 带有 `prettier-ignore` 的声明保持不变，其前后的 `import` 分别排序。
- 独立注释会分隔前后的 `import`。紧跟某条 `import` 的注释会和它一起移动。
- 插件会保留文件开头的 `#!` 指令、Prettier 文件级指令和位置敏感的 ESLint 指令。
- `import source`、`import defer`、Flow `import typeof` 等特殊声明可以整体参与排序。插件不会改写或合并这些声明。

## `export` 排序

`esmExportSpecifierSort` 会按名称排列顶层 `export { ... }` 和 `export type { ... }`。使用 `as` 时，按导出后的名称排序。

排序前：

<!-- prettier-ignore -->
```typescript
export { useState, useEffect, type FC } from 'react';
```

排序后：

```typescript
export { type FC, useEffect, useState } from 'react';
```

插件不会移动或合并 `export` 声明。花括号内含有注释时，整条声明会保持原样，避免改变注释归属。

## `package.json` 排序

`package.json` 的字段顺序遵循 [sort-package-json 4.0.0 的默认规则](https://github.com/keithamus/sort-package-json/blob/v4.0.0/defaultRules.md)。`scripts`、`exports` 和依赖字段等内部内容也按该版本的规则排序。

排序前：

<!-- prettier-ignore -->
```json
{
  "version": "1.0.0",
  "name": "example",
  "dependencies": {
    "typescript": "^7.0.0",
    "prettier": "^3.9.0"
  }
}
```

排序后：

```json
{
  "name": "example",
  "version": "1.0.0",
  "dependencies": {
    "prettier": "^3.9.0",
    "typescript": "^7.0.0"
  }
}
```

将 `packageSort` 设为 `false` 只会关闭字段排序，Prettier 仍会照常排版该文件。

## TypeScript 配置

插件同时导出 `SortOptions`、`ImportGroup` 和 `TypeImportStyle`，可用于 TypeScript 配置文件：

```typescript
import { type Config } from 'prettier';
import { type SortOptions } from 'prettier-plugin-sort';

export default {
  plugins: ['prettier-plugin-sort'],
  esmImportGroups: [
    'builtin',
    'external',
    'internal',
    'parent',
    'sibling',
    'index',
  ],
  esmImportTypeStyle: 'inline-last',
} satisfies Config & SortOptions;
```
