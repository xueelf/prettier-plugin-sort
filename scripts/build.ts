import { type BuildConfig, $, build } from 'bun';
import { rm } from 'node:fs/promises';

import { journal } from 'annal';

import { compilerOptions } from '~/tsconfig.json';

const buildConfig: BuildConfig = {
  entrypoints: ['src/index.ts'],
  external: ['prettier', 'semver'],
  outdir: compilerOptions.outDir,
};

await rm(compilerOptions.outDir, { recursive: true, force: true });
journal.info(`${compilerOptions.outDir} directory removed`);

await $`tsc -p tsconfig.build.json`;
journal.info('Type declaration files generated');

await build(buildConfig);
journal.info('JavaScript bundle generated');
