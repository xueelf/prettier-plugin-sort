# prettier-plugin-sort

A [Prettier](https://prettier.io/) plugin focused on sorting.

- Sort `import` declarations in JS / TS files
- Sort named specifiers inside `export { … }`
- Sort top-level keys, string arrays, and dependency maps in `package.json`
- Zero runtime dependencies

Read this in other languages: English | [中文](./README.zh.md)

## Install

```shell
npm i -D prettier prettier-plugin-sort
```

Enable it in your Prettier config:

```json
{
  "plugins": ["prettier-plugin-sort"]
}
```

Then run Prettier as usual, for example `npx prettier --write .`.

## What gets sorted

### Imports

#### Grouping and sorting

With the default config, imports are grouped and ordered like this.

Before:

<!-- prettier-ignore -->
```typescript
import App from './App.tsx';
import fs from 'node:fs';
import lodash from 'lodash';
import path from 'node:path';
import react from 'react';
```

After:

```typescript
import fs from 'node:fs';
import path from 'node:path';

import lodash from 'lodash';
import react from 'react';

import App from './App.tsx';
```

Each import belongs to a group. For example, `node:fs` is a `builtin` (covers Node.js / Bun / Deno built-ins), while `react` and `lodash` are `external` npm packages. The plugin first classifies each import by group, then sorts alphabetically within each group.

Grouping and ordering follow the conventions of [eslint-plugin-import](https://github.com/import-js/eslint-plugin-import)'s [import/order](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md) rule.

The default import config is:

```json
{
  "plugins": ["prettier-plugin-sort"],
  "importOrderGroups": ["builtin", "external", "parent", "sibling", "index"],
  "importOrderSeparation": true,
  "importOrderTypeImports": "separate",
  "importOrderMergeDuplicates": true
}
```

Group matchers:

| Group      | Matches                                                     | Examples                           |
| ---------- | ----------------------------------------------------------- | ---------------------------------- |
| `builtin`  | `node:*`, `bun:*`, `deno:*`, and unprefixed Node built-ins  | `node:fs`, `path`                  |
| `external` | npm packages, and anything that doesn't match another group | `react`, `@scope/pkg`              |
| `internal` | Project absolute paths and aliases                          | `/utils`, `~/app`, `@/shared`      |
| `parent`   | Parent-relative paths                                       | `../Button`                        |
| `sibling`  | Sibling paths (excluding index)                             | `./Icon`                           |
| `index`    | Current directory index                                     | `.`, `./`, `./index`, `./index.ts` |

> **Note on `internal` detection:** the plugin currently uses hardcoded specifier prefixes (`/`, `~`, `@/`) and does not read `tsconfig paths` or any bundler config. An `importOrderInternalPatterns` option for custom regex matching may be added in a future release.

Reorder or drop groups through `importOrderGroups`. For example, adding `internal` explicitly:

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

Before:

<!-- prettier-ignore -->
```typescript
import App from './App.tsx';
import react from 'react';
import shared from '@/shared';
```

After:

<!-- prettier-ignore -->
```typescript
import react from 'react';

import shared from '@/shared';

import App from './App.tsx';
```

Set `importOrderSeparation` to `false` if you don't want blank lines between groups.

#### Type imports

By default the plugin splits `type` imports into their own statement.

Before:

<!-- prettier-ignore -->
```typescript
import { useState, type FC } from 'react';
```

After:

<!-- prettier-ignore -->
```typescript
import type { FC } from 'react';
import { useState } from 'react';
```

The shape of `importOrderTypeImports` mirrors conventions in the ESLint ecosystem, especially the `fixStyle` option of [@typescript-eslint/consistent-type-imports](https://typescript-eslint.io/rules/consistent-type-imports).

Using `import { c, type B, a } from 'mod';` as an example:

| Mode           | Result                                                        |
| -------------- | ------------------------------------------------------------- |
| `separate`     | `import type { B } from 'mod';`<br>`import { a, c } from 'mod';` |
| `inline-first` | `import { type B, a, c } from 'mod';`                            |
| `inline-last`  | `import { a, c, type B } from 'mod';`                            |
| `mixed`        | `import { a, type B, c } from 'mod';`                            |

`separate`, `inline-first`, and `inline-last` sort type and value specifiers independently within their own group. `mixed` sorts all specifiers together alphabetically (case-insensitive), keeping the `type` keyword inline where needed.

#### Merging same-source imports

By default, multiple `import` statements from the same source are merged into one.

Before:

<!-- prettier-ignore -->
```typescript
import { useState } from 'react';
import { useEffect } from 'react';
```

After:

```typescript
import { useEffect, useState } from 'react';
```

`importOrderMergeDuplicates` only handles the merge step itself. The arrangement inside the braces is entirely controlled by `importOrderTypeImports`. For instance, merging `import { useState } from 'react';` and `import { type FC, useEffect } from 'react';` produces:

- `separate` (default): the merged statement is split back into two at the type-import stage, so you end up with an independent `import type` statement
- `inline-first`: `import { type FC, useEffect, useState } from 'react';`
- `inline-last`: `import { useEffect, useState, type FC } from 'react';`
- `mixed`: `import { type FC, useEffect, useState } from 'react';`

Set `importOrderMergeDuplicates` to `false` if you want to keep the original separate statements. Side-effect imports (`import 'mod';`) are never merged because their order has runtime semantics.

Sorting rules:

- Imports are classified into groups. Within each group they are sorted alphabetically
- Default group order: `builtin` → `external` → `parent` → `sibling` → `index`
- A blank line is inserted between groups by default. Disable with `importOrderSeparation`
- `type` imports are split into their own statement by default. Use `importOrderTypeImports` to inline them instead
- Multiple imports from the same source are merged into one by default. Disable with `importOrderMergeDuplicates`
- Side-effect imports (`import 'mod'`) are never merged or moved across groups

### Exports

By default, named specifiers inside `export { … }` are sorted alphabetically.

Before:

<!-- prettier-ignore -->
```typescript
export { useState, useEffect, type FC } from 'react';
```

After:

```typescript
export { type FC, useEffect, useState } from 'react';
```

The plugin only reorders what's inside the braces. It doesn't move the export statement itself and doesn't merge two same-source exports. Set `exportOrder` to `false` to disable this behavior.

Sorting rules:

- Named specifiers inside `export { … }` and `export type { … }` are sorted alphabetically
- The position of the export statement in the file is not changed
- Multiple export statements from the same source are not merged

### package.json

With the default config, the output looks like this.

Before:

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

After:

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

Top-level key order follows the field list maintained by [sort-package-json](https://github.com/keithamus/sort-package-json), staying aligned with widely adopted community conventions.

Rules the plugin follows:

- Top-level keys are reordered to the canonical sequence (`name` → `version` → ... → `dependencies`)
- Top-level string-only arrays are sorted alphabetically, e.g. `keywords`, `files`
- `dependencies`, `devDependencies`, `peerDependencies` and other dependency maps are always sorted alphabetically, even if `packageJsonOrder` is set to `false`, because `npm install` rewrites them in alphabetical order every time
- `scripts`, `exports`, `imports` and other nested objects are not sorted recursively, because their key order carries runtime semantics
- Use `packageJsonOrderExcludeKeys` to opt specific top-level keys out of sorting entirely

## Options

Prettier plugin options are flat, so these options are prefixed with `importOrder`, `exportOrder`, or `packageJsonOrder`.

| Option                        | Description                                                                                | Default                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `importOrder`                 | Sort `import` declarations in JS / TS                                                      | `true`                                                  |
| `importOrderGroups`           | Group order. Valid values: `builtin`, `external`, `internal`, `parent`, `sibling`, `index` | `["builtin", "external", "parent", "sibling", "index"]` |
| `importOrderSeparation`       | Insert a blank line between adjacent groups                                                | `true`                                                  |
| `importOrderTypeImports`      | How to place `type` imports: `separate`, `inline-first`, `inline-last`, `mixed`            | `"separate"`                                            |
| `importOrderMergeDuplicates`  | Merge multiple `import` statements from the same source (except side-effect imports)       | `true`                                                  |
| `exportOrder`                 | Sort named specifiers inside `export { … }` alphabetically                                 | `true`                                                  |
| `packageJsonOrder`            | Sort top-level keys and string arrays in `package.json`                                    | `true`                                                  |
| `packageJsonOrderExcludeKeys` | Top-level `package.json` keys to leave untouched                                           | `[]`                                                    |

## Example

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

## Type hints

If you write your Prettier config in a `.ts` or `.js` file, you can reuse the `SortOptions` type exported by the plugin to get completion and validation.

### In a `.ts` file

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

### In a `.js` file

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

The `ImportGroup` and `TypeImportsStyle` literal types are also exported if you only need those.

## Motivation

Before adopting Prettier, I relied on IDE-native sorting features to keep my code organized. As I started switching between different IDEs, I wanted a portable, unified configuration, so I brought ESLint and Prettier into my projects.

Prettier doesn't provide sorting out of the box. To sort imports I had to install `prettier-plugin-organize-imports`. To sort `package.json` I had to install `prettier-plugin-packagejson`. The fragmented experience bothered me.

I ignored this for a long time while focusing on actual development. Recently, though, I needed to control how `import type` was inlined and found that `prettier-plugin-organize-imports` didn't support it. On top of that, `prettier-plugin-packagejson`, built on `sort-package-json`, carries many dependencies that are redundant for a plugin. That's when I decided to build my own.

`prettier-plugin-sort` isn't meant to replace anything. It's about giving developers more options. Prettier is used almost entirely for JS/TS code, and every JS project has a `package.json`, so the plugin covers these two fundamental sorting tasks. The goal is to let JS developers work out of the box with minimal mental overhead (support for `tsconfig.json` sorting may be added in a future release). If you have other sorting needs, you can still install something like `prettier-plugin-css-order` alongside it. There's no conflict.

## Credits

- `eslint-plugin-import`: https://github.com/import-js/eslint-plugin-import
- `typescript-eslint`: https://github.com/typescript-eslint/typescript-eslint
- `sort-package-json`: https://github.com/keithamus/sort-package-json
