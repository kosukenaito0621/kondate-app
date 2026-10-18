import { z } from 'zod';
import {
  CATEGORIES,
  GENRES,
  MAIN_INGREDIENTS,
  SECTIONS,
  type Section,
} from '../../shared/constants';
import { normalizeIngredientName, sectionOf } from '../../shared/ingredients';
import { FUTABA_RULES } from '../../shared/levels';
import { parseAmount, type RecipeInput } from '../../shared/recipe';

/** AI に返してもらう形（ゆるめに受けて、あとで整える） */
export const aiRecipeSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum(CATEGORIES).catch('main'),
  genre: z.enum(GENRES).catch('wa'),
  servings: z.coerce.number().int().min(1).max(12).catch(2),
  timeMinutes: z.coerce.number().int().min(1).max(600).catch(30),
  costYen: z.coerce.number().int().min(0).max(100000).catch(400),
  mainIngredient: z.enum(MAIN_INGREDIENTS).catch('other'),
  difficulty: z.enum(['futaba', 'minori']).catch('minori'),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        amount: z.string().max(30).catch(''),
        section: z.enum(SECTIONS).catch('other'),
      }),
    )
    .min(1)
    .max(50),
  steps: z
    .array(z.object({ text: z.string().min(1).max(400), tip: z.string().max(200).nullish() }))
    .min(1)
    .max(30),
  tags: z.array(z.string().max(20)).max(10).catch([]),
});
export type AiRecipe = z.infer<typeof aiRecipeSchema>;

/** guided_json / response_format に渡す JSON Schema（AI への指示用） */
export const AI_RECIPE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '料理名' },
    category: {
      type: 'string',
      enum: [...CATEGORIES],
      description: 'main=主菜, soup=汁物, side=副菜',
    },
    genre: { type: 'string', enum: [...GENRES], description: 'wa=和食, yo=洋食, chu=中華' },
    servings: { type: 'integer', description: '何人分か' },
    timeMinutes: { type: 'integer', description: '調理時間（分）の目安' },
    costYen: { type: 'integer', description: '材料費の目安（円、書かれた人数分）' },
    mainIngredient: { type: 'string', enum: [...MAIN_INGREDIENTS] },
    difficulty: { type: 'string', enum: ['futaba', 'minori'] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: {
            type: 'string',
            description: '書かれている分量そのまま（例: 200g, 大さじ2, 少々）',
          },
          section: { type: 'string', enum: [...SECTIONS] },
        },
        required: ['name', 'amount', 'section'],
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          tip: { type: 'string', description: '初心者向けのひとことコツ' },
        },
        required: ['text'],
      },
    },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'name',
    'category',
    'genre',
    'servings',
    'timeMinutes',
    'costYen',
    'mainIngredient',
    'difficulty',
    'ingredients',
    'steps',
  ],
} as const;

export type RecipeDraft = Omit<RecipeInput, 'imageKey'> & { imageKey: null };

/**
 * AI の結果をアプリのレシピ形式に整える。
 * - 材料名の表記ゆれを統一し、区分は辞書を優先（辞書にない材料だけ AI の推定を使う）
 * - 分量は文字列から数量・単位を読み取る
 * - ふたばの基準（手順5つ以内・揚げ物なし・材料7品目以内）を満たさなければみのりにする
 * - ふたばなのにコツがない手順があれば知らせる
 */
export function toRecipeDraft(ai: AiRecipe, sourceUrl: string | null = null) {
  const warnings: string[] = [];
  const ingredients = ai.ingredients.map((i) => {
    const name = normalizeIngredientName(i.name);
    const section: Section = sectionOf(name) ?? i.section;
    return { name, section, ...parseAmount(i.amount) };
  });

  const nonSeasoning = ingredients.filter((i) => i.section !== 'seasoning').length;
  const fried =
    ai.tags.some((t) => /揚げ/.test(t)) || ai.steps.some((s) => /揚げ(る|て|焼き)/.test(s.text));
  let difficulty = ai.difficulty;
  if (
    difficulty === 'futaba' &&
    (ai.steps.length > FUTABA_RULES.maxSteps || nonSeasoning > FUTABA_RULES.maxIngredients || fried)
  ) {
    difficulty = 'minori';
    warnings.push('手順や材料が多いため、料理レベルを🌾にしました');
  }
  const tags = [...new Set(ai.tags.map((t) => t.replace(/^#/, '').trim()).filter(Boolean))];
  if (fried && !tags.includes('揚げ物')) tags.push('揚げ物');

  const steps = ai.steps.map((s) => ({
    text: s.text.trim(),
    ...(s.tip?.trim() && { tip: s.tip.trim() }),
  }));
  if (difficulty === 'futaba' && steps.some((s) => !s.tip)) {
    warnings.push('🌱のレシピは、コツが空の手順に一言入れておくと安心です');
  }
  if (ingredients.some((i) => i.quantity === null && i.amountText === null)) {
    warnings.push('分量が読み取れなかった材料があります。確認してください');
  }

  const draft: RecipeDraft = {
    name: ai.name.trim().slice(0, 60),
    category: ai.category,
    genre: ai.genre,
    servings: ai.servings,
    timeMinutes: ai.timeMinutes,
    costYen: ai.costYen,
    mainIngredient: ai.mainIngredient,
    difficulty,
    ingredients,
    steps,
    tags: tags.slice(0, 10),
    imageKey: null,
    sourceUrl,
  };
  return { draft, warnings };
}

/** AI の返答から JSON を取り出す（文字列・オブジェクト・前後に説明文がある場合に対応） */
export function extractJson(response: unknown): unknown {
  if (response && typeof response === 'object') return response;
  if (typeof response !== 'string') return null;
  const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : response;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
