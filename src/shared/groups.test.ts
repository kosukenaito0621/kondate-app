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
