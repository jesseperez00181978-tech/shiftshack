import { createSign } from 'node:crypto';

export const PREMIUM_PRODUCT = 'shiftstack_premium';
const PRODUCTS = new Set([PREMIUM_PRODUCT]);
const PACKAGE = 'com.jesseperez.shiftstack';
const origins = new Set(['https://jesseperez00181978-tech.github.io', 'https://shiftshack.vercel.app']);
let cachedToken;

function credentials() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const account = JSON.parse(raw);
  if (!account.client_email || !account.private_key) return null;
  return account;
}

async function accessToken(account) {
  if (cachedToken?.until > Date.now()) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  const assertion = unsigned + '.' + createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw Error('Google Play verification is unavailable. Please try again later.');
  cachedToken = { value: data.access_token, until: Date.now() + Math.max(0, (Number(data.expires_in) || 3600) - 60) * 1000 };
  return cachedToken.value;
}

export function entitlement(data, productId, now = Date.now()) {
  const expiresAt = Math.max(0, ...(data.lineItems || []).filter(item => item.productId === productId).map(item => Date.parse(item.expiryTime) || 0));
  const validState = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(data.subscriptionState);
  return { active: validState && expiresAt > now, productId, expiresAt };
}

export async function verifySubscriptionPurchase(productId, purchaseToken, { acknowledge = true } = {}) {
  if (!PRODUCTS.has(productId)) throw Error('Unknown ShiftStack subscription product.');
  if (typeof purchaseToken !== 'string' || !purchaseToken.trim() || purchaseToken.length > 4096) throw Error('A valid purchase token is required.');
  const account = credentials();
  if (!account) throw Error('Google Play subscription verification is not configured yet.');
  const token = await accessToken(account);
  const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE + '/purchases/';
  const headers = { Authorization: 'Bearer ' + token };
  const response = await fetch(base + 'subscriptionsv2/tokens/' + encodeURIComponent(purchaseToken), { headers, signal: AbortSignal.timeout(10000) });
  if ([400, 404, 410].includes(response.status)) {
    const error = Error('This purchase could not be verified.');
    error.code = 'INVALID_PURCHASE';
    throw error;
  }
  if (!response.ok) throw Error('Google Play verification is unavailable. Please try again later.');
  const data = await response.json();
  const result = entitlement(data, productId);
  if (acknowledge && result.active && data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') {
    const acknowledged = await fetch(base + 'subscriptions/' + productId + '/tokens/' + encodeURIComponent(purchaseToken) + ':acknowledge', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10000)
    });
    if (!acknowledged.ok) throw Error('Purchase confirmation is pending. Please use Restore purchases to try again.');
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  const origin = req.headers.origin;
  if (origin && !origins.has(origin)) return res.status(403).json({ error: 'Origin not allowed.' });
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  let account;
  try { account = credentials(); } catch {}
  if (req.method === 'GET') return res.status(200).json({ ready: !!account, productId: PREMIUM_PRODUCT, productIds: [PREMIUM_PRODUCT] });
  if (!account) return res.status(503).json({ error: 'Google Play subscription verification is not configured yet. Please try again later.' });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid request.' }); }
  const purchaseToken = body?.purchaseToken;
  const productId = typeof body?.productId === 'string' ? body.productId : PREMIUM_PRODUCT;
  if (!PRODUCTS.has(productId)) return res.status(400).json({ error: 'Unknown ShiftStack subscription product.' });
  if (typeof purchaseToken !== 'string' || !purchaseToken.trim() || purchaseToken.length > 4096) return res.status(400).json({ error: 'A valid purchase token is required.' });
  try {
    return res.status(200).json(await verifySubscriptionPurchase(productId, purchaseToken));
  } catch (error) {
    if (error?.code === 'INVALID_PURCHASE') return res.status(400).json({ error: 'This purchase could not be verified. Restore purchases from the Google Play account used to subscribe.' });
    return res.status(502).json({ error: 'Google Play verification could not finish. Please use Restore purchases to try again.' });
  }
}

