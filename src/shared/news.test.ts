import { describe, expect, it } from 'vitest';
import { LATEST_NEWS_ID, NEWS, unreadNewsCount } from './news';

describe('お知らせ', () => {
  it('id が重複せず、新しい順に並んでいる', () => {
    expect(new Set(NEWS.map((n) => n.id)).size).toBe(NEWS.length);
    const dates = NEWS.map((n) => n.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('未読の数（最後に見た id より新しいもの）', () => {
    expect(unreadNewsCount(null)).toBe(NEWS.length);
    expect(unreadNewsCount(LATEST_NEWS_ID)).toBe(0);
    expect(unreadNewsCount(NEWS[2]!.id)).toBe(2);
    // 消えた id を覚えていたら、すべて未読扱い
    expect(unreadNewsCount('unknown')).toBe(NEWS.length);
  });
});
