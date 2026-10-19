import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { MAX_SHARE_BUNDLE, type CreatedShare } from '../../../shared/recipe';
import { api } from '../../api';
import { spring } from '../../lib/motion';
import { shareOrCopy } from '../../lib/shareLink';
import { GlassButton } from '../glass/GlassButton';
import { Sheet } from '../glass/Sheet';
import { LinkIcon } from '../icons';
import { useToast } from '../toast/Toaster';

/**
 * 「まとめて送る」：選んだレシピを1つのリンクにして送る。
 * 画面下（タブバーの上）に、選んだ数と「送る」ボタンを出す。
 */
export function BundleShareBar({
  selected,
  onCancel,
  onDone,
}: {
  selected: { id: string; name: string }[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  const send = useMutation({
    mutationFn: async () => {
      const res = await api.recipes['share-bundle'].$post({
        json: { recipeIds: selected.map((r) => r.id), title: title.trim() || undefined },
      });
      if (res.status === 429) throw new Error('今日はこれ以上リンクを作れません');
      if (!res.ok) throw new Error('リンクを作れませんでした');
      return (await res.json()) as CreatedShare;
    },
    onSuccess: async ({ url }) => {
      const name = title.trim() || `${selected.length}品のレシピ`;
      await shareOrCopy({
        title: name,
        text: `「${name}」を送ります（${selected
          .map((r) => r.name)
          .slice(0, 3)
          .join(
            '・',
          )}${selected.length > 3 ? ' ほか' : ''}）。開いて「うちのレシピに保存」を押すと、あなたのレシピに追加されます。`,
        url,
        toast,
      });
      setOpen(false);
      setTitle('');
      onDone();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const count = selected.length;
  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
        style={{ bottom: 'calc(var(--tabbar-height) + var(--safe-bottom) + 1.25rem)' }}
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={spring.soft}
          className="glass glass--strong pointer-events-auto flex w-full max-w-[24rem] items-center gap-2 rounded-2xl py-2 pl-4 pr-2"
        >
          <p className="flex-1 text-sm font-bold" aria-live="polite">
            <span className="num">{count}</span>品を選択中
            <span className="block text-[11px] font-normal text-ink-soft">
              {MAX_SHARE_BUNDLE}品まで
            </span>
          </p>
          <GlassButton size="sm" variant="ghost" onClick={onCancel}>
            やめる
          </GlassButton>
          <GlassButton
            size="sm"
            variant="primary"
            icon={<LinkIcon size={16} />}
            disabled={count === 0}
            onClick={() => setOpen(true)}
          >
            送る
          </GlassButton>
        </motion.div>
      </div>

      <Sheet open={open} title="まとめて送る" onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-3">
          <label htmlFor="bundle-title" className="text-xs font-bold text-ink-soft">
            題名（なくても大丈夫です）
          </label>
          <input
            id="bundle-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={40}
            placeholder="例：実家の味、作り置きセット"
            className="field min-h-12 rounded-2xl px-4"
          />
          <ul className="max-h-48 overflow-y-auto rounded-2xl bg-field px-3 py-2 text-sm">
            <AnimatePresence initial={false}>
              {selected.map((r) => (
                <li key={r.id} className="truncate py-1">
                  {r.name}
                </li>
              ))}
            </AnimatePresence>
          </ul>
          <p className="text-xs text-ink-soft">
            1つのリンクで{count}
            品を送ります。受け取った人は、全部または選んだものだけを自分のレシピに保存できます。リンクの期限は30日です。
          </p>
          <GlassButton
            variant="primary"
            size="lg"
            icon={<LinkIcon size={18} />}
            loading={send.isPending}
            onClick={() => send.mutate()}
          >
            リンクを作って送る
          </GlassButton>
        </div>
      </Sheet>
    </>
  );
}
