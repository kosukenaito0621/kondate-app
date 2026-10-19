import { aiRecipeSchema, AI_RECIPE_JSON_SCHEMA, extractJson, type AiRecipe } from './draft';

/**
 * 使うモデル（ここだけ変えれば差し替えられる）。
 * 2026-10-18 に日本語のレシピ画像で比較：mistral-small-3.1 が約15秒で最も正確
 * （llama-4-scout 約30秒・分量の誤読あり、qwen3.8 約57秒、gemma-4 は形式崩れ）。
 */
export const VISION_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
export const TEXT_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

const SYSTEM_PROMPT = `あなたは料理本の写真やレシピサイトから、レシピを正確に読み取るアシスタントです。
次のルールで、指定された JSON だけを返してください。説明文は不要です。

- 書かれている内容を正確に写す。材料名・分量は書かれたとおり。書かれていない材料を足さない。
- name: 料理名。
- category: main=主菜（肉・魚・卵・豆腐などが主役のおかず、丼・麺・パスタ・カレーも含む）/ soup=汁物 / side=副菜。
- genre: wa=和食 / yo=洋食 / chu=中華（韓国料理やエスニックは近いほう）。
- mainIngredient: chicken / pork / beef / fish（魚介全般）/ egg / tofu（豆腐・大豆製品）/ veg / other。
- difficulty（料理レベル）:
  futaba = 料理に慣れていない人でも作れる。手順が5つ以内、揚げ物・三枚おろしなし、調味料以外の材料が7品目以内、火加減が難しくない。
  minori = それ以外。
- ingredients: name と amount（「200g」「大さじ2」「1/2個」「少々」など書かれたまま）と section。
  group: 「A」「B」「たれ」「合わせ調味料」など見出しの下にまとめられた材料は、その見出し（記号はそのまま、例「A」）。見出しがなければ空文字。
    同じ調味料が複数のグループにあっても、まとめずに別々に書く。
  section: veg=野菜・きのこ・果物 / meat=肉・ハム / fish=魚介・練り物 / dairy_egg=卵・乳製品 / soy=豆腐・大豆製品 / dry=乾物・麺・缶詰 / other=その他 / seasoning=調味料・油・粉・水・だし。
- steps: 番号を除いた手順を順番どおりに。text は1手順1文〜2文。
  tip は初心者向けのひとことコツ（30字程度）。futaba のときは全手順に入れる。
- timeMinutes: 書かれていればその値、なければ手順から推定。
- costYen: 書かれた人数分の材料費の目安（円）を推定。
- servings: 書かれていなければ 2。
- tags: 0〜3個（例: 作り置き, お弁当, 時短, 節約）。
- seasons: 季節の料理ならその季節（spring/summer/autumn/winter）。冷やし中華・そうめん・冷製スープ→summer、おでん・鍋→winter など。通年の料理は空。
- seasonOnly: その季節にしか食べない料理（冷やし中華・おでん など）なら true。旬の材料を使うだけなら false。`;

type AiInput =
  { kind: 'image'; bytes: Uint8Array; contentType: string } | { kind: 'text'; text: string };

function toDataUri(bytes: Uint8Array, type: string) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${type};base64,${btoa(bin)}`;
}

type Message = { role: 'system' | 'user' | 'assistant'; content: unknown };
type RunResult = { response?: unknown; choices?: { message?: { content?: unknown } }[] };

/** AI の呼び出しが返ってこないときに待ち続けないための上限 */
export const AI_TIMEOUT_MS = 90_000;

/**
 * 返答の本文を取り出す。モデルによって { response } 形式と
 * OpenAI 互換の { choices[0].message.content } 形式がある。
 */
export function responseOf(res: RunResult | null | undefined): unknown {
  return res?.response ?? res?.choices?.[0]?.message?.content ?? null;
}

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('ai timeout')), AI_TIMEOUT_MS);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function callModel(ai: Ai, input: AiInput, messages: Message[]): Promise<RunResult> {
  const run = (ai as unknown as { run: (m: string, i: unknown) => Promise<RunResult> }).run.bind(
    ai,
  );
  const common = {
    max_tokens: 2500,
    temperature: 0.1,
    response_format: { type: 'json_schema', json_schema: AI_RECIPE_JSON_SCHEMA },
  };
  if (input.kind === 'text') return withTimeout(run(TEXT_MODEL, { ...common, messages }));

  // 画像は最後のユーザーメッセージに、文字と画像の配列として添える（OpenAI 互換の形式）。
  // 実機確認：image 欄の形式では画像を読まないモデルがある。
  const dataUri = toDataUri(input.bytes, input.contentType);
  const last = messages[messages.length - 1]!;
  return withTimeout(
    run(VISION_MODEL, {
      ...common,
      messages: [
        ...messages.slice(0, -1),
        {
          role: 'user',
          content: [
            { type: 'text', text: String(last.content) },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  );
}

/**
 * 写真・本文からレシピを読み取る。JSON が崩れていたら、理由を伝えて1回だけやり直す。
 */
export async function extractRecipe(ai: Ai, input: AiInput): Promise<AiRecipe> {
  const userText =
    input.kind === 'image'
      ? 'この料理本・レシピの写真から、レシピを読み取ってください。'
      : `次のページの本文から、レシピを読み取ってください。\n\n${input.text}`;
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userText },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callModel(ai, input, messages);
    const json = extractJson(responseOf(res));
    if (json && typeof json === 'object' && 'error' in json && !('name' in json)) {
      throw new ExtractError(
        'レシピを読み取れませんでした。写真が鮮明か、レシピが写っているか確認してください',
      );
    }
    const parsed = aiRecipeSchema.safeParse(json);
    if (parsed.success) return parsed.data;
    const lastError = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(' / ');
    console.warn('ai output invalid', lastError);
    messages.push(
      {
        role: 'assistant',
        content:
          typeof responseOf(res) === 'string' ? responseOf(res) : JSON.stringify(responseOf(res)),
      },
      {
        role: 'user',
        content: `出力が形式に合っていません（${lastError}）。指定の JSON の形だけで、もう一度出力してください。`,
      },
    );
  }
  throw new ExtractError('レシピの形にまとめられませんでした。手入力で補ってください');
}

export class ExtractError extends Error {}
