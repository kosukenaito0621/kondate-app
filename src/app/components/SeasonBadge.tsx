import { toJstDate } from '../../shared/date';
import { isInSeason, seasonBadge, seasonOf, type RecipeSeason } from '../../shared/season';
import { cn } from '../lib/cn';

/** 「秋が旬」「夏だけ」の札。いまが旬なら色付きで目立たせる */
export function SeasonBadge({ recipe, className }: { recipe: RecipeSeason; className?: string }) {
  const label = seasonBadge(recipe);
  if (!label) return null;
  const now = isInSeason(recipe, seasonOf(toJstDate()));
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold',
        now ? 'bg-accent-soft text-accent-strong' : 'bg-pill text-ink-soft',
        className,
      )}
    >
      {now && !recipe.seasonOnly ? '今が旬' : label}
    </span>
  );
}
