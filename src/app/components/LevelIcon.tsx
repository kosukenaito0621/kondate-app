import type { CookingLevel } from '../../shared/levels';
import { cn } from '../lib/cn';
import { RiceEarIcon, SproutIcon } from './icons';

/** わかば＝若葉色、みのり＝実りの金色（白い線画が読める濃さ） */
const LEVEL_BG: Record<CookingLevel, string> = {
  futaba: 'bg-[#5c9a4f]',
  minori: 'bg-[#b0841f]',
};

/**
 * 料理レベルのアイコン：色付きの丸に白い線画（わかば＝双葉、みのり＝稲穂）。
 * size は丸の直径（px）。
 */
export function LevelIcon({
  level,
  size = 20,
  className,
}: {
  level: CookingLevel;
  size?: number;
  className?: string;
}) {
  const inner = Math.round(size * 0.66);
  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full text-white',
        LEVEL_BG[level],
        className,
      )}
      style={{ width: size, height: size }}
    >
      {level === 'futaba' ? (
        <SproutIcon size={inner} strokeWidth={2.2} />
      ) : (
        <RiceEarIcon size={inner} strokeWidth={2} />
      )}
    </span>
  );
}
