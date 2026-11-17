/** 切り取る範囲（元画像のピクセル座標。react-easy-crop の croppedAreaPixels と同じ形） */
export type CropArea = { x: number; y: number; width: number; height: number };

/**
 * 切り取り範囲を画像の中に収め、出力サイズを決める。
 * 正方形を保ち、元より大きくは引き伸ばさない（長辺 maxSide まで縮小）。
 */
export function cropRect(area: CropArea, imgW: number, imgH: number, maxSide: number) {
  const side = Math.max(1, Math.min(Math.round(area.width), Math.round(area.height), imgW, imgH));
  const sx = Math.min(Math.max(0, Math.round(area.x)), imgW - side);
  const sy = Math.min(Math.max(0, Math.round(area.y)), imgH - side);
  const out = Math.min(side, maxSide);
  return { sx, sy, sw: side, sh: side, w: out, h: out };
}
