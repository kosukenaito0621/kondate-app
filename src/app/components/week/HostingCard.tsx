import type { ReactNode } from 'react';
import { MEAL_LABEL, type HostingCourseView, type HostingView } from '../../../shared/hosting';
import { cn } from '../../lib/cn';
import { CheckDraw, CutleryIcon } from '../icons';

/** もてなしのコース（出す順）。ボタンやリンクの中に置くので、すべて span で組む */
export function HostingCard({
  hosting,
  action,
}: {
  hosting: HostingView;
  /** 料理ごとに右端へ置くもの（ホームの「作った」ボタン） */
  action?: (course: HostingCourseView) => ReactNode;
}) {
  return (
    <span className="block rounded-2xl bg-accent-soft px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-accent-strong">
        <CutleryIcon size={16} />
        <span className="text-sm font-bold">{MEAL_LABEL[hosting.meal]}のもてなし</span>
        <span className="num ml-auto text-xs font-bold">{hosting.servings}人</span>
      </span>
      <span className="mt-1.5 flex flex-col gap-1">
        {hosting.courses.map((c) => (
          <span key={c.id} className={cn('flex items-center gap-2 text-sm', action && 'min-h-11')}>
            <span className="w-14 shrink-0 truncate text-[11px] font-bold text-ink-soft">
              {c.label}
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate font-bold',
                !c.recipe && 'font-normal text-ink-faint',
              )}
            >
              {c.recipe?.name ?? '未定'}
            </span>
            {action
              ? action(c)
              : c.cookedLogId && (
                  <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-success px-1.5 py-0.5 text-[10px] font-bold text-success-ink">
                    <CheckDraw checked size={11} />
                    作った
                  </span>
                )}
          </span>
        ))}
      </span>
    </span>
  );
}
