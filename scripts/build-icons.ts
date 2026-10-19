/**
 * アプリアイコン（今日のごはん）を作る。
 * ワンプレートと、箸置きに乗せた一膳のお箸を、白い陶器のような質感で抽象的に描く。
 *
 * 1. public/icon.svg（通常）と public/icon-maskable.svg（Android のマスク用に絵を小さくしたもの）を書き出す
 * 2. pwa-assets-generator で favicon / PWA / Apple 用の PNG を作る
 * 3. マスカブルアイコンは専用の SVG から作り直す（背景のにじみを途切れさせないため）
 *
 * 使い方: npm run pwa:assets
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const PLATE = { cx: 262, cy: 206, r: 146, ring: 54 };
// お箸は先（左）に向かって少し寄る。y は [上の箸, 下の箸]
const STICKS = { x0: 90, x1: 426, yTip: [407, 418], yEnd: [405, 420], w0: 8, w1: 13 };
const REST = { x: 132, w: 30, h: 60 };
const IVORY = '#FFFDF8';

const f = (n: number) => Math.round(n * 100) / 100;

/** 太さが変わる、両端の丸い棒 */
function stick(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) {
  const l = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / l;
  const ny = (x1 - x0) / l;
  const p = (x: number, y: number, w: number, s: 1 | -1) =>
    `${f(x + (s * nx * w) / 2)},${f(y + (s * ny * w) / 2)}`;
  return `M${p(x0, y0, w0, 1)} L${p(x1, y1, w1, 1)} A${w1 / 2},${w1 / 2} 0 0 0 ${p(x1, y1, w1, -1)} L${p(x0, y0, w0, -1)} A${w0 / 2},${w0 / 2} 0 0 0 ${p(x0, y0, w0, 1)}Z`;
}
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`;
function roundRect(cx: number, cy: number, w: number, h: number, rx: number) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return `M${x + rx},${y}h${w - 2 * rx}a${rx},${rx} 0 0 1 ${rx},${rx}v${h - 2 * rx}a${rx},${rx} 0 0 1 ${-rx},${rx}h${-(w - 2 * rx)}a${rx},${rx} 0 0 1 ${-rx},${-rx}v${-(h - 2 * rx)}a${rx},${rx} 0 0 1 ${rx},${-rx}Z`;
}

/** scale: 絵（お皿・お箸）の大きさ。背景はいつも全面に敷く */
function iconSvg(scale = 1) {
  const plate =
    circle(PLATE.cx, PLATE.cy, PLATE.r) + circle(PLATE.cx, PLATE.cy, PLATE.r - PLATE.ring);
  const ry = (STICKS.yEnd[0]! + STICKS.yEnd[1]!) / 2;
  const parts = [
    roundRect(REST.x, ry, REST.w, REST.h, 12),
    ...[0, 1].map((i) =>
      stick(STICKS.x0, STICKS.yTip[i]!, STICKS.x1, STICKS.yEnd[i]!, STICKS.w0, STICKS.w1),
    ),
  ];
  const chopsticks = parts.map((d) => `<path d="${d}"/>`).join('');
  const { cx, cy, r } = PLATE;
  const art =
    scale === 1 ? '' : ` transform="translate(256 256) scale(${scale}) translate(-256 -256)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sheenP" gradientUnits="userSpaceOnUse" x1="0" y1="${cy - r}" x2="0" y2="${cy + r}"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".42" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="sheenS" gradientUnits="userSpaceOnUse" x1="0" y1="${ry - REST.h / 2}" x2="0" y2="${ry + REST.h / 2}"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".45" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#B9707F" stop-opacity="0"/><stop offset="1" stop-color="#B9707F" stop-opacity=".22"/></linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".5" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity=".8"/></linearGradient>
    <filter id="mist" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="58"/></filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="11"/></filter>
    <filter id="edge" x="0" y="0" width="512" height="512" filterUnits="userSpaceOnUse"><feMorphology in="SourceAlpha" operator="erode" radius="3" result="inner"/><feComposite in="SourceAlpha" in2="inner" operator="out" result="ring"/><feFlood flood-color="#fff" flood-opacity=".9"/><feComposite in2="ring" operator="in"/></filter>
    <clipPath id="clipPlate"><path d="${plate}" clip-rule="evenodd"/></clipPath>
    <!-- お箸2本と箸置きを1つの形として塗るためのマスク（重なりも塗りつぶす） -->
    <mask id="maskSticks"><g fill="#fff">${chopsticks}</g></mask>
  </defs>
  <rect width="512" height="512" fill="#FFF8EC"/>
  <g filter="url(#mist)">
    <circle cx="110" cy="120" r="150" fill="#FBCFDA"/><circle cx="420" cy="90" r="130" fill="#FFEDB0"/>
    <circle cx="400" cy="400" r="160" fill="#FCD6DE"/><circle cx="90" cy="430" r="130" fill="#FFF0BC"/>
    <circle cx="270" cy="270" r="90" fill="#FFF9F0"/>
  </g>
  <g${art}>
    <path d="${plate}" fill-rule="evenodd" transform="translate(0 14)" fill="#8C4A5C" opacity=".3" filter="url(#shadow)"/>
    <g clip-path="url(#clipPlate)"><rect width="512" height="512" fill="${IVORY}"/><rect width="512" height="512" fill="url(#sheenP)"/><rect width="512" height="512" fill="url(#shade)"/></g>
    <path d="${plate}" fill-rule="evenodd" fill="none" stroke="url(#rim)" stroke-width="3.5"/>
    <g transform="translate(0 10)" fill="#8C4A5C" opacity=".3" filter="url(#shadow)">${chopsticks}</g>
    <g mask="url(#maskSticks)"><rect width="512" height="512" fill="${IVORY}"/><rect y="${ry - REST.h / 2}" width="512" height="${REST.h}" fill="url(#sheenS)"/><rect width="512" height="512" fill="url(#shade)"/></g>
    <!-- ふちのツヤ：形の内側に沿った細い光（1つの形として、マスクから作る） -->
    <g filter="url(#edge)"><rect width="512" height="512" fill="#fff" mask="url(#maskSticks)"/></g>
    <path d="M${f(cx - r * 0.62)},${f(cy - r * 0.62)} A${f(r * 0.88)},${f(r * 0.88)} 0 0 1 ${f(cx + r * 0.15)},${f(cy - r * 0.86)}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="7" stroke-linecap="round"/>
  </g>
</svg>
`;
}

writeFileSync('public/icon.svg', iconSvg());
// マスカブルは中央 80% の円が必ず見える範囲。絵をそこに収める
writeFileSync('public/icon-maskable.svg', iconSvg(0.76));

execSync('npx pwa-assets-generator', { stdio: 'inherit' });
await sharp('public/icon-maskable.svg', { density: 288 })
  .resize(512, 512)
  .png()
  .toFile('public/maskable-icon-512x512.png');
console.log('icons written');
