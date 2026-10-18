import { z } from 'zod';
import { addDays, isIsoDate } from './date';
import type { RecipeSummary } from './recipe';

export const createLogSchema = z.object({
  recipeId: z.string().min(1),
  /** 省略時は今日（JST） */
  date: z.string().refine(isIsoDate).optional(),
});

export const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export type CookLogEntry = {
  id: string;
  date: string;
  recipe: RecipeSummary;
  cookedBy: { id: string; name: string | null; avatarUrl: string | null } | null;
};

export type CookLogMonth = {
  month: string;
  entries: CookLogEntry[];
  stats: {
    /** 今月の記録数 */
    count: number;
    /** 今月作った日数 */
    days: number;
    /** 今日（または昨日）まで続いている連続日数 */
    streak: number;
    /** 今月作ったレシピの種類 */
    distinctRecipes: number;
  };
};

export type RecipeCookStats = { count: number; lastDate: string | null; cookedToday: boolean };

/** 日付の集合から、today（記録がなければ昨日）までの連続日数を数える */
export function streakDays(dates: Iterable<string>, today: string): number {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}
