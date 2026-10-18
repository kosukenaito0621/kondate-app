import { SECTIONS, type Section } from './constants';
import { normalizeIngredientName } from './ingredients';
import { formatAmount } from './recipe';

export type ShoppingSource = {
  recipeName: string;
  recipeServings: number;
  ingredients: {
    name: string;
    quantity: number | null;
    unit: string | null;
    amountText: string | null;
    section: Section;
  }[];
};

export type ShoppingLine = {
  name: string;
  section: Section;
  quantity: number | null;
  unit: string | null;
  /** 合算できない分量がある場合の表示（例: 1個 + 100g） */
  amountText: string | null;
  /** どの料理に使うか */
  sources: string[];
};

/** 調味料と同じく「家にある前提」で買い物リストに出さないもの（買うに指定すれば出す） */
export const HOME_STAPLES = ['水', '湯', 'ご飯', '米'];

export const isHomeStock = (section: Section, name: string) =>
  section === 'seasoning' || HOME_STAPLES.includes(name);

/** 同じ種類の単位をそろえて足すための換算（基準単位あたりの量） */
const MASS: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME: Record<string, number> = { ml: 1, L: 1000, カップ: 200, 大さじ: 15, 小さじ: 5 };

function family(unit: string | null): 'mass' | 'volume' | null {
  if (!unit) return null;
  if (unit in MASS) return 'mass';
  if (unit in VOLUME) return 'volume';
  return null;
}

/** 表示しやすい単位に戻す */
function present(fam: 'mass' | 'volume', base: number, units: Set<string>) {
  if (fam === 'mass')
    return base >= 1000 && base % 100 === 0 ? { q: base / 1000, u: 'kg' } : { q: base, u: 'g' };
  // 大さじ・小さじだけなら大さじで、それ以外は ml で
  if ([...units].every((u) => u === '大さじ' || u === '小さじ')) {
    return base % 15 === 0 ? { q: base / 15, u: '大さじ' } : { q: base / 5, u: '小さじ' };
  }
  return base >= 1000 && base % 100 === 0 ? { q: base / 1000, u: 'L' } : { q: base, u: 'ml' };
}

/** 数量を見やすく丸める（端数は 0.1 単位、分数で表せるものはそのまま） */
function tidy(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * 献立のレシピから買い物リストを作る。
 * - 分量は人数に合わせて換算（servings / レシピの人数）
 * - 調味料（section=seasoning）は除外。buySeasonings に入っている材料は残す
 * - 同じ材料は合算。g/kg、ml/L/カップ/大さじ/小さじ はそろえて足し、
 *   個・本など同じ単位どうしは足す。合算できないものは併記する
 * - 売り場順（SECTIONS の順）→ 名前順に並べる
 */
export function buildShoppingList(
  sources: readonly ShoppingSource[],
  servings: number,
  buySeasonings: readonly string[] = [],
): ShoppingLine[] {
  const buy = new Set(buySeasonings.map(normalizeIngredientName));

  type Acc = {
    name: string;
    section: Section;
    byUnit: Map<string, { base: number; units: Set<string> }>; // key: family か単位
    texts: Set<string>;
    sources: Set<string>;
  };
  const acc = new Map<string, Acc>();

  for (const src of sources) {
    const scale = servings / (src.recipeServings || 2);
    for (const ing of src.ingredients) {
      const name = normalizeIngredientName(ing.name);
      if (isHomeStock(ing.section, name) && !buy.has(name)) continue;
      const a =
        acc.get(name) ??
        ({
          name,
          section: ing.section,
          byUnit: new Map(),
          texts: new Set(),
          sources: new Set(),
        } as Acc);
      a.sources.add(src.recipeName);

      if (ing.quantity === null) {
        if (ing.amountText) a.texts.add(ing.amountText);
      } else {
        const fam = family(ing.unit);
        const key = fam ?? ing.unit ?? '';
        const factor =
          fam === 'mass' ? MASS[ing.unit!]! : fam === 'volume' ? VOLUME[ing.unit!]! : 1;
        const slot = a.byUnit.get(key) ?? { base: 0, units: new Set<string>() };
        slot.base += ing.quantity * scale * factor;
        if (ing.unit) slot.units.add(ing.unit);
        a.byUnit.set(key, slot);
      }
      acc.set(name, a);
    }
  }

  const lines: ShoppingLine[] = [];
  for (const a of acc.values()) {
    const parts = [...a.byUnit.entries()].map(([key, v]) => {
      if (key === 'mass' || key === 'volume') {
        const p = present(key, v.base, v.units);
        return { quantity: tidy(p.q), unit: p.u };
      }
      return { quantity: tidy(v.base), unit: key || null };
    });
    const texts = [...a.texts];
    let line: Pick<ShoppingLine, 'quantity' | 'unit' | 'amountText'>;
    if (parts.length === 1 && texts.length === 0) {
      line = { quantity: parts[0]!.quantity, unit: parts[0]!.unit, amountText: null };
    } else if (parts.length === 0) {
      line = { quantity: null, unit: null, amountText: texts.join('・') || null };
    } else {
      line = {
        quantity: null,
        unit: null,
        amountText: [
          ...parts.map((p) =>
            formatAmount({ quantity: p.quantity, unit: p.unit, amountText: null }),
          ),
          ...texts,
        ].join(' + '),
      };
    }
    lines.push({ name: a.name, section: a.section, ...line, sources: [...a.sources] });
  }

  return lines.sort(
    (x, y) =>
      SECTIONS.indexOf(x.section) - SECTIONS.indexOf(y.section) ||
      x.name.localeCompare(y.name, 'ja'),
  );
}

/** 表示用の分量 */
export function lineAmount(l: Pick<ShoppingLine, 'quantity' | 'unit' | 'amountText'>) {
  if (l.amountText) return l.amountText;
  if (l.quantity === null) return '';
  return formatAmount({ quantity: l.quantity, unit: l.unit, amountText: null });
}

/** 再生成のときにチェック状態を引き継ぐための鍵（名前のみ。分量が変わってもチェックは残す） */
export const lineKey = (l: { name: string }) => normalizeIngredientName(l.name);

// ===== API の型 =====

export type ShoppingItemView = {
  id: string;
  name: string;
  section: Section;
  quantity: number | null;
  unit: string | null;
  amountText: string | null;
  sources: string[];
  checked: boolean;
  checkedBy: { id: string; name: string | null; avatarUrl: string | null } | null;
  isManual: boolean;
};

export type ShoppingListView = {
  weekStart: string;
  /** その週の献立があるか */
  exists: boolean;
  items: ShoppingItemView[];
  /** 献立が変わってリストが古くなっているか */
  outdated: boolean;
  /** 家にある前提で除外した調味料など（タップで「買う」に切り替えられる） */
  excludedSeasonings: string[];
  servings: number;
};
