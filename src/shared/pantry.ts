import { z } from 'zod';
import { UNITS, type Section } from './constants';
import { isIsoDate } from './date';
import { normalizeIngredientName } from './ingredients';
import { formatAmount } from './recipe';
import { PACKS, toPackUnit } from './purchase';
import { family, MASS, present, VOLUME } from './shopping';

/**
 * うちの在庫（冷蔵庫・棚にある食材）。
 * 分量は「300g」「2個」のように数と単位で持つ。数が分からないときは「あり」（数量なし）。
 */
export type Qty = { quantity: number | null; unit: string | null };

export type PantryItemView = {
  id: string;
  name: string;
  section: Section;
  quantity: number | null;
  unit: string | null;
  /** 期限（YYYY-MM-DD）。なければ null */
  expiresOn: string | null;
  updatedAt: number;
};

export const pantryInputSchema = z.object({
  name: z.string().trim().min(1, '食材名を入力してください').max(40),
  quantity: z.number().positive().max(100000).nullable(),
  unit: z.enum(UNITS).nullable(),
  expiresOn: z.string().refine(isIsoDate).nullable(),
});
export type PantryInput = z.infer<typeof pantryInputSchema>;

export const pantryPatchSchema = pantryInputSchema.partial();

/** 買い物リストのチェック済みを在庫に入れる */
export const stockFromShoppingSchema = z.object({ weekStart: z.string().refine(isIsoDate) });

type Base = { key: string; base: number; units: Set<string> };

/**
 * 比べたり足したりできる形（g・ml にそろえる。個・本などは同じ単位どうしだけ）。
 * 買う単位を登録した食材（キャベツなど）は、名前が分かれば「枚」「g」も「個」にそろえる
 */
function toBase(q: Qty, name?: string): Base | null {
  if (q.quantity === null) return null;
  const pack = name ? PACKS[name] : undefined;
  if (pack) {
    const v = toPackUnit(name!, q);
    if (v !== null) return { key: `pack:${pack.unit}`, base: v, units: new Set([pack.unit]) };
  }
  const fam = family(q.unit);
  if (fam === 'mass')
    return { key: 'mass', base: q.quantity * MASS[q.unit!]!, units: new Set([q.unit!]) };
  if (fam === 'volume')
    return { key: 'volume', base: q.quantity * VOLUME[q.unit!]!, units: new Set([q.unit!]) };
  return { key: q.unit ?? '', base: q.quantity, units: new Set(q.unit ? [q.unit] : []) };
}

const round = (n: number) => Math.round(n * 100) / 100;

function fromBase(b: Base): Qty {
  if (b.key === 'mass' || b.key === 'volume') {
    const p = present(b.key, b.base, b.units);
    return { quantity: round(p.q), unit: p.u };
  }
  if (b.key.startsWith('pack:')) return { quantity: round(b.base), unit: b.key.slice(5) };
  return { quantity: round(b.base), unit: b.key || null };
}

export const qtyLabel = (q: Qty) =>
  q.quantity === null ? 'あり' : formatAmount({ ...q, amountText: null });

/**
 * 必要な量から在庫を差し引く。
 * - covered：在庫で足りる（在庫の数量が分からないときも、あるものとして扱う）
 * - partial：一部だけ足りる。remaining が買う量
 * - none：単位がちがって比べられない（買い物リストはそのまま、在庫を添えて見せる）
 */
export function compareStock(
  need: Qty,
  have: Qty[],
  name?: string,
): { status: 'covered' | 'partial' | 'none'; remaining: Qty } {
  if (have.length === 0) return { status: 'none', remaining: need };
  if (have.some((h) => h.quantity === null)) return { status: 'covered', remaining: need };
  const n = toBase(need, name);
  if (!n) return { status: 'covered', remaining: need };
  const sum = have
    .map((h) => toBase(h, name))
    .filter((h): h is Base => !!h && h.key === n.key)
    .reduce((s, h) => s + h.base, 0);
  if (sum === 0) return { status: 'none', remaining: need };
  if (sum >= n.base) return { status: 'covered', remaining: need };
  return { status: 'partial', remaining: fromBase({ ...n, base: n.base - sum }) };
}

/** 在庫の合計（表示用。単位がちがうものは併記） */
export function stockLabel(have: Qty[], name?: string): string {
  if (have.some((h) => h.quantity === null)) return 'あり';
  const byKey = new Map<string, Base>();
  for (const h of have) {
    const b = toBase(h, name);
    if (!b) continue;
    const prev = byKey.get(b.key);
    if (prev) {
      prev.base += b.base;
      for (const u of b.units) prev.units.add(u);
    } else byKey.set(b.key, b);
  }
  return [...byKey.values()].map((b) => qtyLabel(fromBase(b))).join(' + ');
}

/** 同じ単位の仲間なら足す（買ったものを在庫に入れるとき） */
export function addQty(a: Qty, b: Qty, name?: string): Qty | null {
  if (a.quantity === null || b.quantity === null) return { quantity: null, unit: null };
  const x = toBase(a, name);
  const y = toBase(b, name);
  if (!x || !y || x.key !== y.key) return null;
  return fromBase({ key: x.key, base: x.base + y.base, units: new Set([...x.units, ...y.units]) });
}

export type StockRow = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  expiresOn: string | null;
};
export type StockUse = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  expiresOn: string | null;
};

/**
 * 料理を作ったときに在庫から使う量を決める。期限の近いものから使う。
 * 数量の分からない在庫や、単位がちがう在庫は減らさない。
 * 戻り値：各在庫の新しい数量（0 以下なら消す）と、取り消し用に使った量
 */
export function consumeStock(
  rows: readonly StockRow[],
  needs: readonly { name: string; quantity: number | null; unit: string | null }[],
): {
  updates: { id: string; quantity: number | null; unit: string | null; remove: boolean }[];
  used: StockUse[];
} {
  const left = new Map(rows.map((r) => [r.id, { ...r }]));
  const used: StockUse[] = [];
  for (const need of needs) {
    const key = normalizeIngredientName(need.name);
    const n = toBase(need, key);
    if (!n) continue;
    let rest = n.base;
    const candidates = [...left.values()]
      .filter((r) => r.name === key && r.quantity !== null)
      .sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'));
    for (const r of candidates) {
      if (rest <= 0) break;
      const b = toBase(r, key);
      if (!b || b.key !== n.key || b.base <= 0) continue;
      const take = Math.min(rest, b.base);
      rest -= take;
      const after = fromBase({ ...b, base: b.base - take });
      const usedQty = fromBase({ ...b, base: take });
      used.push({
        id: r.id,
        name: r.name,
        quantity: usedQty.quantity!,
        unit: usedQty.unit,
        expiresOn: r.expiresOn,
      });
      r.quantity = after.quantity;
      r.unit = after.unit;
    }
  }
  const updates = rows
    .map((r) => {
      const now = left.get(r.id)!;
      if (now.quantity === r.quantity && now.unit === r.unit) return null;
      return { id: r.id, quantity: now.quantity, unit: now.unit, remove: (now.quantity ?? 1) <= 0 };
    })
    .filter((u): u is NonNullable<typeof u> => !!u);
  return { updates, used };
}

/** 期限まであと何日か（今日が期限なら 0、過ぎていれば負） */
export function daysUntil(expiresOn: string, today: string) {
  return Math.round((Date.parse(expiresOn) - Date.parse(today)) / 86_400_000);
}
