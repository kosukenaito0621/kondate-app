import { SEED_RECIPES } from './recipes';
import type { SeedRecipe } from './recipes/define';

const q = (v: string | number | null): string =>
  v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`;

/**
 * 初期レシピを投入する SQL 文の配列。何度実行しても同じ結果になる（冪等）。
 * レシピは ID で upsert し（献立から参照されていても消さない）、材料は入れ直す。
 */
export function seedStatements(): string[] {
  return SEED_RECIPES.flatMap(recipeStatements);
}

/** 1品分の内容を表すハッシュ（本番では、変わったレシピだけを書き直すのに使う） */
export function recipeHash(r: SeedRecipe): string {
  return hash(recipeStatements(r).join('\n'));
}

/** 文字列のハッシュ（cyrb53 を2本並べたもの。変更の検出に使うだけなので暗号強度は要らない） */
function hash(text: string): string {
  const run = (seed: number) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
  };
  return run(1) + run(2);
}

/** 書き込んだレシピのハッシュを記録する文 */
export const hashStatement = (r: SeedRecipe) =>
  `INSERT INTO seed_hashes (recipe_id, hash) VALUES (${q(r.id)}, ${q(recipeHash(r))}) ON CONFLICT(recipe_id) DO UPDATE SET hash = excluded.hash`;

export function recipeStatements(r: SeedRecipe): string[] {
  const out: string[] = [];
  {
    out.push(
      `INSERT INTO recipes (id, group_id, created_by, name, category, genre, servings, time_minutes, cost_yen, cost_level, main_ingredient, difficulty, steps, tags, image_key, source_url, seasons, season_only) VALUES (${[
        q(r.id),
        'NULL',
        'NULL',
        q(r.name),
        q(r.category),
        q(r.genre),
        r.servings,
        r.timeMinutes,
        r.costYen,
        q(r.costLevel),
        q(r.mainIngredient),
        q(r.difficulty),
        q(JSON.stringify(r.steps)),
        q(JSON.stringify(r.tags)),
        'NULL',
        'NULL',
        q(JSON.stringify(r.seasons)),
        r.seasonOnly ? 1 : 0,
      ].join(
        ', ',
      )}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, genre = excluded.genre, servings = excluded.servings, time_minutes = excluded.time_minutes, cost_yen = excluded.cost_yen, cost_level = excluded.cost_level, main_ingredient = excluded.main_ingredient, difficulty = excluded.difficulty, steps = excluded.steps, tags = excluded.tags, seasons = excluded.seasons, season_only = excluded.season_only, updated_at = unixepoch() * 1000`,
    );
    out.push(`DELETE FROM recipe_ingredients WHERE recipe_id = ${q(r.id)}`);
    r.ingredients.forEach((i, idx) => {
      out.push(
        `INSERT INTO recipe_ingredients (id, recipe_id, sort, name, quantity, unit, amount_text, section, group_label) VALUES (${[
          q(`${r.id}-${String(idx + 1).padStart(2, '0')}`),
          q(r.id),
          idx,
          q(i.name),
          q(i.quantity),
          q(i.unit),
          q(i.amountText),
          q(i.section),
          q(i.group ?? null),
        ].join(', ')})`,
      );
    });
  }
  return out;
}
