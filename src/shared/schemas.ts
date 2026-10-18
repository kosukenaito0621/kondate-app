import { z } from 'zod';
import { COOKING_LEVELS, type CookingLevel } from './levels';
import { THEME_IDS, type ThemeId } from './themes';

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'ユーザーネームを入力してください')
  .max(20, '20文字以内で入力してください');

export const themeSchema = z.enum(THEME_IDS);
export const cookingLevelSchema = z.enum(COOKING_LEVELS);

export const updateMeSchema = z
  .object({ displayName: displayNameSchema, theme: themeSchema, cookingLevel: cookingLevelSchema })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: '変更する項目がありません',
  });

export type GroupSummary = {
  id: string;
  name: string;
  icon: string;
  color: string;
  role: 'owner' | 'member';
  memberCount: number;
};

export type Me = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  theme: ThemeId;
  /** 未選択（オンボーディング前）は null */
  cookingLevel: CookingLevel | null;
  currentGroupId: string;
  groups: GroupSummary[];
};
