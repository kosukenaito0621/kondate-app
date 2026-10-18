/**
 * 外部ページを安全に取得する（URL からのレシピ取り込み用）。SSRF 対策：
 * - http / https のみ、ポートは 80 / 443 のみ、認証情報付き URL は不可
 * - ホスト名が IP アドレスならプライベート・ループバック・リンクローカル等を拒否
 * - localhost・.local・.internal などの内部向け名前を拒否
 * - リダイレクトは手動で最大3回、毎回同じ検証をする
 * - タイムアウト10秒、本文は 2MB まで、HTML のみ
 * Workers の fetch は名前解決後の IP を取得できないため、DNS で内部 IP を返す名前への対策は
 * ホスト名の検証までとなる（Cloudflare のネットワークから利用者の内部ネットワークには届かない）。
 */
export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export class UnsafeUrlError extends Error {}

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // リンクローカル（クラウドのメタデータ含む）
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // マルチキャスト・予約
  );
}

function isBlockedIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  return (
    h === '::' ||
    h === '::1' ||
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('fe80') ||
    h.startsWith('::ffff:') ||
    h.startsWith('64:ff9b')
  );
}

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.intranet',
];

export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('URL の形式が正しくありません');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('http または https の URL を入力してください');
  }
  if (url.username || url.password) throw new UnsafeUrlError('この URL は使えません');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new UnsafeUrlError('この URL は使えません');
  }
  const host = url.hostname.toLowerCase();
  if (
    !host.includes('.') ||
    host === 'localhost' ||
    BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) ||
    isPrivateIPv4(host) ||
    isBlockedIPv6(host) ||
    /^\d+$/.test(host) // 10進表記の IP（例: http://2130706433/）
  ) {
    throw new UnsafeUrlError('この URL は使えません');
  }
  return url;
}

export async function safeFetchHtml(
  raw: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ url: string; html: string }> {
  let url = assertSafeUrl(raw);
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetchFn(url.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'KondateRecipeImporter/1.0',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      url = assertSafeUrl(new URL(loc, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`ページを取得できませんでした（${res.status}）`);
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/.test(type)) {
      throw new UnsafeUrlError('レシピのページ（HTML）の URL を入力してください');
    }
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) throw new UnsafeUrlError('ページが大きすぎます');
    // 本文は上限まで読んで打ち切る
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const buf = new Uint8Array(Math.min(size, MAX_BODY_BYTES));
    let off = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, buf.length - off), off);
      off += c.byteLength;
      if (off >= buf.length) break;
    }
    return { url: url.toString(), html: new TextDecoder('utf-8').decode(buf) };
  }
  throw new UnsafeUrlError('リダイレクトが多すぎます');
}
