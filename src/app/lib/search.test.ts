import { describe, expect, it } from 'vitest';
import { compact, optMatch, optOneOf, optString } from './search';

describe('URL クエリの読み取り', () => {
  it('形の合わない値は捨てる', () => {
    expect(optString('abc')).toBe('abc');
    expect(optString(['a'])).toBeUndefined();
    expect(optMatch('2026-10', /^\d{4}-\d{2}$/)).toBe('2026-10');
    expect(optMatch('2026-1', /^\d{4}-\d{2}$/)).toBeUndefined();
    expect(optOneOf('wa', ['wa', 'yo'] as const)).toBe('wa');
    expect(optOneOf('xx', ['wa', 'yo'] as const)).toBeUndefined();
    expect(compact({ a: 1, b: undefined })).toEqual({ a: 1 });
  });
});
