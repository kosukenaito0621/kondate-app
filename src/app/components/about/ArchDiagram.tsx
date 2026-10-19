import { cn } from '../../lib/cn';

/**
 * 仕組みノートの構成図。スマホでも読めるよう、上から下へ流れる箱と矢印で描く。
 * 読み上げでは下の説明文（リスト）で同じ内容を伝える。
 */
function Box({ title, sub, className }: { title: string; sub: string; className?: string }) {
  return (
    <div className={cn('rounded-2xl px-3 py-2.5 text-center', className)}>
      <p className="text-sm font-bold leading-snug">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug opacity-80">{sub}</p>
    </div>
  );
}

function Arrow({ label, dashed }: { label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 text-[11px] text-ink-soft">
      <span
        className={cn(
          'h-6 w-0 border-l-2',
          dashed ? 'border-dashed border-accent' : 'border-ink/30',
        )}
      />
      <span>{label}</span>
    </div>
  );
}

export function ArchDiagram() {
  return (
    <figure className="flex flex-col items-stretch rounded-2xl bg-field p-3">
      <div aria-hidden="true" className="flex flex-col items-stretch">
        <Box
          title="スマホ（ホーム画面のアプリ）"
          sub="React の画面。オフラインでも前の内容を表示"
          className="bg-accent-soft text-accent-strong"
        />
        <div className="grid grid-cols-2 gap-2">
          <Arrow label="画面・API" />
          <Arrow label="変更のお知らせ（WebSocket）" dashed />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
          <Box title="Cloudflare Worker" sub="Hono。画面の配信と API" className="bg-pill" />
          <div className="flex flex-col items-center text-[10px] leading-tight text-ink-soft">
            <span>変わったら</span>
            <span className="my-0.5 h-0 w-8 border-t-2 border-dashed border-accent" />
            <span>知らせる</span>
          </div>
          <Box
            title="Durable Object"
            sub="グループごとの「部屋」"
            className="bg-sub-soft text-sub-ink"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Arrow label="読み書き・AI" />
          <span />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Box title="D1" sub="データベース（献立・レシピ など）" className="bg-pill" />
          <Box title="R2" sub="写真" className="bg-pill" />
          <Box title="Workers AI" sub="レシピの読み取り" className="bg-pill" />
          <Box title="Google" sub="ログイン" className="bg-pill" />
        </div>
      </div>
      <figcaption className="mt-3 px-1 text-xs leading-relaxed text-ink-soft">
        スマホは Worker と通信して画面とデータを受け取ります。だれかが変更すると、Worker
        がグループの「部屋」に知らせ、部屋が同じグループのスマホへ「変わったよ」と伝えます。データは
        D1、写真は R2 に保存し、レシピの読み取りは Workers AI、ログインは Google を使います。
      </figcaption>
    </figure>
  );
}
