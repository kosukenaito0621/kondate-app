import { describe, expect, it } from 'vitest';
import { normalizeInviteCode } from './groups';

describe('normalizeInviteCode', () => {
  it.each([
    ['abc234', 'ABC234'],
    [' ab c-234 ', 'ABC234'],
    ['ＡＢＣ２３４', 'ABC234'], // 全角
    ['ABC23', null], // 短い
    ['ABC0I1', null], // 紛らわしい文字は使わない
    ['../../x', null],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeInviteCode(raw)).toBe(expected);
  });
});

describe('グループ名（○○の食卓）', () => {
  it('○○の部分だけを保存し、表示のときに「の食卓」を付ける', async () => {
    const { groupNameSchema, groupDisplayName } = await import('./groups');
    expect(groupNameSchema.parse(' はなこ ')).toBe('はなこ');
    // 「の食卓」まで入力されても二重にならない
    expect(groupNameSchema.parse('はなこの食卓')).toBe('はなこ');
    expect(groupDisplayName('はなこ')).toBe('はなこの食卓');
    expect(groupNameSchema.safeParse('の食卓').success).toBe(false);
    expect(groupNameSchema.safeParse('あ'.repeat(17)).success).toBe(false);
  });
});
