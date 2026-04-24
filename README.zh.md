# prettier-plugin-sort

一个专注于排序的 [Prettier](https://prettier.io/) 插件。

- 排序 JS / TS 文件里的 import 语句
- 排序 `export { … }` 花括号内的命名导出
- 排序 package.json 的顶层字段、字符串数组和依赖表
- 零运行时依赖

使用其他语言阅读：[English](./README.md) | 中文

## 安装

```shell
npm i -D prettier prettier-plugin-sort
```

在 Prettier 配置里启用：

```json
{
  "plugins": ["prettier-plugin-sort"]
}
```

然后按常规方式运行 Prettier 即可，例如 `npx prettier --write .`。

## 当前支持的排序

### import

#### 模块分组与排序

默认配置下，效果大致如下。

排序前：

<!-- prettier-ignore -->
```typescript
import App from './App.tsx';
import fs from 'node:fs';
import lodash from 'lodash';
import path from 'node:path';
import react from 'react';
```

排序后：

```typescript
import fs from 'node:fs';
import path from 'node:path';

import lodash from 'lodash';
import react from 'react';

import App from './App.tsx';
```

import 的模块一般可以按其来源分为不同的类别，例如上面的示例代码，'node:fs' 就属于 builtin 分类，该分类涵盖 Node.js、Bun、Deno 等**运行时**的内置模块。而像 react 和 lodash 这种直接从 npm 下载的依赖模块，属于 external 分类。

插件会先根据不同的模块进行分类，然后在模块内部基于字母顺序进行排列。

整体分组和排序方式参考了 [eslint-plugin-import](https://github.com/import-js/eslint-plugin-import) 的 [import/order](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md) 规则。

插件 import 默认的配置是：

```json
{
  "plugins": ["prettier-plugin-sort"],
  "importOrderGroups": ["builtin", "external", "parent", "sibling", "index"],
  "importOrderSeparation": true,
  "importOrderTypeImports": "separate",
  "importOrderMergeDuplicates": true
}
```

各分组的匹配规则如下：

| 分组       | 匹配内容                                                | 示例                               |
| ---------- | ------------------------------------------------------- | ---------------------------------- |
| `builtin`  | `node:*`、`bun:*`、`deno:*`，以及无前缀的 Node 内置模块 | `node:fs`、`path`                  |
| `external` | npm 包，以及不属于其他分组的模块                        | `react`、`@scope/pkg`              |
| `internal` | 项目绝对路径与别名                                      | `/utils`、`~/app`、`@/shared`      |
| `parent`   | 向上跳级的相对路径                                      | `../Button`                        |
| `sibling`  | 同级相对路径（不包含 index）                            | `./Icon`                           |
| `index`    | 当前目录的 index 模块                                   | `.`、`./`、`./index`、`./index.ts` |

> **关于 `internal` 的检测方式：** 插件目前通过说明符的前缀硬编码（`/`、`~`、`@/`）来判断，不会读取 tsconfig `paths` 或任何构建工具的配置。后续版本可能会提供 `importOrderInternalPatterns` 选项，支持自定义正则匹配。

你可以通过 `importOrderGroups` 调整分组顺序，或者删掉不需要的分组，比如把 `internal` 显式加入分组：

```json
{
  "plugins": ["prettier-plugin-sort"],
  "importOrderGroups": [
    "builtin",
    "external",
    "internal",
    "parent",
    "sibling",
    "index"
  ]
}
```

排序前：

<!-- prettier-ignore -->
```typescript
import App from './App.tsx';
import react from 'react';
import shared from '@/shared';
```

排序后：

<!-- prettier-ignore -->
```typescript
import react from 'react';

import shared from '@/shared';

import App from './App.tsx';
```

如果不想在分组之间插入空行，把 `importOrderSeparation` 设为 `false` 即可。

#### 类型导入

默认配置下，插件会把 `type` import 拆成独立的语句。

排序前：

<!-- prettier-ignore -->
```typescript
import { useState, type FC } from 'react';
```

排序后：

<!-- prettier-ignore -->
```typescript
import type { FC } from 'react';
import { useState } from 'react';
```

`importOrderTypeImports` 的几种风格则参考了 ESLint 生态里对 type import 的常见约定，尤其是
[@typescript-eslint/consistent-type-imports](https://typescript-eslint.io/rules/consistent-type-imports) 的 `fixStyle` 设计。

以 `import { c, type B, a } from 'mod';` 为例，各模式的效果：

| 模式           | 结果                                                             |
| -------------- | ---------------------------------------------------------------- |
| `separate`     | `import type { B } from 'mod';`<br>`import { a, c } from 'mod';` |
| `inline-first` | `import { type B, a, c } from 'mod';`                            |
| `inline-last`  | `import { a, c, type B } from 'mod';`                            |
| `mixed`        | `import { a, type B, c } from 'mod';`                            |

`separate`、`inline-first`、`inline-last` 三种模式会先按类型和值分开，然后在各自组内按字母序排列。`mixed` 将统一按字母序排列（不分类型与值），type 关键字始终跟随它所修饰的标识符，保持原有的关系。

#### 合并同源导入

默认情况下，来自同一来源的多条 import 语句会被合并成一条，便于阅读。

排序前：

<!-- prettier-ignore -->
```typescript
import { useState } from 'react';
import { useEffect } from 'react';
```

排序后：

```typescript
import { useEffect, useState } from 'react';
```

`importOrderMergeDuplicates` 只负责合并这一步，花括号内的排列方式完全由 `importOrderTypeImports` 决定。比如把 `import { useState } from 'react';` 和 `import { type FC, useEffect } from 'react';` 合并后，不同模式的结果：

- `separate`（默认）：合并后这一阶段又会被拆回两条，最终保持独立的 `import type` 语句
- `inline-first`：`import { type FC, useEffect, useState } from 'react';`
- `inline-last`：`import { useEffect, useState, type FC } from 'react';`
- `mixed`：`import { type FC, useEffect, useState } from 'react';`

如果你希望保留原本分离的两条语句，把 `importOrderMergeDuplicates` 设为 `false` 即可。副作用导入（`import 'mod';`）因为顺序有语义，永远不会被合并。

#### 副作用导入

副作用导入（`import 'mod'`）的顺序通常有运行时语义，例如 CSS 的层叠顺序、polyfill 必须在框架之前加载等。插件不会跨越副作用导入移动其他 import 语句：

排序前：

<!-- prettier-ignore -->
```typescript
import Button from './Button';
import App from './App';
import 'normalize.css';
import theme from './theme';
import Icon from './Icon';
```

排序后：

```typescript
import App from './App';
import Button from './Button';

import 'normalize.css';

import Icon from './Icon';
import theme from './theme';
```

副作用导入两侧的 import 各自独立排序，副作用导入本身保持原位不动。

排序规则：

- import 按分组分类，分组内按字母序排列
- 默认分组顺序：`builtin` → `external` → `parent` → `sibling` → `index`
- 分组之间默认插入空行，可通过 `importOrderSeparation` 关闭
- `type` import 默认拆成独立语句，可通过 `importOrderTypeImports` 调整为内联
- 同一来源的多条 import 默认合并为一条，可通过 `importOrderMergeDuplicates` 关闭
- 副作用导入（`import 'mod'`）其顺序有语义，不会被移动，两侧的 import 各自独立排序

### export

默认情况下，`export { … }` 花括号内的命名导出会按字母序排列。

排序前：

<!-- prettier-ignore -->
```typescript
export { useState, useEffect, type FC } from 'react';
```

排序后：

```typescript
export { type FC, useEffect, useState } from 'react';
```

插件只整理花括号内的顺序，不会改变整条 export 语句的位置，也不会合并两条同来源的 export。如果不需要这个行为，把 `exportOrder` 设为 `false` 即可。

排序规则：

- `export { … }` 和 `export type { … }` 花括号内的命名导出按字母序排列
- 不改变整条 export 语句在文件中的位置
- 不合并同来源的多条 export 语句

### package.json

默认配置下，效果大致如下。

排序前：

<!-- prettier-ignore -->
```json
{
  "version": "1.0.0",
  "keywords": ["sort", "prettier", "plugin"],
  "name": "demo",
  "dependencies": {
    "typescript": "^6.0.0",
    "prettier": "^3.0.0"
  }
}
```

排序后：

```json
{
  "name": "demo",
  "version": "1.0.0",
  "keywords": ["plugin", "prettier", "sort"],
  "dependencies": {
    "prettier": "^3.0.0",
    "typescript": "^6.0.0"
  }
}
```

`package.json` 顶层字段顺序参考了 [sort-package-json](https://github.com/keithamus/sort-package-json) 维护的字段列表，便于和社区里被广泛使用的排序习惯保持一致。

排序规则：

- 顶层字段按常用顺序排列（`name` → `version` → ... → `dependencies`）
- 顶层的纯字符串数组按字母序排列，如 `keywords`、`files`
- `dependencies`、`devDependencies`、`peerDependencies` 等依赖表永远按字母序排列，即使 `packageJsonOrder` 设为 `false` 也不例外。因为 `npm install` 每次都会按照字母序写回
- `scripts`、`exports`、`imports` 等嵌套对象不会递归排序，它们的键顺序有运行时语义
- 想让某些顶层字段完全跳过排序，可以在 `packageJsonOrderExcludeKeys` 里列出

## 配置项

Prettier 的插件选项是扁平的，所以这些配置都以 `importOrder`、`exportOrder` 或 `packageJsonOrder` 开头。

| 配置项                        | 说明                                                                           | 默认值                                                  |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `importOrder`                 | 是否排序 JS / TS 里的 import                                                   | `true`                                                  |
| `importOrderGroups`           | 分组顺序，支持 `builtin`、`external`、`internal`、`parent`、`sibling`、`index` | `["builtin", "external", "parent", "sibling", "index"]` |
| `importOrderSeparation`       | 分组之间是否插入空行                                                           | `true`                                                  |
| `importOrderTypeImports`      | `type` import 的处理方式：`separate`、`inline-first`、`inline-last`、`mixed`   | `"separate"`                                            |
| `importOrderMergeDuplicates`  | 是否合并同来源的多条 import 语句（副作用导入除外）                             | `true`                                                  |
| `exportOrder`                 | 是否按字母序排列 `export { … }` 花括号内的命名导出                             | `true`                                                  |
| `packageJsonOrder`            | 是否排序 package.json 的顶层字段和字符串数组                                   | `true`                                                  |
| `packageJsonOrderExcludeKeys` | 不参与 package.json 排序的顶层字段                                             | `[]`                                                    |

## 示例

```json
{
  "plugins": ["prettier-plugin-sort"],
  "importOrderGroups": [
    "builtin",
    "external",
    "internal",
    "parent",
    "sibling",
    "index"
  ],
  "importOrderTypeImports": "inline-last",
  "packageJsonOrderExcludeKeys": ["contributes"]
}
```

## 类型提示

如果你在 `.ts` 或 `.js` 配置文件里写 Prettier 配置，可以直接复用插件导出的
`SortOptions` 类型，这样写配置时会有补全和校验。

### 在 `.ts` 文件里使用

```typescript
import { type Config } from 'prettier';
import { type SortOptions } from 'prettier-plugin-sort';

export default {
  plugins: ['prettier-plugin-sort'],
  importOrderGroups: [
    'builtin',
    'external',
    'internal',
    'parent',
    'sibling',
    'index',
  ],
  importOrderTypeImports: 'inline-last',
  packageJsonOrderExcludeKeys: ['contributes'],
} satisfies Config & SortOptions;
```

### 在 `.js` 文件里使用

```js
/** @type {import('prettier').Config & import('prettier-plugin-sort').SortOptions} */
const config = {
  plugins: ['prettier-plugin-sort'],
  importOrderGroups: [
    'builtin',
    'external',
    'internal',
    'parent',
    'sibling',
    'index',
  ],
  importOrderTypeImports: 'inline-last',
  packageJsonOrderExcludeKeys: ['contributes'],
};

export default config;
```

如果你只想单独复用字面量类型，也可以使用插件导出的 `ImportGroup` 和
`TypeImportsStyle`。

## 项目由来

在接触 Prettier 之前，我一直都在使用 IDE 的自定义代码排序。因为后面开始尝试各种不同的 IDE，所以便有了统一配置管理的需求，于是将 ESLint + Prettier 引入到了项目中。

可是 Prettier 没有提供 sort 配置，我想要格式化 import 排序，就必须安装 `prettier-plugin-organize-imports` 插件，想要格式化 package.json 排序，就必须安装 `prettier-plugin-packagejson` 插件，导致体验十分割裂。

我在很长的一段时间里都没有去在意这些细枝末节，主要的精力放在了开发上。但在最近，我有调整 import type 内联排版的需求，发现 `prettier-plugin-organize-imports` 并不支持。再加上基于 `sort-package-json` 开发的 `prettier-plugin-packagejson` 有很多对于插件而言冗余的依赖项，所以便有了自己开发的打算。

`prettier-plugin-sort` 的目的不是为了替代谁，而是让开发者有着更多的选择。Prettier 绝大多数的用途都是格式化 JS/TS 代码，而所有的 JS 项目都有着 package.json，所以 `prettier-plugin-sort` 只实现了这两种基础的排序，初衷是让 JS 开发者能够以最小的心智负担做到开箱即用（未来可能还会添加对 tsconfig.json 的排序支持）。如果你有着其它代码的排序要求，那么依然可以选择安装 `prettier-plugin-css-order` 之类的插件，它们之间并不冲突。

## 鸣谢

- `eslint-plugin-import`: https://github.com/import-js/eslint-plugin-import
- `typescript-eslint`: https://github.com/typescript-eslint/typescript-eslint
- `sort-package-json`: https://github.com/keithamus/sort-package-json
