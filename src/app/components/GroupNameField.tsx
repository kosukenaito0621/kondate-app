import { GROUP_NAME_MAX, GROUP_NAME_SUFFIX } from '../../shared/groups';
import { cn } from '../lib/cn';

/** 「○○の食卓」の○○を入れる欄。「の食卓」は欄の右に固定で表示する */
export function GroupNameField({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('field flex min-h-12 min-w-0 items-center rounded-2xl pr-4', className)}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={GROUP_NAME_MAX + GROUP_NAME_SUFFIX.length}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-describedby={id ? `${id}-suffix` : undefined}
        className="min-h-12 min-w-0 flex-1 bg-transparent pl-4 outline-none"
      />
      <span id={id ? `${id}-suffix` : undefined} className="shrink-0 font-bold text-ink-soft">
        {GROUP_NAME_SUFFIX}
      </span>
    </div>
  );
}
