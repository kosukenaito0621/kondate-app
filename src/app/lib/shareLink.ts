/**
 * 共有リンクを送る。共有シート（LINE など）が使えればそれを開き、
 * 使えなければリンクをコピーしてトーストで知らせる。
 */
export async function shareOrCopy({
  title,
  text,
  url,
  toast,
}: {
  title: string;
  text: string;
  url: string;
  toast: (message: string) => void;
}) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      // 共有シートを閉じただけなら何もしない
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('リンクをコピーしました。LINE などに貼り付けて送ってください');
  } catch {
    window.prompt('このリンクをコピーして送ってください', url);
  }
}
