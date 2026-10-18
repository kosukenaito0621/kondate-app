// レシピ・献立で使う区分の定義（フロント・バック・シード共通）

export const CATEGORIES = ['main', 'soup', 'side'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  main: '主菜',
  soup: '汁物',
  side: '副菜',
};

export const GENRES = ['wa', 'yo', 'chu'] as const;
export type Genre = (typeof GENRES)[number];
export const GENRE_LABEL: Record<Genre, string> = { wa: '和食', yo: '洋食', chu: '中華' };

export const LEVELS = ['save', 'normal', 'rich'] as const;
export type CostLevel = (typeof LEVELS)[number];
export const COST_LEVEL_LABEL: Record<CostLevel, string> = {
  save: '節約',
  normal: '標準',
  rich: 'ゆとり',
};

export const TIME_LEVELS = ['quick', 'normal', 'slow'] as const;
export type TimeLevel = (typeof TIME_LEVELS)[number];
export const TIME_LEVEL_LABEL: Record<TimeLevel, string> = {
  quick: '時短',
  normal: 'ほどよく',
  slow: 'じっくり',
};

/** 料理時間の段階ごとの上限（分）。じっくりは上限なし */
export const TIME_LIMIT: Record<TimeLevel, number> = { quick: 20, normal: 40, slow: Infinity };

export const MAIN_INGREDIENTS = [
  'chicken',
  'pork',
  'beef',
  'fish',
  'egg',
  'tofu',
  'veg',
  'other',
] as const;
export type MainIngredient = (typeof MAIN_INGREDIENTS)[number];
export const MAIN_INGREDIENT_LABEL: Record<MainIngredient, string> = {
  chicken: '鶏肉',
  pork: '豚肉',
  beef: '牛肉',
  fish: '魚介',
  egg: '卵',
  tofu: '豆腐・大豆',
  veg: '野菜',
  other: 'その他',
};

/** 材料区分。配列の順＝売り場順（買い物リストの並び） */
export const SECTIONS = [
  'veg',
  'meat',
  'fish',
  'dairy_egg',
  'soy',
  'dry',
  'other',
  'seasoning',
] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = {
  veg: '野菜・果物',
  meat: '肉',
  fish: '魚介',
  dairy_egg: '卵・乳製品',
  soy: '豆腐・大豆製品',
  dry: '乾物・麺',
  other: 'その他',
  seasoning: '調味料',
};

export const UNITS = [
  'g',
  'kg',
  'ml',
  'L',
  '個',
  '本',
  '枚',
  '切れ',
  '尾',
  '丁',
  'パック',
  '袋',
  '束',
  '株',
  '片',
  'かけ',
  '玉',
  '缶',
  '大さじ',
  '小さじ',
  'カップ',
] as const;
export type Unit = (typeof UNITS)[number];

/**
 * 費用（円・2人前換算）から費用段階を決める。カテゴリごとに基準が違う。
 * 例: 主菜 ≤350円=節約, ≤700円=ふつう, それ以上=ゆとり
 */
export const COST_THRESHOLDS: Record<Category, [number, number]> = {
  main: [350, 700],
  soup: [120, 250],
  side: [130, 260],
};

export function costLevelFor(category: Category, costYen: number): CostLevel {
  const [save, normal] = COST_THRESHOLDS[category];
  return costYen <= save ? 'save' : costYen <= normal ? 'normal' : 'rich';
}

export function timeLevelFits(level: TimeLevel, minutes: number): boolean {
  return minutes <= TIME_LIMIT[level];
}
