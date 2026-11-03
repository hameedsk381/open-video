import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The build goes where `ove ai studio` looks for it (packages/cli/studio; the published package gets a copy at studio/).
// In dev, requests for the API, the project files and the Player go to a running `ove ai studio` (default port 3100).
const target = process.env.OVE_STUDIO_URL ?? 'http://127.0.0.1:3100';
const forward = { target, changeOrigin: true, configure: (proxy: any) => { proxy.on('proxyReq', (req: any) => { if (req.getHeader('origin')) req.setHeader('origin', target); }); } };

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: '../../packages/cli/studio', emptyOutDir: true, target: 'es2022', sourcemap: false },
  server: { port: 5173, proxy: { '/api': forward, '/files': forward, '/player.js': forward, '/sfx': forward, '/fonts': forward } },
});
