import { cn } from '../lib/cn';

export type Genre = 'wa' | 'yo' | 'chu';

export const GENRE_LABEL: Record<Genre, string> = { wa: '和', yo: '洋', chu: '中' };

const styles: Record<Genre, string> = {
  wa: 'bg-wa-soft text-wa',
  yo: 'bg-yo-soft text-yo',
  chu: 'bg-chu-soft text-chu',
};

export function GenreBadge({ genre, className }: { genre: Genre; className?: string }) {
  return (
    <span
      className={cn(
        'inline-grid size-6 place-items-center rounded-full text-[11px] font-bold',
        styles[genre],
        className,
      )}
      aria-label={`${GENRE_LABEL[genre]}食`}
    >
      {GENRE_LABEL[genre]}
    </span>
  );
}
