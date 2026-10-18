import { describe, expect, it } from 'vitest';
import { ExtractError, extractRecipe } from './extract';

const valid = {
  name: '鶏の照り焼き',
  category: 'main',
  genre: 'wa',
  servings: 2,
  timeMinutes: 20,
  costYen: 380,
  mainIngredient: 'chicken',
  difficulty: 'futaba',
  ingredients: [{ name: '鶏もも肉', amount: '1枚', section: 'meat' }],
  steps: [{ text: '焼く', tip: '皮目から' }],
  tags: [],
};

/** env.AI の代わり。呼ばれた入力を記録し、用意した返答を順に返す */
function fakeAi(responses: unknown[], failFirstCall = false) {
  const calls: { model: string; input: Record<string, unknown> }[] = [];
  let i = 0;
  const ai = {
    run: async (model: string, input: Record<string, unknown>) => {
      calls.push({ model, input });
      if (failFirstCall && calls.length === 1) throw new Error('unsupported content format');
      return { response: responses[i++] };
    },
  } as unknown as Ai;
  return { ai, calls };
}

const img = {
  kind: 'image' as const,
  bytes: new Uint8Array([0xff, 0xd8, 0xff]),
  contentType: 'image/jpeg',
};

describe('extractRecipe', () => {
  it('画像は content 配列（image_url の data URI）で渡す', async () => {
    const { ai, calls } = fakeAi([valid]);
    const r = await extractRecipe(ai, img);
    expect(r.name).toBe('鶏の照り焼き');
    const messages = calls[0]!.input.messages as { content: unknown }[];
    const last = messages[messages.length - 1]!.content as {
      type: string;
      image_url?: { url: string };
    }[];
    expect(last[1]!.image_url!.url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('content 配列が使えなければ image 欄の形式でやり直す', async () => {
    const { ai, calls } = fakeAi([valid], true);
    await extractRecipe(ai, img);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.input.image).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('形式が崩れていたら理由を伝えて1回だけやり直す', async () => {
    const { ai, calls } = fakeAi(['すみません、{"name": ""}', JSON.stringify(valid)]);
    const r = await extractRecipe(ai, { kind: 'text', text: '本文' });
    expect(r.name).toBe('鶏の照り焼き');
    expect(calls).toHaveLength(2);
    const retry = calls[1]!.input.messages as { role: string; content: string }[];
    expect(retry[retry.length - 1]!.content).toMatch(/形式に合っていません/);
  });

  it('2回とも失敗したら ExtractError', async () => {
    const { ai } = fakeAi(['だめ', 'まだだめ']);
    await expect(extractRecipe(ai, { kind: 'text', text: '本文' })).rejects.toThrow(ExtractError);
  });

  it('レシピが写っていないと言われたら ExtractError', async () => {
    const { ai } = fakeAi([{ error: 'no recipe' }]);
    await expect(extractRecipe(ai, img)).rejects.toThrow(/読み取れませんでした/);
  });
});
