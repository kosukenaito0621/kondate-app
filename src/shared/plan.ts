import { z } from 'zod';
import { EDIT_MEMO_CHOICES, SWAP_MEMO_CHOICES, type DayMemo } from './memo';
import { CATEGORIES, LEVELS, TIME_LEVELS, type CostLevel, type TimeLevel } from './constants';
import { isIsoDate } from './date';
import { DAY_LEVELS, type CookingLevel, type DayLevel } from './levels';
import type { RecipeSummary } from './recipe';

export const SIDE_MODES = ['auto', 'on', 'off'] as const;
export type SideModeValue = (typeof SIDE_MODES)[number];
export const SIDE_MODE_LABEL: Record<SideModeValue, string> = {
  auto: '自動',
  on: 'あり',
  off: 'なし',
};

/** その日の予定：料理する／外食／テイクアウト（外食とテイクアウトの日は献立を作らない） */
export const DAY_MODES = ['cook', 'eat_out', 'takeout'] as const;
export type DayMode = (typeof DAY_MODES)[number];
export const DAY_MODE_LABEL: Record<DayMode, string> = {
  cook: '料理する',
  eat_out: '外食',
  takeout: 'テイクアウト',
};
export const isOffDay = (mode: DayMode) => mode !== 'cook';

export const daySettingSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  budgetLevel: z.enum(LEVELS),
  timeLevel: z.enum(TIME_LEVELS),
  sideMode: z.enum(SIDE_MODES),
  level: z.enum(DAY_LEVELS),
  /** 曜日ごとの予定（毎週金曜は外食 など） */
  mode: z.enum(DAY_MODES).default('cook'),
});
export type DaySetting = z.infer<typeof daySettingSchema>;

const ratioSchema = z
  .object({
    wa: z.number().int().min(0).max(100),
    yo: z.number().int().min(0).max(100),
    chu: z.number().int().min(0).max(100),
  })
  .refine((r) => r.wa + r.yo + r.chu === 100, { message: '割合の合計は100%にしてください' });

export const updateSettingsSchema = z
  .object({
    weeklyBudget: z.number().int().min(0).max(1_000_000),
    ratio: ratioSchema,
    buySeasonings: z.array(z.string().trim().min(1).max(40)).max(100),
    days: z
      .array(daySettingSchema)
      .length(7)
      .refine((ds) => new Set(ds.map((d) => d.weekday)).size === 7, {
        message: '曜日が重複しています',
      }),
  })
  .partial();

export type PlanSettings = {
  weeklyBudget: number;
  ratio: { wa: number; yo: number; chu: number };
  buySeasonings: string[];
  defaultLevel: CookingLevel;
  servings: number;
  days: DaySetting[];
};

export const weekStartParam = z.string().refine(isIsoDate, '日付の形式が不正です');

export const versionSchema = z.object({ version: z.number().int().min(0).optional() });
/** memo：その日のメモをどうするか（省略時は残す） */
export const regenerateSchema = versionSchema.extend({
  slot: z.enum(CATEGORIES).optional(),
  memo: z.enum(EDIT_MEMO_CHOICES).optional(),
});
export const setSlotSchema = versionSchema.extend({
  recipeId: z.string().min(1).nullable(),
  memo: z.enum(EDIT_MEMO_CHOICES).optional(),
});
export const dayModeSchema = versionSchema.extend({ mode: z.enum(DAY_MODES) });
export const swapSchema = versionSchema.extend({
  from: z.string().refine(isIsoDate),
  to: z.string().refine(isIsoDate),
  /** メモをどうするか（省略時は日に残す） */
  memo: z.enum(SWAP_MEMO_CHOICES).optional(),
});

export type PlanItemView = {
  slot: (typeof CATEGORIES)[number];
  recipe: RecipeSummary;
  updatedBy: string | null;
  updatedAt: number;
  /** その日にこの料理を「作った」と記録していれば、その記録の id */
  cookedLogId: string | null;
  /** 食卓のだれかのお気に入りか */
  favorite: boolean;
};

export type PlanDayView = {
  date: string;
  weekday: number;
  budgetLevel: CostLevel;
  timeLevel: TimeLevel;
  sideMode: SideModeValue;
  /** 曜日の設定（inherit ならグループ既定） */
  levelSetting: DayLevel;
  /** 解決済みのレベル */
  level: CookingLevel;
  /** この日の予定（その週だけの変更があればそちら） */
  mode: DayMode;
  /** 曜日の設定どおりの予定 */
  modeSetting: DayMode;
  items: PlanItemView[];
  /** その日のメモ */
  memo: DayMemo | null;
};

export type PlanView = {
  weekStart: string;
  exists: boolean;
  version: number;
  estimatedCost: number;
  weeklyBudget: number;
  overBudget: boolean;
  servings: number;
  updatedBy: { id: string; name: string | null } | null;
  updatedAt: number;
  days: PlanDayView[];
  warnings: string[];
};
