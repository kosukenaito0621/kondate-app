import type { Category, Genre, MainIngredient } from '../../src/shared/constants';
import { costLevelFor } from '../../src/shared/constants';
import { normalizeIngredientName, sectionOf } from '../../src/shared/ingredients';
import type { CookingLevel } from '../../src/shared/levels';
import { parseAmount, type RecipeInput } from '../../src/shared/recipe';

/**
 * 初期レシピの短縮記法（すべて2人前）。
 * - i: 材料「名前 分量」（例: "鶏もも肉 300g", "しょうゆ 大さじ2", "塩 少々"）。区分は材料辞書から引く
 *   グループ分けするときは "A: しょうゆ 大さじ1" のように見出しとコロンを前に付ける
 * - s: 手順。ふたばは [手順, コツ] の組で書く
 * - lv: 'f' = ふたば / 'm' = みのり
 * - 並び順が ID になるので、追加は各配列の末尾に行うこと
 */
export type SeedSpec = {
  n: string;
  t: number;
  c: number;
  m?: MainIngredient;
  lv: 'f' | 'm';
  i: string[];
  s: (string | [string, string])[];
  tags?: string[];
};

export type SeedRecipe = RecipeInput & { id: string; costLevel: ReturnType<typeof costLevelFor> };

export type SeedGroup = { category: Category; genre: Genre; specs: SeedSpec[] };

export const group = (category: Category, genre: Genre, specs: SeedSpec[]): SeedGroup => ({
  category,
  genre,
  specs,
});

function parseIngredientLine(raw: string, recipe: string) {
  const m = /^([^:]{1,20}):s*(.+)$/.exec(raw);
  const group = m ? m[1]!.trim() : null;
  const line = m ? m[2]! : raw;
  const at = line.lastIndexOf(' ');
  if (at <= 0) throw new Error(`[${recipe}] 材料の書式が不正: "${line}"`);
  const name = normalizeIngredientName(line.slice(0, at));
  const section = sectionOf(name);
  if (!section) throw new Error(`[${recipe}] 材料辞書にない材料: "${name}"`);
  return { name, section, group, ...parseAmount(line.slice(at + 1)) };
}

export function expand(g: SeedGroup): SeedRecipe[] {
  return g.specs.map((spec, idx) => {
    const difficulty: CookingLevel = spec.lv === 'f' ? 'futaba' : 'minori';
    return {
      id: `sys-${g.category}-${g.genre}-${String(idx + 1).padStart(2, '0')}`,
      name: spec.n,
      category: g.category,
      genre: g.genre,
      servings: 2,
      timeMinutes: spec.t,
      costYen: spec.c,
      costLevel: costLevelFor(g.category, spec.c),
      mainIngredient: spec.m ?? 'veg',
      difficulty,
      ingredients: spec.i.map((line) => parseIngredientLine(line, spec.n)),
      steps: spec.s.map((s) => (typeof s === 'string' ? { text: s } : { text: s[0], tip: s[1] })),
      tags: spec.tags ?? [],
      imageKey: null,
      sourceUrl: null,
    };
  });
}
