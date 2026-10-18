import { z } from 'zod';

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'ユーザーネームを入力してください')
  .max(20, '20文字以内で入力してください');

export const updateMeSchema = z.object({ displayName: displayNameSchema });

export type Me = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};
