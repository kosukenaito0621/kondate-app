// 日付はすべて Asia/Tokyo 基準の 'YYYY-MM-DD' 文字列で扱う
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** JSTの日付文字列 */
export function toJstDate(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** JSTの時（0-23） */
export function jstHour(now: Date = new Date()): number {
  return new Date(now.getTime() + JST_OFFSET_MS).getUTCHours();
}

/** 'YYYY-MM-DD' に日数を加算 */
export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** 曜日インデックス（0=月 … 6=日） */
export function weekdayIndex(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=日
  return (d + 6) % 7;
}

/** その日を含む週の月曜日 */
export function weekStartOf(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/** 週の7日分 */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const;

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
