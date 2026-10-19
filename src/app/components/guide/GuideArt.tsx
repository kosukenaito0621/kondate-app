import { cn } from '../../lib/cn';
import {
  CameraIcon,
  CutleryIcon,
  GearIcon,
  LinkIcon,
  PlusIcon,
  RefreshIcon,
  ShuffleIcon,
  SparkleIcon,
} from '../icons';

/**
 * 使い方ガイドの挿絵。実際の画面の部品を小さく組み合わせた「ミニ画面」。
 * 読み上げでは本文で説明するので、絵そのものは aria-hidden にする。
 */
function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'glass relative mx-auto flex min-h-44 w-full max-w-[19rem] shrink-0 flex-col justify-center gap-2 overflow-hidden rounded-[1.6rem] p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

const Bar = ({ w, className }: { w: string; className?: string }) => (
  <span className={cn('block h-2 rounded-full bg-ink/15', className)} style={{ width: w }} />
);

function MiniDay({
  day,
  genre,
  lines = 2,
  glow,
  className,
}: {
  day: string;
  genre: 'wa' | 'yo' | 'chu';
  lines?: number;
  glow?: boolean;
  className?: string;
}) {
  const color = { wa: 'bg-wa', yo: 'bg-yo', chu: 'bg-chu' }[genre];
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl bg-field px-2.5 py-2',
        glow && 'ring-2 ring-accent',
        className,
      )}
    >
      <span className="w-4 text-[11px] font-bold text-ink-soft">{day}</span>
      <span className={cn('h-6 w-1 rounded-full', color)} />
      <span className="flex flex-1 flex-col gap-1">
        {Array.from({ length: lines }, (_, i) => (
          <Bar key={i} w={i === 0 ? '78%' : '52%'} />
        ))}
      </span>
    </div>
  );
}

export function ArtWelcome({ groupName }: { groupName: string }) {
  return (
    <Frame className="items-center text-center">
      <img src="/icon.svg" alt="" className="size-16 rounded-2xl shadow-lg" />
      <p className="mt-1 text-lg font-bold">{groupName}</p>
      <div className="flex -space-x-2">
        {['bg-wa', 'bg-yo', 'bg-chu'].map((c) => (
          <span key={c} className={cn('size-7 rounded-full ring-2 ring-canvas', c)} />
        ))}
      </div>
    </Frame>
  );
}

export function ArtGenerate() {
  return (
    <Frame>
      <MiniDay day="月" genre="wa" />
      <MiniDay day="火" genre="yo" />
      <MiniDay day="水" genre="chu" />
      <span className="btn-primary mt-1 flex min-h-9 items-center justify-center gap-1.5 rounded-full text-xs font-bold">
        <CutleryIcon size={15} />
        1週間の献立をつくる
      </span>
    </Frame>
  );
}

export function ArtSettings() {
  return (
    <Frame className="gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-ink-soft">和・洋・中の割合</span>
        <GearIcon size={15} className="text-ink-soft" />
      </div>
      <div className="flex h-3 overflow-hidden rounded-full">
        <span className="bg-wa" style={{ width: '50%' }} />
        <span className="bg-yo" style={{ width: '30%' }} />
        <span className="bg-chu" style={{ width: '20%' }} />
      </div>
      <div className="flex items-center justify-between rounded-xl bg-field px-3 py-2">
        <span className="text-[11px] font-bold text-ink-soft">1週間の予算</span>
        <span className="num text-sm font-bold">10,000円</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
        {['時短', '節約', '副菜あり', '🌱'].map((t) => (
          <span key={t} className="rounded-full bg-pill py-1.5">
            {t}
          </span>
        ))}
      </div>
    </Frame>
  );
}

export function ArtRedo() {
  return (
    <Frame>
      <div className="relative">
        <MiniDay day="月" genre="wa" glow />
        <span className="absolute -top-2 right-2 grid size-7 place-items-center rounded-full bg-accent text-accent-ink shadow">
          <RefreshIcon size={15} />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <MiniDay day="火" genre="yo" lines={1} className="flex-1" />
        <ShuffleIcon size={18} className="shrink-0 text-accent-strong" />
        <MiniDay day="金" genre="chu" lines={1} className="flex-1" />
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-field px-2.5 py-2">
        <span className="rounded-full bg-pill px-2 py-0.5 text-[10px] font-bold">主菜</span>
        <Bar w="40%" />
        <span className="ml-auto text-[10px] font-bold text-accent-strong">別のレシピに</span>
      </div>
    </Frame>
  );
}

function ShopRow({ name, done, swiped }: { name: string; done?: boolean; swiped?: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-xl">
      {swiped && (
        <span className="absolute inset-0 flex items-center bg-success pl-3 text-[10px] font-bold text-success-ink">
          かごに入れた
        </span>
      )}
      <div
        className={cn(
          'relative flex items-center gap-2 bg-field px-2.5 py-2',
          swiped && 'translate-x-20',
        )}
      >
        <span
          className={cn(
            'grid size-5 place-items-center rounded-full border-2',
            done ? 'border-success bg-success' : 'border-ink/25',
          )}
        />
        <span className={cn('text-xs font-bold', done && 'text-ink-soft line-through')}>
          {name}
        </span>
      </div>
    </div>
  );
}

export function ArtShopping() {
  return (
    <Frame className="gap-1.5">
      <ShopRow name="キャベツ 1/2個" done />
      <ShopRow name="鶏もも肉 300g" swiped />
      <ShopRow name="にんじん 2本" />
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold text-ink-soft">家にある前提で除いたもの</span>
        <span className="rounded-full bg-pill px-2 py-0.5 text-[10px] font-bold">＋ みりん</span>
      </div>
    </Frame>
  );
}

export function ArtRecipe() {
  return (
    <Frame className="flex-row items-center justify-between gap-2">
      <div className="grid size-16 place-items-center rounded-2xl bg-field">
        <CameraIcon size={28} className="text-ink-soft" />
      </div>
      <SparkleIcon size={24} className="shrink-0 text-accent-strong" />
      <div className="flex w-32 flex-col gap-1.5 rounded-2xl bg-field p-2.5">
        <span className="flex gap-1">
          <span className="rounded-full bg-wa-soft px-1.5 text-[9px] font-bold text-wa-ink">
            和食
          </span>
          <span className="rounded-full bg-pill px-1.5 text-[9px] font-bold">主菜</span>
          <span className="text-[11px]">🌱</span>
        </span>
        <Bar w="90%" />
        <Bar w="70%" />
        <span className="mt-1 text-[9px] font-bold text-ink-soft">材料・手順を自動で</span>
      </div>
    </Frame>
  );
}

export function ArtLog() {
  return (
    <Frame>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[
          ['作った料理', '18', '品'],
          ['自炊した日', '9', '日'],
          ['連続', '4', '日'],
        ].map(([l, v, u]) => (
          <div key={l} className="rounded-xl bg-field px-1 py-2">
            <p className="text-[9px] font-bold text-ink-soft">{l}</p>
            <p className="num text-lg font-bold">
              {v}
              <span className="text-[10px]">{u}</span>
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {['bg-wa', 'bg-yo', 'bg-chu', 'bg-accent'].map((c) => (
          <span key={c} className={cn('aspect-square flex-1 rounded-lg opacity-60', c)} />
        ))}
      </div>
      <span className="self-center rounded-full bg-success px-3 py-1 text-[11px] font-bold text-success-ink">
        作った！
      </span>
    </Frame>
  );
}

export function ArtShare() {
  return (
    <Frame className="items-center gap-3">
      <div className="flex -space-x-3">
        {['あ', 'い', 'う'].map((n, i) => (
          <span
            key={n}
            className={cn(
              'grid size-11 place-items-center rounded-full text-sm font-bold ring-2 ring-canvas',
              ['bg-wa-soft text-wa-ink', 'bg-yo-soft text-yo-ink', 'bg-chu-soft text-chu-ink'][i],
            )}
          >
            {n}
          </span>
        ))}
        <span className="grid size-11 place-items-center rounded-full bg-pill ring-2 ring-canvas">
          <PlusIcon size={18} />
        </span>
      </div>
      <span className="flex items-center gap-1.5 rounded-full bg-field px-3 py-1.5 text-[11px] font-bold">
        <LinkIcon size={14} />
        招待リンクを送る
      </span>
      <span className="num text-xs font-bold tracking-[0.3em] text-ink-soft">K7MQ2X</span>
    </Frame>
  );
}

export function ArtInstall() {
  return (
    <Frame className="items-center">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 8 }, (_, i) =>
          i === 5 ? (
            <span key={i} className="flex flex-col items-center gap-1">
              <img
                src="/icon.svg"
                alt=""
                className="size-11 rounded-[0.8rem] shadow-md ring-2 ring-accent"
              />
              <span className="text-[8px] font-bold">今日のごはん</span>
            </span>
          ) : (
            <span key={i} className="flex flex-col items-center gap-1">
              <span className="size-11 rounded-[0.8rem] bg-ink/10" />
              <span className="h-1.5 w-8 rounded-full bg-ink/10" />
            </span>
          ),
        )}
      </div>
    </Frame>
  );
}
