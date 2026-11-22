// ShiftStack Work: validation of one-time physical-service invoices.
// The server, never the browser, computes a 10% fee on LABOR only.
export const PLATFORM_FEE_BPS = 1000;

function cents(raw, label, optional = false) {
  const value = String(raw ?? (optional ? '0' : '')).trim();
  if (!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(label + ' must be a USD amount with at most two decimals');
  }
  const [dollars, fractional = ''] = value.split('.');
  const n = Number(dollars) * 100 + Number(fractional.padEnd(2, '0'));
  if (!Number.isSafeInteger(n) || n < 0 || n > 999999) {
    throw new Error(label + ' is outside the allowed range');
  }
  return n;
}

export function validateQuote(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid request');
  const customerEmail = String(input.customerEmail || '').trim();
  const contractorAccountId = String(input.contractorAccountId || '').trim();
  const serviceDescription = String(input.serviceDescription || '').trim();
  const quoteId = String(input.quoteId || '').trim();

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
  const laborCents = cents(input.laborUsd, 'Labor');
  const materialsCents = cents(input.materialsUsd, 'Materials', true);
  const amountCents = laborCents + materialsCents;
  if (laborCents < 1000 || amountCents > 999999) {
    throw new Error('Labor must be at least $10 and total no more than $9,999.99');
  }
  // Nearest cent, half up, using integer arithmetic.
  const platformFeeCents = Math.floor((laborCents * PLATFORM_FEE_BPS + 5000) / 10000);
  return {
    customerEmail, contractorAccountId, serviceDescription, quoteId,
    laborCents, materialsCents, amountCents, platformFeeCents
  };
}

export function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}
