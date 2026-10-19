import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// public/icon.svg から PWA 用アイコンを作る（scripts/build-icons.ts から呼ぶ。マスカブルはそちらで作り直す）
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0,
      resizeOptions: { background: '#FFF8EC' },
    },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#FFF8EC' } },
  },
  images: ['public/icon.svg'],
});
