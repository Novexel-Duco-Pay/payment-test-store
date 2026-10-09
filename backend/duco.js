import crypto from 'node:crypto';

const TOLERANCE_SECONDS = 300;

export function apiBase() {
  return (process.env.DUCO_API_BASE || 'https://api-staging.ducopay.com').replace(/\/$/, '');
}

export function merchantKey() {
  return process.env.DUCO_MERCHANT_KEY || process.env.DOCU_PAY_API || '';
}

export function webhookSecret() {
  return process.env.DUCO_WEBHOOK_SECRET || '';
}

async function duco(path, { method = 'GET', body, idempotencyKey } = {}) {
  const key = merchantKey();
  if (!key) {
    const error = new Error('DUCO_MERCHANT_KEY is not set. Add it to .env and restart the API.');
    error.status = 500;
    throw error;
  }

  const headers = {
    'x-duco-merchant-key': key,
    Accept: 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let res;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const error = new Error(`Could not reach Duco at ${apiBase()}: ${err.message}`);
    error.status = 502;
    throw error;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(errorMessage(data, `Duco request failed (${res.status})`));
    error.status = res.status >= 500 ? 502 : 400;
    error.details = data;
    throw error;
  }
  return data;
}

export function createCheckoutSession(payload, idempotencyKey) {
  return duco('/v2.0/api/checkout-sessions', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function getCheckoutSession(id) {
  return duco(`/v2.0/api/checkout-sessions/${encodeURIComponent(id)}`);
}

export function getPaymentIntent(id) {
  return duco(`/v2.0/api/payment-intents/${encodeURIComponent(id)}`);
}

function errorMessage(data, fallback) {
  const value = data?.error || data?.message || data?.detail;
  if (!value) return fallback;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Webhook-Signature is `t=<unix>,v1=<hex>`.
 * v1 is HMAC-SHA256 of `${t}.${rawBody}`, keyed with the full whsec_ secret.
 * https://docs.ducopay.com/webhooks/verification
 */
export function verifyWebhookSignature(rawBody, header, secret) {
  if (!secret || !header) return false;

  const parts = String(header)
    .split(',')
    .map((part) => {
      const i = part.indexOf('=');
      if (i < 1) return null;
      return [part.slice(0, i).trim(), part.slice(i + 1).trim()];
    })
    .filter(Boolean);

  const timestamp = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!Number.isInteger(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();

  return signatures.some((signature) => {
    if (!/^[0-9a-f]+$/i.test(signature) || signature.length % 2 !== 0) return false;
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
