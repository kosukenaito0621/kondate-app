import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useIsGuest } from '../../../lib/auth';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { CATEGORY_LABEL, GENRE_LABEL } from '../../../../shared/constants';
import { LEVEL_META } from '../../../../shared/levels';
import type { RecipeDetail, RecipeInput } from '../../../../shared/recipe';
import { api } from '../../../api';
import { GlassButton } from '../../../components/glass/GlassButton';
import { GlassCard } from '../../../components/glass/GlassCard';
import { Segmented } from '../../../components/glass/Segmented';
import { CameraIcon, LinkIcon, SparkleIcon } from '../../../components/icons';
import { PageHeader } from '../../../components/PageHeader';
import { RecipeForm, toFormValue } from '../../../components/recipe/RecipeForm';
import { AiProgressSkeleton } from '../../../components/skeleton/Skeletons';
import { resizeImage } from '../../../lib/images';
import { LevelIcon } from '../../../components/LevelIcon';
import { DEMO_DRAFT, DEMO_IMAGE } from '../../../lib/demoRecipe';
import { markMission, showSpot, useTour } from '../../../lib/tour';
import { riseItem, spring, staggerContainer } from '../../../lib/motion';

export const Route = createFileRoute('/_app/recipes/import')({
  component: ImportPage,
});

type Draft = { draft: RecipeInput; warnings: string[] };

const PHOTO_STAGES = [
  '写真を送っています',
  '写真を読み取っています',
  '材料を整理しています',
  '手順をまとめています',
];
const URL_STAGES = [
  'ページを取得しています',
  '本文を読み取っています',
  '材料を整理しています',
  '手順をまとめています',
];

async function readError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return new Error(body.message ?? fallback);
}

function ImportPage() {
  // お試しでは AI を使わず、見本の写真で取り込みを体験する
  return <ImportForm demo={useIsGuest()} />;
}

function ImportForm({ demo }: { demo: boolean }) {
  const [mode, setMode] = useState<'photo' | 'url'>('photo');
  const [result, setResult] = useState<Draft | null>(null);
  const [stage, setStage] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // 待っている間、段階表示を少しずつ進める（最後の段階で止まる）
  const importing = useMutation({
    mutationFn: async (
      input: { kind: 'photo'; file: File } | { kind: 'url'; url: string } | { kind: 'sample' },
    ) => {
      setStage(0);
      if (input.kind === 'sample') {
        setPreview(DEMO_IMAGE);
        await new Promise((r) => window.setTimeout(r, 6500));
        return DEMO_DRAFT;
      }
      if (input.kind === 'photo') {
        const blob = await resizeImage(input.file);
        const form = new FormData();
        form.append('file', blob, blob.type === 'image/webp' ? 'p.webp' : 'p.jpg');
        const up = await fetch('/api/images', {
          method: 'POST',
          body: form,
          credentials: 'same-origin',
        });
        if (!up.ok) throw await readError(up, '写真を送れませんでした');
        const { key } = (await up.json()) as { key: string };
        setStage(1);
        const res = await api.ai['import-image'].$post({ json: { imageKey: key } });
        if (!res.ok) throw await readError(res as unknown as Response, '読み取れませんでした');
        return (await res.json()) as Draft;
      }
      const res = await api.ai['import-url'].$post({ json: { url: input.url } });
      if (!res.ok) throw await readError(res as unknown as Response, '読み取れませんでした');
      return (await res.json()) as Draft;
    },
    onSuccess: (d) => {
      setResult(d);
      markMission('import');
    },
  });

  // 「やってみよう」から来たら、見本の写真のボタンを光らせる
  const { spot } = useTour();
  useEffect(() => {
    if (!demo || spot?.id !== 'import' || spot.spot === 'import-sample') return;
    showSpot({ ...spot, spot: 'import-sample', hint: '「この写真で試す」を押してみましょう' });
  }, [demo, spot]);

  useEffect(() => {
    if (!importing.isPending) return;
    const t = window.setInterval(() => setStage((s) => Math.min(s + 1, 3)), demo ? 1600 : 3500);
    return () => window.clearInterval(t);
  }, [importing.isPending, demo]);

  const save = useMutation({
    mutationFn: async (input: RecipeInput) => {
      const res = await api.recipes.$post({ json: input });
      if (!res.ok) throw new Error('保存できませんでした。入力を確認してください');
      return (await res.json()) as RecipeDetail;
    },
    onSuccess: async (r) => {
      queryClient.setQueryData(['recipe', r.id], r);
      await queryClient.invalidateQueries({ queryKey: ['recipes'] });
      navigate({ to: '/recipes/$id', params: { id: r.id }, replace: true });
    },
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    importing.mutate({ kind: 'photo', file });
  };

  if (result) {
    const d = result.draft;
    return (
      <>
        <PageHeader
          eyebrow={demo ? '見本を読み取りました（お試し）' : 'AIで読み取りました'}
          title="内容を確認して保存"
        />
        <motion.div
          className="mb-4 flex flex-col gap-3"
          variants={staggerContainer(0.06)}
          initial="initial"
          animate="animate"
        >
          <GlassCard variants={riseItem} padding="md">
            <p className="flex items-center gap-1.5 text-xs font-bold text-accent-strong">
              <SparkleIcon size={14} />
              AIの判定（下のフォームで直せます）
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              <span className="pill-active rounded-full px-3 py-1 font-bold">
                {CATEGORY_LABEL[d.category]}
              </span>
              <span className="pill-active rounded-full px-3 py-1 font-bold">
                {GENRE_LABEL[d.genre]}
              </span>
              <span
                className="pill-active rounded-full px-3 py-1 font-bold"
                aria-label={LEVEL_META[d.difficulty].name}
                title={LEVEL_META[d.difficulty].name}
              >
                <span className={`inline-flex align-middle`}>
                  <LevelIcon level={d.difficulty} size={20} />
                </span>
              </span>
              <span className="pill-active num rounded-full px-3 py-1">{d.timeMinutes}分</span>
            </div>
            {result.warnings.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-xs text-sub-ink">
                {result.warnings.map((w) => (
                  <li key={w}>・{w}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-ink-soft">
              費用はAIによる目安です。必要なら直してください。
            </p>
          </GlassCard>
        </motion.div>
        <RecipeForm
          initial={toFormValue(d)}
          submitLabel="この内容で保存"
          saving={save.isPending}
          serverError={save.error?.message}
          onSubmit={(input) => save.mutate(input)}
        />
        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-3 min-h-11 w-full text-sm font-bold text-ink-soft"
        >
          読み取りからやり直す
        </button>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="レシピを追加" title="写真・URLから取り込む" />
      {!demo && (
        <div className="mb-4">
          <Segmented
            label="取り込み方法"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'photo', label: 'レシピ本の写真' },
              { value: 'url', label: 'レシピサイトのURL' },
            ]}
          />
        </div>
      )}

      <AnimatePresence mode="wait">
        {importing.isPending ? (
          <motion.div
            key="progress"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {preview && (mode === 'photo' || demo) && (
              <img
                src={preview}
                alt=""
                className="mb-3 max-h-48 w-full rounded-[var(--radius-card)] object-cover"
              />
            )}
            <AiProgressSkeleton
              stages={mode === 'photo' ? PHOTO_STAGES : URL_STAGES}
              current={stage}
            />
          </motion.div>
        ) : demo ? (
          <motion.div
            key="demo"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.soft}
          >
            <GlassCard padding="lg" className="flex flex-col gap-3">
              <p className="text-sm text-ink-soft">
                本番では、料理本のページを撮るだけで、AIが材料・分量・作り方を読み取ります。
                お試しでは、この見本の写真で体験できます。
              </p>
              <img
                src={DEMO_IMAGE}
                alt="見本のレシピの写真（鶏むね肉のはちみつレモンソテー）"
                className="w-full rounded-2xl"
              />
              <GlassButton
                variant="primary"
                size="lg"
                data-tour="import-sample"
                icon={<SparkleIcon size={20} />}
                onClick={() => importing.mutate({ kind: 'sample' })}
              >
                この写真で試す
              </GlassButton>
            </GlassCard>
          </motion.div>
        ) : mode === 'photo' ? (
          <motion.div
            key="photo"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.soft}
            className="flex flex-col gap-3"
          >
            <GlassCard padding="lg" className="flex flex-col gap-3">
              <p className="text-sm text-ink-soft">
                料理本のレシピのページを撮ると、AIが材料・分量・作り方を読み取り、
                主菜／汁物／副菜・和洋中・料理レベルも自動で振り分けます。
              </p>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={onFile}
              />
              <input
                ref={libraryRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={onFile}
              />
              <GlassButton
                variant="primary"
                size="lg"
                icon={<CameraIcon size={20} />}
                onClick={() => cameraRef.current?.click()}
              >
                カメラで撮る
              </GlassButton>
              <GlassButton onClick={() => libraryRef.current?.click()}>写真を選ぶ</GlassButton>
              <p className="text-xs text-ink-soft">
                コツ：ページ全体がまっすぐ入るように、明るい場所で撮ると読み取りやすくなります。
              </p>
            </GlassCard>
          </motion.div>
        ) : (
          <motion.form
            key="url"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={spring.soft}
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) importing.mutate({ kind: 'url', url: url.trim() });
            }}
          >
            <GlassCard padding="lg" className="flex flex-col gap-3">
              <label htmlFor="recipe-url" className="text-sm font-bold">
                レシピのページのURL
              </label>
              <input
                id="recipe-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                className="field min-h-12 rounded-2xl px-4"
              />
              <GlassButton
                type="submit"
                variant="primary"
                size="lg"
                icon={<LinkIcon size={18} />}
                disabled={!url.trim()}
              >
                読み取る
              </GlassButton>
            </GlassCard>
          </motion.form>
        )}
      </AnimatePresence>

      {importing.isError && (
        <p role="alert" className="mt-3 rounded-2xl bg-chu-soft px-4 py-3 text-sm text-chu-ink">
          {importing.error.message}
        </p>
      )}
    </>
  );
}
