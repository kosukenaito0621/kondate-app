import { DEFAULT_THEME, isThemeId, THEMES, type ThemeId } from '../../shared/themes';
import { ensureFonts } from './fonts';

const STORAGE_KEY = 'kd_theme';

/** 端末に記憶したテーマ（ログイン前・読み込み前の表示用） */
export function storedTheme(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isThemeId(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function currentTheme(): ThemeId {
  const v = document.documentElement.dataset.theme;
  return isThemeId(v) ? v : DEFAULT_THEME;
}

function setThemeAttributes(id: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = id;
  const series = THEMES.find((t) => t.id === id)?.series;
  if (series) ensureFonts(series);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const color = THEMES.find((t) => t.id === id)?.metaColor;
  if (meta && color) meta.content = color;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // プライベートモード等では記憶しない（表示には影響なし）
  }
}

/**
 * テーマを適用する。animate=true なら対応ブラウザでクロスフェード。
 * 動きを減らす設定のときはフェードしない。
 */
export function applyTheme(id: ThemeId, { animate = false } = {}) {
  if (currentTheme() === id && document.documentElement.dataset.theme) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animate && !reduce && 'startViewTransition' in document) {
    document.startViewTransition(() => setThemeAttributes(id));
  } else {
    setThemeAttributes(id);
  }
}
