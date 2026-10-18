// 開発用：アプリの読み取り処理を、Cloudflare の REST API 経由で実際の Workers AI に対して試す。
// 使い方: npx tsx scripts/ai-probe.ts <画像ファイル> [モデルID]
// （wrangler login 済みであること。トークンは表示しない）
import { readFileSync } from 'node:fs';
import { toRecipeDraft } from '../src/worker/ai/draft';
import { extractRecipe } from '../src/worker/ai/extract';

const [file, model] = process.argv.slice(2);
if (!file) throw new Error('画像ファイルを指定してください');

const toml = readFileSync(
  `${process.env.APPDATA}/xdg.config/.wrangler/config/default.toml`,
  'utf8',
);
const token = toml.match(/oauth_token\s*=\s*"([^"]+)"/)![1];
const account = process.env.CF_ACCOUNT_ID ?? '688725d7ba090a81be2ff41a6cd4aea6';

const ai = {
  run: async (m: string, input: unknown) => {
    const t0 = Date.now();
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model ?? m}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
    );
    const json = (await res.json()) as { result?: unknown; errors?: unknown };
    console.error(`  AI ${res.status} ${Date.now() - t0}ms`);
    if (!res.ok) throw new Error(JSON.stringify(json.errors));
    return json.result;
  },
} as unknown as Ai;

const bytes = new Uint8Array(readFileSync(file));
const type = file.endsWith('.png')
  ? 'image/png'
  : file.endsWith('.webp')
    ? 'image/webp'
    : 'image/jpeg';
const t0 = Date.now();
const recipe = await extractRecipe(ai, { kind: 'image', bytes, contentType: type });
const { draft, warnings } = toRecipeDraft(recipe);
console.log(JSON.stringify({ ms: Date.now() - t0, draft, warnings }, null, 2));
