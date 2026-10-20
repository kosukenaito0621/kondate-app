import { useSyncExternalStore } from 'react';

/**
 * お試しの「やってみよう」（伴走ガイド）。
 * ミッションの一覧から「やってみる」を押すと、その画面へ移って押す場所を光らせ（スポットライト）、
 * 実際にその操作をすると自動でチェックが付く。進み具合は端末に保存する（サーバーには書かない）。
 */
export type MissionId =
  'generate' | 'change' | 'swap' | 'memo' | 'check' | 'pantry' | 'import' | 'family';

export type Mission = {
  id: MissionId;
  title: string;
  /** お祝いの一覧に出す短い名前 */
  short: string;
  desc: string;
  /** 「やってみる」で移る画面 */
  to: '/' | '/week' | '/shopping' | '/pantry' | '/recipes';
  /** 光らせる場所（data-tour の値） */
  spot: string;
  /** 光らせた場所に添える一言 */
  hint: string;
  /** 光らせた場所に触れたあと、続けて光らせる場所（次の画面のボタンなど） */
  then?: { spot: string; hint: string };
};

export const MISSIONS: readonly Mission[] = [
  {
    id: 'generate',
    short: '献立づくり',
    title: '献立を作ってみよう',
    desc: 'ボタン1つで、1週間分の主菜・汁物・副菜ができます',
    to: '/week',
    spot: 'week-generate',
    hint: 'ここを押すと、1週間の献立をまるごと作り直します',
  },
  {
    id: 'change',
    short: '料理の変更',
    title: '料理を変えてみよう',
    desc: '気に入らない1品だけ、別のレシピに変えられます',
    to: '/week',
    spot: 'meal-row',
    hint: '料理名を長押しすると、変えるメニューが開きます（タップするとレシピ）',
  },
  {
    id: 'swap',
    short: '曜日の入れ替え',
    title: '曜日を入れ替えてみよう',
    desc: '「水曜と金曜を交換」もドラッグひとつ',
    to: '/week',
    spot: 'day-grip',
    hint: '点々のつまみを持って、ほかの曜日へスライドしてみてください',
  },
  {
    id: 'memo',
    short: '日ごとメモ',
    title: 'メモを書いてみよう',
    desc: '「スープにレタスも」など、その日の一言を家族と共有',
    to: '/week',
    spot: 'memo',
    hint: 'ここにメモを書くと、自動で保存されます',
  },
  {
    id: 'check',
    short: '買い物リスト',
    title: '買い物リストでチェック',
    desc: '献立の材料が、売り場の順にまとまっています',
    to: '/shopping',
    spot: 'shop-check',
    hint: '丸を押すと「かごに入れた」になります',
  },
  {
    id: 'pantry',
    short: 'うちの在庫',
    title: '在庫を入れてみよう',
    desc: '冷蔵庫にあるものは、買い物リストから差し引かれます',
    to: '/pantry',
    spot: 'pantry-add',
    hint: '冷蔵庫にある食材を入れてみましょう',
  },
  {
    id: 'import',
    short: 'レシピの取り込み',
    title: 'レシピを取り込んでみよう',
    desc: 'レシピ本の写真から、材料と手順を自動で読み取ります',
    to: '/recipes',
    spot: 'recipe-import',
    hint: '見本の写真で、取り込みを試せます',
    then: { spot: 'import-sample', hint: '「この写真で試す」を押してみましょう' },
  },
  {
    id: 'family',
    short: '家族との共有',
    title: '家族と一緒に使ってみよう',
    desc: '家族が変えたことが、すぐに届きます',
    to: '/',
    spot: 'family',
    hint: '押すと、家族役の「はなこ」さんがやって来ます',
  },
];

type State = { user: string | null; done: ReadonlySet<MissionId>; spot: Mission | null };
let state: State = { user: null, done: new Set(), spot: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const key = (user: string) => `kd-tour:${user}`;

function load(user: string): Set<MissionId> {
  try {
    const raw = localStorage.getItem(key(user));
    return new Set(raw ? (JSON.parse(raw) as MissionId[]) : []);
  } catch {
    return new Set();
  }
}

/** お試しのユーザーを決める（ユーザーごとに進み具合を分ける）。null で止める */
export function setTourUser(user: string | null) {
  if (state.user === user) return;
  state = { user, done: user ? load(user) : new Set(), spot: null };
  emit();
}

/** その操作をしたらミッションを完了にする（お試し中でなければ何もしない） */
export function markMission(id: MissionId) {
  if (!state.user || state.done.has(id)) {
    if (state.spot?.id === id) {
      state = { ...state, spot: null };
      emit();
    }
    return;
  }
  const done = new Set(state.done).add(id);
  try {
    localStorage.setItem(key(state.user), JSON.stringify([...done]));
  } catch {
    // 保存できなくても、この画面の間は進み具合を覚えておく
  }
  state = { ...state, done, spot: state.spot?.id === id ? null : state.spot };
  emit();
}

/** ミッションの場所を光らせる（画面の移動は呼び出し側で） */
export function showSpot(mission: Mission | null) {
  state = { ...state, spot: mission };
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useTour() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
