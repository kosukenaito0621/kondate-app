import { applyD1Migrations, env } from 'cloudflare:test';
import { seedStatements } from '../seed/sql';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// 初期レシピを投入（冪等なので各テストファイルで実行されても問題ない）
const statements = seedStatements();
for (let i = 0; i < statements.length; i += 200) {
  await env.DB.batch(statements.slice(i, i + 200).map((s) => env.DB.prepare(s)));
}
