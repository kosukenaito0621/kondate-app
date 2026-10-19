/**
 * URL のクエリ（?w=… など）を読むための小さな関数。
 * zod を使うと最初に読むファイルが大きくなるので、ルートの検証はこれで行う。
 * 形が合わない値はエラーにせず、なかったことにする（壊れたリンクでも画面は開く）。
 */
export const optString = (v: unknown, max = 200): string | undefined =>
  typeof v === 'string' && v.length <= max ? v : typeof v === 'number' ? String(v) : undefined;

export const optMatch = (v: unknown, re: RegExp): string | undefined => {
  const s = optString(v);
  return s !== undefined && re.test(s) ? s : undefined;
};

export const optOneOf = <T extends string>(v: unknown, list: readonly T[]): T | undefined =>
  list.includes(v as T) ? (v as T) : undefined;

/** undefined のキーを落とす（URL に ?q=undefined が出ないように） */
export const compact = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
