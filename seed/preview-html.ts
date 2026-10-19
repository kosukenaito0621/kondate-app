// 初期レシピを確認するためのプレビューHTMLを出力する（npm run seed:preview）
import { writeFileSync } from 'node:fs';
import {
  CATEGORY_LABEL,
  COST_LEVEL_LABEL,
  GENRE_LABEL,
  SECTION_LABEL,
} from '../src/shared/constants';
import { LEVEL_META } from '../src/shared/levels';
import { formatAmount } from '../src/shared/recipe';
import { SEED_RECIPES } from './recipes';

const data = SEED_RECIPES.map((r) => ({
  name: r.name,
  category: r.category,
  genre: r.genre,
  level: r.difficulty,
  time: r.timeMinutes,
  cost: r.costYen,
  costLevel: COST_LEVEL_LABEL[r.costLevel],
  tags: r.tags,
  ingredients: r.ingredients.map((i) => ({
    name: i.name,
    amount: formatAmount(i),
    section: SECTION_LABEL[i.section],
    seasoning: i.section === 'seasoning',
  })),
  steps: r.steps,
}));

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>初期レシピ一覧</title>
<link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&family=Nunito:wght@700&display=swap" rel="stylesheet">
<style>
:root{--base:#fff8f3;--ink:#4a3b40;--soft:#75636b;--accent:#f7b8c8;--accent-ink:#7e2a4c;--strong:#b23c68;--asoft:#fde8ee;--sub:#fce38a;
--wa:#e6f3df;--wa-i:#4a7539;--yo:#e3eef8;--yo-i:#3b6890;--chu:#fde4e0;--chu-i:#a8443a}
*{box-sizing:border-box}body{margin:0;background:var(--base);color:var(--ink);font-family:'Zen Maru Gothic',sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:24px;margin:0 0 4px}.lead{color:var(--soft);font-size:13px;margin:0 0 16px}
.bar{position:sticky;top:0;z-index:2;background:rgb(255 248 243/.9);backdrop-filter:blur(12px);padding:10px 0;display:flex;flex-direction:column;gap:8px}
input{width:100%;padding:12px 16px;border-radius:999px;border:1px solid #f1d9df;background:#fff;font:inherit;color:inherit}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{border:0;border-radius:999px;padding:8px 14px;background:#fff;font:inherit;font-size:13px;color:var(--soft);cursor:pointer;box-shadow:0 1px 3px rgb(180 110 130/.15)}
.chip.on{background:var(--accent);color:var(--accent-ink);font-weight:700}
.count{font-size:12px;color:var(--soft)}
details{background:rgb(255 255 255/.8);border:1px solid #fff;border-radius:22px;margin-top:10px;box-shadow:0 6px 20px -10px rgb(180 110 130/.35);overflow:hidden}
summary{list-style:none;cursor:pointer;padding:14px 16px;display:flex;gap:12px;align-items:center}summary::-webkit-details-marker{display:none}
.g{width:38px;height:38px;border-radius:14px;display:grid;place-items:center;font-weight:700;flex-shrink:0}
.g.wa{background:var(--wa);color:var(--wa-i)}.g.yo{background:var(--yo);color:var(--yo-i)}.g.chu{background:var(--chu);color:var(--chu-i)}
.t{flex:1;min-width:0}.n{font-weight:700}.m{font-size:12px;color:var(--soft);margin-top:2px}
.num{font-family:Nunito,sans-serif}
.lv{font-size:11px;padding:3px 8px;border-radius:999px;background:var(--asoft);color:var(--strong);white-space:nowrap}
.lv.minori{background:#fff3c9;color:#7d5f0c}
.body{padding:0 16px 16px;display:grid;gap:14px}
h3{font-size:13px;margin:0 0 6px;color:var(--strong)}
.ing{display:grid;grid-template-columns:1fr auto;gap:4px 12px;font-size:14px}.ing .s{color:var(--soft)}
ol{margin:0;padding-left:20px;display:grid;gap:8px;font-size:14px;line-height:1.6}
.tip{margin-top:4px;font-size:12px;background:var(--asoft);color:var(--accent-ink);border-radius:12px;padding:6px 10px;display:inline-block}
.tip::before{content:'💡 '}
.tags{display:flex;gap:4px;flex-wrap:wrap}.tags span{font-size:11px;background:#fff;border-radius:999px;padding:2px 8px;color:var(--soft)}
</style></head><body><div class="wrap">
<h1>初期レシピ一覧</h1>
<p class="lead">アプリに入る110品のプレビューです（2人前）。タップで材料・手順・コツが開きます。</p>
<div class="bar">
<input id="q" type="search" placeholder="料理名・材料で検索（例：豚、なす）" aria-label="検索">
<div class="chips" data-key="category"></div>
<div class="chips" data-key="genre"></div>
<div class="chips" data-key="level"></div>
<div class="count" id="count"></div>
</div>
<div id="list"></div>
</div>
<script>
const R=${JSON.stringify(data)};
const L={category:${JSON.stringify(CATEGORY_LABEL)},genre:${JSON.stringify(GENRE_LABEL)},level:${JSON.stringify(
  Object.fromEntries(Object.entries(LEVEL_META).map(([k, v]) => [k, v.name])),
)}};
const state={category:'',genre:'',level:'',q:''};
for(const el of document.querySelectorAll('.chips')){const key=el.dataset.key;
  el.innerHTML='<button class="chip on" data-v="">すべて</button>'+Object.entries(L[key]).map(([v,l])=>'<button class="chip" data-v="'+v+'">'+l+'</button>').join('');
  el.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state[key]=b.dataset.v;el.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===b));render();});}
document.getElementById('q').addEventListener('input',e=>{state.q=e.target.value.trim();render();});
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function render(){
  const list=R.filter(r=>(!state.category||r.category===state.category)&&(!state.genre||r.genre===state.genre)&&(!state.level||r.level===state.level)
    &&(!state.q||r.name.includes(state.q)||r.ingredients.some(i=>i.name.includes(state.q))));
  document.getElementById('count').textContent=list.length+'品';
  document.getElementById('list').innerHTML=list.map(r=>'<details><summary>'
    +'<span class="g '+r.genre+'">'+L.genre[r.genre][0]+'</span>'
    +'<span class="t"><div class="n">'+esc(r.name)+'</div><div class="m">'+L.category[r.category]+' ・ <span class="num">'+r.time+'</span>分 ・ <span class="num">'+r.cost+'</span>円（'+r.costLevel+'）</div></span>'
    +'<span class="lv '+r.level+'">'+L.level[r.level]+'</span></summary><div class="body">'
    +(r.tags.length?'<div class="tags">'+r.tags.map(t=>'<span>#'+esc(t)+'</span>').join('')+'</div>':'')
    +'<div><h3>材料（2人前）</h3><div class="ing">'+r.ingredients.map(i=>'<span class="'+(i.seasoning?'s':'')+'">'+esc(i.name)+'</span><span class="num">'+esc(i.amount)+'</span>').join('')+'</div></div>'
    +'<div><h3>作り方</h3><ol>'+r.steps.map(s=>'<li>'+esc(s.text)+(s.tip?'<br><span class="tip">'+esc(s.tip)+'</span>':'')+'</li>').join('')+'</ol></div>'
    +'</div></details>').join('');
}
render();
</script></body></html>`;

const out = process.argv[2] ?? 'docs/recipes-preview.html';
writeFileSync(out, html);
console.log(`wrote ${out} (${data.length} recipes)`);
