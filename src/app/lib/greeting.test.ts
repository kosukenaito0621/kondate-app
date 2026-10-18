import { describe, expect, it } from 'vitest';
import { greeting, timeBand, type GreetingContext } from './greeting';

const base: GreetingContext = {
  name: 'こうすけ',
  hour: 8,
  weekday: 0,
  hasPlan: true,
  mainDish: '鶏の照り焼き',
  seed: 1,
};

describe('greeting', () => {
  it.each([
    [5, 'morning'],
    [9, 'morning'],
    [10, 'day'],
    [16, 'day'],
    [17, 'evening'],
    [21, 'evening'],
    [22, 'night'],
    [2, 'night'],
  ])('%i時は %s', (hour, band) => {
    expect(timeBand(hour)).toBe(band);
  });

  it('時間帯ごとの挨拶になり、名前が入る', () => {
    expect(greeting({ ...base, hour: 7 }).title).toMatch(/おはよう/);
    expect(greeting({ ...base, hour: 12 }).title).toMatch(/こんにちは/);
    expect(greeting({ ...base, hour: 19 }).title).toMatch(/こんばんは|おつかれさま/);
    expect(greeting({ ...base, hour: 23 }).title).toMatch(/おつかれさま/);
    for (const hour of [7, 12, 19, 23]) {
      for (let seed = 0; seed < 10; seed++) {
        const t = greeting({ ...base, hour, seed }).title;
        expect(t.includes('こうすけ') || t === 'こんばんは。今日もおつかれさま').toBe(true);
      }
    }
  });

  it('複数パターンからランダムに選ばれ、同じ種なら同じ文言', () => {
    const titles = new Set(
      Array.from({ length: 30 }, (_, seed) => greeting({ ...base, seed }).title),
    );
    expect(titles.size).toBeGreaterThan(1);
    expect(greeting(base)).toEqual(greeting(base));
  });

  it('時短デーや献立内容にふれた一言が入る', () => {
    const lines = new Set(
      Array.from({ length: 40 }, (_, seed) => greeting({ ...base, timeLevel: 'quick', seed }).line),
    );
    expect([...lines].some((l) => l.includes('時短デー'))).toBe(true);
    expect([...lines].some((l) => l.includes('鶏の照り焼き'))).toBe(true);
  });

  it('献立がなければ作成をうながす', () => {
    expect(greeting({ ...base, hasPlan: false, mainDish: undefined }).line).toMatch(
      /まだ今日の献立がありません/,
    );
  });
});

describe('曜日の一言', () => {
  it('0=月曜・6=日曜の番号に合っている', () => {
    const lines = (weekday: number) =>
      new Set(
        Array.from(
          { length: 60 },
          (_, seed) => greeting({ ...base, weekday, mainDish: undefined, seed }).line,
        ),
      );
    expect([...lines(0)].some((l) => l.includes('月曜') || l.includes('一週間のはじまり'))).toBe(
      true,
    );
    expect([...lines(6)].some((l) => l.includes('日曜') || l.includes('締めくくり'))).toBe(true);
    expect([...lines(6)].some((l) => l.includes('土曜'))).toBe(false);
  });
});
