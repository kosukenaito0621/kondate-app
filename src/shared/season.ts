/**
 * 季節。献立を作るとき、旬のレシピを出やすくし、季節限定のレシピは季節外に出さない。
 * 日本の暦に合わせて 春=3〜5月 / 夏=6〜8月 / 秋=9〜11月 / 冬=12〜2月。
 */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_LABEL: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
};

/** 'YYYY-MM-DD' の日付の季節 */
export function seasonOf(date: string): Season {
  const month = Number(date.slice(5, 7));
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/**
 * 旬がはっきりしていて、季節感の出る材料（正式名）。
 * 一年中よく使う材料（玉ねぎ・トマト・大根など）や、水煮で通年使う材料（たけのこ）は入れない。
 * 入れると、ほとんどの料理に季節が付いてしまうため。たけのこご飯などはレシピ側で季節を指定する。
 */
export const SEASONAL_INGREDIENTS: Readonly<Record<string, Season>> = {
  菜の花: 'spring',
  新玉ねぎ: 'spring',
  新じゃが: 'spring',
  春キャベツ: 'spring',
  アスパラガス: 'spring',
  スナップえんどう: 'spring',
  グリーンピース: 'spring',
  ゴーヤ: 'summer',
  オクラ: 'summer',
  とうもろこし: 'summer',
  みょうが: 'summer',
  ズッキーニ: 'summer',
  枝豆: 'summer',
  なす: 'summer',
  なめこ: 'autumn',
  かぼちゃ: 'autumn',
  さつまいも: 'autumn',
  里芋: 'autumn',
  栗: 'autumn',
  さんま: 'autumn',
  しめじ: 'autumn',
  えのき: 'autumn',
  しいたけ: 'autumn',
  まいたけ: 'autumn',
  エリンギ: 'autumn',
  きのこ: 'autumn',
  白菜: 'winter',
  春菊: 'winter',
  かぶ: 'winter',
  ぶり: 'winter',
  かき: 'winter',
  ゆず: 'winter',
};

/** 材料（正規化済みの名前）から旬の季節を推定する。季節の並び順にそろえて返す */
export function seasonsFromIngredients(names: readonly string[]): Season[] {
  const found = new Set(names.map((n) => SEASONAL_INGREDIENTS[n]).filter(Boolean));
  return SEASONS.filter((s) => found.has(s));
}

/**
 * レシピの季節の扱い。
 * - seasons が空：通年
 * - seasonOnly=false：旬（その季節に出やすく、季節外は少し出にくい）
 * - seasonOnly=true：季節限定（その季節以外は献立に出さない。冷やし中華・おでん など）
 */
export type RecipeSeason = { seasons: Season[]; seasonOnly: boolean };

export function isInSeason(r: RecipeSeason, season: Season) {
  return r.seasons.length > 0 && r.seasons.includes(season);
}

/** 季節限定で、いまは季節外 */
export function isOutOfSeasonOnly(r: RecipeSeason, season: Season) {
  return r.seasonOnly && r.seasons.length > 0 && !r.seasons.includes(season);
}

/** 表示用：「秋が旬」「夏だけ」「春・秋が旬」 */
export function seasonBadge(r: RecipeSeason): string | null {
  if (r.seasons.length === 0) return null;
  const label = r.seasons.map((s) => SEASON_LABEL[s]).join('・');
  return r.seasonOnly ? `${label}だけ` : `${label}が旬`;
}
