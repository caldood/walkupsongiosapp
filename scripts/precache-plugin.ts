import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * After the build, lists every emitted file into `sw.js` (precache) and stamps a build id so
 * each deploy replaces the old cache. Deliberately tiny: no Workbox dependency.
 */
export function precachePlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'precache-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = join(outDir, 'sw.js');
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js');
      const src = readFileSync(swPath, 'utf8');
      const buildId = Date.now().toString(36);
      writeFileSync(swPath, src.replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify(['./', ...files])));
    },
  };
}
