import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuote, safeCompare, PLATFORM_FEE_BPS } from '../lib/contractor-invoice.mjs';

const valid = {
  customerEmail:'customer@example.com',
  contractorAccountId:'acct_123456789012345',
  serviceDescription:'Lawn mow, trim and cleanup',
  quoteId:'SS-2026-0001',
  amountUsd:'70.00'
};
test('proposed commission is 10% rounded to cents', () => {
  const v=validateQuote(valid);
  assert.equal(PLATFORM_FEE_BPS,1000);
  assert.equal(v.amountCents,7000);
  assert.equal(v.platformFeeCents,700);
  assert.equal(validateQuote({...valid,amountUsd:'10.05'}).platformFeeCents,101);
});
test('only approved USD amounts from 10 to 9999.99',()=>{
  for(const amountUsd of ['9.99','10000','-2','1e6','0','70.000','20,000','100.0x','']) {
    assert.throws(()=>validateQuote({...valid,amountUsd}),Error,amountUsd);
  }
  assert.equal(validateQuote({...valid,amountUsd:'9999.99'}).amountCents,999999);
});
test('reject unapproved connected-account and bad email',()=>{
  assert.throws(()=>validateQuote({...valid,contractorAccountId:'acct_x'}));
  assert.throws(()=>validateQuote({...valid,customerEmail:'hi'}));
  assert.throws(()=>validateQuote({...valid,serviceDescription:'X'}));
  assert.throws(()=>validateQuote({...valid,quoteId:'bad'}));
});
test('token helper accepts exact token only',()=>{
  assert.equal(safeCompare('abcdef','abcdef'),true);
  assert.equal(safeCompare('abcdef','abcdeg'),false);
  assert.equal(safeCompare('ab','abcdef'),false);
});
