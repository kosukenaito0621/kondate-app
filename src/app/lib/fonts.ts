import type { ThemeSeries } from '../../shared/themes';

/**
 * テーマのシリーズごとに必要な Web フォントだけを読む（index.html の先読みスクリプトと内容を合わせる）。
 * かっこいいシリーズの本文は端末の日本語フォントを使い、数字だけ Outfit にする。
 */
export const FONT_CSS: Record<ThemeSeries, string> = {
  pastel:
    'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&family=Nunito:wght@600;700;800&display=swap',
  cool: 'https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&display=swap',
};

/** スクリプトから足したスタイルシートは描画を止めないので、文字はすぐ出て、届いたら切り替わる */
export function ensureFonts(series: ThemeSeries) {
  const href = FONT_CSS[series];
  if (document.querySelector(`link[data-fonts="${series}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.fonts = series;
  document.head.appendChild(link);
}
