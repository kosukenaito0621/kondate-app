import { Link } from '@tanstack/react-router';
import { Sheet } from '../glass/Sheet';
import { CameraIcon, LinkIcon, MemoIcon } from '../icons';

const row = 'groove flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3';
const text = 'min-w-0 flex-1';
const sub = 'block text-xs text-ink-soft';

/** レシピの追加のしかたを選ぶ（写真・URL・手入力） */
export function AddRecipeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title="レシピを追加" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <Link
          to="/recipes/import"
          search={{ mode: 'photo' }}
          className={row}
          data-tour="recipe-add-photo"
        >
          <CameraIcon size={22} className="shrink-0 text-accent-strong" />
          <span className={text}>
            <span className="block font-bold">レシピ本の写真</span>
            <span className={sub}>撮った写真から読み取ります</span>
          </span>
        </Link>
        <Link to="/recipes/import" search={{ mode: 'url' }} className={row}>
          <LinkIcon size={22} className="shrink-0 text-accent-strong" />
          <span className={text}>
            <span className="block font-bold">レシピサイトのURL</span>
            <span className={sub}>ページの内容から読み取ります</span>
          </span>
        </Link>
        <Link to="/recipes/new" className={row}>
          <MemoIcon size={22} className="shrink-0 text-accent-strong" />
          <span className={text}>
            <span className="block font-bold">手入力</span>
            <span className={sub}>材料と手順を自分で入れます</span>
          </span>
        </Link>
      </div>
    </Sheet>
  );
}
