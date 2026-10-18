import { z } from 'zod';
import { COOKING_LEVELS, type CookingLevel } from './levels';

/** グループの色（絵文字アイコンは使わず、色で見分ける） */
export const GROUP_COLORS = [
  { id: 'rose', label: 'ローズ', value: '#e9879f' },
  { id: 'butter', label: 'バター', value: '#e8c45a' },
  { id: 'peach', label: 'ピーチ', value: '#f2a27a' },
  { id: 'mint', label: 'ミント', value: '#7fc4a3' },
  { id: 'sky', label: 'スカイ', value: '#7fb0dc' },
  { id: 'lavender', label: 'ラベンダー', value: '#a48fd6' },
  { id: 'gold', label: 'ゴールド', value: '#c9a24f' },
  { id: 'slate', label: 'スレート', value: '#7d8796' },
] as const;
export type GroupColorId = (typeof GROUP_COLORS)[number]['id'];
const COLOR_IDS = GROUP_COLORS.map((c) => c.id) as [GroupColorId, ...GroupColorId[]];

export function groupColor(id: string): string {
  return GROUP_COLORS.find((c) => c.id === id)?.value ?? GROUP_COLORS[0].value;
}

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, 'グループ名を入力してください')
  .max(20, '20文字以内で入力してください');

export const createGroupSchema = z.object({
  name: groupNameSchema,
  color: z.enum(COLOR_IDS).default('rose'),
});

export const updateGroupSchema = z
  .object({
    name: groupNameSchema,
    color: z.enum(COLOR_IDS),
    defaultLevel: z.enum(COOKING_LEVELS),
    /** null でメンバー数 */
    servings: z.number().int().min(1).max(12).nullable(),
  })
  .partial();

/** 招待コード：紛らわしい文字（0/O, 1/I/L）を除いた英数字6文字 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export function normalizeInviteCode(raw: string): string | null {
  const s = raw.normalize('NFKC').toUpperCase().replace(/[\s-]/g, '');
  const re = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);
  return re.test(s) ? s : null;
}

export type GroupMember = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'member';
  isMe: boolean;
};

export type GroupDetail = {
  id: string;
  name: string;
  color: string;
  defaultLevel: CookingLevel;
  servings: number | null;
  /** 分量計算に使う人数（servings が null ならメンバー数） */
  effectiveServings: number;
  role: 'owner' | 'member';
  members: GroupMember[];
};

export type InviteSummary = { id: string; code: string; expiresAt: number; createdAt: number };
export type CreatedInvite = InviteSummary & { token: string };

export type InvitePreview = {
  groupName: string;
  color: string;
  inviterName: string | null;
  memberCount: number;
  alreadyMember: boolean;
  expiresAt: number;
};
