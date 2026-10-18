import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) =>
  integer(name, { mode: 'number' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
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

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  weeklyBudget: integer('weekly_budget').notNull().default(10000),
  ratioWa: integer('ratio_wa').notNull().default(50),
  ratioYo: integer('ratio_yo').notNull().default(30),
  ratioChu: integer('ratio_chu').notNull().default(20),
  servings: integer('servings').notNull().default(2),
  buySeasonings: text('buy_seasonings', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
});

export const daySettings = sqliteTable(
  'day_settings',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekday] })],
);

export const recipes = sqliteTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }), // NULL=システム共通
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
    steps: text('steps', { mode: 'json' }).$type<string[]>().notNull(),
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    imageKey: text('image_key'),
    sourceUrl: text('source_url'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at'),
  },
  (t) => [index('recipes_owner_category_idx').on(t.ownerId, t.category)],
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
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.recipeId] })],
);

export const mealPlans = sqliteTable(
  'meal_plans',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekStart: text('week_start').notNull(), // YYYY-MM-DD（月曜）
    estimatedCost: integer('estimated_cost').notNull().default(0),
    createdAt: timestamp('created_at'),
  },
  (t) => [uniqueIndex('meal_plans_user_week_uq').on(t.userId, t.weekStart)],
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
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
