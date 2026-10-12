import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Encryption for connector credentials (e.g. OAuth refresh tokens) at rest,
 * and signing for OAuth `state` values.
 *
 * Keys are derived from `AMBERD_ENCRYPTION_KEY` when set, otherwise from
 * `JWT_SECRET`, with distinct HKDF labels so the two uses never share a key.
 * Neither secret is ever stored in the database or returned by the API.
 */
const masterSecret = (): string => {
  const secret = process.env.AMBERD_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AMBERD_ENCRYPTION_KEY or JWT_SECRET (32+ chars) is required to protect connector credentials');
  }
  return secret;
};

const deriveKey = (label: string): Buffer =>
  Buffer.from(hkdfSync('sha256', masterSecret(), 'amberd', label, 32));

export const encryptSecret = (plaintext: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey('connector-credentials'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
};

export const decryptSecret = (payload: string): string => {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognized credential format');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey('connector-credentials'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
};

export interface OAuthState {
  organizationId: string;
  userId: string;
  connectionId: string;
}

const STATE_TTL_MS = 10 * 60 * 1000;

/** Signed, expiring state so the public OAuth callback can trust who started the flow. */
export const signOAuthState = (state: OAuthState): string => {
  const body = Buffer.from(
    JSON.stringify({ ...state, exp: Date.now() + STATE_TTL_MS, n: randomBytes(8).toString('hex') }),
  ).toString('base64url');
  const mac = createHmac('sha256', deriveKey('oauth-state')).update(body).digest('base64url');
  return `${body}.${mac}`;
};

export const verifyOAuthState = (value: string): OAuthState => {
  const [body, mac] = value.split('.');
  if (!body || !mac) throw new Error('Malformed OAuth state');
  const expected = createHmac('sha256', deriveKey('oauth-state')).update(body).digest();
  const actual = Buffer.from(mac, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('OAuth state signature is invalid');
  }
  const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState & { exp: number };
  if (parsed.exp < Date.now()) throw new Error('OAuth state has expired — start the connection again');
  return { organizationId: parsed.organizationId, userId: parsed.userId, connectionId: parsed.connectionId };
};
