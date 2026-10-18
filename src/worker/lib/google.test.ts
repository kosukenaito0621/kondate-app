import { describe, expect, it } from 'vitest';
import { base64url } from './crypto';
import { parseIdToken } from './google';

const CLIENT = 'client.apps.googleusercontent.com';
const NOW = 1_800_000_000_000;

function token(claims: Record<string, unknown>) {
  const enc = (o: object) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  return `${enc({ alg: 'RS256' })}.${enc(claims)}.sig`;
}

const valid = {
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  exp: NOW / 1000 + 600,
  sub: '123',
  email: 'me@example.com',
  email_verified: true,
  name: '内藤',
};

describe('parseIdToken', () => {
  it('正しいクレームを返す（日本語名もデコードできる）', () => {
    expect(parseIdToken(token(valid), CLIENT, NOW)).toMatchObject({ sub: '123', name: '内藤' });
  });
  it.each([
    ['iss', { iss: 'https://evil.example.com' }],
    ['aud', { aud: 'other-client' }],
    ['exp', { exp: NOW / 1000 - 1 }],
    ['email_verified', { email_verified: false }],
  ])('%s が不正なら拒否', (_, patch) => {
    expect(() => parseIdToken(token({ ...valid, ...patch }), CLIENT, NOW)).toThrow();
  });
});
