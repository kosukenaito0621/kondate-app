import { sql } from 'drizzle-orm';
import { EDIT_MEMO_CHOICES, SWAP_MEMO_CHOICES } from '../../shared/memo';
import type { Season } from '../../shared/season';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) =>
  integer(name, { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const LEVEL = ['futaba', 'minori'] as const;

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  /** 最後に使ったグループ */
  currentGroupId: text('current_group_id').references((): AnySQLiteColumn => groups.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at'),
});

export const sessions = sqliteTable(
  'sessions',
  {
    // SHA-256(token) の16進。生トークンは保存しない
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** 個人設定（グループで共有しないもの） */
export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('ichigo'),
  /** 未選択（オンボーディング前）は NULL */
  cookingLevel: text('cooking_level', { enum: LEVEL }),
  /** 使い方ガイドを最後まで見た（またはスキップした）時刻。NULL なら初回に表示する */
  guideSeenAt: integer('guide_seen_at'),
  /** 最後に見たお知らせの id（shared/news.ts） */
  newsSeenId: text('news_seen_id'),
  /** 日ごとメモがある日の入れ替えで「次回から確認しない」にした選択（NULL は毎回確認） */
  memoSwapChoice: text('memo_swap_choice', { enum: SWAP_MEMO_CHOICES }),
  /** 差し替え・作り直し・削除で「次回から確認しない」にした選択 */
  memoEditChoice: text('memo_edit_choice', { enum: EDIT_MEMO_CHOICES }),
});

/** 家庭（グループ）。献立・設定・買い物リスト・独自レシピを共有する単位 */
export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('🏠'),
  color: text('color').notNull().default('ichigo'), // 既定値はアプリ側で必ず指定する（変えるとテーブル作り直しになるため据え置き）
  defaultLevel: text('default_level', { enum: LEVEL }).notNull().default('minori'),
  /** 分量計算の人数。NULL ならメンバー数 */
  servings: integer('servings'),
  weeklyBudget: integer('weekly_budget').notNull().default(10000),
  ratioWa: integer('ratio_wa').notNull().default(50),
  ratioYo: integer('ratio_yo').notNull().default(30),
  ratioChu: integer('ratio_chu').notNull().default(20),
  buySeasonings: text('buy_seasonings', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  createdAt: timestamp('created_at'),
});

export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    joinedAt: timestamp('joined_at'),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index('group_members_user_idx').on(t.userId),
  ],
);

export const groupInvites = sqliteTable(
  'group_invites',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    /** 6文字の招待コード（紛らわしい文字を除いた英数字） */
    code: text('code').notNull().unique(),
    /** 招待リンク用トークンの SHA-256 */
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'number' }),
    createdAt: timestamp('created_at'),
  },
  (t) => [index('group_invites_group_idx').on(t.groupId)],
);

export const daySettings = sqliteTable(
  'day_settings',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(), // 0=月 … 6=日
    budgetLevel: text('budget_level', { enum: ['save', 'normal', 'rich'] })
      .notNull()
      .default('normal'),
    timeLevel: text('time_level', { enum: ['quick', 'normal', 'slow'] })
      .notNull()
      .default('normal'),
    sideMode: text('side_mode', { enum: ['auto', 'on', 'off'] })
      .notNull()
      .default('auto'),
    level: text('level', { enum: ['inherit', ...LEVEL] })
      .notNull()
      .default('inherit'),
    /** 予定：料理する／外食／テイクアウト */
    mode: text('day_mode', { enum: ['cook', 'eat_out', 'takeout'] })
      .notNull()
      .default('cook'),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.weekday] })],
);

export type StepRow = { text: string; tip?: string };

export const recipes = sqliteTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    /** 旧: 所有ユーザー（未使用）。子テーブルを守るため列は残す */
    legacyOwnerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }), // NULL=システム共通
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    category: text('category', { enum: ['main', 'soup', 'side'] }).notNull(),
    genre: text('genre', { enum: ['wa', 'yo', 'chu'] }).notNull(),
    servings: integer('servings').notNull().default(2),
    timeMinutes: integer('time_minutes').notNull(),
    costYen: integer('cost_yen').notNull(),
    costLevel: text('cost_level', { enum: ['save', 'normal', 'rich'] }).notNull(),
    mainIngredient: text('main_ingredient', {
      enum: ['chicken', 'pork', 'beef', 'fish', 'egg', 'tofu', 'veg', 'other'],
    }).notNull(),
    difficulty: text('difficulty', { enum: LEVEL }).notNull().default('minori'),
    steps: text('steps', { mode: 'json' }).$type<StepRow[]>().notNull(),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    imageKey: text('image_key'),
    sourceUrl: text('source_url'),
    /** 旬・季節限定の季節（空なら通年）。shared/season.ts */
    seasons: text('seasons', { mode: 'json' })
      .$type<Season[]>()
      .notNull()
      .default(sql`'[]'`),
    /** true なら季節限定（季節外は献立に出さない） */
    seasonOnly: integer('season_only', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [index('recipes_group_category_idx').on(t.groupId, t.category)],
);

export const recipeIngredients = sqliteTable(
  'recipe_ingredients',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    sort: integer('sort').notNull(),
    name: text('name').notNull(),
    quantity: real('quantity'),
    unit: text('unit'),
    amountText: text('amount_text'),
    /** 「A（たれ）」「B」など、まとめて使う材料の見出し。同じ調味料でも別のグループなら別物として扱う */
    groupLabel: text('group_label'),
    section: text('section', {
      enum: ['veg', 'meat', 'fish', 'dairy_egg', 'soy', 'dry', 'seasoning', 'other'],
    }).notNull(),
  },
  (t) => [index('recipe_ingredients_recipe_idx').on(t.recipeId)],
);

export const hiddenRecipes = sqliteTable(
  'hidden_recipes',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.recipeId] })],
);

export const mealPlans = sqliteTable(
  'meal_plans',
  {
    id: text('id').primaryKey(),
    /** 作成者（旧 user_id 列をそのまま使う。子テーブルを守るため作り直さない） */
    createdBy: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** アプリ側で必ず設定する（既存テーブルへの追加列のため DB 上は NULL 可） */
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    weekStart: text('week_start').notNull(), // YYYY-MM-DD（月曜）
    estimatedCost: integer('estimated_cost').notNull().default(0),
    /** その週だけの予定の変更（日付 → 料理する／外食／テイクアウト）。曜日の設定より優先 */
    dayModes: text('day_modes', { mode: 'json' })
      .$type<Record<string, 'cook' | 'eat_out' | 'takeout'>>()
      .notNull()
      .default(sql`'{}'`),
    version: integer('version').notNull().default(1),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull().default(0),
    createdAt: timestamp('created_at'),
  },
  (t) => [uniqueIndex('meal_plans_group_week_uq').on(t.groupId, t.weekStart)],
);

export const mealPlanItems = sqliteTable(
  'meal_plan_items',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    slot: text('slot', { enum: ['main', 'soup', 'side'] }).notNull(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull().default(0),
  },
  (t) => [uniqueIndex('meal_plan_items_slot_uq').on(t.planId, t.date, t.slot)],
);

export const shoppingItems = sqliteTable(
  'shopping_items',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => mealPlans.id, { onDelete: 'cascade' }),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    section: text('section').notNull(),
    quantity: real('quantity'),
    unit: text('unit'),
    amountText: text('amount_text'),
    sources: text('sources', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
    checkedBy: text('checked_by').references(() => users.id, { onDelete: 'set null' }),
    checkedAt: integer('checked_at', { mode: 'number' }),
    isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
    sort: integer('sort').notNull().default(0),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [index('shopping_items_plan_idx').on(t.planId)],
);

export const aiUsage = sqliteTable(
  'ai_usage',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // JST日付
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

/** 簡易レート制限（キー×時間枠ごとの回数）。招待コードの総当たり対策など */
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    window: text('window').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.window] })],
);

/** 自炊記録：グループで「作った」料理（同じ日に同じレシピは1回） */
export const cookLogs = sqliteTable(
  'cook_logs',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // JST日付
    /** 作った料理の写真（R2 のキー） */
    imageKey: text('image_key'),
    createdAt: timestamp('created_at'),
  },
  (t) => [
    uniqueIndex('cook_logs_group_recipe_date_uq').on(t.groupId, t.recipeId, t.date),
    index('cook_logs_group_date_idx').on(t.groupId, t.date),
  ],
);

/** レシピの共有リンク（別のグループの人に送って、相手のレシピとして保存してもらう） */
export const recipeShares = sqliteTable(
  'recipe_shares',
  {
    id: text('id').primaryKey(),
    /** 共有リンク用トークンの SHA-256（生トークンは保存しない） */
    tokenHash: text('token_hash').notNull().unique(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at'),
  },
  (t) => [index('recipe_shares_recipe_idx').on(t.recipeId)],
);

/** まとめて送るときの共有リンク（複数のレシピを1つのリンクで送る） */
export const recipeShareBundles = sqliteTable('recipe_share_bundles', {
  id: text('id').primaryKey(),
  /** 共有リンク用トークンの SHA-256 */
  tokenHash: text('token_hash').notNull().unique(),
  /** 「実家の味」などの題名（任意） */
  title: text('title'),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at'),
});

export const recipeShareBundleItems = sqliteTable(
  'recipe_share_bundle_items',
  {
    bundleId: text('bundle_id')
      .notNull()
      .references(() => recipeShareBundles.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    sort: integer('sort').notNull(),
  },
  (t) => [primaryKey({ columns: [t.bundleId, t.recipeId] })],
);

/** 日ごとメモ（グループ × 日付で1件。古いものは Cron で消す） */
export const dayMemos = sqliteTable(
  'day_memos',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    body: text('body').notNull(),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.date] }), index('day_memos_date_idx').on(t.date)],
);

/** 本番へ入れた初期レシピの内容のハッシュ（変わったレシピだけを書き直し、D1 の書き込み回数を抑える） */
export const seedHashes = sqliteTable('seed_hashes', {
  recipeId: text('recipe_id').primaryKey(),
  hash: text('hash').notNull(),
});
