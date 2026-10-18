import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { displayNameSchema } from '../../shared/schemas';
import { api } from '../api';
import { meQuery } from '../lib/auth';

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery);
    if (!me) throw redirect({ to: '/login' });
    if (me.displayName) throw redirect({ to: '/' });
  },
  component: Onboarding,
});

function Onboarding() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const save = useMutation({
    mutationFn: async (displayName: string) => {
      const res = await api.me.$patch({ json: { displayName } });
      if (!res.ok) throw new Error('保存に失敗しました');
      return res.json();
    },
    onSuccess: (me) => {
      queryClient.setQueryData(meQuery.queryKey, me);
      navigate({ to: '/' });
    },
    onError: (e) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '入力を確認してください');
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">はじめまして</h1>
        <p className="mt-2 text-sm opacity-70">なんとお呼びしましょう？（あとで設定から変えられます）</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <label htmlFor="displayName" className="text-sm font-medium">
          ユーザーネーム
        </label>
        <input
          id="displayName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoComplete="nickname"
          aria-invalid={!!error}
          aria-describedby={error ? 'displayName-error' : undefined}
          className="min-h-11 rounded-2xl bg-white px-4 py-3 shadow-inner"
        />
        {error && (
          <p id="displayName-error" role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={save.isPending}
          className="min-h-11 rounded-full bg-[var(--color-terracotta)] px-6 py-3 font-medium text-white disabled:opacity-60"
        >
          {save.isPending ? '保存中…' : 'はじめる'}
        </button>
      </form>
    </main>
  );
}
