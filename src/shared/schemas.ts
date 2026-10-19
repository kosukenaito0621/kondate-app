import { z } from 'zod';
import { memoChoicesSchema, type MemoChoices } from './memo';
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
  .object({
    displayName: displayNameSchema,
    theme: themeSchema,
    cookingLevel: cookingLevelSchema,
    /** 使い方ガイドを見終えた */
    guideSeen: z.literal(true),
    /** ここまでお知らせを読んだ */
    newsSeen: z.string().min(1).max(60),
    /** メモの確認で覚えた選択（null で「毎回確認する」に戻す） */
    memoChoices: memoChoicesSchema,
  })
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
  /** 使い方ガイドを見終えたか（初回ログイン時に表示する） */
  guideSeen: boolean;
  /** 最後に見たお知らせの id */
  newsSeen: string | null;
  /** 日ごとメモの確認で「次回から確認しない」にした選択 */
  memoChoices: MemoChoices;
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
