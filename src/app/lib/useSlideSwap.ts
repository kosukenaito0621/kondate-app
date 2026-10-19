import { useEffect, useState } from 'react';

const EASE = 'cubic-bezier(.22,1,.36,1)';
const LAND_MS = 280;
const SHIFT_MS = 300;
/** 画面の端にこれより近づいたら自動でスクロールする */
const EDGE_TOP = 90;
const EDGE_BOTTOM = 120;

type Rect = { cardTop: number; cardBottom: number; bodyTop: number };
type Drag = {
  from: string;
  startY: number;
  startScroll: number;
  rects: Map<string, Rect>;
  target: string;
  clientY: number;
  raf: number;
};
type OnDrop = (from: string, to: string) => Promise<boolean>;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, reduced() ? 0 : ms));
const pageTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;

function setMove(el: HTMLElement, y: number, opts: { ms?: number; scale?: number } = {}) {
  el.style.transition = opts.ms && !reduced() ? `transform ${opts.ms}ms ${EASE}` : 'none';
  el.style.transform = `translateY(${y}px) scale(${opts.scale ?? 1})`;
}

/**
 * 献立のスライド入れ替えの動き（React の外で DOM を直接動かし、指に毎フレーム追従させる）
 * - 持ち上げた献立は指についてくる。重なった曜日の献立は、元の場所へすっと移って結果を先に見せる
 * - 離すと相手の場所に収まり、onDrop が true を返したら（表示を入れ替えたあとで）元に戻す
 * - onDrop が false（メモの確認でキャンセルなど）なら、両方とも元の場所へ戻す
 *
 * カードはガラスの効果で重なりの層が分かれていて、ほかのカードの上に中身を出せない。
 * そのため動いているあいだは、献立の写し（クローン）をページの一番上の層で動かし、本物は隠しておく。
 */
class SlideSwap {
  bodies = new Map<string, HTMLElement>();
  clones = new Map<string, HTMLElement>();
  layer: HTMLElement | null = null;
  drag: Drag | null = null;
  busy = false;

  private onDrop: OnDrop = async () => false;

  setOnDrop(fn: OnDrop) {
    this.onDrop = fn;
  }

  register(date: string, el: HTMLElement | null) {
    if (el) this.bodies.set(date, el);
    else if (!this.bodies.get(date)?.isConnected) this.bodies.delete(date);
  }

  /** 献立の写しを、元と同じ位置に重ねて出す（本物は隠す） */
  private cloneOf(date: string, lifted = false) {
    const have = this.clones.get(date);
    if (have) return have;
    const el = this.bodies.get(date);
    if (!el) return null;
    if (!this.layer) {
      this.layer = document.createElement('div');
      this.layer.className = 'slide-layer';
      document.body.appendChild(this.layer);
    }
    const r = el.getBoundingClientRect();
    const c = el.cloneNode(true) as HTMLElement;
    c.setAttribute('aria-hidden', 'true');
    c.classList.add('slide-clone');
    if (lifted) c.dataset.lifted = '';
    Object.assign(c.style, {
      left: `${r.left + window.scrollX}px`,
      top: `${r.top + window.scrollY}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    this.layer.appendChild(c);
    el.style.visibility = 'hidden';
    this.clones.set(date, c);
    return c;
  }

  private dropClone(date: string) {
    this.clones.get(date)?.remove();
    this.clones.delete(date);
    const el = this.bodies.get(date);
    if (el) el.style.visibility = '';
  }

  private cleanup() {
    for (const date of [...this.clones.keys()]) this.dropClone(date);
    for (const el of this.bodies.values()) delete el.parentElement?.dataset.empty;
  }

  start(date: string, e: React.PointerEvent) {
    if (this.busy || this.drag || e.button !== 0) return;
    const el = this.bodies.get(date);
    if (!el?.isConnected) return;
    e.preventDefault();
    const rects = new Map<string, Rect>();
    for (const [d, body] of this.bodies) {
      if (!body.isConnected) continue;
      const card = body.closest('article') ?? body;
      const top = pageTop(card);
      rects.set(d, { cardTop: top, cardBottom: top + card.clientHeight, bodyTop: pageTop(body) });
    }
    const c = this.cloneOf(date, true)!;
    if (el.parentElement) el.parentElement.dataset.empty = '';
    setMove(c, 0, { ms: 180, scale: 1.03 });
    navigator.vibrate?.(8);
    this.drag = {
      from: date,
      startY: e.clientY,
      startScroll: window.scrollY,
      rects,
      target: date,
      clientY: e.clientY,
      raf: window.requestAnimationFrame(this.tick),
    };
  }

  move = (e: PointerEvent) => {
    if (!this.drag) return;
    this.drag.clientY = e.clientY;
    this.update();
  };

  end = () => void this.finish();

  /** 画面の端に近づいたら自動でスクロールする */
  tick = () => {
    const d = this.drag;
    if (!d) return;
    const bottom = window.innerHeight - EDGE_BOTTOM;
    const speed =
      d.clientY < EDGE_TOP
        ? -Math.ceil((EDGE_TOP - d.clientY) / 6)
        : d.clientY > bottom
          ? Math.ceil((d.clientY - bottom) / 6)
          : 0;
    if (speed) {
      window.scrollBy(0, speed);
      this.update();
    }
    d.raf = window.requestAnimationFrame(this.tick);
  };

  update() {
    const d = this.drag;
    if (!d) return;
    const c = this.clones.get(d.from);
    if (!c) return;
    const dy = d.clientY + window.scrollY - (d.startY + d.startScroll);
    setMove(c, dy, { scale: 1.03 });
    const src = d.rects.get(d.from)!;
    const mid = src.bodyTop + c.offsetHeight / 2 + dy;
    let target = d.from;
    for (const [date, r] of d.rects) if (mid >= r.cardTop && mid <= r.cardBottom) target = date;
    if (target === d.target) return;
    const prev = d.target;
    d.target = target;
    // 前に重なっていた曜日の献立は元へ戻す
    if (prev !== d.from) {
      const pc = this.clones.get(prev);
      if (pc) {
        setMove(pc, 0, { ms: SHIFT_MS });
        window.setTimeout(() => {
          if (this.drag?.target !== prev && this.clones.get(prev) === pc) this.dropClone(prev);
        }, SHIFT_MS);
      }
    }
    // 重なった曜日の献立を、持ち上げた献立の元の場所へ動かす
    if (target !== d.from) {
      const tc = this.cloneOf(target);
      const r = d.rects.get(target);
      if (tc && r) setMove(tc, src.bodyTop - r.bodyTop, { ms: SHIFT_MS });
    }
  }

  async finish() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    window.cancelAnimationFrame(d.raf);
    const c = this.clones.get(d.from);
    if (c) delete c.dataset.lifted;
    const back = async () => {
      for (const clone of this.clones.values()) setMove(clone, 0, { ms: LAND_MS });
      await wait(LAND_MS);
      this.cleanup();
    };
    if (d.target === d.from || !c) return back();

    this.busy = true;
    // 相手の場所へ収める（相手の献立はすでに元の場所に来ている）
    const src = d.rects.get(d.from)!;
    const to = d.rects.get(d.target)!;
    setMove(c, to.bodyTop - src.bodyTop, { ms: LAND_MS });
    await wait(LAND_MS);
    const ok = await this.onDrop(d.from, d.target).catch(() => false);
    // ok なら呼び出し側で表示を入れ替え済み。写しを消せば見た目はそのまま
    if (ok) this.cleanup();
    else await back();
    this.busy = false;
  }
}

/** 週間献立の「献立だけをほかの曜日へスライドして入れ替える」動き */
export function useSlideSwap(onDrop: OnDrop) {
  const [ctl] = useState(() => new SlideSwap());
  useEffect(() => ctl.setOnDrop(onDrop), [ctl, onDrop]);
  useEffect(() => {
    window.addEventListener('pointermove', ctl.move);
    window.addEventListener('pointerup', ctl.end);
    window.addEventListener('pointercancel', ctl.end);
    return () => {
      window.removeEventListener('pointermove', ctl.move);
      window.removeEventListener('pointerup', ctl.end);
      window.removeEventListener('pointercancel', ctl.end);
    };
  }, [ctl]);
  return {
    register: (date: string) => (el: HTMLElement | null) => ctl.register(date, el),
    grip: (date: string) => (e: React.PointerEvent) => ctl.start(date, e),
  };
}
