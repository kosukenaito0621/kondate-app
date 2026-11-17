import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import type { CropArea } from '../lib/crop';
import { spring } from '../lib/motion';
import { GlassButton } from './glass/GlassButton';
import { CloseIcon } from './icons';

/**
 * 写真の位置合わせ（正方形）。全画面で一番手前に出す。
 * シートの中から開いても、下スワイプで閉じる動きとぶつからないように Sheet は使わない。
 */
export function CropDialog({
  file,
  onCancel,
  onConfirm,
  onReselect,
}: {
  file: File | null;
  onCancel: () => void;
  onConfirm: (area: CropArea) => void;
  onReselect: () => void;
}) {
  const src = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, onCancel]);

  return createPortal(
    <AnimatePresence>
      {file && src && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="写真の位置を合わせる"
          className="fixed inset-0 z-[60] flex flex-col bg-neutral-950 text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={spring.soft}
          style={{
            paddingTop: 'max(0.75rem, var(--safe-top))',
            paddingBottom: 'max(1rem, var(--safe-bottom))',
          }}
        >
          <div className="mx-auto flex w-full max-w-[var(--app-max-width)] items-center gap-2 px-3">
            <button
              type="button"
              onClick={onCancel}
              className="grid size-11 place-items-center rounded-full"
              aria-label="閉じる"
            >
              <CloseIcon size={22} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="font-bold">写真の位置を合わせる</p>
              <p className="text-xs text-white/70">指でずらす・2本指で拡大</p>
            </div>
            <span className="size-11" aria-hidden="true" />
          </div>

          <CropStage key={src} src={src} onConfirm={onConfirm} onReselect={onReselect} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** 写真ごとに位置・拡大をリセットするため key 付きで出す中身 */
function CropStage({
  src,
  onConfirm,
  onReselect,
}: {
  src: string;
  onConfirm: (area: CropArea) => void;
  onReselect: () => void;
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [broken, setBroken] = useState(false);
  return (
    <>
      <div className="relative mx-auto my-3 w-full max-w-[var(--app-max-width)] flex-1">
        {broken ? (
          <p className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-white/80">
            この写真はここでは表示できません。別の写真を選んでください。
          </p>
        ) : (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={1}
            maxZoom={4}
            aspect={1}
            showGrid={false}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, px) => setArea(px)}
            mediaProps={{ onError: () => setBroken(true) }}
          />
        )}
      </div>

      <div className="mx-auto grid w-full max-w-[var(--app-max-width)] grid-cols-2 gap-3 px-4">
        <GlassButton variant="glass" onClick={onReselect}>
          選び直す
        </GlassButton>
        <GlassButton
          variant="primary"
          disabled={!area || broken}
          onClick={() => area && onConfirm(area)}
        >
          決定
        </GlassButton>
      </div>
    </>
  );
}
