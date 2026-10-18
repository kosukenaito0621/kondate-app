/** 画像は 5MB まで。クライアント側で縮小してから送る想定 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    ext: 'png',
    test: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  {
    type: 'image/webp',
    ext: 'webp',
    // "RIFF" .... "WEBP"
    test: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

/** 中身の先頭バイトから画像の種類を判定（拡張子や Content-Type は信用しない） */
export function sniffImage(bytes: Uint8Array) {
  return SIGNATURES.find((s) => s.test(bytes)) ?? null;
}

/** グループの画像キー。groups/{groupId}/{uuid}.{ext} */
export const groupImagePrefix = (groupId: string) => `groups/${groupId}/`;

export function groupOfImageKey(key: string): string | null {
  const m = key.match(/^groups\/([^/]+)\/[0-9a-f-]{36}\.(jpg|png|webp)$/);
  return m ? m[1]! : null;
}

export function isGroupImageKey(groupId: string, key: string | null | undefined) {
  return key == null || groupOfImageKey(key) === groupId;
}
