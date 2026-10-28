// Shared validation for ShiftStack's physical-service contractor invoices.
// No browser-controlled payment split or billing credentials.
export const PLATFORM_FEE_BPS = 1000; // 10%, in basis points

export function validateQuote(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request');
  const customerEmail = String(input.customerEmail || '').trim();
  const contractorAccountId = String(input.contractorAccountId || '').trim();
  const serviceDescription = String(input.serviceDescription || '').trim();
  const quoteId = String(input.quoteId || '').trim();
  const amountUsd = String(input.amountUsd || '').trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.length > 254) {
    throw new Error('Enter a valid customer email');
  }
  if (!/^acct_[a-zA-Z0-9]{8,}$/.test(contractorAccountId)) {
    throw new Error('Enter a valid Stripe connected-account ID');
  }
  if (serviceDescription.length < 5 || serviceDescription.length > 200) {
    throw new Error('Describe the physical service in 5 to 200 characters');
  }
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(quoteId)) {
    throw new Error('Use a unique quote reference of 8 to 64 characters');
  }
  if (!/^(?:[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(amountUsd)) {
    throw new Error('Price must be USD 1.00 to 9999.99 with at most two decimals');
  }
  const [dollars, cents = ''] = amountUsd.split('.');
  const amountCents = Number(dollars) * 100 + Number(cents.padEnd(2, '0'));
  if (!Number.isSafeInteger(amountCents) || amountCents < 1000 || amountCents > 999999) {
    throw new Error('Invoice amount must be between $10.00 and $9,999.99');
  }
  const platformFeeCents = Math.floor((amountCents * PLATFORM_FEE_BPS + 5000) / 10000);
  return { customerEmail, contractorAccountId, serviceDescription, quoteId, amountCents, platformFeeCents };
}

export function safeCompare(a, b) {
  // Constant-time token comparison in the API handler (without leaking length).
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}
