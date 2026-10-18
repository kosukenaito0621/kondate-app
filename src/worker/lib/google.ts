import { z } from 'zod';
import { base64url, base64urlDecode, sha256 } from './crypto';

// Google OAuth 2.0 / OpenID Connect（Authorization Code + PKCE, confidential client）
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

export async function buildAuthorizationUrl(
  config: GoogleConfig,
  state: string,
  codeVerifier: string,
): Promise<string> {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'openid email profile',
    state,
    code_challenge: base64url(await sha256(codeVerifier)),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

const tokenResponseSchema = z.object({ id_token: z.string() });

const idTokenClaimsSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  exp: z.number(),
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.url().optional(),
});

export type GoogleProfile = { sub: string; email: string; name?: string; picture?: string };

/**
 * 認可コードをトークンに交換し、IDトークンのクレームを返す。
 * IDトークンは Google のトークンエンドポイントから TLS で直接受け取るため、
 * OIDC Core 3.1.3.7 に従い署名検証は省略し、iss / aud / exp を検証する。
 */
export async function exchangeCode(
  config: GoogleConfig,
  code: string,
  codeVerifier: string,
  fetchFn: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const res = await fetchFn(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status}`);
  const { id_token } = tokenResponseSchema.parse(await res.json());
  return parseIdToken(id_token, config.clientId);
}

export function parseIdToken(idToken: string, clientId: string, now = Date.now()): GoogleProfile {
  const payload = idToken.split('.')[1];
  if (!payload) throw new Error('malformed id_token');
  const claims = idTokenClaimsSchema.parse(JSON.parse(base64urlDecode(payload)));
  if (!ISSUERS.includes(claims.iss)) throw new Error('invalid iss');
  if (claims.aud !== clientId) throw new Error('invalid aud');
  if (claims.exp * 1000 < now) throw new Error('id_token expired');
  if (claims.email_verified === false) throw new Error('email not verified');
  return { sub: claims.sub, email: claims.email, name: claims.name, picture: claims.picture };
}
