import type { CookingLevel } from '../../shared/levels';
import { RiceEarIcon, SproutIcon } from './icons';

/** 料理レベルの線画アイコン：わかば＝双葉、みのり＝稲穂 */
export function LevelIcon({ level, size = 18 }: { level: CookingLevel; size?: number }) {
  return level === 'futaba' ? <SproutIcon size={size} /> : <RiceEarIcon size={size} />;
}

/** わかば＝若葉色、みのり＝実りの金色 */
export const LEVEL_COLOR: Record<CookingLevel, string> = {
  futaba: 'text-success-ink',
  minori: 'text-sub-ink',
};
