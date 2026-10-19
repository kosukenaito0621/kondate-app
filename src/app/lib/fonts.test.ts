import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../shared/themes';
import { FONT_CSS } from './fonts';

describe('フォントの先読み（index.html）', () => {
  const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');

  it('かっこいいシリーズのテーマ一覧が themes.ts と一致する', () => {
    const listed = /\^\(([a-z|]+)\)\$/.exec(html)?.[1]?.split('|').sort();
    const cool = THEMES.filter((t) => t.series === 'cool')
      .map((t) => t.id)
      .sort();
    expect(listed).toEqual(cool);
  });

  it('読み込む URL が fonts.ts と一致する', () => {
    for (const href of Object.values(FONT_CSS)) expect(html).toContain(href);
  });
});
