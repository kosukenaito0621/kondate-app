import { sql } from 'drizzle-orm';
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
});

/** 家庭（グループ）。献立・設定・買い物リスト・独自レシピを共有する単位 */
export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('🏠'),
  color: text('color').notNull().default('ichigo'),
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
