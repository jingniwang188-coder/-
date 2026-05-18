import crypto from 'node:crypto';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function signPayload(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
}

function safeEqualHex(a = '', b = '') {
  const left = Buffer.from(String(a), 'hex');
  const right = Buffer.from(String(b), 'hex');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function createVipToken(secret, claims = {}, options = {}) {
  const now = Date.now();
  const exp = now + Number(options.ttlMs || DEFAULT_TTL_MS);
  const payload = {
    scope: 'vip-unlock',
    productType: 'all',
    source: 'unknown',
    ...claims,
    iat: now,
    exp
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(payloadB64, secret);
  return { token: `${payloadB64}.${signature}`, expiresAt: exp, payload };
}

export function verifyVipToken(token, secret, { requiredProductType = '' } = {}) {
  if (!token || !secret) return { ok: false, reason: 'missing_token_or_secret' };

  const parts = String(token).split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed_token' };

  const [payloadB64, signature] = parts;
  const expected = signPayload(payloadB64, secret);
  if (!safeEqualHex(signature, expected)) return { ok: false, reason: 'bad_signature' };

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }

  if (payload?.scope !== 'vip-unlock') return { ok: false, reason: 'bad_scope' };
  if (!payload?.exp || Date.now() >= Number(payload.exp)) return { ok: false, reason: 'expired' };

  const tokenProductType = String(payload.productType || '').trim();
  if (requiredProductType && tokenProductType !== 'all' && tokenProductType !== requiredProductType) {
    return { ok: false, reason: 'product_mismatch' };
  }

  return { ok: true, payload };
}
