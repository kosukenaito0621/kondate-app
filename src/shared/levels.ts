// 料理レベル。名前・説明はこのファイルだけで管理する（「初級/上級」という言葉は使わない）
export const COOKING_LEVELS = ['futaba', 'minori'] as const;
export type CookingLevel = (typeof COOKING_LEVELS)[number];

export const LEVEL_META: Record<
  CookingLevel,
  { emoji: string; name: string; description: string }
> = {
  futaba: {
    emoji: '🌱',
    name: 'ふたば',
    description: 'まずは気軽に。手順が少なく、失敗しにくいメニュー中心',
  },
  minori: {
    emoji: '🌾',
    name: 'みのり',
    description: 'レパートリーを広げたい人に。手の込んだ料理もおまかせ',
  },
};

/** 曜日ごとの設定。inherit はグループの既定レベルに従う */
export const DAY_LEVELS = ['inherit', ...COOKING_LEVELS] as const;
export type DayLevel = (typeof DAY_LEVELS)[number];

/** ふたばの基準（シード検証・AI推定の目安） */
export const FUTABA_RULES = {
  maxSteps: 5,
  /** 調味料以外の材料の品目数 */
  maxIngredients: 7,
  /** これらのタグを持つレシピはふたばにしない */
  excludedTags: ['揚げ物', '三枚おろし'],
} as const;

/** 献立生成：みのりの日に、みのりのレシピを優先する重み */
export const MINORI_PREFERENCE_WEIGHT = 1.6;
