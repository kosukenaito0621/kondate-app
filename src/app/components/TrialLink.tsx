import { useState } from 'react';
import { useToast } from './toast/Toaster';

/**
 * 友達に送るお試し版のリンク（開くとログインなしで「おためしの食卓」が始まる）。
 * 設定の下に小さく置く
 */
export function TrialLink() {
  const url = `${window.location.origin}/login?try=1`;
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('コピーできませんでした。リンクを長押ししてコピーしてください', 'warn');
    }
  };
  return (
    <div className="flex flex-col gap-1 px-2 text-xs text-ink-soft">
      <span className="font-bold">お試し版のリンク（友達に送る用）</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all truncate rounded-xl bg-pill px-3 py-2 font-mono text-[11px]">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="min-h-9 shrink-0 rounded-full px-3 font-bold text-accent-strong hover:bg-pill"
        >
          {copied ? 'コピーしました' : 'コピー'}
        </button>
      </div>
    </div>
  );
}
