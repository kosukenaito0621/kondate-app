import { describe, expect, it } from 'vitest';
import { formatAmount, formatQuantity, parseAmount } from './recipe';

describe('parseAmount', () => {
  it.each([
    ['300g', { quantity: 300, unit: 'g', amountText: null }],
    ['1/2個', { quantity: 0.5, unit: '個', amountText: null }],
    ['大さじ2', { quantity: 2, unit: '大さじ', amountText: null }],
    ['大さじ1と1/2', { quantity: 1.5, unit: '大さじ', amountText: null }],
    ['小さじ1/2', { quantity: 0.5, unit: '小さじ', amountText: null }],
    ['400ml', { quantity: 400, unit: 'ml', amountText: null }],
    ['１パック', { quantity: 1, unit: 'パック', amountText: null }], // 全角
    ['2〜3枚', { quantity: 2, unit: '枚', amountText: '2〜3枚' }],
    ['少々', { quantity: null, unit: null, amountText: '少々' }],
    ['適量', { quantity: null, unit: null, amountText: '適量' }],
  ])('%s', (raw, expected) => {
    expect(parseAmount(raw)).toEqual(expected);
  });
});

describe('formatAmount', () => {
  it('単位の位置と分数', () => {
    expect(formatAmount({ quantity: 1.5, unit: '大さじ', amountText: null })).toBe('大さじ1と1/2');
    expect(formatAmount({ quantity: 300, unit: 'g', amountText: null })).toBe('300g');
    expect(formatAmount({ quantity: 0.5, unit: '個', amountText: null })).toBe('1/2個');
    expect(formatAmount({ quantity: null, unit: null, amountText: '少々' })).toBe('少々');
  });
  it('割り切れない数は小数1桁', () => {
    expect(formatQuantity(1.2)).toBe('1.2');
    expect(formatQuantity(3)).toBe('3');
  });
});
