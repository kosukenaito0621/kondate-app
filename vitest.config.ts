import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');

  return {
    test: {
      projects: [
        {
          // 純粋ロジック（献立生成・買い物集計・日付など）
          test: {
            name: 'unit',
            include: ['src/**/*.test.ts'],
            environment: 'node',
          },
        },
        {
          // Workers ランタイム上での API テスト
          plugins: [
            cloudflareTest({
              wrangler: { configPath: './wrangler.jsonc' },
              // Workers AI はリモート専用。テストではモックするのでリモート接続しない
              remoteBindings: false,
              miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
            }),
          ],
          test: {
            name: 'worker',
            include: ['test/**/*.test.ts'],
            setupFiles: ['./test/apply-migrations.ts'],
          },
        },
      ],
    },
  };
});
