import { describe, expect, it } from 'vitest';
import { withHostings } from './hosting';

describe('withHostings', () => {
  it('もてなしの項目がない古い応答でも、空の一覧として扱える', () => {
    expect(withHostings({ date: '2026-11-08' } as never)).toEqual({
      date: '2026-11-08',
      hostings: [],
    });
  });

  it('もてなしがある応答はそのまま', () => {
    const day = { date: '2026-11-08', hostings: [{ id: 'h1' }] } as never;
    expect(withHostings(day)).toEqual(day);
  });
});
