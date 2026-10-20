import type { RecipeInput } from '../../shared/recipe';

/**
 * お試しの「レシピを取り込んでみよう」で使う見本。
 * AI の無料枠を使わないよう、見本の写真（public/demo/sample-recipe.svg）を読み取った結果を用意しておき、
 * 本物と同じ「読み取り中」の演出のあとで表示する
 */
export const DEMO_IMAGE = '/demo/sample-recipe.svg';

export const DEMO_DRAFT: { draft: RecipeInput; warnings: string[] } = {
  draft: {
    name: '鶏むね肉のはちみつレモンソテー',
    category: 'main',
    genre: 'yo',
    servings: 2,
    timeMinutes: 20,
    costYen: 380,
    mainIngredient: 'chicken',
    difficulty: 'futaba',
    ingredients: [
      { name: '鶏むね肉', quantity: 300, unit: 'g', amountText: null, section: 'meat' },
      { name: '塩', quantity: null, unit: null, amountText: '少々', section: 'seasoning' },
      { name: 'こしょう', quantity: null, unit: null, amountText: '少々', section: 'seasoning' },
      { name: '片栗粉', quantity: 1, unit: '大さじ', amountText: null, section: 'seasoning' },
      {
        name: 'オリーブオイル',
        quantity: 1,
        unit: '大さじ',
        amountText: null,
        section: 'seasoning',
      },
      { name: 'はちみつ', quantity: 1.5, unit: '大さじ', amountText: null, section: 'seasoning' },
      { name: 'しょうゆ', quantity: 1, unit: '大さじ', amountText: null, section: 'seasoning' },
      { name: 'レモン汁', quantity: 1, unit: '大さじ', amountText: null, section: 'seasoning' },
    ],
    steps: [
      {
        text: '鶏肉はそぎ切りにし、塩・こしょうをふって片栗粉をまぶす',
        tip: '片栗粉をまぶすと、むね肉でもしっとり仕上がります',
      },
      {
        text: 'フライパンにオイルを熱し、鶏肉を両面3分ずつ焼く',
        tip: '焼いている間はあまり動かさないと、きれいな焼き色が付きます',
      },
      {
        text: 'はちみつ・しょうゆ・レモン汁を混ぜて加え、からめながら煮詰める',
        tip: 'たれに照りが出たらできあがり。焦げやすいので弱めの中火で',
      },
    ],
    tags: ['お試し'],
    imageKey: null,
    sourceUrl: null,
    seasons: [],
    seasonOnly: false,
  },
  warnings: ['これはお試し用の見本です。保存すると「うちのレシピ」に入ります'],
};
