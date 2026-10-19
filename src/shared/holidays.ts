/**
 * 日本の祝日（「国民の祝日に関する法律」の現行のきまり）。外部に問い合わせず計算で求める。
 * 春分・秋分は国立天文台の発表と一致する近似式（1980〜2099年）を使う。
 * 振替休日（祝日が日曜なら、次の祝日でない日）と国民の休日（祝日にはさまれた平日）も含む。
 */
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** その月の第 n 月曜日 */
function nthMonday(y: number, m: number, n: number) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=日
  const firstMonday = 1 + ((8 - first) % 7);
  return firstMonday + (n - 1) * 7;
}

const shunbun = (y: number) =>
  Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const shubun = (y: number) =>
  Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

/** 法律で決まった祝日（振替・国民の休日を除く） */
function baseHolidays(y: number): Map<string, string> {
  const h = new Map<string, string>();
  h.set(iso(y, 1, 1), '元日');
  h.set(iso(y, 1, nthMonday(y, 1, 2)), '成人の日');
  h.set(iso(y, 2, 11), '建国記念の日');
  if (y >= 2020) h.set(iso(y, 2, 23), '天皇誕生日');
  h.set(iso(y, 3, shunbun(y)), '春分の日');
  h.set(iso(y, 4, 29), '昭和の日');
  h.set(iso(y, 5, 3), '憲法記念日');
  h.set(iso(y, 5, 4), 'みどりの日');
  h.set(iso(y, 5, 5), 'こどもの日');
  // 東京オリンピックの年だけ日付が違う
  if (y === 2020) h.set(iso(y, 7, 23), '海の日');
  else if (y === 2021) h.set(iso(y, 7, 22), '海の日');
  else h.set(iso(y, 7, nthMonday(y, 7, 3)), '海の日');
  if (y === 2020) h.set(iso(y, 8, 10), '山の日');
  else if (y === 2021) h.set(iso(y, 8, 8), '山の日');
  else h.set(iso(y, 8, 11), '山の日');
  h.set(iso(y, 9, nthMonday(y, 9, 3)), '敬老の日');
  h.set(iso(y, 9, shubun(y)), '秋分の日');
  if (y === 2020) h.set(iso(y, 7, 24), 'スポーツの日');
  else if (y === 2021) h.set(iso(y, 7, 23), 'スポーツの日');
  else h.set(iso(y, 10, nthMonday(y, 10, 2)), 'スポーツの日');
  h.set(iso(y, 11, 3), '文化の日');
  h.set(iso(y, 11, 23), '勤労感謝の日');
  return h;
}

const cache = new Map<number, Map<string, string>>();

function holidaysOf(y: number): Map<string, string> {
  const cached = cache.get(y);
  if (cached) return cached;
  const base = baseHolidays(y);
  const all = new Map(base);
  const dayOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
  const add = (d: string, n: number) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  // 振替休日：日曜の祝日のあと、最初の祝日でない日
  for (const d of base.keys()) {
    if (dayOf(d) !== 0) continue;
    let next = add(d, 1);
    while (base.has(next)) next = add(next, 1);
    if (next.startsWith(String(y))) all.set(next, '振替休日');
  }
  // 国民の休日：前後が祝日で、日曜でない日
  for (const d of base.keys()) {
    const mid = add(d, 1);
    if (base.has(add(d, 2)) && !all.has(mid) && dayOf(mid) !== 0) all.set(mid, '国民の休日');
  }
  cache.set(y, all);
  return all;
}

/** 'YYYY-MM-DD' が祝日なら名前、そうでなければ null */
export function holidayName(date: string): string | null {
  const y = Number(date.slice(0, 4));
  if (!Number.isFinite(y)) return null;
  return holidaysOf(y).get(date) ?? null;
}
