/**
 * 傷みやすい食材の「買うときの単位」。
 * 白菜は1/4株から、なすは3本袋で…のように、必要な量より多く買うことになる食材を登録し、
 * - 買い物リストに「目安 1/2個（約1/4個あまる）」「月・木で使い切り」を出す
 * - 献立作成で、同じ週にすでに使う食材を使う料理を出やすくする（使い切り）
 * - 買ったものを在庫に入れるとき、実際に買う量で入れる
 * に使う。
 */
export type Pack = {
  /** 数える単位（レシピでいちばん多い書き方） */
  unit: string;
  /** 売っている量（unit で。例：白菜は 1/4・1/2・1株） */
  sizes: number[];
  /** ほかの単位から unit への換算（1枚 = 1/20個 など）。g は 1g あたり */
  per?: Partial<Record<string, number>>;
};

const P = (unit: string, sizes: number[], per?: Pack['per']): Pack => ({ unit, sizes, per });

export const PACKS: Readonly<Record<string, Pack>> = {
  キャベツ: P('個', [0.5, 1], { 枚: 1 / 20, g: 1 / 1000 }),
  白菜: P('個', [0.25, 0.5, 1], { 枚: 1 / 20, g: 1 / 2000 }),
  大根: P('本', [0.5, 1], { cm: 1 / 30, g: 1 / 1000 }),
  レタス: P('個', [1], { 枚: 1 / 15, g: 1 / 300 }),
  かぼちゃ: P('個', [0.25, 0.5, 1], { g: 1 / 1200 }),
  ブロッコリー: P('株', [1], { g: 1 / 250 }),
  ほうれん草: P('束', [1], { g: 1 / 200 }),
  小松菜: P('束', [1], { g: 1 / 250 }),
  春菊: P('束', [1], { g: 1 / 150 }),
  ニラ: P('束', [1], { g: 1 / 100 }),
  三つ葉: P('束', [1]),
  チンゲン菜: P('株', [2], { g: 1 / 100 }),
  もやし: P('袋', [1], { g: 1 / 200 }),
  長ねぎ: P('本', [1], { cm: 1 / 50, g: 1 / 100 }),
  小ねぎ: P('本', [10], { g: 1 / 5 }),
  なす: P('本', [3], { g: 1 / 80 }),
  きゅうり: P('本', [3], { g: 1 / 100 }),
  ピーマン: P('個', [5], { g: 1 / 35 }),
  パプリカ: P('個', [1], { g: 1 / 150 }),
  トマト: P('個', [1], { g: 1 / 150 }),
  ミニトマト: P('個', [12]),
  ズッキーニ: P('本', [1], { g: 1 / 200 }),
  セロリ: P('本', [1], { g: 1 / 100 }),
  ごぼう: P('本', [1], { cm: 1 / 50, g: 1 / 150 }),
  いんげん: P('本', [20], { g: 1 / 7 }),
  アスパラガス: P('本', [4], { g: 1 / 20 }),
  大葉: P('枚', [10]),
  しいたけ: P('枚', [6], { g: 1 / 15 }),
  しめじ: P('パック', [1], { g: 1 / 100 }),
  えのき: P('袋', [1], { g: 1 / 200 }),
  まいたけ: P('パック', [1], { g: 1 / 100 }),
  エリンギ: P('本', [3], { パック: 3, g: 1 / 40 }),
  木綿豆腐: P('丁', [1], { g: 1 / 300 }),
  絹ごし豆腐: P('丁', [1], { g: 1 / 300 }),
  油揚げ: P('枚', [2]),
  厚揚げ: P('枚', [2]),
  牛乳: P('ml', [1000], { L: 1000, カップ: 200, 大さじ: 15, 小さじ: 5 }),
  生クリーム: P('ml', [200], { カップ: 200, 大さじ: 15 }),
};

export const isPacked = (name: string) => name in PACKS;

type Amount = { quantity: number | null; unit: string | null; amountText?: string | null };

/** 分量をその食材の数える単位にそろえる（換算できなければ null） */
export function toPackUnit(name: string, a: Amount): number | null {
  const pack = PACKS[name];
  if (!pack) return null;
  let q = a.quantity;
  let unit = a.unit;
  // 「5cm」のように文字で書かれた分量
  if (q === null && a.amountText) {
    const m = a.amountText.normalize('NFKC').match(/^(\d+(?:\.\d+)?)(cm|g)$/);
    if (m) {
      q = Number(m[1]);
      unit = m[2]!;
    }
  }
  if (q === null) return null;
  if (unit === pack.unit) return q;
  if (unit === 'kg' && pack.per?.g) return q * 1000 * pack.per.g;
  const f = unit ? pack.per?.[unit] : undefined;
  return f ? q * f : null;
}

const EPS = 1e-6;

/**
 * 必要な量に対して、いくら買えばよいか（売っている量の倍数で、いちばん少なく済む買い方）。
 * leftover はあまる量。
 */
export function purchaseFor(name: string, need: number) {
  const pack = PACKS[name];
  if (!pack || need <= 0) return null;
  const buy = Math.min(...pack.sizes.map((s) => Math.ceil(need / s - EPS) * s));
  return { unit: pack.unit, buy, leftover: Math.max(0, buy - need) };
}

/**
 * あまりを分かりやすい量に丸める。
 * 1/4株・1/2本から売る食材はその半分刻み、1本・1丁で売るものは 1/4 刻み、
 * 3本袋などは1刻み、ml は 50 刻み
 */
export function roundLeftover(name: string, leftover: number) {
  const pack = PACKS[name];
  if (!pack) return 0;
  const min = Math.min(...pack.sizes);
  const step = pack.unit === 'ml' ? 50 : min < 1 ? min / 2 : min === 1 ? 0.25 : 1;
  return Math.round(leftover / step) * step;
}
