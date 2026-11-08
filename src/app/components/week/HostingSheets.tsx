import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '../../../shared/constants';
import { weekdayIndex, WEEKDAY_LABELS } from '../../../shared/date';
import {
  MAX_COURSES,
  MAX_HOSTING_SERVINGS,
  MEAL_LABEL,
  MEALS,
  type HostingCourseView,
  type HostingView,
  type Meal,
} from '../../../shared/hosting';
import type { PlanDayView } from '../../../shared/plan';
import { cn } from '../../lib/cn';
import { useHostingMutation, type CourseInput } from '../../lib/hostings';
import { ConfirmDialog } from '../glass/ConfirmDialog';
import { GlassButton } from '../glass/GlassButton';
import { Segmented } from '../glass/Segmented';
import { Sheet } from '../glass/Sheet';
import { ChevronDownIcon, ChevronUpIcon, PlusIcon } from '../icons';
import { CookOnDateButton, RecipePicker } from './MealSheets';

const dayLabel = (date: string) => `${WEEKDAY_LABELS[weekdayIndex(date)]}曜日`;
const DEFAULT_SERVINGS = 4;

function ServingsStepper({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const button = 'groove grid size-11 place-items-center rounded-full text-lg font-bold';
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-ink-soft">人数（お客さんと家族の合計）</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={disabled || value <= 1}
          onClick={() => onChange(value - 1)}
          aria-label="人数を減らす"
        >
          −
        </button>
        <span className="num w-10 text-center font-bold">{value}人</span>
        <button
          type="button"
          className={button}
          disabled={disabled || value >= MAX_HOSTING_SERVINGS}
          onClick={() => onChange(value + 1)}
          aria-label="人数を増やす"
        >
          ＋
        </button>
      </span>
    </div>
  );
}

/** もてなしを追加する（昼か夜かと人数） */
export function HostingCreateSheet({
  day,
  weekStart,
  onClose,
}: {
  day: PlanDayView | null;
  weekStart: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={day !== null} title="もてなしを追加" onClose={onClose}>
      {day && (
        <HostingCreateBody key={day.date} day={day} weekStart={weekStart} onClose={onClose} />
      )}
    </Sheet>
  );
}

function HostingCreateBody({
  day,
  weekStart,
  onClose,
}: {
  day: PlanDayView;
  weekStart: string;
  onClose: () => void;
}) {
  const mutation = useHostingMutation(weekStart);
  const taken = (m: Meal) => day.hostings.some((h) => h.meal === m);
  const [meal, setMeal] = useState<Meal>(taken('dinner') ? 'lunch' : 'dinner');
  const [servings, setServings] = useState(DEFAULT_SERVINGS);
  const [confirm, setConfirm] = useState(false);
  const create = () =>
    mutation.mutate(
      { type: 'create', date: day.date, meal, servings },
      { onSuccess: onClose, onSettled: () => setConfirm(false) },
    );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-soft">{dayLabel(day.date)}のもてなし</p>
      <div className="grid grid-cols-2 gap-1.5">
        {MEALS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={taken(m)}
            aria-pressed={meal === m}
            onClick={() => setMeal(m)}
            className={cn(
              'min-h-14 rounded-2xl text-sm font-bold disabled:opacity-40',
              meal === m ? 'bg-accent text-accent-ink' : 'groove',
            )}
          >
            {MEAL_LABEL[m]}
            {taken(m) && '（登録済み）'}
          </button>
        ))}
      </div>
      <ServingsStepper value={servings} onChange={setServings} />
      <GlassButton
        variant="primary"
        loading={mutation.isPending}
        disabled={taken(meal)}
        onClick={() => (meal === 'dinner' && day.items.length ? setConfirm(true) : create())}
      >
        追加する
      </GlassButton>
      <ConfirmDialog
        open={confirm}
        title="この日の料理を外して、夜のもてなしにしますか？"
        message="その日のふだんの献立はお休みになります。"
        confirmLabel="もてなしにする"
        loading={mutation.isPending}
        onConfirm={create}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}

type View =
  | { kind: 'list' }
  | { kind: 'course'; index: number }
  | { kind: 'pick'; index: number }
  | { kind: 'add' };

const toInput = (c: HostingCourseView): CourseInput => ({
  label: c.label,
  category: c.category,
  recipeId: c.recipe?.id ?? null,
});

/** コースの編集（人数・枠の追加と並べ替え・レシピの指定・もてなしの削除） */
export function HostingSheet({
  hosting,
  weekStart,
  onClose,
}: {
  hosting: HostingView | null;
  weekStart: string;
  onClose: () => void;
}) {
  const title = hosting ? `${dayLabel(hosting.date)}の${MEAL_LABEL[hosting.meal]}のもてなし` : '';
  return (
    <Sheet open={hosting !== null} title={title} onClose={onClose}>
      {hosting && (
        <HostingBody key={hosting.id} hosting={hosting} weekStart={weekStart} onClose={onClose} />
      )}
    </Sheet>
  );
}

function HostingBody({
  hosting,
  weekStart,
  onClose,
}: {
  hosting: HostingView;
  weekStart: string;
  onClose: () => void;
}) {
  const mutation = useHostingMutation(weekStart);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = mutation.isPending;
  const courses = hosting.courses.map(toInput);
  // then を渡さなければ、保存しても画面は切り替えない
  const save = (next: CourseInput[], then?: View) =>
    mutation.mutate(
      { type: 'courses', id: hosting.id, courses: next },
      { onSuccess: () => then && setView(then) },
    );
  const replace = (index: number, patch: Partial<CourseInput>, then?: View) =>
    save(
      courses.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      then,
    );
  const move = (index: number, delta: number) => {
    const next = [...courses];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    save(next);
  };

  if (view.kind === 'pick') {
    const course = hosting.courses[view.index];
    if (!course) return null;
    return (
      <div className="flex flex-col gap-3">
        <GlassButton variant="ghost" onClick={() => setView({ kind: 'course', index: view.index })}>
          もどる
        </GlassButton>
        <RecipePicker
          hosting
          category={course.category}
          level="minori"
          currentId={course.recipe?.id}
          onPick={(recipeId) => replace(view.index, { recipeId }, { kind: 'list' })}
        />
      </div>
    );
  }

  if (view.kind === 'add') {
    return (
      <AddCourse
        busy={busy}
        onBack={() => setView({ kind: 'list' })}
        onAdd={(label, category) =>
          save([...courses, { label, category, recipeId: null }], { kind: 'list' })
        }
      />
    );
  }

  if (view.kind === 'course') {
    const course = hosting.courses[view.index];
    if (!course) return null;
    return (
      <CourseDetail
        key={course.id}
        course={course}
        date={hosting.date}
        busy={busy}
        canRemove={courses.length > 1}
        onBack={() => setView({ kind: 'list' })}
        onPick={() => setView({ kind: 'pick', index: view.index })}
        onSave={(patch, next) =>
          replace(
            view.index,
            patch,
            next === 'pick'
              ? { kind: 'pick', index: view.index }
              : next === 'list'
                ? { kind: 'list' }
                : undefined,
          )
        }
        onRemove={() =>
          save(
            courses.filter((_, i) => i !== view.index),
            { kind: 'list' },
          )
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ServingsStepper
        value={hosting.servings}
        disabled={busy}
        onChange={(servings) => mutation.mutate({ type: 'servings', id: hosting.id, servings })}
      />
      <ol className="flex max-h-[45dvh] flex-col gap-1.5 overflow-y-auto">
        {hosting.courses.map((c, i) => (
          <li key={c.id} className="groove flex items-center gap-1 rounded-2xl p-1.5">
            <button
              type="button"
              onClick={() =>
                setView(c.recipe ? { kind: 'course', index: i } : { kind: 'pick', index: i })
              }
              className="flex min-h-11 min-w-0 flex-1 flex-col justify-center px-2 text-left"
            >
              <span className="truncate text-[11px] font-bold text-ink-soft">{c.label}</span>
              <span className={cn('truncate font-bold', !c.recipe && 'font-normal text-ink-faint')}>
                {c.recipe?.name ?? '未定（タップして選ぶ）'}
              </span>
            </button>
            <button
              type="button"
              disabled={busy || i === 0}
              onClick={() => move(i, -1)}
              className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft disabled:opacity-30"
              aria-label={`${c.label}を上へ`}
            >
              <ChevronUpIcon size={18} />
            </button>
            <button
              type="button"
              disabled={busy || i === hosting.courses.length - 1}
              onClick={() => move(i, 1)}
              className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft disabled:opacity-30"
              aria-label={`${c.label}を下へ`}
            >
              <ChevronDownIcon size={18} />
            </button>
          </li>
        ))}
      </ol>
      {courses.length < MAX_COURSES && (
        <GlassButton icon={<PlusIcon size={18} />} onClick={() => setView({ kind: 'add' })}>
          枠を追加
        </GlassButton>
      )}
      <GlassButton variant="ghost" onClick={() => setConfirmDelete(true)}>
        このもてなしを消す
      </GlassButton>
      <ConfirmDialog
        open={confirmDelete}
        title="このもてなしを消しますか？"
        message="コースの内容は元に戻せません。"
        confirmLabel="消す"
        danger
        loading={busy}
        onConfirm={() =>
          mutation.mutate(
            { type: 'delete', id: hosting.id },
            { onSuccess: onClose, onSettled: () => setConfirmDelete(false) },
          )
        }
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function CourseDetail({
  course,
  date,
  busy,
  canRemove,
  onBack,
  onPick,
  onSave,
  onRemove,
}: {
  course: HostingCourseView;
  date: string;
  busy: boolean;
  canRemove: boolean;
  onBack: () => void;
  onPick: () => void;
  onSave: (patch: Partial<CourseInput>, next?: 'list' | 'pick') => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(course.label);
  // 書きかけの名前は、次の操作と一緒に1回で保存する（別々に送ると行き違うため）
  const next = label.trim();
  const dirty = next && next !== course.label ? { label: next } : null;
  return (
    <div className="flex flex-col gap-2.5">
      <GlassButton
        variant="ghost"
        disabled={busy}
        onClick={() => (dirty ? onSave(dirty, 'list') : onBack())}
      >
        もどる
      </GlassButton>
      <label className="groove flex min-h-11 items-center gap-2 rounded-full px-4">
        <span className="shrink-0 text-xs font-bold text-ink-soft">枠の名前</span>
        <input
          value={label}
          maxLength={20}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty && !busy) onSave(dirty);
          }}
          className="min-w-0 flex-1 bg-transparent py-2 outline-none"
        />
        {dirty && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(dirty)}
            className="shrink-0 text-sm font-bold text-accent-strong"
          >
            変更
          </button>
        )}
      </label>
      {course.recipe && (
        <>
          <Link
            to="/recipes/$id"
            params={{ id: course.recipe.id }}
            className="groove flex flex-col rounded-2xl p-3"
          >
            <span className="truncate font-bold">{course.recipe.name}</span>
            <span className="text-xs text-ink-soft">レシピを見る</span>
          </Link>
          <CookOnDateButton
            recipeId={course.recipe.id}
            date={date}
            logId={course.cookedLogId}
            hostingCourseId={course.id}
          />
        </>
      )}
      <GlassButton
        variant="primary"
        disabled={busy}
        onClick={() => (dirty ? onSave(dirty, 'pick') : onPick())}
      >
        {course.recipe ? '別のレシピを選ぶ' : 'レシピを選ぶ'}
      </GlassButton>
      {course.recipe && (
        <GlassButton
          variant="ghost"
          loading={busy}
          onClick={() => onSave({ ...dirty, recipeId: null })}
        >
          未定に戻す
        </GlassButton>
      )}
      {canRemove && (
        <GlassButton variant="ghost" loading={busy} onClick={onRemove}>
          この枠を消す
        </GlassButton>
      )}
    </div>
  );
}

function AddCourse({
  busy,
  onBack,
  onAdd,
}: {
  busy: boolean;
  onBack: () => void;
  onAdd: (label: string, category: Category) => void;
}) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<Category>('main');
  return (
    <div className="flex flex-col gap-3">
      <GlassButton variant="ghost" onClick={onBack}>
        もどる
      </GlassButton>
      <label className="groove flex min-h-11 items-center gap-2 rounded-full px-4">
        <span className="shrink-0 text-xs font-bold text-ink-soft">枠の名前</span>
        <input
          value={label}
          maxLength={20}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="例：魚料理"
          className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-ink-faint"
        />
      </label>
      <Segmented
        label="レシピの分類"
        value={category}
        onChange={setCategory}
        options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
      />
      <GlassButton
        variant="primary"
        loading={busy}
        disabled={!label.trim()}
        onClick={() => onAdd(label.trim(), category)}
      >
        追加する
      </GlassButton>
    </div>
  );
}
