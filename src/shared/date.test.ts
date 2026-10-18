import { describe, expect, it } from 'vitest';
import { addDays, jstHour, toJstDate, weekDates, weekStartOf, weekdayIndex } from './date';

describe('date (JST)', () => {
  it('UTC 15:00 は JST の翌日 0時', () => {
    const d = new Date('2026-10-18T15:00:00Z');
    expect(toJstDate(d)).toBe('2026-10-19');
    expect(jstHour(d)).toBe(0);
  });

  it('週は月曜始まり', () => {
    expect(weekdayIndex('2026-10-19')).toBe(0); // 月
    expect(weekdayIndex('2026-10-18')).toBe(6); // 日
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12');
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19');
  });

  it('月またぎ・7日分', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(weekDates('2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });
});
