import { type BunPlugin, $ } from 'bun';
import { rm } from 'node:fs/promises';

import { journal } from 'annal';

import { compilerOptions } from '~/tsconfig.json';

export function rmPlugin(): BunPlugin {
  return {
    name: 'rm',
    async setup(): Promise<void> {
      await rm(compilerOptions.outDir, { recursive: true, force: true });
      journal.info(`${compilerOptions.outDir} directory removed`);
    },
  };
}

export function dtsPlugin(): BunPlugin {
  return {
    name: 'dts',
    async setup(): Promise<void> {
      await $`tsc -p tsconfig.build.json`;
      journal.info('Type declaration files generated');
    },
  };
}
