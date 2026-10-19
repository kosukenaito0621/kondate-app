import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// public/icon.svg から PWA 用アイコン（通常・マスカブル・Apple）を作る
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0,
      resizeOptions: { background: '#FFD9C2' },
    },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#FFD9C2' } },
  },
  images: ['public/icon.svg'],
});
