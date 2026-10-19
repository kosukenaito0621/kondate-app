// 本番の D1 に初期レシピを入れる（npm run db:seed:remote から呼ぶ）。
// 前回入れた内容のハッシュ（seed_hashes）とくらべ、変わったレシピだけを書き直す。
// 毎回 300品すべてを書き直すと、デプロイのたびに数千行を書き込み、
// D1 の無料枠（1日あたりの書き込み行数）を使い切ってしまうため。
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { SEED_RECIPES } from './recipes';
import { hashStatement, recipeHash, recipeStatements } from './sql';

const FILE = 'seed/seed-remote.sql';
// 動作確認用：--local を付けるとローカルの D1 に対して同じことをする
const TARGET = process.argv.includes('--local') ? '--local' : '--remote';

function wrangler(args: string[]) {
  // シェルを通さずに wrangler を直接動かす（Windows でも引数の空白が崩れないように）
  return execFileSync(
    process.execPath,
    ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', TARGET, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  );
}

const out = wrangler(['--json', '--command', 'SELECT recipe_id, hash FROM seed_hashes']);
const rows = (JSON.parse(out) as { results: { recipe_id: string; hash: string }[] }[])[0]!.results;
const current = new Map(rows.map((r) => [r.recipe_id, r.hash]));

const changed = SEED_RECIPES.filter((r) => current.get(r.id) !== recipeHash(r));
if (!changed.length) {
  console.log('初期レシピに変更はありません（書き込みなし）');
  process.exit(0);
}

const statements = changed.flatMap((r) => [...recipeStatements(r), hashStatement(r)]);
writeFileSync(FILE, statements.map((s) => `${s};`).join('\n') + '\n');
console.log(`${changed.length}品を書き直します（${statements.length}文）`);
wrangler(['--file', FILE]);
