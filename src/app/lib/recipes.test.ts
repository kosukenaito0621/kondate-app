import { describe, expect, it } from 'vitest';
import { findMinutes } from './recipes';

describe('findMinutes（手順のタイマー検出）', () => {
  it.each([
    ['弱火で10分煮る', 10],
    ['中火で2〜3分炒める', 3],
    ['電子レンジ（600W）で1分30秒加熱する', 1],
    ['１５分置く', 15],
    ['塩をふる', null],
    ['ご飯を盛る', null],
  ])('%s → %s', (text, expected) => {
    expect(findMinutes(text)).toBe(expected);
  });
});
