import { AnimatePresence, Reorder, useDragControls } from 'motion/react';
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
import { spring } from '../../lib/motion';
import { GlassButton } from '../glass/GlassButton';
import { GlassCard } from '../glass/GlassCard';
import { Segmented } from '../glass/Segmented';
import { SEASON_LABEL, SEASONS, seasonsFromIngredients, type Season } from '../../../shared/season';
import { LevelIcon } from '../LevelIcon';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, GripIcon, PlusIcon, TrashIcon } from '../icons';

type IngredientRow = { key: string; name: string; amount: string; section: Section; group: string };
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
  seasons: Season[];
  seasonOnly: boolean;
  /** 季節を自分で選んだか。選んでいなければ材料から自動で決める */
  seasonsTouched: boolean;
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
      group: i?.group ?? '',
    })),
    seasons: r?.seasons ?? [],
    seasonOnly: r?.seasonOnly ?? false,
    // 既存のレシピや AI の下書きは、入っている季節をそのまま使う
    seasonsTouched: !!r,
    steps: (r?.steps?.length ? r.steps : [null, null]).map((s) => ({
      key: key(),
      text: s?.text ?? '',
      tip: s?.tip ?? '',
    })),
  };
}

/** フォームの値を API 入力に変換して検証する */
export function parseForm(v: RecipeFormValue) {
  const seasons = effectiveSeasons(v);
  return recipeInputSchema.safeParse({
    seasons,
    seasonOnly: seasons.length > 0 && v.seasonOnly,
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
      .map((i) => ({
        name: i.name.trim(),
        section: i.section,
        group: i.group.trim() || null,
        ...parseAmount(i.amount),
      })),
    steps: v.steps
      .filter((s) => s.text.trim())
      .map((s) => ({ text: s.text.trim(), ...(s.tip.trim() && { tip: s.tip.trim() }) })),
  });
}

/** 季節を選んでいなければ、材料の旬から決める */
function effectiveSeasons(v: RecipeFormValue): Season[] {
  if (v.seasonsTouched) return v.seasons;
  return seasonsFromIngredients(v.ingredients.map((i) => normalizeIngredientName(i.name.trim())));
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
  const groupListId = useId();
  // 入力済みのグループ名＋A〜C を候補に出す
  const groupNames = [
    ...new Set([...v.ingredients.map((i) => i.group.trim()).filter(Boolean), 'A', 'B', 'C']),
  ];
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
              label: (
                <span className={`inline-flex`}>
                  <LevelIcon level={l} size={22} />
                </span>
              ),
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
        <SeasonField value={v} onChange={(patch) => setV((prev) => ({ ...prev, ...patch }))} />
      </GlassCard>

      <GlassCard padding="lg">
        <h2 className="font-bold">材料</h2>
        <p className="mt-1 text-xs text-ink-soft">
          分量は「300g」「大さじ2」「1/2個」「少々」のように書けます。区分は材料名から自動で入ります。
          「A（たれ）」のように合わせて使う材料は、グループに同じ名前を入れるとまとまって表示されます。
        </p>
        <datalist id={groupListId}>
          {groupNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
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
                <div className="ml-8 flex items-center gap-2">
                  <input
                    aria-label={`材料${idx + 1}のグループ`}
                    list={groupListId}
                    value={i.group}
                    onChange={(e) => updateIngredient(i.key, { group: e.target.value })}
                    placeholder="グループ"
                    maxLength={20}
                    className="field min-h-9 w-24 rounded-full px-3 text-xs"
                  />
                  <select
                    aria-label={`材料${idx + 1}の区分`}
                    value={i.section}
                    onChange={(e) =>
                      updateIngredient(i.key, { section: e.target.value as Section })
                    }
                    className="min-h-9 min-w-0 rounded-full bg-transparent px-2 text-xs text-ink-soft"
                  >
                    {SECTIONS.map((s) => (
                      <option key={s} value={s}>
                        {SECTION_LABEL[s]}
                        {s === 'seasoning' ? '（買い物リストに出さない）' : ''}
                      </option>
                    ))}
                  </select>
                </div>
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
              {
                key: key(),
                name: '',
                amount: '',
                section: 'veg',
                // 続けて同じグループの材料を入れやすいように、直前の行のグループを引き継ぐ
                group: v.ingredients.at(-1)?.group ?? '',
              },
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
            わかばのレシピは、手順ごとに「ひとことコツ」を入れると初めての人も安心です（5ステップ以内がおすすめ）。
          </p>
        )}
        <p className="mt-1 text-xs text-ink-soft">
          左の点々をドラッグするか、↑↓ボタンで順番を入れ替えられます。
        </p>
        <Reorder.Group
          as="ol"
          axis="y"
          values={v.steps}
          onReorder={(rows) => set('steps', rows)}
          className="mt-3 flex flex-col gap-3"
        >
          <AnimatePresence initial={false}>
            {v.steps.map((s, idx) => (
              <StepEditor
                key={s.key}
                step={s}
                index={idx}
                count={v.steps.length}
                futaba={futaba}
                onChange={(patch) => updateStep(s.key, patch)}
                onMove={(to) => {
                  const rows = [...v.steps];
                  const [moved] = rows.splice(idx, 1);
                  rows.splice(to, 0, moved!);
                  set('steps', rows);
                }}
                onRemove={() =>
                  set(
                    'steps',
                    v.steps.filter((x) => x.key !== s.key),
                  )
                }
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>
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

/** 季節：旬の季節を選ぶ。選ばなければ材料から自動。「この季節だけ」で季節限定に */
function SeasonField({
  value,
  onChange,
}: {
  value: RecipeFormValue;
  onChange: (patch: Partial<RecipeFormValue>) => void;
}) {
  const current = effectiveSeasons(value);
  const toggle = (s: Season) => {
    const next = current.includes(s) ? current.filter((x) => x !== s) : [...current, s];
    onChange({ seasons: SEASONS.filter((x) => next.includes(x)), seasonsTouched: true });
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-xs font-bold text-ink-soft">旬の季節</legend>
      <div className="grid grid-cols-4 gap-2">
        {SEASONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={current.includes(s)}
            onClick={() => toggle(s)}
            className={cn(
              'min-h-11 rounded-full text-sm font-bold transition-colors',
              current.includes(s) ? 'bg-accent text-accent-ink' : 'bg-pill text-ink-soft',
            )}
          >
            {SEASON_LABEL[s]}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-soft">
        {current.length === 0
          ? '選ばなければ通年。旬の材料を入れると自動で付きます。'
          : value.seasonsTouched
            ? '旬の季節は献立に出やすくなります。'
            : '材料の旬から自動で付けました。タップで変えられます。'}
      </p>
      {current.length > 0 && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.seasonOnly}
            onChange={(e) =>
              onChange({ seasonOnly: e.target.checked, seasonsTouched: true, seasons: current })
            }
            className="size-5 accent-[var(--accent-strong)]"
          />
          この季節だけ献立に出す（冷やし中華・おでん など）
        </label>
      )}
    </fieldset>
  );
}

/** 手順1つ分。点々のつまみでドラッグ、↑↓で並べ替え。コツは×で消せる */
function StepEditor({
  step,
  index,
  count,
  futaba,
  onChange,
  onMove,
  onRemove,
}: {
  step: StepRow;
  index: number;
  count: number;
  futaba: boolean;
  onChange: (patch: Partial<StepRow>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const n = index + 1;
  return (
    <Reorder.Item
      value={step}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      whileDrag={{ scale: 1.02, boxShadow: '0 12px 30px -12px rgb(0 0 0 / 0.35)' }}
      transition={spring.soft}
      className="flex list-none gap-1.5 rounded-2xl bg-canvas/40"
    >
      <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
        <span className="btn-primary num grid size-7 place-items-center rounded-full text-sm font-bold">
          {n}
        </span>
        <span
          onPointerDown={(e) => controls.start(e)}
          className="grid size-9 cursor-grab touch-none place-items-center text-ink-soft active:cursor-grabbing"
          aria-hidden="true"
        >
          <GripIcon size={18} />
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <textarea
          aria-label={`手順${n}`}
          value={step.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={2}
          placeholder="例：中火で5分焼く（「◯分」はタイマーになります）"
          className="field w-full resize-none rounded-2xl px-3 py-2.5"
        />
        <div className="field flex min-h-10 items-center rounded-xl pr-1">
          <input
            aria-label={`手順${n}のコツ`}
            value={step.tip}
            onChange={(e) => onChange({ tip: e.target.value })}
            placeholder={futaba ? 'ひとことコツ' : 'コツ（任意）'}
            className="min-h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
          />
          {step.tip && (
            <button
              type="button"
              onClick={() => onChange({ tip: '' })}
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-pill"
              aria-label={`手順${n}のコツを消す`}
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center">
        <button
          type="button"
          onClick={() => onMove(index - 1)}
          disabled={index === 0}
          className="grid size-9 place-items-center text-ink-soft disabled:opacity-30"
          aria-label={`手順${n}を上へ`}
        >
          <ChevronUpIcon size={18} />
        </button>
        <button
          type="button"
          onClick={() => onMove(index + 1)}
          disabled={index === count - 1}
          className="grid size-9 place-items-center text-ink-soft disabled:opacity-30"
          aria-label={`手順${n}を下へ`}
        >
          <ChevronDownIcon size={18} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="grid size-9 place-items-center text-ink-soft"
          aria-label={`手順${n}を削除`}
        >
          <TrashIcon size={18} />
        </button>
      </div>
    </Reorder.Item>
  );
}
