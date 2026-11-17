import { cropRect, type CropArea } from './crop';

/** 画像の表示用URL（API 経由。グループのメンバーだけが見られる） */
export function imageUrl(key: string) {
  return `/api/images/${key}`;
}

const MAX_SIDE = 1600;

/**
 * 送る前に端末側で縮小する（長辺1600px、WebP。未対応なら JPEG）。
 * 向き（EXIF）は createImageBitmap が反映する。
 * area があればその範囲（正方形）だけ切り取る。このときは位置合わせ画面と同じ <img> で読み、
 * 向きの扱いが画面と食い違わないようにする（ブラウザによって createImageBitmap の向き補正が異なるため）。
 */
export async function resizeImage(file: File, area?: CropArea): Promise<Blob> {
  const canvas = document.createElement('canvas');
  if (area) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const r = cropRect(area, img.naturalWidth, img.naturalHeight, MAX_SIDE);
      canvas.width = r.w;
      canvas.height = r.h;
      canvas.getContext('2d')!.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.w, r.h);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
  }
  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  const webp = await toBlob('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg');
  if (!jpeg) throw new Error('画像を変換できませんでした');
  return jpeg;
}

export async function uploadImage(file: File, area?: CropArea): Promise<string> {
  const blob = await resizeImage(file, area);
  const form = new FormData();
  form.append('file', blob, blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg');
  const res = await fetch('/api/images', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? '写真をアップロードできませんでした');
  }
  return ((await res.json()) as { key: string }).key;
}
