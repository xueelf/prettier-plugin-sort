import { type Config } from 'prettier';

import { type SortOptions } from './src/options.ts';

export default {
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  arrowParens: 'avoid',
  endOfLine: 'lf',
  plugins: ['./dist/index.js'],
  esmImportTypeStyle: 'inline-first',
} satisfies Config & SortOptions;
