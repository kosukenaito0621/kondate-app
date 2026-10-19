import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** オフラインでも直前に見た内容を出す API（GET のみ）。ログアウト時に消す */
export const API_CACHE = 'kd-api';

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
    VitePWA({
      // 入力途中で勝手に再読み込みしないよう、更新は画面のバナーから
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: '今日のごはん — 1週間の献立と買い物リスト',
        short_name: '今日のごはん',
        description: '1週間の献立と買い物リストを、かんたんに。',
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF8F3',
        theme_color: '#FFF8F3',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: '買い物リスト',
            url: '/shopping',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: '今週の献立',
            url: '/week',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        // API・ログインの往復は SPA に横取りさせない
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // 写真はキーが毎回新しいので、一度取ったら使い回す
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/api/images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kd-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // 献立・買い物・レシピなどは通信優先。電波が弱い売り場では直前の内容を出す
            urlPattern: ({ url, sameOrigin, request }) =>
              sameOrigin &&
              request.method === 'GET' &&
              /^\/api\/(me|today|plans|shopping|recipes|settings|logs|groups)(\/|$)/.test(
                url.pathname,
              ),
            handler: 'NetworkFirst',
            options: {
              cacheName: API_CACHE,
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'kd-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
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
