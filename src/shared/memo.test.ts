import { describe, expect, it } from 'vitest';
import { memoDecision, swapMemos } from './memo';

const none = { swap: null, edit: null };

describe('メモの確認を出すか', () => {
  it('メモのない日は確認しない（入れ替えはそのまま、ほかは残す）', () => {
    expect(memoDecision('swap', false, none)).toEqual({ ask: false, choice: 'swap' });
    expect(memoDecision('edit', false, none)).toEqual({ ask: false, choice: 'keep' });
  });

  it('メモがあり、覚えた選択がなければ確認する', () => {
    expect(memoDecision('swap', true, none)).toEqual({ ask: true });
    expect(memoDecision('edit', true, none)).toEqual({ ask: true });
  });

  it('覚えた選択は操作の種類ごとに使う', () => {
    const remembered = { swap: 'clear' as const, edit: null };
    expect(memoDecision('swap', true, remembered)).toEqual({ ask: false, choice: 'clear' });
    expect(memoDecision('edit', true, remembered)).toEqual({ ask: true });
    expect(memoDecision('edit', true, { swap: null, edit: 'keep' })).toEqual({
      ask: false,
      choice: 'keep',
    });
  });
});

describe('入れ替えたあとのメモ', () => {
  it('一緒に入れ替える：交換・移動', () => {
    expect(swapMemos({ from: 'A', to: 'B' }, 'swap')).toEqual({ from: 'B', to: 'A' });
    expect(swapMemos({ from: 'A', to: null }, 'swap')).toEqual({ from: null, to: 'A' });
  });

  it('その日に残す・消す', () => {
    expect(swapMemos({ from: 'A', to: 'B' }, 'keep')).toEqual({ from: 'A', to: 'B' });
    expect(swapMemos({ from: 'A', to: 'B' }, 'clear')).toEqual({ from: null, to: null });
  });
});
