import { defineConfig } from 'vitest/config';

// Several unit tests start a browser, FFmpeg or a bundler. They finish in seconds alone but pass the 5 s default when the whole suite runs at once.
export default defineConfig({ cacheDir: 'node_modules/.vite', test: { include: ['tests/unit/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 } });
