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
