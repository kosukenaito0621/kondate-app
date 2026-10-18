import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import {
  GROUP_COLORS,
  groupColor,
  groupNameSchema,
  normalizeInviteCode,
  type GroupColorId,
} from '../../shared/groups';
import { api } from '../api';
import { meQuery } from '../lib/auth';
import { cn } from '../lib/cn';
import { switchGroup } from '../lib/groups';
import { spring } from '../lib/motion';
import { GlassButton } from './glass/GlassButton';
import { Sheet } from './glass/Sheet';
import { CheckDraw, ChevronRightIcon } from './icons';

export function GroupDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full ring-2 ring-white/70"
      style={{ width: size, height: size, background: groupColor(color) }}
      aria-hidden="true"
    />
  );
}

/** いまのグループ名を表示し、タップで切り替えシートを開く */
export function GroupSwitcher() {
  const { data: me } = useQuery(meQuery);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'create' | 'join'>('list');
  const queryClient = useQueryClient();

  const switcher = useMutation({
    mutationFn: (id: string) => switchGroup(queryClient, id),
    onSuccess: () => setOpen(false),
  });

  if (!me) return null;
  const current = me.groups.find((g) => g.id === me.currentGroupId);

  const close = () => {
    setOpen(false);
    setMode('list');
  };

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.95 }}
        transition={spring.snappy}
        className="glass inline-flex min-h-11 max-w-full items-center gap-2 rounded-full pl-3.5 pr-2.5 text-sm font-bold"
        aria-haspopup="dialog"
      >
        <GroupDot color={current?.color ?? 'rose'} />
        <span className="truncate">{current?.name ?? 'グループ'}</span>
        {current && current.memberCount > 1 && (
          <span className="num text-xs font-normal text-ink-soft">{current.memberCount}人</span>
        )}
        <ChevronRightIcon size={16} className="rotate-90 text-ink-soft" />
      </motion.button>

      <Sheet
        open={open}
        title={
          mode === 'create' ? '新しいグループ' : mode === 'join' ? '招待コードで参加' : 'グループ'
        }
        onClose={close}
      >
        {mode === 'list' && (
          <div className="flex flex-col gap-2">
            <ul role="radiogroup" aria-label="使うグループ" className="flex flex-col gap-2">
              {me.groups.map((g) => {
                const selected = g.id === me.currentGroupId;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={switcher.isPending}
                      onClick={() => (selected ? close() : switcher.mutate(g.id))}
                      className={cn(
                        'flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left',
                        selected ? 'pill-active' : 'groove',
                      )}
                    >
                      <GroupDot color={g.color} size={14} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{g.name}</span>
                        <span className="text-xs text-ink-soft">
                          {g.memberCount}人{g.role === 'owner' ? '・オーナー' : ''}
                        </span>
                      </span>
                      {selected && (
                        <span className="grid size-6 place-items-center rounded-full bg-accent text-accent-ink">
                          <CheckDraw checked size={14} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {switcher.isError && (
              <p role="alert" className="text-sm text-danger">
                {switcher.error.message}
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <GlassButton onClick={() => setMode('create')}>グループを作る</GlassButton>
              <GlassButton onClick={() => setMode('join')}>コードで参加</GlassButton>
            </div>
          </div>
        )}
        {mode === 'create' && <CreateGroupForm onDone={close} />}
        {mode === 'join' && <JoinByCodeForm onDone={close} />}
      </Sheet>
    </>
  );
}

function CreateGroupForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<GroupColorId>('mint');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.groups.$post({ json: { name, color } });
      if (!res.ok) throw new Error('作成できませんでした');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      onDone();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = groupNameSchema.safeParse(name);
        if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? '');
        create.mutate();
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-ink-soft">グループ名</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="例：実家"
          className="field min-h-12 rounded-2xl px-4"
          autoFocus
        />
      </label>
      <ColorPicker value={color} onChange={setColor} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <GlassButton type="submit" variant="primary" loading={create.isPending}>
        作成して切り替える
      </GlassButton>
    </form>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: GroupColorId) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-bold text-ink-soft">色</legend>
      <div role="radiogroup" aria-label="グループの色" className="flex flex-wrap gap-2.5">
        {GROUP_COLORS.map((c) => (
          <motion.button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            aria-label={c.label}
            onClick={() => onChange(c.id)}
            whileTap={{ scale: 0.9 }}
            animate={{ scale: value === c.id ? 1.12 : 1 }}
            transition={spring.snappy}
            className={cn(
              'grid size-11 place-items-center rounded-full',
              value === c.id && 'ring-2 ring-ink ring-offset-2 ring-offset-transparent',
            )}
            style={{ background: c.value }}
          >
            {value === c.id && (
              <span className="text-white">
                <CheckDraw checked size={16} />
              </span>
            )}
          </motion.button>
        ))}
      </div>
    </fieldset>
  );
}

function JoinByCodeForm({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const normalized = normalizeInviteCode(code);
        if (!normalized) return setError('6文字の招待コードを入力してください');
        onDone();
        navigate({ to: '/invite/$key', params: { key: normalized } });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-ink-soft">招待コード（6文字）</span>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="ABC234"
          className="field num min-h-14 rounded-2xl px-4 text-center text-2xl tracking-[0.3em]"
          autoFocus
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <GlassButton type="submit" variant="primary">
        確認する
      </GlassButton>
    </form>
  );
}
