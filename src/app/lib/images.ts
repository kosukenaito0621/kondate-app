/** 画像の表示用URL（API 経由。グループのメンバーだけが見られる） */
export function imageUrl(key: string) {
  return `/api/images/${key}`;
}

const MAX_SIDE = 1600;

/**
 * 送る前に端末側で縮小する（長辺1600px、WebP。未対応なら JPEG）。
 * 向き（EXIF）は createImageBitmap が反映する。
 */
export async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  const webp = await toBlob('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg');
  if (!jpeg) throw new Error('画像を変換できませんでした');
  return jpeg;
}

export async function uploadImage(file: File): Promise<string> {
  const blob = await resizeImage(file);
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
