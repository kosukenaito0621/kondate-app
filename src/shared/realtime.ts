/** グループ内に配るリアルタイムのお知らせ（正しいデータは常に API から取り直す） */
export type RealtimeEvent =
  | {
      type: 'plan.updated';
      weekStart: string;
      /** 変わった日付（ハイライト用） */
      dates: string[];
      /** 例: 水曜の主菜を変更しました */
      summary: string;
      by: { id: string; name: string | null };
    }
  | {
      type: 'shopping.updated';
      weekStart: string;
      summary: string;
      by: { id: string; name: string | null };
    }
  | {
      type: 'memo.updated';
      weekStart: string;
      date: string;
      summary: string;
      by: { id: string; name: string | null };
    }
  | { type: 'pantry.updated'; summary: string; by: { id: string; name: string | null } }
  | { type: 'logs.updated'; by: { id: string; name: string | null } }
  | { type: 'settings.updated'; by: { id: string; name: string | null } }
  | { type: 'recipes.updated'; by: { id: string; name: string | null } }
  | { type: 'group.updated'; by: { id: string; name: string | null } };

export type RealtimeEventInput = RealtimeEvent extends infer E
  ? E extends { by: unknown }
    ? Omit<E, 'by'>
    : never
  : never;
