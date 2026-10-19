import { SEED_RECIPES } from './recipes';

const q = (v: string | number | null): string =>
  v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`;

/**
 * 初期レシピを投入する SQL 文の配列。何度実行しても同じ結果になる（冪等）。
 * レシピは ID で upsert し（献立から参照されていても消さない）、材料は入れ直す。
 */
export function seedStatements(): string[] {
  const out: string[] = [];
  for (const r of SEED_RECIPES) {
    out.push(
      `INSERT INTO recipes (id, group_id, created_by, name, category, genre, servings, time_minutes, cost_yen, cost_level, main_ingredient, difficulty, steps, tags, image_key, source_url) VALUES (${[
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
      ].join(
        ', ',
      )}) ON CONFLICT(id) DO UPDATE SET name = excluded.name, category = excluded.category, genre = excluded.genre, servings = excluded.servings, time_minutes = excluded.time_minutes, cost_yen = excluded.cost_yen, cost_level = excluded.cost_level, main_ingredient = excluded.main_ingredient, difficulty = excluded.difficulty, steps = excluded.steps, tags = excluded.tags, updated_at = unixepoch() * 1000`,
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
