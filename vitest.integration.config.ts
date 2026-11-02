// Integration tests launch Chromium and FFmpeg, so they run separately: pnpm test:integration (CI runs them on Linux, macOS and Windows).
import { defineConfig } from 'vitest/config'; export default defineConfig({ cacheDir: 'node_modules/.vite', test:{include:['tests/integration/**/*.test.ts'],testTimeout:180_000,hookTimeout:180_000,fileParallelism:false}});
