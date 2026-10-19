import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { COST_LEVEL_LABEL, LEVELS, TIME_LEVELS, TIME_LEVEL_LABEL } from '../../../shared/constants';
import { WEEKDAY_LABELS } from '../../../shared/date';
import { LEVEL_META } from '../../../shared/levels';
import {
  DAY_MODES,
  DAY_MODE_LABEL,
  isOffDay,
  SIDE_MODES,
  SIDE_MODE_LABEL,
  type DaySetting,
  type PlanSettings,
} from '../../../shared/plan';
import { api } from '../../api';
import { GenreRatioSlider } from '../../components/GenreRatioSlider';
import { GlassCard } from '../../components/glass/GlassCard';
import { Segmented } from '../../components/glass/Segmented';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons';
import { LevelBadge } from '../../components/LevelBadge';
import { PageHeader } from '../../components/PageHeader';
import { SettingsSkeleton } from '../../components/skeleton/Skeletons';
import { useToast } from '../../components/toast/Toaster';
import { cn } from '../../lib/cn';
import { riseItem, spring, staggerContainer } from '../../lib/motion';
import { DayModeIcon } from '../../components/week/DayModeIcon';
import { LEVEL_COLOR, LevelIcon } from '../../components/LevelIcon';
import { settingsQuery } from '../../lib/plans';

export const Route = createFileRoute('/_app/week_/settings')({
  component: WeekSettingsPage,
});

function WeekSettingsPage() {
  const { data } = useQuery(settingsQuery);
  return (
    <>
      <Link
        to="/week"
        className="glass mb-3 inline-flex min-h-11 items-center gap-1 rounded-full pl-2 pr-4 text-sm font-bold"
      >
        <ChevronLeftIcon size={20} />
        週間献立
      </Link>
      <PageHeader title="献立の設定" eyebrow="グループで共有されます" />
      {data ? <SettingsForm initial={data} /> : <SettingsSkeleton />}
    </>
  );
}

type Draft = Pick<PlanSettings, 'weeklyBudget' | 'ratio' | 'days'>;

function SettingsForm({ initial }: { initial: PlanSettings }) {
  const [draft, setDraft] = useState<Draft>({
    weeklyBudget: initial.weeklyBudget,
    ratio: initial.ratio,
    days: initial.days,
  });
  const [budgetText, setBudgetText] = useState(String(initial.weeklyBudget));
  const [openDay, setOpenDay] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const dirty = useRef(false);

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const res = await api.settings.$put({ json: d });
      if (!res.ok) throw new Error('保存できませんでした');
      return (await res.json()) as PlanSettings;
    },
    onSuccess: (s) => {
      queryClient.setQueryData(settingsQuery.queryKey, s);
      queryClient.invalidateQueries({ queryKey: ['plan'] });
    },
    onError: (e) => toast(e.message, 'error'),
  });

  // 変更が止まってから自動保存
  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => save.mutate(draft), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const update = (patch: Partial<Draft>) => {
    dirty.current = true;
    setDraft((d) => ({ ...d, ...patch }));
  };
  const updateDay = (weekday: number, patch: Partial<DaySetting>) =>
    update({ days: draft.days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)) });

  return (
    <motion.div
      className="flex flex-col gap-4"
      variants={staggerContainer()}
      initial="initial"
      animate="animate"
    >
      <p className="-mt-2 h-4 px-1 text-xs text-ink-soft" aria-live="polite">
        {save.isPending ? '保存中…' : save.isSuccess ? '保存しました' : ''}
      </p>

      <GlassCard variants={riseItem} padding="lg">
        <label htmlFor="budget" className="text-sm font-bold">
          1週間の予算
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="budget"
            inputMode="numeric"
            value={budgetText}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 7);
              setBudgetText(v);
              if (v) update({ weeklyBudget: Number(v) });
            }}
            className="field num min-h-12 w-40 rounded-2xl px-4 text-lg font-bold"
          />
          <span className="text-sm text-ink-soft">円</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[7000, 10000, 15000, 20000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setBudgetText(String(v));
                update({ weeklyBudget: v });
              }}
              className={cn(
                'num min-h-10 rounded-full px-3 text-sm',
                draft.weeklyBudget === v ? 'btn-primary font-bold' : 'groove',
              )}
            >
              {v.toLocaleString()}円
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-soft">
          献立を作るとき、合計がこの金額に収まるよう安いレシピを優先します（{initial.servings}
          人分で計算）。
        </p>
      </GlassCard>

      <GlassCard variants={riseItem} padding="lg">
        <h2 className="mb-3 text-sm font-bold">和・洋・中の割合</h2>
        <GenreRatioSlider value={draft.ratio} onChange={(ratio) => update({ ratio })} />
      </GlassCard>

      <GlassCard variants={riseItem} padding="lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">曜日ごとの設定</h2>
          <Link
            to="/group"
            className="flex items-center gap-1 text-xs font-bold text-accent-strong"
          >
            いつもの料理レベル
            <LevelBadge level={initial.defaultLevel} />
          </Link>
        </div>
        <ul className="flex flex-col gap-2">
          {draft.days.map((d) => {
            const open = openDay === d.weekday;
            const level = d.level === 'inherit' ? initial.defaultLevel : d.level;
            return (
              <li key={d.weekday} className="groove overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => setOpenDay(open ? null : d.weekday)}
                  aria-expanded={open}
                  className="flex min-h-12 w-full items-center gap-3 px-4 text-left"
                >
                  <span className="w-5 font-bold">{WEEKDAY_LABELS[d.weekday]}</span>
                  {isOffDay(d.mode) ? (
                    <span className="flex flex-1 items-center gap-1.5 text-xs font-bold text-sub-ink">
                      <DayModeIcon mode={d.mode} size={15} />
                      {DAY_MODE_LABEL[d.mode]}の日
                    </span>
                  ) : (
                    <>
                      <span className="flex-1 text-xs text-ink-soft">
                        {COST_LEVEL_LABEL[d.budgetLevel]}・{TIME_LEVEL_LABEL[d.timeLevel]}・副菜
                        {SIDE_MODE_LABEL[d.sideMode]}
                      </span>
                      <LevelBadge level={level} />
                    </>
                  )}
                  <motion.span animate={{ rotate: open ? 90 : 0 }} transition={spring.snappy}>
                    <ChevronRightIcon size={16} className="text-ink-soft" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={spring.soft}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-3 px-3 pb-4 pt-1">
                        <Row label="この曜日の予定">
                          <Segmented
                            size="sm"
                            label={`${WEEKDAY_LABELS[d.weekday]}曜日の予定`}
                            value={d.mode}
                            onChange={(mode) => updateDay(d.weekday, { mode })}
                            options={DAY_MODES.map((m) => ({ value: m, label: DAY_MODE_LABEL[m] }))}
                          />
                        </Row>
                        {isOffDay(d.mode) ? (
                          <p className="px-1 text-xs text-ink-soft">
                            毎週この曜日は献立を作らず、買い物リストにも入りません。今週だけ変えたいときは、週間献立の曜日の「…」から変えられます。
                          </p>
                        ) : (
                          <>
                            <Row label="予算">
                              <Segmented
                                size="sm"
                                label={`${WEEKDAY_LABELS[d.weekday]}曜日の予算`}
                                value={d.budgetLevel}
                                onChange={(budgetLevel) => updateDay(d.weekday, { budgetLevel })}
                                options={LEVELS.map((l) => ({
                                  value: l,
                                  label: COST_LEVEL_LABEL[l],
                                }))}
                              />
                            </Row>
                            <Row label="料理時間">
                              <Segmented
                                size="sm"
                                label={`${WEEKDAY_LABELS[d.weekday]}曜日の料理時間`}
                                value={d.timeLevel}
                                onChange={(timeLevel) => updateDay(d.weekday, { timeLevel })}
                                options={TIME_LEVELS.map((t) => ({
                                  value: t,
                                  label: TIME_LEVEL_LABEL[t],
                                  hint:
                                    t === 'quick'
                                      ? '20分以内'
                                      : t === 'normal'
                                        ? '40分以内'
                                        : '時間をかける',
                                }))}
                              />
                            </Row>
                            <Row label="副菜">
                              <Segmented
                                size="sm"
                                label={`${WEEKDAY_LABELS[d.weekday]}曜日の副菜`}
                                value={d.sideMode}
                                onChange={(sideMode) => updateDay(d.weekday, { sideMode })}
                                options={SIDE_MODES.map((m) => ({
                                  value: m,
                                  label: SIDE_MODE_LABEL[m],
                                  hint: m === 'auto' ? '時短・節約はなし' : undefined,
                                }))}
                              />
                            </Row>
                            <Row label="料理レベル">
                              <Segmented
                                size="sm"
                                label={`${WEEKDAY_LABELS[d.weekday]}曜日の料理レベル`}
                                value={d.level}
                                onChange={(lv) => updateDay(d.weekday, { level: lv })}
                                options={[
                                  {
                                    value: 'inherit' as const,
                                    label: (
                                      <span className="inline-flex items-center gap-1">
                                        既定
                                        <LevelIcon level={initial.defaultLevel} size={16} />
                                      </span>
                                    ),
                                    hint: 'グループの設定',
                                    ariaLabel: `グループの既定（${LEVEL_META[initial.defaultLevel].name}）`,
                                  },
                                  {
                                    value: 'futaba' as const,
                                    label: (
                                      <span
                                        className={`inline-flex ${LEVEL_COLOR['futaba' as const]}`}
                                      >
                                        <LevelIcon level={'futaba' as const} size={18} />
                                      </span>
                                    ),
                                    ariaLabel: LEVEL_META.futaba.name,
                                  },
                                  {
                                    value: 'minori' as const,
                                    label: (
                                      <span
                                        className={`inline-flex ${LEVEL_COLOR['minori' as const]}`}
                                      >
                                        <LevelIcon level={'minori' as const} size={18} />
                                      </span>
                                    ),
                                    ariaLabel: LEVEL_META.minori.name,
                                  },
                                ]}
                              />
                              <p className="mt-1.5 text-[11px] text-ink-soft">
                                {d.level === 'inherit'
                                  ? `グループ設定の「いつもの料理レベル」に従います。${LEVEL_META[level].description}`
                                  : LEVEL_META[level].description}
                              </p>
                            </Row>
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </GlassCard>
    </motion.div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold text-ink-soft">{label}</p>
      {children}
    </div>
  );
}
