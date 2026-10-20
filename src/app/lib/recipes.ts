import { queryOptions } from '@tanstack/react-query';
import type { Category, Genre } from '../../shared/constants';
import type { CookingLevel } from '../../shared/levels';
import type { Season } from '../../shared/season';
import type { RecipeDetail, RecipeSummary } from '../../shared/recipe';
import { api } from '../api';

export type RecipeFilters = {
  q?: string;
  category?: Category;
  genre?: Genre;
  difficulty?: CookingLevel;
  mine?: '1';
  season?: Season;
  /** 在庫で探す */
  stock?: '1';
};

type JsonResponse = { ok: boolean; status: number; json(): Promise<unknown> };

export async function ok<T>(res: JsonResponse): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const recipesQuery = (filters: RecipeFilters) =>
  queryOptions({
    queryKey: ['recipes', filters],
    queryFn: async () => ok<RecipeSummary[]>(await api.recipes.$get({ query: filters })),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

export const recipeQuery = (id: string) =>
  queryOptions({
    queryKey: ['recipe', id],
    queryFn: async () => ok<RecipeDetail>(await api.recipes[':id'].$get({ param: { id } })),
    staleTime: 5 * 60_000,
  });

/** 手順の文章から「◯分」を見つける（タイマー用）。「2〜3分」は大きい方 */
export function findMinutes(text: string): number | null {
  const m = text.normalize('NFKC').match(/(\d+)(?:[〜~-](\d+))?分/);
  if (!m) return null;
  const n = Number(m[2] ?? m[1]);
  return n > 0 && n <= 180 ? n : null;
}
