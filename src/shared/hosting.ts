// もてなし（昼・夜のコース）の定義（フロント・バック共通）
import { z } from 'zod';
import { CATEGORIES, type Category } from './constants';
import { versionSchema, type PlanDayView } from './plan';
import type { RecipeSummary } from './recipe';

export const MEALS = ['lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_LABEL: Record<Meal, string> = { lunch: '昼', dinner: '夜' };

/** もてなしを作ったときに並ぶ枠（出す順） */
export const DEFAULT_COURSES: readonly { label: string; category: Category }[] = [
  { label: '前菜', category: 'side' },
  { label: '汁物', category: 'soup' },
  { label: '主菜', category: 'main' },
  { label: 'デザート', category: 'dessert' },
];

export const MAX_COURSES = 12;
export const MAX_HOSTING_SERVINGS = 30;

const servings = z.number().int().min(1).max(MAX_HOSTING_SERVINGS);

export const createHostingSchema = versionSchema.extend({ meal: z.enum(MEALS), servings });
export const updateHostingSchema = versionSchema.extend({ servings });
export const saveCoursesSchema = versionSchema.extend({
  courses: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(20),
        category: z.enum(CATEGORIES),
        recipeId: z.string().min(1).nullable(),
      }),
    )
    .min(1)
    .max(MAX_COURSES),
});

export type HostingCourseView = {
  id: string;
  label: string;
  category: Category;
  /** 未定の枠は null */
  recipe: RecipeSummary | null;
  /** その日にこの料理を「作った」と記録していれば、その記録の id */
  cookedLogId: string | null;
  /** 食卓のだれかのお気に入りか */
  favorite: boolean;
};

export type HostingView = {
  id: string;
  date: string;
  meal: Meal;
  servings: number;
  courses: HostingCourseView[];
};

/** 公開前の応答（端末に残ったキャッシュ）には hostings がないので、空として扱う */
export const withHostings = <T extends Pick<PlanDayView, 'hostings'>>(day: T): T => ({
  ...day,
  hostings: day.hostings ?? [],
});

/** 夜のもてなしがある日は、ふだんの献立をお休みにする */
export const isDinnerHosted = (day: Pick<PlanDayView, 'hostings'>) =>
  day.hostings.some((h) => h.meal === 'dinner');
