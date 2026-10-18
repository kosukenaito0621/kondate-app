import { useState } from 'react';
import { cn } from '../lib/cn';

/** Google のアバター。読めないときは名前の頭文字 */
export function Avatar({
  name,
  url,
  size = 36,
  className,
}: {
  name: string | null;
  url: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (name ?? '?').slice(0, 1);
  return url && !failed ? (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-full object-cover ring-2 ring-white/70', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-strong ring-2 ring-white/70',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
