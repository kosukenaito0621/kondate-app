import { aiRecipeSchema, AI_RECIPE_JSON_SCHEMA, extractJson, type AiRecipe } from './draft';

/**
 * 使うモデル（ここだけ変えれば差し替えられる）。
 * 公式ドキュメントで画像入力対応を確認したもの。日本語の読み取り精度は実機で比較して選ぶ。
 */
export const VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const TEXT_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

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
  section: veg=野菜・きのこ・果物 / meat=肉・ハム / fish=魚介・練り物 / dairy_egg=卵・乳製品 / soy=豆腐・大豆製品 / dry=乾物・麺・缶詰 / other=その他 / seasoning=調味料・油・粉・水・だし。
- steps: 番号を除いた手順を順番どおりに。text は1手順1文〜2文。
  tip は初心者向けのひとことコツ（30字程度）。futaba のときは全手順に入れる。
- timeMinutes: 書かれていればその値、なければ手順から推定。
- costYen: 書かれた人数分の材料費の目安（円）を推定。
- servings: 書かれていなければ 2。
- tags: 0〜3個（例: 作り置き, お弁当, 時短, 節約）。`;

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

async function callModel(ai: Ai, input: AiInput, messages: Message[]) {
  const common = {
    max_tokens: 2500,
    temperature: 0.1,
    response_format: { type: 'json_schema', json_schema: AI_RECIPE_JSON_SCHEMA },
  };
  if (input.kind === 'text') {
    return (
      ai as unknown as { run: (m: string, i: unknown) => Promise<{ response?: unknown }> }
    ).run(TEXT_MODEL, { ...common, messages });
  }
  const run = (
    ai as unknown as { run: (m: string, i: unknown) => Promise<{ response?: unknown }> }
  ).run.bind(ai);
  const dataUri = toDataUri(input.bytes, input.contentType);
  const [system, ...rest] = messages;
  const last = rest[rest.length - 1]!;
  try {
    // OpenAI 互換の形式（文字と画像を content の配列で渡す）
    return await run(VISION_MODEL, {
      ...common,
      messages: [
        system,
        ...rest.slice(0, -1),
        {
          role: 'user',
          content: [
            { type: 'text', text: String(last.content) },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
    });
  } catch (e) {
    console.warn('vision content-array format failed, retrying with image field', e);
    // Workers AI のビジョンチュートリアルの形式（image 欄）
    return await run(VISION_MODEL, { ...common, messages, image: dataUri });
  }
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
    const json = extractJson(res?.response);
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
        content: typeof res?.response === 'string' ? res.response : JSON.stringify(res?.response),
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
