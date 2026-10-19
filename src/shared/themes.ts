// テーマ一覧。色の実体は src/app/styles/themes.css の [data-theme] に定義する
export const THEME_IDS = [
  'ichigo',
  'peach',
  'lavender',
  'sakura',
  'midnight',
  'graphite',
  'forest',
  'bordeaux',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'ichigo';

export type ThemeSeries = 'pastel' | 'cool';

export type ThemeMeta = {
  id: ThemeId;
  name: string;
  description: string;
  series: ThemeSeries;
  /** ブラウザのアドレスバー等の色（meta theme-color） */
  metaColor: string;
  /** 選択画面のプレビュー用 [背景, アクセント, サブ] */
  swatch: [string, string, string];
};

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'ichigo',
    name: 'いちごミルク',
    description: 'ピンク × イエロー',
    series: 'pastel',
    metaColor: '#FFF8F3',
    swatch: ['#FFF8F3', '#F7B8C8', '#FCE38A'],
  },
  {
    id: 'peach',
    name: 'ピーチレモン',
    description: 'ピーチ × レモン × ミント',
    series: 'pastel',
    metaColor: '#FFFAF2',
    swatch: ['#FFFAF2', '#FFC8A8', '#FFF1A6'],
  },
  {
    id: 'lavender',
    name: 'ラベンダーバナナ',
    description: 'ラベンダー × バナナ',
    series: 'pastel',
    metaColor: '#FBF8FF',
    swatch: ['#FBF8FF', '#D9C8F2', '#FBE7A1'],
  },
  {
    id: 'sakura',
    name: 'さくら抹茶',
    description: 'さくら × 抹茶ミルク',
    series: 'pastel',
    metaColor: '#FFF9F6',
    swatch: ['#FFF9F6', '#F9CBD6', '#DCE8C6'],
  },
  {
    id: 'midnight',
    name: 'ミッドナイト',
    description: '濃紺 × ゴールド',
    series: 'cool',
    metaColor: '#0E1424',
    swatch: ['#0E1424', '#D4AF6A', '#4A6FA5'],
  },
  {
    id: 'graphite',
    name: 'グラファイト',
    description: '墨黒 × エンバーオレンジ',
    series: 'cool',
    metaColor: '#121212',
    swatch: ['#121212', '#FF6B3D', '#8A8A8A'],
  },
  {
    id: 'forest',
    name: 'フォレスト',
    description: '深緑 × 真鍮',
    series: 'cool',
    metaColor: '#0F1A16',
    swatch: ['#0F1A16', '#C9A66B', '#3F6B57'],
  },
  {
    id: 'bordeaux',
    name: 'ボルドー',
    description: 'ワイン × シャンパン',
    series: 'cool',
    metaColor: '#1A0F14',
    swatch: ['#1A0F14', '#E9C9A8', '#7A2A44'],
  },
];

export const SERIES_LABEL: Record<ThemeSeries, string> = {
  pastel: 'パステル',
  cool: 'ノワール',
};

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}
