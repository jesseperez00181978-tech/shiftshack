import { timingSafeEqual } from 'node:crypto';
import { validateQuote } from '../lib/contractor-invoice.mjs';

// Admin-only route for quoted, real-world contractor services.
// Creates a *single payable invoice*, rather than a reusable Payment Link.
// No card details or secret keys are accepted/stored by ShiftStack's browser.
function authorized(header, secret) {
  if (!secret || secret.length < 24 || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function stripeRequest(path, params, idem) {
  const headers = { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY };
  if (idem) headers['Idempotency-Key'] = idem;
  const options = { method: params ? 'POST' : 'GET', headers };
  if (params) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = new URLSearchParams(params).toString();
  }
  const result = await fetch('https://api.stripe.com/v1' + path, options);
  const data = await result.json();
  if (!result.ok) throw new Error(data?.error?.message || 'Stripe rejected the request');
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Allow', 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  // Fail closed. A new branch or preview must not issue live invoices by accident.
  if (process.env.CONTRACTOR_PAYMENTS_ENABLED !== 'true'
      || !/^sk_(?:test|live)_/.test(process.env.STRIPE_SECRET_KEY || '')
      || !process.env.CONTRACTOR_ADMIN_TOKEN) {
    return res.status(503).json({ error: 'Contractor invoicing is not configured' });
  }
  if (!authorized(req.headers.authorization, process.env.CONTRACTOR_ADMIN_TOKEN)) {
    return res.status(401).json({ error: 'Not authorized' });
  }
  try {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      return res.status(415).json({ error: 'JSON required' });
    }
    if (Number(req.headers['content-length'] || 0) > 8192) return res.status(413).json({ error: 'Request too large' });
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(input || {}).length > 8192) return res.status(413).json({ error: 'Request too large' });
    const quote = validateQuote(input);

    // Confirm this is a Stripe account connected to this platform, ready to receive funds.
    const contractor = await stripeRequest('/accounts/' + encodeURIComponent(quote.contractorAccountId));
    if (!contractor.payouts_enabled || contractor.capabilities?.transfers !== 'active') {
      return res.status(409).json({ error: 'Contractor must finish Stripe Connect onboarding before payment' });
    }

    const prefix = 'shiftstack-contractor-' + quote.quoteId;
    const customer = await stripeRequest('/customers', {
      email: quote.customerEmail,
      'metadata[shiftstack_quote_id]': quote.quoteId
    }, prefix + '-customer');

    const invoice = await stripeRequest('/invoices', {
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: '7',
      auto_advance: 'false',
      pending_invoice_items_behavior: 'exclude',
      application_fee_amount: String(quote.platformFeeCents),
      'transfer_data[destination]': quote.contractorAccountId,
      'metadata[shiftstack_quote_id]': quote.quoteId,
      'metadata[shiftstack_payment_type]': 'physical_contractor_service'
    }, prefix + '-invoice');

    await stripeRequest('/invoiceitems', {
      customer: customer.id,
      invoice: invoice.id,
      amount: String(quote.amountCents),
      currency: 'usd',
      description: quote.serviceDescription
    }, prefix + '-item');

    const finalized = await stripeRequest('/invoices/' + encodeURIComponent(invoice.id) + '/finalize', {
      auto_advance: 'false'
    }, prefix + '-finalize');

    if (!finalized.hosted_invoice_url) throw new Error('Stripe did not return a hosted payment URL');
    return res.status(200).json({
      invoiceId: finalized.id,
      invoiceUrl: finalized.hosted_invoice_url,
      quoteId: quote.quoteId,
      amountCents: quote.amountCents,
      platformFeeCents: quote.platformFeeCents,
      status: finalized.status
    });
  } catch (err) {
    if (err instanceof SyntaxError || /^Enter |^Describe |^Use |^Price |^Invoice amount |^Invalid request/.test(err.message || '')) {
      return res.status(400).json({ error: err.message });
    }
    // Never log tokens, Stripe keys, email addresses, or request bodies.
    console.error('Contractor invoice creation failed', err?.name || 'Error');
    return res.status(502).json({ error: 'Unable to create invoice. Check Stripe dashboard before retrying this quote ID.' });
  }
}
