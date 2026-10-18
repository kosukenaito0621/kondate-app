import { describe, expect, it } from 'vitest';
import { extractRecipeText } from './html-to-text';
import { assertSafeUrl, safeFetchHtml, UnsafeUrlError } from './safe-fetch';

describe('assertSafeUrl（SSRF 対策）', () => {
  it.each([
    'https://cookpad.com/recipe/123',
    'http://www.kurashiru.com/recipes/abc',
    'https://example.com:443/a',
  ])('許可: %s', (u) => {
    expect(() => assertSafeUrl(u)).not.toThrow();
  });

  it.each([
    'file:///etc/passwd',
    'ftp://example.com/',
    'http://localhost/',
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://172.16.5.4/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/',
    'http://printer.local/',
    'http://db.internal/',
    'http://intranet/',
    'http://example.com:8080/',
    'https://user:pass@example.com/',
    'not a url',
  ])('拒否: %s', (u) => {
    expect(() => assertSafeUrl(u)).toThrow(UnsafeUrlError);
  });
});

describe('safeFetchHtml', () => {
  const html = (body: string, init: ResponseInit = {}) =>
    new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });

  it('リダイレクト先も検証し、内部アドレスへの転送は拒否', async () => {
    const fetchFn = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/admin' },
      })) as typeof fetch;
    await expect(safeFetchHtml('https://example.com/r', fetchFn)).rejects.toThrow(UnsafeUrlError);
  });

  it('安全なリダイレクトはたどる', async () => {
    let n = 0;
    const fetchFn = (async (u: string) => {
      n++;
      return u.endsWith('/a')
        ? new Response(null, { status: 301, headers: { location: '/b' } })
        : html('<p>ok</p>');
    }) as unknown as typeof fetch;
    const res = await safeFetchHtml('https://example.com/a', fetchFn);
    expect(res).toEqual({ url: 'https://example.com/b', html: '<p>ok</p>' });
    expect(n).toBe(2);
  });

  it('HTML 以外は拒否', async () => {
    const fetchFn = (async () =>
      new Response('{}', { headers: { 'content-type': 'application/json' } })) as typeof fetch;
    await expect(safeFetchHtml('https://example.com/', fetchFn)).rejects.toThrow(UnsafeUrlError);
  });

  it('大きすぎる本文は上限で打ち切る', async () => {
    const big = 'a'.repeat(3 * 1024 * 1024);
    const fetchFn = (async () => html(big)) as typeof fetch;
    const res = await safeFetchHtml('https://example.com/', fetchFn);
    expect(res.html.length).toBe(2 * 1024 * 1024);
  });
});

describe('extractRecipeText', () => {
  it('JSON-LD の Recipe があれば優先して使う', () => {
    const page = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage' },
        {
          '@type': 'Recipe',
          name: '肉じゃが',
          recipeYield: '2人分',
          recipeIngredient: ['牛肉 150g', 'じゃがいも 3個'],
          recipeInstructions: [{ '@type': 'HowToStep', text: '切る' }, { text: '煮る' }],
        },
      ],
    })}</script></head><body>広告</body></html>`;
    const text = extractRecipeText(page);
    expect(text).toContain('料理名: 肉じゃが');
    expect(text).toContain('牛肉 150g');
    expect(text).toContain('煮る');
    expect(text).not.toContain('広告');
  });

  it('なければ本文テキスト（script/style は除く）', () => {
    const text = extractRecipeText(
      '<style>.a{}</style><script>alert(1)</script><h1>カレー</h1><p>材料&amp;作り方</p>',
    );
    expect(text).toBe('カレー\n材料&作り方');
  });
});
