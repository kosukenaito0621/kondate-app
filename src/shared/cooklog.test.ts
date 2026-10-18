import { describe, expect, it } from 'vitest';
import { streakDays } from './cooklog';

describe('streakDays', () => {
  it('今日まで続いている日数', () => {
    expect(streakDays(['2026-10-16', '2026-10-17', '2026-10-18'], '2026-10-18')).toBe(3);
  });
  it('今日まだ記録がなくても、昨日まで続いていれば数える', () => {
    expect(streakDays(['2026-10-16', '2026-10-17'], '2026-10-18')).toBe(2);
  });
  it('途切れていたら0', () => {
    expect(streakDays(['2026-10-15'], '2026-10-18')).toBe(0);
  });
  it('月またぎ', () => {
    expect(streakDays(['2026-09-30', '2026-10-01'], '2026-10-01')).toBe(2);
  });
});
