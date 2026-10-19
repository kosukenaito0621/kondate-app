import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { COOKING_LEVELS, LEVEL_META, type CookingLevel } from '../../shared/levels';
import { displayNameSchema, type Me } from '../../shared/schemas';
import { api } from '../api';
import { GlassButton } from '../components/glass/GlassButton';
import { GlassCard } from '../components/glass/GlassCard';
import { meQuery } from '../lib/auth';
import { cn } from '../lib/cn';
import { LEVEL_COLOR, LevelIcon } from '../components/LevelIcon';
import { riseItem, spring, staggerContainer } from '../lib/motion';

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    if (me.displayName && me.cookingLevel) throw redirect({ to: '/' });
  },
  component: Onboarding,
});

function useSaveMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: { displayName?: string; cookingLevel?: CookingLevel }) => {
      const res = await api.me.$patch({ json });
      if (!res.ok) throw new Error('保存に失敗しました');
      return (await res.json()) as Me;
    },
    onSuccess: (me) => queryClient.setQueryData(meQuery.queryKey, me),
  });
}

function Onboarding() {
  const { data: me } = useQuery(meQuery);
  const step = !me?.displayName ? 'name' : 'level';
  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mb-6 flex justify-center gap-2" aria-hidden="true">
        {['name', 'level'].map((s) => (
          <motion.span
            key={s}
            className="h-1.5 rounded-full bg-accent"
            animate={{ width: s === step ? 28 : 8, opacity: s === step ? 1 : 0.4 }}
            transition={spring.soft}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        {step === 'name' ? (
          <NameStep key="name" />
        ) : (
          <LevelStep key="level" name={me?.displayName ?? ''} />
        )}
      </AnimatePresence>
    </main>
  );
}

function NameStep() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useSaveMe();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      return setError(parsed.error.issues[0]?.message ?? '入力を確認してください');
    }
    setError(null);
    save.mutate({ displayName: parsed.data }, { onError: (e) => setError(e.message) });
  };

  return (
    <motion.div
      className="flex flex-col gap-5"
      variants={staggerContainer(0.08, 0.05)}
      initial="initial"
      animate="animate"
      exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
    >
      <motion.div variants={riseItem} className="px-1">
        <p className="text-sm font-bold text-accent-strong">ようこそ</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight">はじめまして</h1>
        <p className="mt-2 text-sm text-ink-soft">
          なんとお呼びしましょう？
          <br />
          あとで設定から変えられます。
        </p>
      </motion.div>

      <GlassCard variants={riseItem} strong padding="lg">
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <label htmlFor="displayName" className="text-sm font-bold">
            ユーザーネーム
          </label>
          <input
            id="displayName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            placeholder="例：こうすけ"
            aria-invalid={!!error}
            aria-describedby={error ? 'displayName-error' : undefined}
            className="field min-h-12 rounded-2xl px-4"
          />
          {error && (
            <p id="displayName-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <GlassButton
            type="submit"
            variant="primary"
            size="lg"
            loading={save.isPending}
            className="mt-2"
          >
            つぎへ
          </GlassButton>
        </form>
      </GlassCard>
    </motion.div>
  );
}

function LevelStep({ name }: { name: string }) {
  const [level, setLevel] = useState<CookingLevel | null>(null);
  const save = useSaveMe();
  const navigate = useNavigate();

  return (
    <motion.div
      className="flex flex-col gap-5"
      variants={staggerContainer(0.1, 0.05)}
      initial="initial"
      animate="animate"
      exit={{ opacity: 0, x: -40 }}
    >
      <motion.div variants={riseItem} className="px-1">
        <p className="text-sm font-bold text-accent-strong">{name}さん、よろしくお願いします</p>
        <h1 className="mt-1 text-[26px] font-bold leading-tight">どんなふうに作りたい？</h1>
        <p className="mt-2 text-sm text-ink-soft">
          おすすめする献立の作りやすさが変わります。曜日ごとにも変えられます。
        </p>
      </motion.div>

      <div role="radiogroup" aria-label="料理レベル" className="flex flex-col gap-3">
        {COOKING_LEVELS.map((l) => {
          const selected = level === l;
          const meta = LEVEL_META[l];
          return (
            <motion.button
              key={l}
              variants={riseItem}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setLevel(l)}
              animate={{ y: selected ? -6 : 0, scale: selected ? 1.02 : 1 }}
              whileTap={{ scale: 0.98 }}
              transition={spring.soft}
              className={cn(
                'glass sheen flex items-center gap-4 rounded-[var(--radius-card)] p-5 text-left transition-shadow',
                selected &&
                  'glass--strong shadow-[0_24px_48px_-20px_rgb(var(--shadow-rgb)/0.6)] ring-2 ring-accent',
              )}
            >
              <motion.span
                className={`inline-grid ${LEVEL_COLOR[l]}`}
                aria-hidden="true"
                animate={
                  selected
                    ? { rotate: [0, -12, 10, 0], scale: [1, 1.2, 1] }
                    : { rotate: 0, scale: 1 }
                }
                transition={{ duration: 0.6 }}
              >
                <LevelIcon level={l} size={40} />
              </motion.span>
              <span>
                <span className="block text-lg font-bold">{meta.name}</span>
                <span className="mt-0.5 block text-sm text-ink-soft">{meta.description}</span>
              </span>
            </motion.button>
          );
        })}
      </div>

      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
      <motion.div variants={riseItem}>
        <GlassButton
          variant="primary"
          size="lg"
          block
          disabled={!level}
          loading={save.isPending}
          onClick={() =>
            level &&
            save.mutate({ cookingLevel: level }, { onSuccess: () => navigate({ to: '/' }) })
          }
        >
          はじめる
        </GlassButton>
      </motion.div>
    </motion.div>
  );
}
