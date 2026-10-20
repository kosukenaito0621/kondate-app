import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState } from 'react';
import type { FavoriteUser } from '../../../shared/recipe';
import { api } from '../../api';
import { cn } from '../../lib/cn';
import { spring } from '../../lib/motion';
import { HeartIcon } from '../icons';
import { useToast } from '../toast/Toaster';

/**
 * お気に入りのハート。押した瞬間に塗りを切り替え（失敗したら戻す）、ぽんと弾ませる。
 * ハートは丸いボタンの真ん中に置く（アイコンの中心とボタンの中心をそろえてある）
 */
export function FavoriteButton({
  recipeId,
  recipeName,
  favorite,
  size = 40,
  onChange,
}: {
  recipeId: string;
  recipeName: string;
  favorite: boolean;
  size?: number;
  onChange?: (r: { favorite: boolean; favoritedBy: FavoriteUser[] }) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  // 押した直後の表示（読み直しが届くまでのあいだ）
  const [shown, setShown] = useState<boolean | null>(null);
  const on = shown ?? favorite;
  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const res = next
        ? await api.recipes[':id'].favorite.$put({ param: { id: recipeId } })
        : await api.recipes[':id'].favorite.$delete({ param: { id: recipeId } });
      if (!res.ok) throw new Error();
      return (await res.json()) as { favorite: boolean; favoritedBy: FavoriteUser[] };
    },
    onMutate: (next) => setShown(next),
    onSuccess: (r) => {
      onChange?.(r);
      qc.invalidateQueries({ queryKey: ['recipes'] });
      qc.invalidateQueries({ queryKey: ['recipe', recipeId] });
      qc.invalidateQueries({ queryKey: ['plan'] });
    },
    onError: () => {
      setShown(null);
      toast('お気に入りを変えられませんでした', 'error');
    },
    onSettled: () => setShown(null),
  });

  return (
    <motion.button
      type="button"
      aria-pressed={on}
      aria-label={on ? `${recipeName}をお気に入りから外す` : `${recipeName}をお気に入りに入れる`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate(!on);
      }}
      whileTap={{ scale: 0.88 }}
      transition={spring.snappy}
      className={cn(
        'grid shrink-0 place-items-center rounded-full border transition-colors',
        on ? 'border-fav/40 bg-fav-soft text-fav' : 'border-ink/10 bg-pill text-fav',
      )}
      style={{ width: size, height: size }}
    >
      <motion.span
        key={on ? 'on' : 'off'}
        className="grid place-items-center"
        initial={on ? { scale: 0.6 } : false}
        animate={{ scale: 1 }}
        transition={spring.snappy}
      >
        <HeartIcon size={Math.round(size * 0.5)} filled={on} strokeWidth={2} />
      </motion.span>
    </motion.button>
  );
}
