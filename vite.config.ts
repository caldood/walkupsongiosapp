import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { precachePlugin } from './scripts/precache-plugin.ts';

// `base: './'` makes the build work from any sub-path (GitHub Pages project sites,
// custom domains, or a plain static folder) without configuration.
export default defineConfig({
  base: './',
  plugins: [react(), precachePlugin()],
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
