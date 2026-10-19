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

/** グループ名は「○○の食卓」。保存するのは ○○ の部分だけで、表示のときに付ける */
export const GROUP_NAME_SUFFIX = 'の食卓';

export function groupDisplayName(name: string) {
  return `${name}${GROUP_NAME_SUFFIX}`;
}

export const GROUP_NAME_MAX = 16;

export const groupNameSchema = z
  .string()
  .trim()
  // 「はなこの食卓」と全部入力されても ○○ の部分だけにする
  .transform((s) =>
    s.endsWith(GROUP_NAME_SUFFIX) ? s.slice(0, -GROUP_NAME_SUFFIX.length).trim() : s,
  )
  .pipe(
    z
      .string()
      .min(1, '「○○の食卓」の○○を入力してください')
      .max(GROUP_NAME_MAX, `${GROUP_NAME_MAX}文字以内で入力してください`),
  );

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
