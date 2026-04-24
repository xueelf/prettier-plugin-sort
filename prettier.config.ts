import { type Config } from 'prettier';

import sortPlugin, { type SortOptions } from './dist/index.js';

export default {
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  arrowParens: 'avoid',
  endOfLine: 'lf',
  plugins: [sortPlugin],
  importOrderTypeImports: 'inline-first',
} satisfies Config & SortOptions;
