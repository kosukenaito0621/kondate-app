import { z } from 'zod';
import { THEME_IDS, type ThemeId } from './themes';

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'ユーザーネームを入力してください')
  .max(20, '20文字以内で入力してください');

export const themeSchema = z.enum(THEME_IDS);

export const updateMeSchema = z
  .object({ displayName: displayNameSchema, theme: themeSchema })
  .partial()
  .refine((v) => v.displayName !== undefined || v.theme !== undefined, {
    message: '変更する項目がありません',
  });

export type Me = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  theme: ThemeId;
};
