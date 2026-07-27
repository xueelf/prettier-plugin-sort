# prettier-plugin-sort

A [Prettier](https://prettier.io/) plugin focused on sorting.

- Sort top-level `import` and `export { ... }` in JavaScript, TypeScript, and Flow
- Sort fields in `package.json`

Read this in other languages: English | [中文](./README.zh.md)

## Install

Requires Prettier 3.7 or newer.

```shell
npm i -D prettier prettier-plugin-sort
```

Add the plugin to your Prettier config:

```json
{
  "plugins": ["prettier-plugin-sort"]
}
```

## Scope

ES module sorting supports these Prettier parsers:

- `babel`
- `babel-flow`
- `babel-ts`
- `typescript`
- `flow`
- `acorn`
- `espree`
- `meriyah`

The same sorting also applies to **embedded** JavaScript and TypeScript in Vue or Markdown.

The plugin only handles ES module syntax. CommonJS `require()` and `module.exports`, along with TypeScript `export =`, remain unchanged.

`package.json` sorting is enabled for these Prettier parsers:

- `json`
- `json-stringify`

Sorting is enabled only when the file is named `package.json`.

## Options

| Option                   | Type              | Default                                                 | Description                                                              |
| ------------------------ | ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `esmImportSort`          | `boolean`         | `true`                                                  | Group and sort top-level static imports and the specifiers inside braces |
| `esmImportGroups`        | `ImportGroup[]`   | `["builtin", "external", "parent", "sibling", "index"]` | Set the order of import groups                                           |
| `esmImportSeparation`    | `boolean`         | `true`                                                  | Add blank lines between groups and above and below side-effect imports   |
| `esmImportTypeStyle`     | `TypeImportStyle` | `"separate"`                                            | Control the form and order of type-only imports                          |
| `esmImportMerge`         | `boolean`         | `true`                                                  | Safely merge imports from the same module                                |
| `esmExportSpecifierSort` | `boolean`         | `true`                                                  | Sort specifiers inside `export { ... }`                                  |
| `packageSort`            | `boolean`         | `true`                                                  | Sort fields in `package.json`                                            |

## Import sorting

The plugin groups and sorts top-level static imports. It also sorts the specifiers inside braces. Import specifiers that use `as` are sorted by their local names.

The plugin leaves dynamic `import()` calls and import-like text in strings or comments unchanged. Set `esmImportSort` to `false` to disable all import sorting.

The plugin collects static imports separated by other top-level statements at the first import position, then sorts them.

Before sorting:

<!-- prettier-ignore -->
```typescript
import App from './App';
import fs from 'node:fs';
import react from 'react';
```

After sorting:

```typescript
import fs from 'node:fs';

import react from 'react';

import App from './App';
```

### Grouping

`esmImportGroups` accepts these values:

| Group      | Matches                                                        |
| ---------- | -------------------------------------------------------------- |
| `builtin`  | Modules beginning with `node:` or `bun:`, plus `bun`           |
| `external` | Packages and module paths not matched by any other group       |
| `internal` | Module paths beginning with `/`, `~`, `@/`, or `#`             |
| `parent`   | Parent-relative paths such as `../utils`                       |
| `sibling`  | Sibling paths such as `./Button`                               |
| `index`    | `.`, `./`, `./index`, and `./index` with an optional extension |

Modern Node.js code should reference built-ins explicitly with [`node:` URLs](https://nodejs.org/api/esm.html#node-imports). The plugin also classifies only `node:`-prefixed Node.js built-ins as `builtin`. Module specifiers without the prefix, such as `fs` and `path`, belong to `external`.

The plugin removes duplicate entries and appends omitted default groups in their default order. The default configuration does not include `internal`, so it sorts last unless explicitly added.

Projects that use one of these path aliases can add `internal`:

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

The plugin does not read `compilerOptions.paths` or resolve aliases from bundler configuration.

Set `esmImportSeparation` to `false` to remove blank lines between groups and above and below side-effect imports.

### Type-only import style

`esmImportTypeStyle` controls how type-only imports are written and accepts four values:

| Value          | Input: `import { c, type B, a } from 'mod'`                      |
| -------------- | ---------------------------------------------------------------- |
| `separate`     | `import type { B } from 'mod';`<br>`import { a, c } from 'mod';` |
| `inline-first` | `import { type B, a, c } from 'mod';`                            |
| `inline-last`  | `import { a, c, type B } from 'mod';`                            |
| `mixed`        | `import { a, type B, c } from 'mod';`                            |

`separate` is the default. Type-only default and namespace imports keep their original form.

### Merging and sorting boundaries

With `esmImportMerge` enabled, imports from the same module are merged when it is safe to do so.

The plugin does not merge imports with different import attributes, comments that cannot move safely, or conflicting default or namespace bindings. Side-effect imports also remain separate.

Sorting never crosses these boundaries:

- Side-effect import order can affect CSS cascading or polyfill loading, so these imports are not sorted. They keep their relative positions and separate the sorting segments around them.
- A declaration marked with `prettier-ignore` stays unchanged. Imports before and after it are sorted separately.
- A standalone comment separates the imports before and after it. A comment attached to an import moves with that declaration.
- The plugin preserves shebangs, Prettier file pragmas, and position-sensitive ESLint directives.
- Specialized declarations such as `import source`, `import defer`, and Flow `import typeof` may be reordered as a whole. The plugin never rewrites or merges them.

## Export sorting

`esmExportSpecifierSort` sorts top-level `export { ... }` and `export type { ... }` entries by name. Aliased entries are sorted by their exported names.

Before sorting:

<!-- prettier-ignore -->
```typescript
export { useState, useEffect, type FC } from 'react';
```

After sorting:

```typescript
export { type FC, useEffect, useState } from 'react';
```

The plugin does not move or merge export declarations. If an export list contains comments, the declaration remains unchanged to preserve comment placement.

## `package.json` sorting

`package.json` field order follows [the default rules from sort-package-json 4.0.0](https://github.com/keithamus/sort-package-json/blob/v4.0.0/defaultRules.md). Nested content such as `scripts`, `exports`, and dependency fields follows the same version's rules.

Before sorting:

<!-- prettier-ignore -->
```json
{
  "version": "1.0.0",
  "name": "example",
  "dependencies": {
    "typescript": "^7.0.0",
    "prettier": "^3.7.0"
  }
}
```

After sorting:

```json
{
  "name": "example",
  "version": "1.0.0",
  "dependencies": {
    "prettier": "^3.7.0",
    "typescript": "^7.0.0"
  }
}
```

Setting `packageSort` to `false` disables key sorting only. Prettier still formats the file as usual.

## TypeScript configuration

The package also exports `SortOptions`, `ImportGroup`, and `TypeImportStyle` for use in TypeScript configuration files:

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
