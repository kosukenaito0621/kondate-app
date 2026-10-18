import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // TanStack Router plugin must come before the React plugin
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/app/routes',
      generatedRouteTree: './src/app/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
    cloudflare({
      viteEnvironment: { name: 'worker' },
      // Workers AI はリモート接続（要 `wrangler login`）。未ログインで動かすときは LOCAL_ONLY=1
      remoteBindings: process.env.LOCAL_ONLY !== '1',
    }),
  ],
  environments: {
    worker: { build: { sourcemap: true } },
  },
});
