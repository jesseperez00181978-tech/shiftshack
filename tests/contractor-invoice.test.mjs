import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuote, safeCompare, PLATFORM_FEE_BPS } from '../lib/contractor-invoice.mjs';

const valid = {
  customerEmail: 'customer@example.com',
  contractorAccountId: 'acct_123456789012345',
  serviceDescription: 'Lawn mow, trim and cleanup',
  quoteId: 'SS-2026-0001',
  laborUsd: '70.00',
  materialsUsd: '0.00'
};
test('10% commission applies only to labor, never materials', () => {
  const v = validateQuote({...valid, laborUsd: '500.00', materialsUsd: '150.00'});
  assert.equal(PLATFORM_FEE_BPS, 1000);
  assert.equal(v.laborCents, 50000);
  assert.equal(v.materialsCents, 15000);
  assert.equal(v.amountCents, 65000);
  assert.equal(v.platformFeeCents, 5000);
  assert.equal(validateQuote({...valid, laborUsd: '10.05', materialsUsd: '50'}).platformFeeCents, 101);
});
test('validates nonnegative materials and $10 - $9,999.99 invoice', () => {
  for (const laborUsd of ['9.99','10000','-2','1e6','0','70.000','20,000','100.0x','']) {
    assert.throws(() => validateQuote({...valid,laborUsd}), Error, laborUsd);
  }
  for (const materialsUsd of ['-2','1e6','70.000','20,000','nope']) {
    assert.throws(() => validateQuote({...valid,materialsUsd}), Error, materialsUsd);
  }
  assert.equal(validateQuote({...valid,laborUsd:'9999.99',materialsUsd:'0'}).amountCents,999999);
  assert.equal(validateQuote({...valid,laborUsd:'15',materialsUsd:'10'}).amountCents,2500);
  assert.equal(validateQuote({...valid,materialsUsd:undefined}).materialsCents,0);
  assert.throws(() => validateQuote({...valid,laborUsd:'9999.99',materialsUsd:'0.01'}));
});
test('rejects invalid account, email, description, and quote ID', () => {
  assert.throws(() => validateQuote({...valid,contractorAccountId:'acct_x'}));
  assert.throws(() => validateQuote({...valid,customerEmail:'hi'}));
  assert.throws(() => validateQuote({...valid,serviceDescription:'X'}));
  assert.throws(() => validateQuote({...valid,quoteId:'bad'}));
});
test('token comparison helper accepts exact token only', () => {
  assert.equal(safeCompare('abcdef','abcdef'),true);
  assert.equal(safeCompare('abcdef','abcdeg'),false);
  assert.equal(safeCompare('ab','abcdef'),false);
});

import handler from '../api/contractor-invoice.mjs';

test('invoice endpoint rejects unsafe environments and invalid requests without contacting Stripe', async () => {
  const names = ['VERCEL_ENV', 'CONTRACTOR_PAYMENTS_ENABLED', 'STRIPE_SECRET_KEY', 'CONTRACTOR_ADMIN_TOKEN'];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let stripeCalls = 0;
  globalThis.fetch = async () => { stripeCalls++; throw new Error('Unexpected network request'); };
  const token = 'dummy-test-token-not-a-real-secret';
  const invoke = async (overrides = {}) => {
    const req = { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: valid, ...overrides };
    const res = { code: 0, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler(req, res);
    return res;
  };
  try {
    Object.assign(process.env, { VERCEL_ENV: 'preview', CONTRACTOR_PAYMENTS_ENABLED: 'true', STRIPE_SECRET_KEY: 'sk_test_dummy', CONTRACTOR_ADMIN_TOKEN: token });
    for (const env of ['production', 'development', 'unknown', undefined]) {
      if (env === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = env;
      assert.equal((await invoke()).code, 503, 'unsafe environment: ' + env);
    }
    process.env.VERCEL_ENV = 'preview';
    process.env.CONTRACTOR_PAYMENTS_ENABLED = 'false';
    assert.equal((await invoke()).code, 503);
    process.env.CONTRACTOR_PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_live_dummy';
    assert.equal((await invoke()).code, 503);
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    assert.equal((await invoke({headers: {'content-type': 'application/json'}})).code, 401);
    assert.equal((await invoke({method: 'GET'})).code, 405);
    for (const body of [{...valid, laborUsd: '-2'}, {...valid, materialsUsd: '-1'}, {...valid, laborUsd: '9.99'}, {...valid, laborUsd: '9999.99', materialsUsd: '0.01'}, '{']) {
      assert.equal((await invoke({body})).code, 400);
    }
    assert.equal(stripeCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});
