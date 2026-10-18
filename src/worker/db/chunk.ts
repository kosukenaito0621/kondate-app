/**
 * D1 は1つの SQL に渡せる値が100個までなので、複数行の INSERT は分割する。
 * columns は1行あたりの列数。
 */
export function chunkRows<T>(rows: readonly T[], columns: number, maxParams = 100): T[][] {
  const size = Math.max(1, Math.floor(maxParams / columns));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
