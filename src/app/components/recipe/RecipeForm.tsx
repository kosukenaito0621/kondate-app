import { AnimatePresence, motion, Reorder } from 'motion/react';
import { useId, useState } from 'react';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  GENRES,
  GENRE_LABEL,
  MAIN_INGREDIENTS,
  MAIN_INGREDIENT_LABEL,
  SECTIONS,
  SECTION_LABEL,
  type Section,
} from '../../../shared/constants';
import { INGREDIENT_NAMES, normalizeIngredientName, sectionOf } from '../../../shared/ingredients';
import { COOKING_LEVELS, LEVEL_META } from '../../../shared/levels';
import {
  formatAmount,
  parseAmount,
  recipeInputSchema,
  type RecipeInput,
} from '../../../shared/recipe';
import { cn } from '../../lib/cn';
import { imageUrl } from '../../lib/images';
import { spring } from '../../lib/motion';
import { GlassButton } from '../glass/GlassButton';
import { GlassCard } from '../glass/GlassCard';
import { Segmented } from '../glass/Segmented';
import { GripIcon, PlusIcon, TrashIcon } from '../icons';
import { Photo, PhotoPicker } from '../PhotoPicker';

type IngredientRow = { key: string; name: string; amount: string; section: Section };
type StepRow = { key: string; text: string; tip: string };

export type RecipeFormValue = {
  name: string;
  category: RecipeInput['category'];
  genre: RecipeInput['genre'];
  difficulty: RecipeInput['difficulty'];
  mainIngredient: RecipeInput['mainIngredient'];
  servings: string;
  timeMinutes: string;
  costYen: string;
  tags: string;
  sourceUrl: string;
  imageKey: string | null;
  ingredients: IngredientRow[];
  steps: StepRow[];
};

const key = () => crypto.randomUUID();

export function toFormValue(r?: Partial<RecipeInput>): RecipeFormValue {
  return {
    name: r?.name ?? '',
    category: r?.category ?? 'main',
    genre: r?.genre ?? 'wa',
    difficulty: r?.difficulty ?? 'futaba',
    mainIngredient: r?.mainIngredient ?? 'chicken',
    servings: String(r?.servings ?? 2),
    timeMinutes: r?.timeMinutes ? String(r.timeMinutes) : '',
    costYen: r?.costYen !== undefined ? String(r.costYen) : '',
    tags: (r?.tags ?? []).join('、'),
    sourceUrl: r?.sourceUrl ?? '',
    imageKey: r?.imageKey ?? null,
    ingredients: (r?.ingredients?.length ? r.ingredients : [null, null, null]).map((i) => ({
      key: key(),
      name: i?.name ?? '',
      amount: i ? formatAmount(i) : '',
      section: i?.section ?? 'veg',
    })),
    steps: (r?.steps?.length ? r.steps : [null, null]).map((s) => ({
      key: key(),
      text: s?.text ?? '',
      tip: s?.tip ?? '',
    })),
  };
}

/** フォームの値を API 入力に変換して検証する */
export function parseForm(v: RecipeFormValue) {
  return recipeInputSchema.safeParse({
    name: v.name,
    category: v.category,
    genre: v.genre,
    difficulty: v.difficulty,
    mainIngredient: v.mainIngredient,
    servings: Number(v.servings),
    timeMinutes: Number(v.timeMinutes),
    costYen: Number(v.costYen || 0),
    tags: v.tags
      .split(/[、,\s]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean),
    sourceUrl: v.sourceUrl.trim() || null,
    imageKey: v.imageKey,
    ingredients: v.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({ name: i.name.trim(), section: i.section, ...parseAmount(i.amount) })),
    steps: v.steps
      .filter((s) => s.text.trim())
      .map((s) => ({ text: s.text.trim(), ...(s.tip.trim() && { tip: s.tip.trim() }) })),
  });
}

const fieldCls = 'field min-h-12 w-full rounded-2xl px-4';

export function RecipeForm({
  initial,
  submitLabel,
  saving,
  serverError,
  onSubmit,
}: {
  initial: RecipeFormValue;
  submitLabel: string;
  saving: boolean;
  serverError?: string | null;
  onSubmit: (input: RecipeInput) => void;
}) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const set = <K extends keyof RecipeFormValue>(k: K, val: RecipeFormValue[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  const updateIngredient = (k: string, patch: Partial<IngredientRow>) =>
    set(
      'ingredients',
      v.ingredients.map((i) => (i.key === k ? { ...i, ...patch } : i)),
    );
  const updateStep = (k: string, patch: Partial<StepRow>) =>
    set(
      'steps',
      v.steps.map((s) => (s.key === k ? { ...s, ...patch } : s)),
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseForm(v);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${pathLabel(issue.path)}${issue.message}` : '入力を確認してください');
      return;
    }
    setError(null);
    onSubmit(parsed.data);
  };

  const futaba = v.difficulty === 'futaba';

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <GlassCard padding="lg" className="flex flex-col gap-4">
        <Field label="写真（任意）">
          {v.imageKey ? (
            <div className="flex items-center gap-3">
              <Photo src={imageUrl(v.imageKey)} alt="料理の写真" className="size-24 rounded-2xl" />
              <div className="flex flex-col gap-2">
                <PhotoPicker label="変える" onUploaded={(key) => set('imageKey', key)} />
                <button
                  type="button"
                  onClick={() => set('imageKey', null)}
                  className="min-h-11 text-sm font-bold text-ink-soft"
                >
                  外す
                </button>
              </div>
            </div>
          ) : (
            <PhotoPicker label="料理の写真を追加" onUploaded={(key) => set('imageKey', key)} />
          )}
        </Field>
        <Field label="料理名" htmlFor="name">
          <input
            id="name"
            value={v.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={60}
            placeholder="例：鶏の照り焼き"
            className={fieldCls}
          />
        </Field>
        <Field label="カテゴリ">
          <Segmented
            label="カテゴリ"
            value={v.category}
            onChange={(x) => set('category', x)}
            options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
          />
        </Field>
        <Field label="ジャンル">
          <Segmented
            label="ジャンル"
            value={v.genre}
            onChange={(x) => set('genre', x)}
            options={GENRES.map((g) => ({ value: g, label: GENRE_LABEL[g] }))}
          />
        </Field>
        <Field label="料理レベル">
          <Segmented
            label="料理レベル"
            value={v.difficulty}
            onChange={(x) => set('difficulty', x)}
            options={COOKING_LEVELS.map((l) => ({
              value: l,
              label: LEVEL_META[l].emoji,
              ariaLabel: LEVEL_META[l].name,
            }))}
          />
          <p className="mt-1.5 text-xs text-ink-soft">{LEVEL_META[v.difficulty].description}</p>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="人数" htmlFor="servings">
            <input
              id="servings"
              inputMode="numeric"
              value={v.servings}
              onChange={(e) => set('servings', e.target.value.replace(/\D/g, ''))}
              className={cn(fieldCls, 'num')}
            />
          </Field>
          <Field label="時間（分）" htmlFor="time">
            <input
              id="time"
              inputMode="numeric"
              value={v.timeMinutes}
              onChange={(e) => set('timeMinutes', e.target.value.replace(/\D/g, ''))}
              className={cn(fieldCls, 'num')}
            />
          </Field>
          <Field label="費用（円）" htmlFor="cost">
            <input
              id="cost"
              inputMode="numeric"
              value={v.costYen}
              onChange={(e) => set('costYen', e.target.value.replace(/\D/g, ''))}
              className={cn(fieldCls, 'num')}
            />
          </Field>
        </div>
        <Field label="主材料" htmlFor="main">
          <select
            id="main"
            value={v.mainIngredient}
            onChange={(e) =>
              set('mainIngredient', e.target.value as RecipeFormValue['mainIngredient'])
            }
            className={fieldCls}
          >
            {MAIN_INGREDIENTS.map((m) => (
              <option key={m} value={m}>
                {MAIN_INGREDIENT_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
      </GlassCard>

      <GlassCard padding="lg">
        <h2 className="font-bold">材料</h2>
        <p className="mt-1 text-xs text-ink-soft">
          分量は「300g」「大さじ2」「1/2個」「少々」のように書けます。区分は材料名から自動で入ります。
        </p>
        <datalist id={listId}>
          {INGREDIENT_NAMES.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <Reorder.Group
          axis="y"
          values={v.ingredients}
          onReorder={(rows) => set('ingredients', rows)}
          className="mt-3 flex flex-col gap-2"
        >
          <AnimatePresence initial={false}>
            {v.ingredients.map((i, idx) => (
              <Reorder.Item
                key={i.key}
                value={i}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                whileDrag={{ scale: 1.03, boxShadow: '0 12px 30px -12px rgb(0 0 0 / 0.35)' }}
                className="groove flex flex-col gap-2 rounded-2xl p-2"
              >
                <div className="flex items-center gap-1.5">
                  <span className="cursor-grab touch-none p-1 text-ink-faint" aria-hidden="true">
                    <GripIcon size={18} />
                  </span>
                  <input
                    aria-label={`材料${idx + 1}の名前`}
                    list={listId}
                    value={i.name}
                    onChange={(e) => updateIngredient(i.key, { name: e.target.value })}
                    onBlur={(e) => {
                      const name = normalizeIngredientName(e.target.value);
                      const section = sectionOf(name);
                      updateIngredient(i.key, { name, ...(section && { section }) });
                    }}
                    placeholder="材料名"
                    className="field min-h-11 min-w-0 flex-[1.4] rounded-xl px-3"
                  />
                  <input
                    aria-label={`材料${idx + 1}の分量`}
                    value={i.amount}
                    onChange={(e) => updateIngredient(i.key, { amount: e.target.value })}
                    placeholder="分量"
                    className="field num min-h-11 min-w-0 flex-1 rounded-xl px-3"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        'ingredients',
                        v.ingredients.filter((x) => x.key !== i.key),
                      )
                    }
                    className="grid size-11 shrink-0 place-items-center text-ink-soft"
                    aria-label={`材料${idx + 1}を削除`}
                  >
                    <TrashIcon size={18} />
                  </button>
                </div>
                <select
                  aria-label={`材料${idx + 1}の区分`}
                  value={i.section}
                  onChange={(e) => updateIngredient(i.key, { section: e.target.value as Section })}
                  className="ml-8 min-h-9 self-start rounded-full bg-transparent px-2 text-xs text-ink-soft"
                >
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {SECTION_LABEL[s]}
                      {s === 'seasoning' ? '（買い物リストに出さない）' : ''}
                    </option>
                  ))}
                </select>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
        <GlassButton
          size="sm"
          className="mt-3"
          icon={<PlusIcon size={16} />}
          onClick={() =>
            set('ingredients', [
              ...v.ingredients,
              { key: key(), name: '', amount: '', section: 'veg' },
            ])
          }
        >
          材料を追加
        </GlassButton>
      </GlassCard>

      <GlassCard padding="lg">
        <h2 className="font-bold">作り方</h2>
        {futaba && (
          <p className="mt-1 text-xs text-ink-soft">
            🌱のレシピは、手順ごとに「ひとことコツ」を入れると初めての人も安心です（5ステップ以内がおすすめ）。
          </p>
        )}
        <ol className="mt-3 flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {v.steps.map((s, idx) => (
              <motion.li
                key={s.key}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={spring.soft}
                className="flex gap-2"
              >
                <span className="btn-primary num mt-2 grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold">
                  {idx + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <textarea
                    aria-label={`手順${idx + 1}`}
                    value={s.text}
                    onChange={(e) => updateStep(s.key, { text: e.target.value })}
                    rows={2}
                    placeholder="例：中火で5分焼く（「◯分」はタイマーになります）"
                    className="field w-full resize-none rounded-2xl px-3 py-2.5"
                  />
                  <input
                    aria-label={`手順${idx + 1}のコツ`}
                    value={s.tip}
                    onChange={(e) => updateStep(s.key, { tip: e.target.value })}
                    placeholder={futaba ? 'ひとことコツ' : 'コツ（任意）'}
                    className="field min-h-10 w-full rounded-xl px-3 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    set(
                      'steps',
                      v.steps.filter((x) => x.key !== s.key),
                    )
                  }
                  className="grid size-11 shrink-0 place-items-center text-ink-soft"
                  aria-label={`手順${idx + 1}を削除`}
                >
                  <TrashIcon size={18} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        <GlassButton
          size="sm"
          className="mt-3"
          icon={<PlusIcon size={16} />}
          onClick={() => set('steps', [...v.steps, { key: key(), text: '', tip: '' }])}
        >
          手順を追加
        </GlassButton>
      </GlassCard>

      <GlassCard padding="lg" className="flex flex-col gap-4">
        <Field label="タグ（「、」区切り）" htmlFor="tags">
          <input
            id="tags"
            value={v.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="例：作り置き、お弁当"
            className={fieldCls}
          />
        </Field>
        <Field label="出典URL（任意）" htmlFor="source">
          <input
            id="source"
            type="url"
            value={v.sourceUrl}
            onChange={(e) => set('sourceUrl', e.target.value)}
            placeholder="https://"
            className={fieldCls}
          />
        </Field>
      </GlassCard>

      {(error || serverError) && (
        <p role="alert" className="rounded-2xl bg-chu-soft px-4 py-3 text-sm text-chu-ink">
          {error ?? serverError}
        </p>
      )}
      <GlassButton type="submit" variant="primary" size="lg" loading={saving}>
        {submitLabel}
      </GlassButton>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-xs font-bold text-ink-soft">
          {label}
        </label>
      ) : (
        <span className="text-xs font-bold text-ink-soft">{label}</span>
      )}
      {children}
    </div>
  );
}

const PATH_LABEL: Record<string, string> = {
  name: '料理名：',
  servings: '人数：',
  timeMinutes: '時間：',
  costYen: '費用：',
  ingredients: '材料：',
  steps: '手順：',
  sourceUrl: '出典URL：',
  tags: 'タグ：',
};

function pathLabel(path: PropertyKey[]): string {
  const head = String(path[0] ?? '');
  const label = PATH_LABEL[head] ?? '';
  return typeof path[1] === 'number' ? `${label}${path[1] + 1}番目 ` : label;
}
