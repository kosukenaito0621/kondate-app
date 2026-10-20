import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';
import { SECTIONS, SECTION_LABEL, UNITS, type Unit } from '../../../shared/constants';
import { addDays, toJstDate } from '../../../shared/date';
import { INGREDIENT_NAMES, normalizeIngredientName, sectionOf } from '../../../shared/ingredients';
import { daysUntil, qtyLabel, type PantryInput, type PantryItemView } from '../../../shared/pantry';
import { GlassButton } from '../../components/glass/GlassButton';
import { GlassCard } from '../../components/glass/GlassCard';
import { Sheet } from '../../components/glass/Sheet';
import { BoxIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { RecipeListSkeleton } from '../../components/skeleton/Skeletons';
import { cn } from '../../lib/cn';
import { riseItem, spring, staggerContainer } from '../../lib/motion';
import { pantryQuery, usePantryActions } from '../../lib/pantry';
import { isActiveMission, TOUR_PREFILL } from '../../lib/tour';

export const Route = createFileRoute('/_app/pantry')({
  component: PantryPage,
});

/** 期限が近い（この日数以内）とみなす */
const SOON_DAYS = 3;

/** 期限の表示（期限切れ・今日まで・あと◯日・日付） */
function expiryOf(expiresOn: string | null, today: string) {
  if (!expiresOn) return null;
  const d = daysUntil(expiresOn, today);
  const md = `${Number(expiresOn.slice(5, 7))}/${Number(expiresOn.slice(8, 10))}`;
  if (d < 0) return { label: '期限切れ', tone: 'over' as const };
  if (d === 0) return { label: '今日まで', tone: 'soon' as const };
  if (d <= SOON_DAYS) return { label: `あと${d}日`, tone: 'soon' as const };
  return { label: `${md}まで`, tone: 'ok' as const };
}

type Editing = { mode: 'new' } | { mode: 'edit'; item: PantryItemView };

function PantryPage() {
  const { data, isPending } = useQuery(pantryQuery);
  const [editing, setEditing] = useState<Editing | null>(null);
  const today = toJstDate();
  const rows = data ?? [];
  const soon = rows.filter((r) => r.expiresOn && daysUntil(r.expiresOn, today) <= SOON_DAYS);
  const bySection = SECTIONS.map((s) => ({
    section: s,
    items: rows.filter((r) => r.section === s),
  })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        title="うちの在庫"
        eyebrow={data ? `${rows.length}品` : undefined}
        action={
          <button
            type="button"
            data-tour="pantry-add"
            onClick={() => setEditing({ mode: 'new' })}
            className="btn-primary sheen flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-bold"
          >
            <PlusIcon size={18} />
            追加
          </button>
        }
      />

      {isPending ? (
        <RecipeListSkeleton />
      ) : rows.length === 0 ? (
        <GlassCard padding="lg" className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-strong">
            <BoxIcon size={28} />
          </span>
          <p className="text-lg font-bold">在庫はまだありません</p>
          <p className="text-sm text-ink-soft">
            冷蔵庫や棚にある食材を入れておくと、
            <br />
            買い物リストから差し引き、献立でも使い切りを優先します。
          </p>
          <p className="text-xs text-ink-soft">
            買い物リストの「かごに入れたもの」からも、まとめて入れられます。
          </p>
          <GlassButton
            variant="primary"
            icon={<PlusIcon size={18} />}
            onClick={() => setEditing({ mode: 'new' })}
          >
            在庫を追加する
          </GlassButton>
        </GlassCard>
      ) : (
        <motion.div
          className="flex flex-col gap-3"
          variants={staggerContainer(0.04)}
          initial="initial"
          animate="animate"
        >
          {soon.length > 0 && (
            <GlassCard variants={riseItem} padding="md" className="border-l-0">
              <p className="text-sm font-bold text-sub-ink">期限が近いもの {soon.length}品</p>
              <p className="mt-0.5 text-xs text-ink-soft">{soon.map((r) => r.name).join('・')}</p>
              <Link
                to="/recipes"
                search={{ stock: '1' }}
                className="mt-2 flex min-h-10 items-center gap-1 text-sm font-bold text-accent-strong"
              >
                <SearchIcon size={16} />
                これを使うレシピを探す
                <ChevronRightIcon size={14} />
              </Link>
            </GlassCard>
          )}
          {soon.length === 0 && (
            <Link
              to="/recipes"
              search={{ stock: '1' }}
              className="flex min-h-10 items-center gap-1 self-end rounded-full px-3 text-xs font-bold text-accent-strong"
            >
              <SearchIcon size={15} />
              在庫で作れるレシピを探す
              <ChevronRightIcon size={14} />
            </Link>
          )}

          {bySection.map((g) => (
            <motion.section
              key={g.section}
              variants={riseItem}
              aria-labelledby={`pantry-${g.section}`}
            >
              <h2
                id={`pantry-${g.section}`}
                className="mb-1.5 px-2 text-xs font-bold text-ink-soft"
              >
                {SECTION_LABEL[g.section]}
              </h2>
              <ul className="glass flex flex-col rounded-[var(--radius-card)] p-1.5">
                <AnimatePresence initial={false}>
                  {g.items.map((item) => {
                    const exp = expiryOf(item.expiresOn, today);
                    return (
                      <motion.li
                        key={item.id}
                        layout
                        exit={{ opacity: 0, height: 0 }}
                        transition={spring.soft}
                      >
                        <button
                          type="button"
                          onClick={() => setEditing({ mode: 'edit', item })}
                          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left hover:bg-pill"
                        >
                          <span className="min-w-0 flex-1 truncate font-bold">{item.name}</span>
                          <span className="num shrink-0 text-sm text-ink-soft">
                            {qtyLabel(item)}
                          </span>
                          {exp && (
                            <span
                              className={cn(
                                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                                exp.tone === 'over' && 'bg-sun-chip text-sun',
                                exp.tone === 'soon' && 'bg-memo text-memo-ink',
                                exp.tone === 'ok' && 'bg-pill text-ink-soft',
                              )}
                            >
                              {exp.label}
                            </span>
                          )}
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </motion.section>
          ))}
          <p className="px-2 text-center text-[11px] text-ink-faint">
            「作った」を押すと、使った分を自動で差し引きます
          </p>
        </motion.div>
      )}

      <Sheet
        open={editing !== null}
        title={editing?.mode === 'edit' ? '在庫を変える' : '在庫を追加'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <PantryForm
            key={editing.mode === 'edit' ? editing.item.id : 'new'}
            item={editing.mode === 'edit' ? editing.item : null}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  );
}

const NO_UNIT = '';

/** 在庫の入力（名前・数と単位・期限）。数を空にすると「あり」（数は気にしない） */
function PantryForm({ item, onDone }: { item: PantryItemView | null; onDone: () => void }) {
  const { add, update, remove } = usePantryActions();
  const listId = useId();
  const today = toJstDate();
  // お試しの「在庫を入れてみよう」では、見本の食材を入れた状態で開く
  const [sample] = useState(() =>
    !item && isActiveMission('pantry') ? TOUR_PREFILL.pantry() : null,
  );
  const [name, setName] = useState(item?.name ?? sample?.name ?? '');
  const [qty, setQty] = useState(
    item?.quantity != null ? String(item.quantity) : (sample?.qty ?? ''),
  );
  const [unit, setUnit] = useState<string>(item?.unit ?? sample?.unit ?? '個');
  const [expires, setExpires] = useState(item?.expiresOn ?? sample?.expires ?? '');
  const [error, setError] = useState<string | null>(null);

  const quick = [
    { label: 'なし', value: '' },
    { label: '今日', value: today },
    { label: '明日', value: addDays(today, 1) },
    { label: '3日後', value: addDays(today, 3) },
    { label: '1週間', value: addDays(today, 7) },
  ];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = normalizeIngredientName(name);
    if (!n) return setError('食材名を入力してください');
    const q = qty.trim() === '' ? null : Number(qty.normalize('NFKC'));
    if (q !== null && !(q > 0 && q <= 100000))
      return setError('数は0より大きい数で入力してください');
    const input: PantryInput = {
      name: n,
      quantity: q,
      unit: q === null || unit === NO_UNIT ? null : (unit as Unit),
      expiresOn: expires || null,
    };
    const opts = { onSuccess: onDone };
    if (item) update.mutate({ id: item.id, ...input }, opts);
    else add.mutate(input, opts);
  };

  const section = sectionOf(normalizeIngredientName(name));
  const busy = add.isPending || update.isPending;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-ink-soft">食材</span>
        <input
          value={name}
          list={listId}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="例：鶏もも肉"
          maxLength={40}
          className="field min-h-12 rounded-2xl px-4"
          autoFocus={!item}
        />
        <datalist id={listId}>
          {INGREDIENT_NAMES.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {section && (
          <span className="px-1 text-[11px] text-ink-soft">{SECTION_LABEL[section]}</span>
        )}
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-bold text-ink-soft">分量（空欄なら「あり」）</span>
        <div className="flex gap-2">
          <input
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setError(null);
            }}
            inputMode="decimal"
            placeholder="例：300"
            aria-label="数"
            className="field num min-h-12 min-w-0 flex-1 rounded-2xl px-4"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            aria-label="単位"
            disabled={qty.trim() === ''}
            className="field min-h-12 w-28 rounded-2xl px-3 disabled:opacity-50"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            <option value={NO_UNIT}>（単位なし）</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-ink-soft">期限</span>
        <div className="flex flex-wrap gap-1.5">
          {quick.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => setExpires(o.value)}
              aria-pressed={expires === o.value}
              className={cn(
                'min-h-9 rounded-full px-3 text-xs font-bold',
                expires === o.value ? 'bg-accent text-accent-ink' : 'groove',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={expires}
          onChange={(e) => setExpires(e.target.value)}
          aria-label="期限の日付"
          className="field min-h-11 rounded-2xl px-4"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <GlassButton type="submit" variant="primary" loading={busy} data-tour="pantry-save">
        {item ? '保存する' : '在庫に入れる'}
      </GlassButton>
      {item && (
        <GlassButton
          variant="ghost"
          loading={remove.isPending}
          onClick={() => remove.mutate(item.id, { onSuccess: onDone })}
        >
          使い切った（在庫から外す）
        </GlassButton>
      )}
    </form>
  );
}
