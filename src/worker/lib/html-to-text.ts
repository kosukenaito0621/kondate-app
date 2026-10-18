/**
 * レシピページの HTML から、AI に渡す本文を取り出す。
 * 多くのレシピサイトは schema.org の Recipe（JSON-LD）を埋め込んでいるので、まずそれを使う。
 * なければ script/style 等を除いた本文テキストを使う。
 */
export function extractRecipeText(html: string): string {
  const ld = findJsonLdRecipe(html);
  if (ld) return ld;
  return htmlToText(html).slice(0, 12_000);
}

function findJsonLdRecipe(html: string): string | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!.trim());
    } catch {
      continue;
    }
    const recipe = findRecipeNode(data);
    if (recipe) return formatRecipeNode(recipe);
  }
  return null;
}

type Node = Record<string, unknown>;

function findRecipeNode(data: unknown): Node | null {
  if (Array.isArray(data)) {
    for (const d of data) {
      const r = findRecipeNode(d);
      if (r) return r;
    }
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const node = data as Node;
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipeNode(node['@graph']);
  return null;
}

const asText = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : Array.isArray(v)
      ? v.map(asText).filter(Boolean).join('\n')
      : v && typeof v === 'object'
        ? asText((v as Node).text ?? (v as Node).name ?? (v as Node).itemListElement ?? '')
        : '';

function formatRecipeNode(r: Node): string {
  return [
    `料理名: ${asText(r.name)}`,
    r.recipeYield ? `分量: ${asText(r.recipeYield)}` : '',
    r.totalTime ? `調理時間: ${asText(r.totalTime)}` : '',
    r.recipeCategory ? `カテゴリ: ${asText(r.recipeCategory)}` : '',
    r.recipeCuisine ? `ジャンル: ${asText(r.recipeCuisine)}` : '',
    `材料:\n${asText(r.recipeIngredient)}`,
    `作り方:\n${asText(r.recipeInstructions)}`,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 12_000);
}

export function htmlToText(html: string): string {
  return (
    html
      .replace(/<(script|style|noscript|svg|iframe|header|footer|nav)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // 改行以外の空白（全角スペースを含む）をまとめる
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n\s*\n+/g, '\n')
      .trim()
  );
}
