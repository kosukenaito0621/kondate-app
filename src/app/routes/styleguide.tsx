import { createFileRoute, notFound } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { useState } from 'react';
import { GenreBadge } from '../components/GenreBadge';
import { GenreRatioSlider } from '../components/GenreRatioSlider';
import { GlassButton } from '../components/glass/GlassButton';
import { GlassCard } from '../components/glass/GlassCard';
import { Segmented } from '../components/glass/Segmented';
import { CheckDraw, ClockIcon, PlusIcon, RefreshIcon, YenIcon } from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import {
  AiProgressSkeleton,
  HomeSkeleton,
  RecipeDetailSkeleton,
  RecipeListSkeleton,
  SettingsSkeleton,
  ShoppingSkeleton,
  WeekSkeleton,
} from '../components/skeleton/Skeletons';
import { THEMES } from '../../shared/themes';
import { riseItem, staggerContainer } from '../lib/motion';
import { applyTheme } from '../lib/theme';
import type { GenreRatio } from '../lib/ratio';

/** 開発用：デザインシステムの一覧（本番ビルドでは 404） */
export const Route = createFileRoute('/styleguide')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: Styleguide,
});

const SKELETONS = {
  home: HomeSkeleton,
  week: WeekSkeleton,
  shopping: ShoppingSkeleton,
  recipes: RecipeListSkeleton,
  detail: RecipeDetailSkeleton,
  settings: SettingsSkeleton,
} as const;

function Styleguide() {
  const [ratio, setRatio] = useState<GenreRatio>({ wa: 50, yo: 30, chu: 20 });
  const [budget, setBudget] = useState<'save' | 'normal' | 'rich'>('normal');
  const [checked, setChecked] = useState(false);
  const [sk, setSk] = useState<keyof typeof SKELETONS>('home');
  const [aiStage, setAiStage] = useState(1);
  const SkeletonView = SKELETONS[sk];

  return (
    <main className="flex flex-col gap-6 px-4 py-6 pb-32">
      <PageHeader eyebrow="開発用" title="スタイルガイド" />

      <Section title="テーマ（ここでの切り替えは保存されません）">
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <GlassButton key={t.id} size="sm" onClick={() => applyTheme(t.id, { animate: true })}>
              <span
                className="size-3 rounded-full"
                style={{ background: t.swatch[1] }}
                aria-hidden="true"
              />
              {t.name}
            </GlassButton>
          ))}
        </div>
      </Section>

      <Section title="カラー">
        <div className="grid grid-cols-4 gap-2 text-[10px]">
          {[
            ['canvas', 'bg-canvas text-ink border border-ink-faint/30'],
            ['ink', 'bg-ink text-canvas'],
            ['ink-soft', 'bg-ink-soft text-canvas'],
            ['accent', 'bg-accent text-accent-ink'],
            ['strong', 'bg-accent-strong text-canvas'],
            ['acc-soft', 'bg-accent-soft text-accent-strong'],
            ['sub', 'bg-sub text-sub-ink'],
            ['sub-soft', 'bg-sub-soft text-sub-ink'],
            ['和 wa', 'bg-wa-soft text-wa-ink'],
            ['洋 yo', 'bg-yo-soft text-yo-ink'],
            ['中 chu', 'bg-chu-soft text-chu-ink'],
            ['success', 'bg-success text-success-ink'],
          ].map(([name, cls]) => (
            <div key={name} className={`grid h-14 place-items-center rounded-2xl ${cls}`}>
              {name}
            </div>
          ))}
        </div>
      </Section>

      <Section title="ボタン">
        <div className="flex flex-wrap gap-2">
          <GlassButton variant="primary" icon={<PlusIcon size={18} />}>
            献立をつくる
          </GlassButton>
          <GlassButton icon={<RefreshIcon size={18} />}>再生成</GlassButton>
          <GlassButton variant="ghost">キャンセル</GlassButton>
          <GlassButton variant="danger" size="sm">
            削除
          </GlassButton>
          <GlassButton variant="primary" loading>
            保存中
          </GlassButton>
        </div>
      </Section>

      <Section title="料理カード（押せる）">
        <motion.div
          className="flex flex-col gap-3"
          variants={staggerContainer()}
          initial="initial"
          animate="animate"
        >
          {[
            { slot: '主菜', name: '鶏の照り焼き', genre: 'wa', min: 20, yen: 380 },
            { slot: '汁物', name: '豆腐とわかめの味噌汁', genre: 'wa', min: 10, yen: 90 },
            { slot: '副菜', name: 'ほうれん草のおひたし', genre: 'wa', min: 8, yen: 120 },
          ].map((m) => (
            <GlassCard
              key={m.name}
              variants={riseItem}
              pressable
              className="flex items-center gap-3"
            >
              <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-wa-soft text-2xl"></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-soft">
                  <GenreBadge genre={m.genre as 'wa'} className="size-5 text-[10px]" />
                  {m.slot}
                </div>
                <p className="mt-0.5 truncate font-bold">{m.name}</p>
                <p className="mt-1 flex gap-3 text-xs text-ink-soft">
                  <span className="flex items-center gap-1">
                    <ClockIcon size={14} />
                    <span className="num">{m.min}</span>分
                  </span>
                  <span className="flex items-center gap-1">
                    <YenIcon size={14} />
                    <span className="num">{m.yen}</span>円
                  </span>
                </p>
              </div>
            </GlassCard>
          ))}
        </motion.div>
      </Section>

      <Section title="3段階セグメント">
        <Segmented
          label="予算"
          value={budget}
          onChange={setBudget}
          options={[
            { value: 'save', label: '節約' },
            { value: 'normal', label: 'ふつう' },
            { value: 'rich', label: 'ゆとり' },
          ]}
        />
      </Section>

      <Section title="ジャンル割合スライダー">
        <GlassCard padding="lg">
          <GenreRatioSlider value={ratio} onChange={setRatio} />
        </GlassCard>
      </Section>

      <Section title="チェック（描画アニメーション）">
        <GlassCard padding="md">
          <button
            type="button"
            onClick={() => setChecked((c) => !c)}
            className="flex min-h-11 items-center gap-3"
            aria-pressed={checked}
          >
            <span
              className={`grid size-7 place-items-center rounded-full border-2 transition-colors ${
                checked
                  ? 'border-success bg-success text-success-ink'
                  : 'border-ink-faint/50 bg-pill'
              }`}
            >
              <CheckDraw checked={checked} />
            </span>
            <span className={checked ? 'text-ink-faint line-through' : ''}>玉ねぎ 2個</span>
          </button>
        </GlassCard>
      </Section>

      <Section title="スケルトン">
        <Segmented
          label="スケルトンの種類"
          size="sm"
          value={sk}
          onChange={setSk}
          options={[
            { value: 'home', label: 'ホーム' },
            { value: 'week', label: '週間' },
            { value: 'shopping', label: '買物' },
            { value: 'recipes', label: '一覧' },
            { value: 'detail', label: '詳細' },
            { value: 'settings', label: '設定' },
          ]}
        />
        <div className="mt-3" key={sk}>
          <SkeletonView />
        </div>
      </Section>

      <Section title="AI解析中">
        <GlassButton size="sm" onClick={() => setAiStage((s) => (s + 1) % 5)}>
          次の段階へ
        </GlassButton>
        <div className="mt-3">
          <AiProgressSkeleton
            current={aiStage}
            stages={['画像をアップロード中', '画像を読み取り中', '材料を整理中', '手順をまとめ中']}
          />
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-bold text-ink-soft">{title}</h2>
      {children}
    </section>
  );
}
