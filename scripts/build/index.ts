import { rm } from 'node:fs/promises';

import { type BuildConfig, build } from 'bun';
import dts from 'bun-plugin-dts';

const outdir = 'dist';
const config = {
  entrypoints: ['src/index.ts'],
  outdir,
  packages: 'external',
  plugins: [dts()],
  target: 'node',
} satisfies BuildConfig;

await rm(outdir, { recursive: true, force: true });
await build(config);
