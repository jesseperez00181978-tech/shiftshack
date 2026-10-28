# ShiftStack contractor payments (pre-release module)

This module handles **payments for real-world physical contractor services**. It is separate from **ShiftStack Premium** ($4.99/month via Google Play Billing). Google Play's payments policy excludes physical services, but digital premium access must stay on Play Billing.

## What is implemented

- An **admin-only** invoice creator at `/contractor-payments.html`.
- A disabled-by-default Vercel Node function at `POST /api/contractor-invoice`.
- Stripe Connect account verification (connected account must be ready for transfers/payouts).
- Server-calculated **10% ShiftStack fee**, 90% gross contractor share, before Stripe fees, refunds, tax and disputes.
- **One-time Stripe-hosted invoices** for approved USD quotes, rather than a publicly reusable payment link. Stripe's invoice state is the source of truth.
- Quote metadata in Stripe for later reconciliation. No card details, bank details, keys, or quoted invoices are stored in ShiftStack localStorage.
- No change to the current job tracker, Play Billing, or production release.

**Important:** This is a quoted-service payment pilot, not a complete contractor marketplace. Contractor matching, request storage, contractor verification, dispute policies, refunds, customer authentication and production accounting still require work.

## Required private setup before testing

1. Create/configure a **Stripe platform** account, enable **Connect**, complete its platform verification. This is NOT Google Play Billing.
2. Onboard at least one contractor as a **connected account**. Obtain their `acct_...` ID from Stripe, and verify `transfers` capability and payouts are enabled. Do not type their banking details into ShiftStack.
3. In Vercel's **shiftshack** project's **Preview environment only**, create:
   - `STRIPE_SECRET_KEY`: Stripe **test** secret key (`sk_test_...`).
   - `CONTRACTOR_ADMIN_TOKEN`: unique random admin secret of at least 24 characters (prefer >=32).
   - `CONTRACTOR_PAYMENTS_ENABLED`: `true`.
4. Keep `CONTRACTOR_PAYMENTS_ENABLED` unset or `false` in **Production** until everything is verified. NEVER commit credentials, paste them into chat or expose them in client-side JavaScript.
5. Deploy the feature branch as a **Preview**, then open `https://<preview-host>/contractor-payments.html` on a trusted device. Enter only the admin token, the connected test account ID, a test customer email, the approved service description and the price.
6. Issue one test invoice. Share the Stripe-hosted invoice URL with your test customer, pay with a Stripe test card in test mode, and verify the invoice status **paid** in the Stripe dashboard. Confirm the destination transfer, application fee, processing fees, and connected account payout status.
7. Test refund/dispute procedures in Stripe and read Connect's fee, loss-liability, and tax responsibilities. Add proper audit logging and a customer booking/contractor approval flow before selling to the public.
8. Only after test reconciliation, business verification, and account security, add **live** keys and live connected account IDs to Production, enable it, and merge/ship the tested build.

## How it works

The admin endpoint accepts JSON containing `quoteId`, `customerEmail`, `contractorAccountId`, `serviceDescription`, and `amountUsd` using `Authorization: Bearer <CONTRACTOR_ADMIN_TOKEN>`. Only the server chooses the 10% fee; customers cannot supply a fee or recipient. The amount must be between $10 and $9,999.99 USD.

The server:
1. Verifies the contractor account on Stripe.
2. Creates a Stripe Customer (email only) and invoice in send-invoice mode, with the destination account and application fee set.
3. Attaches the approved quote as an invoice item, then finalizes the one-time invoice.
4. Returns Stripe's hosted invoice URL; share that HTTPS link with the customer yourself.
5. Stripe records payment state and settlement. **Do not treat returning from a browser redirect or seeing the invoice URL as proof of payment.** Verify `paid` on Stripe before beginning work.

Each `quoteId` is used as a Stripe idempotency key for the API calls. Stripe's idempotency retention has a limited window. **Never regenerate or retry the same quote after a day without checking your Stripe Dashboard** to avoid duplicate invoices. A failed request may have left an incomplete draft invoice: inspect Stripe before retrying.

## Before public marketplace launch

- Implement real contractor/customer accounts, booking records, identity and permission checks, payment-status synchronization/webhook processing with durable idempotency, cancellation/refund and dispute rules, terms, privacy policy and customer support.
- Determine whether to charge before or after completed work and whether deposits, refunds, sales taxes or other obligations apply.
- Strongly protect the admin access (server-side authentication and account-level authorization). The token form is **pilot/admin only**; do not turn it into a public payment form.
- Stripe Connect application fees are not guaranteed take-home profit. Processor fees and chargebacks can affect the platform's balance. Confirm who is responsible for each.
- Leave ShiftStack Premium payments on Google Play Billing. Contractor invoice payments apply only to **real-world physical services**.
- Resolve the separate Google Play payments-account warning in Play Console; this module does not fix that notification.
