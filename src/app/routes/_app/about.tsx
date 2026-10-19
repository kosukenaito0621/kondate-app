import { createFileRoute } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { ArchDiagram } from '../../components/about/ArchDiagram';
import { GlassCard } from '../../components/glass/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { ABOUT_NOTE, type NoteBlock } from '../../lib/aboutNote';
import { riseItem, staggerContainer } from '../../lib/motion';

export const Route = createFileRoute('/_app/about')({
  component: AboutPage,
});

/** 仕組みノート：機能と裏側の仕組み、こだわりを人に説明するためのまとめ */
function AboutPage() {
  const jump = (id: string) =>
    document.getElementById(`note-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <PageHeader eyebrow="設定" title="仕組みノート" />
      <p className="mb-4 px-1 text-sm leading-relaxed text-ink-soft">
        「今日のごはん」の機能と、献立作成・AI取り込みなどの裏側の仕組み、こだわりをまとめています。
      </p>

      <nav aria-label="目次" className="mb-4 flex flex-wrap gap-1.5 px-1">
        {ABOUT_NOTE.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className="min-h-9 rounded-full bg-pill px-3 text-xs font-bold text-ink-soft"
          >
            <span className="num mr-1 text-accent-strong">{i + 1}</span>
            {s.title}
          </button>
        ))}
      </nav>

      <motion.div
        className="flex flex-col gap-3"
        variants={staggerContainer(0.04)}
        initial="initial"
        animate="animate"
      >
        {ABOUT_NOTE.map((s, i) => (
          <GlassCard
            key={s.id}
            id={`note-${s.id}`}
            variants={riseItem}
            padding="lg"
            className="scroll-mt-4"
          >
            <p className="num text-xs font-bold text-accent-strong">
              {String(i + 1).padStart(2, '0')}
            </p>
            <h2 className="mb-1 text-xl font-bold leading-snug">{s.title}</h2>
            <div className="flex flex-col gap-3">
              {s.blocks.map((b, j) => (
                <Block key={j} block={b} />
              ))}
            </div>
          </GlassCard>
        ))}
      </motion.div>
      <p className="mt-4 px-1 text-xs text-ink-soft">
        追加した機能や直したところは「設定 → お知らせ」で確認できます。
      </p>
    </>
  );
}

function Block({ block: b }: { block: NoteBlock }) {
  switch (b.kind) {
    case 'arch':
      return <ArchDiagram />;
    case 'p':
      return <p className="text-[15px] leading-relaxed">{b.text}</p>;
    case 'h':
      return <h3 className="mt-2 font-bold text-accent-strong">{b.text}</h3>;
    case 'list':
      return (
        <ul className="flex flex-col gap-2">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span
                aria-hidden="true"
                className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-accent"
              />
              <span className="min-w-0">
                {it.term && <b className="font-bold">{it.term}：</b>}
                <span className={it.term ? 'text-ink-soft' : undefined}>{it.text}</span>
              </span>
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="flex flex-col gap-3">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-3">
              <span className="btn-primary num grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="font-bold">{it.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{it.text}</p>
              </div>
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-2xl bg-field">
          <table className="w-full min-w-[30rem] border-collapse text-[13px]">
            <thead>
              <tr>
                {b.head.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-ink/10 px-3 py-2 text-left font-bold text-ink-soft"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, k) => (
                    <td
                      key={k}
                      className="border-b border-ink/5 px-3 py-2 align-top leading-relaxed last:[&:not(:first-child)]:text-ink-soft"
                    >
                      {k === 0 ? <b>{c}</b> : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'weights':
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {b.items.map((it, i) => (
            <div key={i} className="rounded-2xl bg-field px-3.5 py-3">
              <p className="num text-lg font-bold text-accent-strong">{it.value}</p>
              <p className="text-xs leading-relaxed text-ink-soft">{it.text}</p>
            </div>
          ))}
        </div>
      );
    case 'note':
      return (
        <div className="rounded-2xl bg-sub-soft px-4 py-3 text-sm leading-relaxed text-sub-ink">
          <b>{b.title}</b>：{b.text}
        </div>
      );
    case 'points':
      return (
        <div className="flex flex-col gap-2">
          {b.items.map((it, i) => (
            <div key={i} className="rounded-2xl bg-field px-4 py-3">
              <p className="font-bold">{it.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{it.text}</p>
            </div>
          ))}
        </div>
      );
  }
}
