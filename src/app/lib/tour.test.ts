import { describe, expect, it } from 'vitest';
import { MISSIONS, nextSpot } from './tour';

describe('nextSpot', () => {
  it('レシピの取り込みは「追加」→「レシピ本の写真」→見本の写真の順に案内する', () => {
    const first = MISSIONS.find((m) => m.id === 'import')!;
    expect(first.spot).toBe('recipe-add');
    const second = nextSpot(first)!;
    expect(second.spot).toBe('recipe-add-photo');
    const third = nextSpot(second)!;
    expect(third.spot).toBe('import-sample');
    expect(nextSpot(third)).toBeNull();
  });

  it('続きがない案内は終わる', () => {
    expect(nextSpot(MISSIONS.find((m) => m.id === 'family')!)).toBeNull();
  });
});
