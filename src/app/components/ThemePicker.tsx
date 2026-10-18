import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { SERIES_LABEL, THEMES, type ThemeId, type ThemeSeries } from '../../shared/themes';
import { api } from '../api';
import { meQuery } from '../lib/auth';
import { cn } from '../lib/cn';
import { spring } from '../lib/motion';
import { applyTheme, currentTheme } from '../lib/theme';
import { CheckDraw } from './icons';

const SERIES: ThemeSeries[] = ['pastel', 'cool'];

/** 気分で選べるテーマカラー。タップした瞬間に切り替え、裏でアカウントに保存 */
export function ThemePicker({ value }: { value: ThemeId }) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: async (theme: ThemeId) => {
      const res = await api.me.$patch({ json: { theme } });
      if (!res.ok) throw new Error('テーマを保存できませんでした');
      return res.json();
    },
    onMutate: (theme) => {
      const previous = currentTheme();
      applyTheme(theme, { animate: true });
      queryClient.setQueryData(meQuery.queryKey, (me) => (me ? { ...me, theme } : me));
      return { previous };
    },
    onError: (_e, _theme, ctx) => {
      if (!ctx) return;
      applyTheme(ctx.previous, { animate: true });
      queryClient.setQueryData(meQuery.queryKey, (me) =>
        me ? { ...me, theme: ctx.previous } : me,
      );
    },
    onSuccess: (me) => queryClient.setQueryData(meQuery.queryKey, me),
  });

  return (
    <div className="flex flex-col gap-5">
      {SERIES.map((series) => (
        <fieldset key={series}>
          <legend className="mb-2 text-xs font-bold text-ink-soft">{SERIES_LABEL[series]}</legend>
          <div
            role="radiogroup"
            aria-label={SERIES_LABEL[series]}
            className="grid grid-cols-2 gap-2.5"
          >
            {THEMES.filter((t) => t.series === series).map((t) => {
              const selected = t.id === value;
              const [bg, accent, sub] = t.swatch;
              return (
                <motion.button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => !selected && save.mutate(t.id)}
                  whileTap={{ scale: 0.96 }}
                  transition={spring.snappy}
                  className={cn(
                    'sheen relative flex flex-col gap-2 rounded-[1.25rem] p-2 text-left',
                    selected ? 'pill-active' : 'groove',
                  )}
                >
                  {/* ミニプレビュー：テーマの背景に、アクセントとサブのしずく */}
                  <span
                    className="relative block h-14 overflow-hidden rounded-2xl"
                    style={{ background: bg, boxShadow: 'inset 0 0 0 1px rgb(127 127 127 / 0.2)' }}
                    aria-hidden="true"
                  >
                    <span
                      className="absolute -left-3 -top-4 size-14 rounded-full opacity-90"
                      style={{ background: accent }}
                    />
                    <span
                      className="absolute -bottom-5 right-3 size-12 rounded-full opacity-90"
                      style={{ background: sub }}
                    />
                    <span
                      className="absolute bottom-2 left-3 h-1.5 w-10 rounded-full opacity-80"
                      style={{ background: accent }}
                    />
                    {selected && (
                      <motion.span
                        className="absolute right-2 top-2 grid size-6 place-items-center rounded-full"
                        style={{ background: accent, color: bg }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={spring.soft}
                      >
                        <CheckDraw checked size={14} />
                      </motion.span>
                    )}
                  </span>
                  <span className="px-1 pb-0.5">
                    <span className="block text-[13px] font-bold leading-tight">{t.name}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-soft">
                      {t.description}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </fieldset>
      ))}
      {save.isError && (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      )}
    </div>
  );
}
