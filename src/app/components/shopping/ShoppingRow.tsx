import { motion, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import type { ShoppingItemView } from '../../../shared/shopping';
import { lineAmount } from '../../../shared/shopping';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { Avatar } from '../Avatar';
import { CheckDraw, TrashIcon } from '../icons';

const SWIPE = 72;

/**
 * 買い物リストの1行。
 * - 丸をタップ、または右へスワイプでチェック（購入済み）
 * - 購入済みは左へスワイプで戻す
 */
export function ShoppingRow({
  item,
  editing,
  onToggle,
  onDelete,
}: {
  item: ShoppingItemView;
  editing: boolean;
  onToggle: (checked: boolean) => void;
  onDelete: () => void;
}) {
  const x = useMotionValue(0);
  // スワイプ量に応じて後ろの「チェック」「戻す」が見えてくる
  const revealOpacity = useTransform(
    x,
    item.checked ? [-SWIPE, -12, 0] : [0, 12, SWIPE],
    item.checked ? [1, 0.3, 0] : [0, 0.3, 1],
  );

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const d = info.offset.x + info.velocity.x * 0.15;
    if (!item.checked && d > SWIPE) onToggle(true);
    else if (item.checked && d < -SWIPE) onToggle(false);
  };

  return (
    <motion.li
      layout
      layoutId={`shop-${item.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={spring.soft}
      className="relative list-none overflow-hidden rounded-2xl"
    >
      {/* スワイプで見える背景 */}
      <motion.div
        aria-hidden="true"
        style={{ opacity: revealOpacity }}
        className={cn(
          'absolute inset-0 flex items-center rounded-2xl px-5 text-sm font-bold',
          item.checked
            ? 'justify-end bg-sub-soft text-sub-ink'
            : 'justify-start bg-success text-success-ink',
        )}
      >
        {item.checked ? '戻す' : 'かごに入れた'}
      </motion.div>

      <motion.div
        drag={editing ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={item.checked ? { left: 0.6, right: 0.05 } : { left: 0.05, right: 0.6 }}
        dragDirectionLock
        onDragEnd={onDragEnd}
        style={{ x }}
        className={cn(
          'relative flex min-h-14 touch-pan-y items-center gap-3 rounded-2xl px-3 py-2',
          item.checked ? 'bg-pill/60' : 'bg-pill',
        )}
      >
        <button
          type="button"
          onClick={() => onToggle(!item.checked)}
          aria-pressed={item.checked}
          aria-label={item.checked ? `${item.name}のチェックを外す` : `${item.name}をかごに入れた`}
          className="-m-1 grid size-11 shrink-0 place-items-center"
        >
          <motion.span
            animate={{ scale: item.checked ? [1, 1.2, 1] : 1 }}
            transition={{ duration: 0.3 }}
            className={cn(
              'grid size-7 place-items-center rounded-full border-2 transition-colors',
              item.checked ? 'border-success bg-success text-success-ink' : 'border-ink-faint/50',
            )}
          >
            <CheckDraw checked={item.checked} size={15} />
          </motion.span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'truncate font-bold transition-colors',
                item.checked && 'text-ink-faint line-through decoration-2',
              )}
            >
              {item.name}
            </span>
            <span
              className={cn(
                'num shrink-0 text-sm',
                item.checked ? 'text-ink-faint' : 'text-ink-soft',
              )}
            >
              {lineAmount(item)}
            </span>
          </div>
          {item.sources.length > 0 && (
            <p className="truncate text-[11px] text-ink-faint">{item.sources.join('・')}</p>
          )}
          {item.isManual && <p className="text-[11px] text-ink-faint">手で追加</p>}
        </div>
        {item.checked && item.checkedBy && (
          <span title={`${item.checkedBy.name ?? ''}さんがチェック`}>
            <Avatar name={item.checkedBy.name} url={item.checkedBy.avatarUrl} size={22} />
          </span>
        )}
        {editing && (
          <button
            type="button"
            onClick={onDelete}
            className="grid size-11 shrink-0 place-items-center text-danger"
            aria-label={`${item.name}を削除`}
          >
            <TrashIcon size={18} />
          </button>
        )}
      </motion.div>
    </motion.li>
  );
}
