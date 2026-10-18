import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { uploadImage } from '../lib/images';
import { spring } from '../lib/motion';
import { CameraIcon } from './icons';
import { useToast } from './toast/Toaster';

/**
 * 写真を選ぶ／撮るボタン。選ぶと縮小してアップロードし、キーを返す。
 * スマホではカメラか写真ライブラリかを選べる。
 */
export function PhotoPicker({
  label = '写真を追加',
  onUploaded,
  className,
  compact,
}: {
  label?: string;
  onUploaded: (key: string) => void | Promise<void>;
  className?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await onUploaded(await uploadImage(file));
    } catch (err) {
      toast(err instanceof Error ? err.message : '写真を追加できませんでした', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onChange}
      />
      <motion.button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-label={compact ? label : undefined}
        whileTap={{ scale: 0.92 }}
        transition={spring.snappy}
        className={cn(
          'groove inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full font-bold text-ink-soft disabled:opacity-60',
          compact ? 'size-11' : 'px-4 text-sm',
          className,
        )}
      >
        {busy ? (
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
        ) : (
          <CameraIcon size={18} />
        )}
        {!compact && (busy ? 'アップロード中…' : label)}
      </motion.button>
    </>
  );
}

/** 写真の表示（読み込むまでシマーを出す） */
export function Photo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={cn('relative block overflow-hidden', !loaded && 'skeleton', className)}>
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        className="size-full object-cover"
      />
    </span>
  );
}
