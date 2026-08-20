# prettier-plugin-sort

A [Prettier](https://prettier.io/) plugin focused on sorting code and configuration files.

- Sort top-level `import` and `export { ... }` in JavaScript, TypeScript, and Flow
- Sort fields in `package.json`
- Sort fields in `tsconfig.json`

Read this in other languages: English | [中文](./README.zh.md)

## Preview

Alongside Prettier's regular formatting, the plugin sorts relevant declarations and fields. For example:

<!-- prettier-ignore -->
```javascript
import App from './App';
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
```

Are formatted as:

```javascript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
```

## Install

Requires Prettier 3.9 or newer.

```shell
npm i -D prettier prettier-plugin-sort
```

Add the plugin to your Prettier config:

```json
{
  "plugins": ["prettier-plugin-sort"]
}
```

Continue running Prettier as usual after adding the plugin. Every sorting feature is enabled by default and can be adjusted independently.

## Import sorting

Top-level static imports are first gathered at the location of the first import, then grouped and sorted by module source. Named imports inside braces are also sorted by name, with aliased imports using their local names.

Dynamic `import()` calls and import-like text in strings or comments are left untouched. Set `esmImportSort` to `false` to disable all import sorting.

### Grouping

`esmImportGroups` accepts these values:

| Group      | Matches                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `builtin`  | Modules beginning with `node:` or `bun:`, plus `bun`                                            |
| `external` | Packages and module paths not matched by any other group                                        |
| `internal` | Path aliases from `compilerOptions.paths` in the TypeScript project containing the current file |
| `parent`   | Parent-relative paths such as `../utils`                                                        |
| `sibling`  | Sibling paths such as `./Button`                                                                |
| `index`    | `.`, `./`, `./index`, and `./index` with an optional extension                                  |

Modern Node.js code should reference built-ins explicitly with [`node:` URLs](https://nodejs.org/api/esm.html#node-imports). The plugin also classifies only `node:`-prefixed modules as `builtin`. Module specifiers without the prefix, such as `fs` and `path`, belong to `external`.

The table also shows the default order. Duplicate entries are removed automatically, and omitted default groups are appended in their default order.

The plugin searches upward from the current file for the nearest `tsconfig.json`, then uses `files`, `include`, and `exclude` to select the TypeScript project containing the file, following `references` when necessary. Each project is resolved through `extends` before matching the file and reading `compilerOptions.paths`. Only `paths` from the selected project are used to classify `internal`; `paths` from other referenced projects are not merged. Non-relative paths not declared there remain `external`. The catch-all pattern `*` is ignored because it cannot distinguish project modules from third-party packages.

With `esmImportSeparation` set to `false`, blank lines are removed both between groups and around side-effect imports.

### Type-only import style

`esmImportTypeStyle` controls how type-only imports are written. It accepts these four values:

| Value          | Input: `import { c, type B, a } from 'mod'`                      |
| -------------- | ---------------------------------------------------------------- |
| `separate`     | `import type { B } from 'mod';`<br>`import { a, c } from 'mod';` |
| `inline-first` | `import { type B, a, c } from 'mod';`                            |
| `inline-last`  | `import { a, c, type B } from 'mod';`                            |
| `mixed`        | `import { a, type B, c } from 'mod';`                            |

`separate` is the default. `import type T from 'mod'` and `import type * as ns from 'mod'` keep their original form.

Under [`verbatimModuleSyntax`](https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html), `import type { T }` and `import { type T }` have different runtime behavior. The plugin converts between them only when the same module also has a value import. Otherwise, it preserves the original form to avoid changing module loading behavior.

### Merging

With `esmImportMerge` enabled, imports from the same module are merged when safe.

Imports are not merged when their import attributes differ, comments cannot move safely, or default and namespace bindings conflict. Side-effect imports always remain separate.

## Export sorting

`esmExportSpecifierSort` sorts top-level `export { ... }` and `export type { ... }` entries by name. Aliased entries use their exported names.

Before sorting:

<!-- prettier-ignore -->
```typescript
export { useState, useEffect, type FC } from 'react';
```

After sorting:

```typescript
export { type FC, useEffect, useState } from 'react';
```

Export declarations themselves are not moved or merged.

## `package.json` sorting

`$schema` comes first in `package.json`. Other fields follow the default rules from [sort-package-json 4.0.0](https://github.com/keithamus/sort-package-json/blob/v4.0.0/defaultRules.md). These rules also determine the internal order of `scripts` and `exports`.

npm sorts dependency names with `String.prototype.localeCompare(..., 'en')`. pnpm uses the default order of `Array.prototype.sort()`, while Yarn compares strings with `<` and `>`. The latter two use UTF-16 code unit ordering, so punctuation can produce different results. For example, npm places `a_b` before `a-b`, while pnpm and Yarn use the opposite order. Because `package.json` uses npm's definition as its canonical reference, the plugin always uses npm's dependency comparator. `sort-package-json` instead switches the dependency comparator based on the package manager. This is the only difference between the plugin's sorting rules and those of `sort-package-json`.

Before sorting:

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

After sorting:

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

Set `packageSort` to `false` to disable field sorting without affecting Prettier's regular formatting.

## `tsconfig.json` sorting

The [TypeScript Handbook inheritance examples](https://www.typescriptlang.org/docs/handbook/tsconfig-json#tsconfig-bases) place `extends` before other settings, while its [file configuration examples](https://www.typescriptlang.org/docs/handbook/tsconfig-json#examples) place `files`, `include`, and `exclude` after `compilerOptions`. The plugin follows this layout and places `$schema` first by common JSON Schema convention. The resulting order is `$schema`, `extends`, other top-level fields, `files`, `include`, and `exclude`. Other top-level fields keep their relative order.

Options in `compilerOptions` follow the groups and order from the [`tsc --init` template in TypeScript 5.8.3](https://github.com/microsoft/TypeScript/blob/v5.8.3/src/compiler/commandLineParser.ts). Objects and arrays inside individual options keep their original order.

Before sorting:

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

After sorting:

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

Groups are separated by a blank line by default. Set `tsconfigSeparation` to `false` to remove these blank lines.

`stableTypeOrdering`, added in TypeScript 6.0, and `deduplicatePackages`, added in TypeScript 7.0, are not part of the 5.8.3 template and are therefore placed last. Other options not found in the template are handled the same way and keep their relative order.

Set `tsconfigSort` to `false` to disable field sorting without affecting Prettier's regular formatting.

## Options

Every option and its default are listed below:

| Option                   | Type              | Default                                                             | Description                                                              |
| ------------------------ | ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `esmImportSort`          | `boolean`         | `true`                                                              | Group and sort top-level static imports and the specifiers inside braces |
| `esmImportGroups`        | `ImportGroup[]`   | `["builtin", "external", "internal", "parent", "sibling", "index"]` | Set the order of import groups                                           |
| `esmImportSeparation`    | `boolean`         | `true`                                                              | Add blank lines between groups and above and below side-effect imports   |
| `esmImportTypeStyle`     | `TypeImportStyle` | `"separate"`                                                        | Control the form and order of type-only imports                          |
| `esmImportMerge`         | `boolean`         | `true`                                                              | Safely merge imports from the same module                                |
| `esmExportSpecifierSort` | `boolean`         | `true`                                                              | Sort specifiers inside `export { ... }`                                  |
| `packageSort`            | `boolean`         | `true`                                                              | Sort fields in `package.json`                                            |
| `tsconfigSort`           | `boolean`         | `true`                                                              | Sort fields in `tsconfig.json`                                           |
| `tsconfigSeparation`     | `boolean`         | `true`                                                              | Add blank lines between `compilerOptions` categories                     |

## Comments and sorting boundaries

To preserve runtime semantics and comment ownership, the following content separates the surrounding imports into independent sorting segments:

- Side-effect imports have execution semantics. They are not sorted and separate the surrounding sorting segments.
- A declaration marked with `prettier-ignore` is left untouched. Imports before and after it are sorted separately.
- A standalone comment separates the surrounding imports, while a comment attached to an import moves with that declaration.

Shebangs, Prettier file pragmas, and position-sensitive ESLint directives stay in place. Specialized declarations such as `import source`, `import defer`, and Flow `import typeof` may move within their segment but are never rewritten or merged.

An `export { ... }` declaration containing comments is left untouched. Comments in `tsconfig.json` only prevent fields in the same layer from being sorted. Top-level comments do not affect `compilerOptions`, and comments in `compilerOptions` do not affect top-level fields.

## Supported files

ES module sorting supports these Prettier parsers:

- `babel`
- `babel-flow`
- `babel-ts`
- `typescript`
- `flow`
- `acorn`
- `espree`
- `meriyah`

JavaScript and TypeScript **embedded code** in files such as Vue and Markdown is also sorted through these parsers.

The plugin only handles ES module syntax. It does not modify CommonJS `require()` or `module.exports`, or TypeScript `export =`.

`package.json` sorting supports the `json` and `json-stringify` parsers and applies only to files named `package.json`.

`tsconfig.json` sorting supports the `json` parser. The file must be named `tsconfig.json` or `tsconfig.*.json`.

## TypeScript configuration

The plugin also exports the `SortOptions`, `ImportGroup`, and `TypeImportStyle` types for use in TypeScript configuration files:

```typescript
import { type Config } from 'prettier';
import { type SortOptions } from 'prettier-plugin-sort';

export default {
  plugins: ['prettier-plugin-sort'],
  esmImportTypeStyle: 'inline-last',
} satisfies Config & SortOptions;
```
