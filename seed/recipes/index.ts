import { expand, type SeedExtra, type SeedGroup, type SeedRecipe } from './define';
import mainChu from './main-chu';
import mainWa from './main-wa';
import mainYo from './main-yo';
import { sideChu, sideWa, sideYo } from './side';
import { soupChu, soupWa, soupYo } from './soup';
import batch01 from './more/batch01';
import batch02 from './more/batch02';
import batch03 from './more/batch03';
import batch04 from './more/batch04';

const BASE_GROUPS: SeedGroup[] = [
  mainWa,
  mainYo,
  mainChu,
  soupWa,
  soupYo,
  soupChu,
  sideWa,
  sideYo,
  sideChu,
];

/**
 * 追加分（バッチごと）。各カテゴリ×ジャンルの末尾に順番に足すので、
 * 既存のレシピの ID は変わらない。バッチの順番は入れ替えないこと。
 */
const EXTRAS: SeedExtra[] = [batch01, batch02, batch03, batch04];

export const SEED_GROUPS: SeedGroup[] = BASE_GROUPS.map((g) => ({
  ...g,
  specs: [...g.specs, ...EXTRAS.flatMap((e) => e[`${g.category}-${g.genre}`] ?? [])],
}));

/** 初期レシピ（システム共通） */
export const SEED_RECIPES: SeedRecipe[] = SEED_GROUPS.flatMap(expand);
