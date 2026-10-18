import { defineConfig } from 'drizzle-kit';

// SQL生成のみに使用。適用は `wrangler d1 migrations apply` で行う
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/worker/db/schema.ts',
  out: './migrations',
});
