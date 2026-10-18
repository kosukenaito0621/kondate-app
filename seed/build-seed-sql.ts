// 初期レシピの SQL を seed/seed.sql に書き出す（npm run db:seed:local / db:seed:remote から呼ぶ）
import { writeFileSync } from 'node:fs';
import { seedStatements } from './sql';

const statements = seedStatements();
writeFileSync('seed/seed.sql', statements.map((s) => `${s};`).join('\n') + '\n');
console.log(`seed/seed.sql: ${statements.length} statements`);
