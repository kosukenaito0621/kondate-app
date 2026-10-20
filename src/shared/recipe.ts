import { z } from 'zod';
import {
  CATEGORIES,
  GENRES,
  LEVELS,
  MAIN_INGREDIENTS,
  SECTIONS,
  UNITS,
  type Section,
  type Unit,
} from './constants';
import { COOKING_LEVELS, type CookingLevel } from './levels';
import { SEASONS, type Season } from './season';

// ===== 分量の読み取り =====

export type Amount = { quantity: number | null; unit: Unit | null; amountText: string | null };

const PREFIX_UNITS = ['大さじ', '小さじ', 'カップ'] as const;

function parseNumber(s: string): number | null {
  // "1と1/2" "1/2" "1.5" "2"
  const m = s.match(/^(\d+(?:\.\d+)?)(?:と(\d+)\/(\d+))?$|^(\d+)\/(\d+)$/);
  if (!m) return null;
  if (m[4]) return Number(m[4]) / Number(m[5]);
  const whole = Number(m[1]);
  return m[2] ? whole + Number(m[2]) / Number(m[3]) : whole;
}

/**
 * 分量の表記を数量・単位に分解する。
 * "300g" / "1/2個" / "大さじ1と1/2" / "少々" / "2〜3枚"（→ 先頭の数で計算し表記も保持）
 */
export function parseAmount(raw: string): Amount {
  const s = raw.normalize('NFKC').replace(/\s+/g, '');
  if (!s) return { quantity: null, unit: null, amountText: null };

  for (const unit of PREFIX_UNITS) {
    if (s.startsWith(unit)) {
      const q = parseNumber(s.slice(unit.length));
      if (q !== null) return { quantity: q, unit, amountText: null };
    }
  }

  const range = s.match(/^(\d+(?:\.\d+)?)[〜~-](\d+(?:\.\d+)?)(.+)$/);
  if (range && (UNITS as readonly string[]).includes(range[3]!)) {
    return { quantity: Number(range[1]), unit: range[3] as Unit, amountText: s };
  }

  const m = s.match(/^([\d./と]+)(.+)$/);
  if (m) {
    const q = parseNumber(m[1]!);
    if (q !== null && (UNITS as readonly string[]).includes(m[2]!)) {
      return { quantity: q, unit: m[2] as Unit, amountText: null };
    }
  }
  // 少々・適量・ひとつまみ など
  return { quantity: null, unit: null, amountText: s };
}

/** 表示用の分量（例: 大さじ1と1/2, 300g, 1/2個） */
export function formatAmount(a: {
  quantity: number | null;
  unit: string | null;
  amountText: string | null;
}): string {
  if (a.amountText) return a.amountText;
  if (a.quantity === null) return '';
  const q = formatQuantity(a.quantity);
  if (!a.unit) return q;
  return (PREFIX_UNITS as readonly string[]).includes(a.unit) ? `${a.unit}${q}` : `${q}${a.unit}`;
}

const FRACTIONS: [number, string][] = [
  [0.25, '1/4'],
  [1 / 3, '1/3'],
  [0.5, '1/2'],
  [2 / 3, '2/3'],
  [0.75, '3/4'],
];

export function formatQuantity(n: number): string {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (frac < 0.01) return String(whole);
  const f = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.02);
  if (!f) return String(Math.round(n * 10) / 10);
  return whole === 0 ? f[1] : `${whole}と${f[1]}`;
}

// ===== レシピの入力スキーマ =====

export const ingredientInputSchema = z.object({
  name: z.string().trim().min(1, '材料名を入力してください').max(40),
  quantity: z.number().positive().max(100000).nullable(),
  unit: z.enum(UNITS).nullable(),
  amountText: z.string().trim().max(20).nullable(),
  section: z.enum(SECTIONS),
  /** 「A（たれ）」「B」などの見出し。null はグループなし */
  group: z.string().trim().max(20).nullish(),
});

/** 手順。tip は初心者向けのひとことコツ（わかばのレシピでは全手順に入れる） */
export const stepSchema = z.object({
  text: z.string().trim().min(1).max(400),
  tip: z.string().trim().min(1).max(200).optional(),
});
export type Step = z.infer<typeof stepSchema>;

export const recipeInputSchema = z.object({
  name: z.string().trim().min(1, '料理名を入力してください').max(60),
  category: z.enum(CATEGORIES),
  genre: z.enum(GENRES),
  servings: z.number().int().min(1).max(12),
  timeMinutes: z.number().int().min(1, '調理時間を入力してください').max(600),
  costYen: z.number().int().min(0).max(100000),
  mainIngredient: z.enum(MAIN_INGREDIENTS),
  difficulty: z.enum(COOKING_LEVELS),
  ingredients: z.array(ingredientInputSchema).min(1, '材料を1つ以上入力してください').max(50),
  steps: z.array(stepSchema).min(1, '手順を1つ以上入力してください').max(30),
  tags: z.array(z.string().trim().min(1).max(20)).max(10).default([]),
  imageKey: z.string().max(200).nullable().default(null),
  sourceUrl: z.url().max(2000).nullable().default(null),
  /** 旬・季節限定の季節（空なら通年） */
  seasons: z.array(z.enum(SEASONS)).max(4).default([]),
  /** true なら季節限定 */
  seasonOnly: z.boolean().default(false),
});

export type IngredientInput = z.infer<typeof ingredientInputSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;

export const recipeQuerySchema = z.object({
  q: z.string().trim().max(50).optional(),
  category: z.enum(CATEGORIES).optional(),
  genre: z.enum(GENRES).optional(),
  difficulty: z.enum(COOKING_LEVELS).optional(),
  mine: z.enum(['1']).optional(),
  /** その季節が旬・季節限定のレシピだけ */
  season: z.enum(SEASONS).optional(),
  /** 在庫にある食材を使うレシピだけ（使う数の多い順） */
  stock: z.enum(['1']).optional(),
});

// ===== APIの返却型 =====

export type RecipeSummary = {
  id: string;
  name: string;
  category: (typeof CATEGORIES)[number];
  genre: (typeof GENRES)[number];
  servings: number;
  timeMinutes: number;
  costYen: number;
  costLevel: (typeof LEVELS)[number];
  mainIngredient: (typeof MAIN_INGREDIENTS)[number];
  difficulty: CookingLevel;
  imageKey: string | null;
  tags: string[];
  isSystem: boolean;
  seasons: Season[];
  seasonOnly: boolean;
  /** 「在庫で探す」のとき：使う在庫の食材と、期限が近い（3日以内）ものを使うか */
  stock?: { have: string[]; soon: boolean };
};

export type RecipeDetail = RecipeSummary & {
  steps: Step[];
  sourceUrl: string | null;
  ingredients: (IngredientInput & { id: string })[];
};

/**
 * レシピ詳細での材料の並べ方。
 * グループなしの材料 → グループなしの調味料（「調味料」見出し）→ 各グループ（最初に出てきた順）。
 * 同じ調味料が別のグループにあっても合算しない。
 */
export function groupIngredients<T extends { section: Section; group?: string | null }>(
  items: T[],
) {
  const plain: T[] = [];
  const seasonings: T[] = [];
  const groups = new Map<string, T[]>();
  for (const i of items) {
    const g = i.group?.trim();
    if (g) groups.set(g, [...(groups.get(g) ?? []), i]);
    else if (i.section === 'seasoning') seasonings.push(i);
    else plain.push(i);
  }
  return [
    { label: null, kind: 'plain' as const, items: plain },
    { label: null, kind: 'seasoning' as const, items: seasonings },
    ...[...groups].map(([label, items]) => ({ label, kind: 'group' as const, items })),
  ].filter((b) => b.items.length > 0);
}

// ===== レシピの共有 =====

export type CreatedShare = { token: string; url: string; expiresAt: number };

/** 共有リンクを開いた人に見せる内容 */
export type SharedRecipe = {
  recipe: RecipeDetail;
  sharedBy: string | null;
  expiresAt: number;
};

/** まとめて送れるレシピの数 */
export const MAX_SHARE_BUNDLE = 30;

export const shareBundleSchema = z.object({
  recipeIds: z
    .array(z.string().min(1).max(100))
    .min(1, 'レシピを選んでください')
    .max(MAX_SHARE_BUNDLE, `一度に送れるのは${MAX_SHARE_BUNDLE}品までです`)
    .refine((ids) => new Set(ids).size === ids.length, '同じレシピが重なっています'),
  title: z.string().trim().max(40).optional(),
});

/** 受け取った人が保存するレシピ（まとめて送られたときは、選んだものだけ） */
export const saveSharedSchema = z.object({
  recipeIds: z.array(z.string().min(1).max(100)).max(MAX_SHARE_BUNDLE).optional(),
});

/** 共有リンクを開いた人に見せる内容（1品か、まとめてか） */
export type ShareView =
  | ({ kind: 'single' } & SharedRecipe)
  | {
      kind: 'bundle';
      title: string | null;
      sharedBy: string | null;
      expiresAt: number;
      recipes: RecipeDetail[];
    };
