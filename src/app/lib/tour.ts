import { useSyncExternalStore } from 'react';
import { addDays, toJstDate } from '../../shared/date';

/**
 * お試しの「やってみよう」（伴走ガイド）。
 * 画面の下のコーチが、ミッションを1つずつ順に案内する。「やってみる」でその画面へ移って
 * 押す場所を光らせ（スポットライト）、実際にその操作をすると自動でクリアになり、次のミッションへ誘う。
 * 文字の入力が要るところは、見本の文字を入れた状態にしておく。進み具合は端末に保存する（サーバーには書かない）。
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
  /** 光らせた場所でする操作（指の案内に出す） */
  gesture: 'タップ' | '長押し' | 'つまんでスライド';
  /** 光らせた場所に添える一言 */
  hint: string;
  /** 光らせた場所に触れたあと、続けて光らせる場所（次の画面のボタンなど） */
  then?: { spot: string; hint: string; gesture: Mission['gesture'] };
};

export const MISSIONS: readonly Mission[] = [
  {
    id: 'generate',
    short: '献立づくり',
    title: '献立を作ってみよう',
    desc: 'ボタン1つで、1週間分の主菜・汁物・副菜ができます',
    to: '/week',
    spot: 'week-generate',
    gesture: 'タップ',
    hint: 'このボタンで、1週間分の献立ができあがります',
  },
  {
    id: 'change',
    short: '料理の変更',
    title: '料理を変えてみよう',
    desc: '気に入らない1品だけ、別のレシピに変えられます',
    to: '/week',
    spot: 'meal-row',
    gesture: '長押し',
    hint: '料理名を長押しして、「別のレシピにする」を選んでみましょう',
  },
  {
    id: 'swap',
    short: '曜日の入れ替え',
    title: '曜日を入れ替えてみよう',
    desc: '「水曜と金曜を交換」もスライドひとつ',
    to: '/week',
    spot: 'day-grip',
    gesture: 'つまんでスライド',
    hint: '点々のつまみを持ったまま、下の曜日へスライドして離してみましょう',
  },
  {
    id: 'memo',
    short: '日ごとメモ',
    title: 'メモを追加してみよう',
    desc: '「スープにレタスも」など、その日の一言を家族と共有',
    to: '/week',
    spot: 'memo-add',
    gesture: 'タップ',
    hint: '「メモを追加」を押すと、見本のメモが入って自動で保存されます',
  },
  {
    id: 'check',
    short: '買い物リスト',
    title: '買い物リストでチェック',
    desc: '献立の材料が、売り場の順にまとまっています',
    to: '/shopping',
    spot: 'shop-check',
    gesture: 'タップ',
    hint: '丸を押すと「かごに入れた」になります',
  },
  {
    id: 'pantry',
    short: 'うちの在庫',
    title: '在庫を入れてみよう',
    desc: '冷蔵庫にあるものは、買い物リストから差し引かれます',
    to: '/pantry',
    spot: 'pantry-add',
    gesture: 'タップ',
    hint: '「追加」を押すと、見本の食材が入った状態で開きます',
    then: {
      spot: 'pantry-save',
      gesture: 'タップ',
      hint: '見本が入っています。「在庫に入れる」を押してみましょう',
    },
  },
  {
    id: 'import',
    short: 'レシピの取り込み',
    title: 'レシピを取り込んでみよう',
    desc: 'レシピ本の写真から、材料と手順を自動で読み取ります',
    to: '/recipes',
    spot: 'recipe-import',
    gesture: 'タップ',
    hint: '「写真・URL」から、見本の写真で取り込みを試せます',
    then: {
      spot: 'import-sample',
      gesture: 'タップ',
      hint: '「この写真で試す」を押してみましょう',
    },
  },
  {
    id: 'family',
    short: '家族との共有',
    title: '家族と一緒に使ってみよう',
    desc: '家族が変えたことが、すぐに届きます',
    to: '/',
    spot: 'family',
    gesture: 'タップ',
    hint: '押すと、家族役の「はなこ」さんがメモや献立を変えに来ます',
  },
];

/** 文字の入力が要るミッションで、あらかじめ入れておく見本 */
export const TOUR_PREFILL = {
  memo: 'スープにレタスも入れたい',
  pantry: () => ({ name: 'キャベツ', qty: '0.5', unit: '個', expires: addDays(toJstDate(), 3) }),
};

type State = {
  user: string | null;
  done: ReadonlySet<MissionId>;
  spot: Mission | null;
  /** いまクリアしたばかりのミッション（コーチが「クリア！次は…」を出す） */
  cleared: MissionId | null;
};
let state: State = { user: null, done: new Set(), spot: null, cleared: null };
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

/** 次にやるミッション（まだクリアしていないもののうち、いちばん前） */
export const nextMission = (done: ReadonlySet<MissionId>) => MISSIONS.find((m) => !done.has(m.id));

/** お試しのユーザーを決める（ユーザーごとに進み具合を分ける）。null で止める */
export function setTourUser(user: string | null) {
  if (state.user === user) return;
  state = { user, done: user ? load(user) : new Set(), spot: null, cleared: null };
  emit();
}

/** いまそのミッションに取り組んでいるか（見本の文字を入れるかどうかに使う） */
export function isActiveMission(id: MissionId) {
  return !!state.user && !state.done.has(id) && nextMission(state.done)?.id === id;
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
  state = { ...state, done, spot: state.spot?.id === id ? null : state.spot, cleared: id };
  emit();
}

/** ミッションの場所を光らせる（画面の移動は呼び出し側で） */
export function showSpot(mission: Mission | null) {
  state = { ...state, spot: mission, cleared: mission ? null : state.cleared };
  emit();
}

/** 「クリア！」の表示を閉じる */
export function dismissCleared() {
  state = { ...state, cleared: null };
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
