import { expand, type SeedRecipe } from './define';
import mainChu from './main-chu';
import mainWa from './main-wa';
import mainYo from './main-yo';
import { sideChu, sideWa, sideYo } from './side';
import { soupChu, soupWa, soupYo } from './soup';

export const SEED_GROUPS = [
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

/** 初期レシピ（システム共通）110件 */
export const SEED_RECIPES: SeedRecipe[] = SEED_GROUPS.flatMap(expand);
