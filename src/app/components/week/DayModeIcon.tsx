import type { DayMode } from '../../../shared/plan';
import { BagIcon, CutleryIcon, StoreIcon } from '../icons';

/** 予定のアイコン：料理する＝カトラリー／外食＝お店／テイクアウト＝袋 */
export function DayModeIcon({ mode, size = 18 }: { mode: DayMode; size?: number }) {
  if (mode === 'eat_out') return <StoreIcon size={size} />;
  if (mode === 'takeout') return <BagIcon size={size} />;
  return <CutleryIcon size={size} />;
}
