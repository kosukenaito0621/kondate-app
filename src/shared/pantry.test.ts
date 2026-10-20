import { describe, expect, it } from 'vitest';
import { addQty, compareStock, consumeStock, daysUntil, stockLabel } from './pantry';

describe('在庫と必要な量をくらべる', () => {
  it('足りる・一部足りる・くらべられない', () => {
    expect(compareStock({ quantity: 300, unit: 'g' }, [{ quantity: 0.5, unit: 'kg' }]).status).toBe(
      'covered',
    );
    expect(compareStock({ quantity: 300, unit: 'g' }, [{ quantity: 100, unit: 'g' }])).toEqual({
      status: 'partial',
      remaining: { quantity: 200, unit: 'g' },
    });
    expect(compareStock({ quantity: 2, unit: '個' }, [{ quantity: 100, unit: 'g' }]).status).toBe(
      'none',
    );
    expect(compareStock({ quantity: 2, unit: '個' }, []).status).toBe('none');
  });

  it('数量の分からない在庫（あり）は足りるものとして扱う', () => {
    expect(compareStock({ quantity: 2, unit: '本' }, [{ quantity: null, unit: null }]).status).toBe(
      'covered',
    );
  });

  it('合計の表示と、足し算', () => {
    expect(
      stockLabel([
        { quantity: 200, unit: 'g' },
        { quantity: 1, unit: 'kg' },
      ]),
    ).toBe('1.2kg');
    expect(stockLabel([{ quantity: null, unit: null }])).toBe('あり');
    expect(addQty({ quantity: 1, unit: '個' }, { quantity: 2, unit: '個' })).toEqual({
      quantity: 3,
      unit: '個',
    });
    expect(addQty({ quantity: 1, unit: '個' }, { quantity: 200, unit: 'g' })).toBeNull();
  });
});

describe('作ったら在庫から減らす', () => {
  const rows = [
    { id: 'a', name: '鶏もも肉', quantity: 300, unit: 'g', expiresOn: '2026-10-25' },
    { id: 'b', name: '鶏もも肉', quantity: 200, unit: 'g', expiresOn: '2026-10-21' },
    { id: 'c', name: '玉ねぎ', quantity: 3, unit: '個', expiresOn: null },
    { id: 'd', name: 'にんじん', quantity: null, unit: null, expiresOn: null },
  ];

  it('期限の近いものから使い、使い切ったら消す', () => {
    const r = consumeStock(rows, [
      { name: '鶏もも肉', quantity: 250, unit: 'g' },
      { name: 'タマネギ', quantity: 1, unit: '個' },
      { name: 'にんじん', quantity: 1, unit: '本' },
    ]);
    expect(r.updates).toEqual([
      { id: 'a', quantity: 250, unit: 'g', remove: false },
      { id: 'b', quantity: 0, unit: 'g', remove: true },
      { id: 'c', quantity: 2, unit: '個', remove: false },
    ]);
    expect(r.used.map((u) => [u.id, u.quantity, u.unit])).toEqual([
      ['b', 200, 'g'],
      ['a', 50, 'g'],
      ['c', 1, '個'],
    ]);
  });

  it('期限までの日数', () => {
    expect(daysUntil('2026-10-22', '2026-10-20')).toBe(2);
    expect(daysUntil('2026-10-19', '2026-10-20')).toBe(-1);
  });
});
