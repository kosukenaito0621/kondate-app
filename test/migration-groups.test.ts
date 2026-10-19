import { applyD1Migrations, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

/**
 * 0002/0003（グループ化）が既存データを壊さないことを確認する。
 * グループ化前（0000〜0001）の状態にデータを入れてから残りを適用する。
 */
describe('マイグレーション: グループ化', () => {
  it('既存ユーザーの設定・レシピ・献立・買い物リストが自分のグループへ移る', async () => {
    const db = env.MIGRATION_DB;
    const before = env.TEST_MIGRATIONS.filter((m) => /^000[01]_/.test(m.name));
    const after = env.TEST_MIGRATIONS.filter((m) => !/^000[01]_/.test(m.name));
    expect(after.map((m) => m.name).slice(0, 2)).toEqual([
      '0002_groups_add.sql',
      '0003_groups_finalize.sql',
    ]);

    await applyD1Migrations(db, before);
    const now = 1_700_000_000_000;
    await db.batch(
      [
        `insert into users (id, google_sub, email, display_name) values ('u1','g1','a@example.com','こうすけ'), ('u2','g2','b@example.com',null)`,
        `insert into user_settings (user_id, weekly_budget, ratio_wa, ratio_yo, ratio_chu, servings, theme, buy_seasonings) values ('u1', 12000, 60, 20, 20, 3, 'midnight', '["みりん"]')`,
        `insert into day_settings (user_id, weekday, budget_level, time_level, side_mode) values ('u1', 0, 'save', 'quick', 'off'), ('u1', 5, 'rich', 'slow', 'on')`,
        `insert into recipes (id, owner_id, name, category, genre, servings, time_minutes, cost_yen, cost_level, main_ingredient, steps) values
          ('sys-1', null, 'システム料理', 'main', 'wa', 2, 10, 300, 'save', 'egg', '["焼く","盛る"]'),
          ('r1', 'u1', '自分の料理', 'side', 'yo', 2, 5, 100, 'save', 'veg', '["切る"]')`,
        `insert into recipe_ingredients (id, recipe_id, sort, name, quantity, unit, section) values ('i1','sys-1',0,'卵',2,'個','dairy_egg'), ('i2','r1',0,'トマト',1,'個','veg')`,
        `insert into hidden_recipes (user_id, recipe_id) values ('u1', 'sys-1')`,
        `insert into meal_plans (id, user_id, week_start, created_at) values ('p1', 'u1', '2026-10-12', ${now})`,
        `insert into meal_plan_items (id, plan_id, date, slot, recipe_id) values ('mi1','p1','2026-10-12','main','sys-1'), ('mi2','p1','2026-10-12','side','r1')`,
        `insert into shopping_items (id, plan_id, user_id, name, section, checked) values ('s1','p1','u1','卵','dairy_egg',1)`,
      ].map((q) => db.prepare(q)),
    );

    await applyD1Migrations(db, after);

    const q = <T>(sql: string) =>
      db
        .prepare(sql)
        .all<T>()
        .then((r) => r.results);

    // グループとメンバー
    expect(
      await q(
        `select id, name, color, servings, weekly_budget, ratio_wa, buy_seasonings from groups order by id`,
      ),
    ).toEqual([
      {
        id: 'solo-u1',
        name: 'こうすけ',
        color: 'midnight',
        servings: 3,
        weekly_budget: 12000,
        ratio_wa: 60,
        buy_seasonings: '["みりん"]',
      },
      {
        id: 'solo-u2',
        name: 'わたし',
        color: 'ichigo',
        servings: 2,
        weekly_budget: 10000,
        ratio_wa: 50,
        buy_seasonings: '[]',
      },
    ]);
    expect(await q(`select group_id, user_id, role from group_members order by user_id`)).toEqual([
      { group_id: 'solo-u1', user_id: 'u1', role: 'owner' },
      { group_id: 'solo-u2', user_id: 'u2', role: 'owner' },
    ]);
    expect(await q(`select id, current_group_id from users order by id`)).toEqual([
      { id: 'u1', current_group_id: 'solo-u1' },
      { id: 'u2', current_group_id: 'solo-u2' },
    ]);

    // 個人設定は残り、共有設定の列は消える
    expect(await q(`select * from user_settings`)).toEqual([
      {
        user_id: 'u1',
        theme: 'midnight',
        cooking_level: null,
        guide_seen_at: null,
        news_seen_id: null,
        memo_swap_choice: null,
        memo_edit_choice: null,
      },
    ]);

    // 曜日設定はグループへ
    expect(
      await q(
        `select group_id, weekday, budget_level, time_level, side_mode, level from day_settings order by weekday`,
      ),
    ).toEqual([
      {
        group_id: 'solo-u1',
        weekday: 0,
        budget_level: 'save',
        time_level: 'quick',
        side_mode: 'off',
        level: 'inherit',
      },
      {
        group_id: 'solo-u1',
        weekday: 5,
        budget_level: 'rich',
        time_level: 'slow',
        side_mode: 'on',
        level: 'inherit',
      },
    ]);

    // レシピ：独自レシピはグループへ、システムは NULL のまま。手順は {text} 形式に
    expect(
      await q(`select id, group_id, created_by, difficulty, steps from recipes order by id`),
    ).toEqual([
      {
        id: 'r1',
        group_id: 'solo-u1',
        created_by: 'u1',
        difficulty: 'minori',
        steps: '[{"text":"切る"}]',
      },
      {
        id: 'sys-1',
        group_id: null,
        created_by: null,
        difficulty: 'minori',
        steps: '[{"text":"焼く"},{"text":"盛る"}]',
      },
    ]);

    // 子テーブルが消えていない
    expect(await q(`select id from recipe_ingredients order by id`)).toEqual([
      { id: 'i1' },
      { id: 'i2' },
    ]);
    expect(await q(`select id, updated_at from meal_plan_items order by id`)).toEqual([
      { id: 'mi1', updated_at: now },
      { id: 'mi2', updated_at: now },
    ]);
    expect(await q(`select group_id, recipe_id from hidden_recipes`)).toEqual([
      { group_id: 'solo-u1', recipe_id: 'sys-1' },
    ]);
    expect(await q(`select id, group_id, version, updated_by from meal_plans`)).toEqual([
      { id: 'p1', group_id: 'solo-u1', version: 1, updated_by: 'u1' },
    ]);
    expect(await q(`select id, group_id, checked from shopping_items`)).toEqual([
      { id: 's1', group_id: 'solo-u1', checked: 1 },
    ]);
  });
});
