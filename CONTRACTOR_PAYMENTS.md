# ShiftStack contractor payments (pre-release module)

This module handles **payments for real-world physical contractor services**. It is separate from **ShiftStack Premium** ($4.99/month via Google Play Billing). Google Play's payments policy excludes physical services, but digital premium access must stay on Play Billing.

## What is implemented

- A **ShiftStack Work marketplace preview** for local jobs, contract posts, contractor responses and profiles, with an admin-only invoice creator linked from My Work at `/contractor-payments.html`.
- A disabled-by-default **test-mode-only** Vercel Node function at `POST /api/contractor-invoice`. The API rejects production deployments and live Stripe keys.
- Stripe Connect account verification (connected account must be ready for transfers/payouts).
- Server-calculated **10% ShiftStack fee on service labor only**, excluding separately itemized materials (and excluding taxes, tips and unrelated work). The contractor's gross share is the invoice amount less the labor commission, before Stripe fees, refunds and disputes.
- **One-time Stripe-hosted invoices** for approved USD quotes, rather than a publicly reusable payment link. Stripe's invoice state is the source of truth.
- Quote metadata in Stripe for later reconciliation. No card details, bank details, keys, or quoted invoices are stored in ShiftStack localStorage.
- No change to the current job tracker, Play Billing, or production release. The marketplace backend requires separate Supabase configuration and review before going live.

**Important:** This is a quoted-service payment pilot, not a complete contractor marketplace. Contractor matching, request storage, contractor verification, dispute policies, refunds, customer authentication and production accounting still require work.

## Required private setup before testing

1. Create/configure a **Stripe platform** account, enable **Connect**, complete its platform verification. This is NOT Google Play Billing.
2. Onboard at least one contractor as a **connected account**. Obtain their `acct_...` ID from Stripe, and verify `transfers` capability and payouts are enabled. Do not type their banking details into ShiftStack.
3. In Vercel's **shiftshack** project's **Preview environment only**, create:
   - `STRIPE_SECRET_KEY`: Stripe **test** secret key (`sk_test_...`).
   - `CONTRACTOR_ADMIN_TOKEN`: unique random admin secret of at least 24 characters (prefer >=32).
   - `CONTRACTOR_PAYMENTS_ENABLED`: `true`.
4. Keep `CONTRACTOR_PAYMENTS_ENABLED` unset or `false` in **Production** until everything is verified. NEVER commit credentials, paste them into chat or expose them in client-side JavaScript.
5. Deploy the feature branch as a **Preview** (the endpoint refuses production deployments and live API keys), then open `https://<preview-host>/contractor-payments.html` on a trusted device. Enter only the admin token, the connected test account ID, a test customer email, the approved service description and the price.
6. Issue one test invoice. Share the Stripe-hosted invoice URL with your test customer, pay with a Stripe test card in test mode, and verify the invoice status **paid** in the Stripe dashboard. Confirm the destination transfer, application fee, processing fees, and connected account payout status.
7. Test refund/dispute procedures in Stripe and read Connect's fee, loss-liability, and tax responsibilities. Add proper audit logging and a customer booking/contractor approval flow before selling to the public.
8. Live payments are intentionally NOT supported by this pilot. Before implementing live payments, add authenticated bookings and ownership checks, verified webhook-based accounting, dispute/refund handling, terms and customer support. Review the release gate separately rather than placing live keys into this preview endpoint.

## How it works

The admin endpoint accepts JSON containing `quoteId`, `customerEmail`, `contractorAccountId`, `serviceDescription`, `laborUsd` and optional `materialsUsd` using `Authorization: Bearer <CONTRACTOR_ADMIN_TOKEN>`. Only the server chooses the 10%-of-labor fee; customers cannot supply a fee or recipient. Service labor must be at least $10, and the combined invoice must be no more than $9,999.99 USD. Materials can be $0; any sales tax must be handled and disclosed separately.

The server:
1. Verifies the contractor account on Stripe.
2. Creates a Stripe Customer (email only) and invoice in send-invoice mode, with the destination account and application fee set.
3. Attaches the approved labor quote and any materials as separate invoice line items, then finalizes the one-time invoice.
4. Returns Stripe's hosted invoice URL; share that HTTPS link with the customer yourself.
5. Stripe records payment state and settlement. **Do not treat returning from a browser redirect or seeing the invoice URL as proof of payment.** Verify `paid` on Stripe before beginning work.

Each `quoteId` is used as a Stripe idempotency key for the API calls. Stripe's idempotency retention has a limited window. **Never regenerate or retry the same quote after a day without checking your Stripe Dashboard** to avoid duplicate invoices. A failed request may have left an incomplete draft invoice: inspect Stripe before retrying.

## Marketplace availability

The ShiftStack Work UI and Supabase schema are in this development branch, but **no public contractor marketplace or authenticated checkout has been launched**. With no Supabase URL and publishable key, the marketplace behaves as a local-device preview. Stripe invoicing is operator-only. Do not imply a customer can hire and safely pay through the marketplace until booking authorization, accepted quotes, contractor identity checks, and payment record synchronization are implemented and tested.

## Before public marketplace launch

- Implement real contractor/customer accounts, booking records, identity and permission checks, payment-status synchronization/webhook processing with durable idempotency, cancellation/refund and dispute rules, terms, privacy policy and customer support.
- Determine whether to charge before or after completed work and whether deposits, refunds, sales taxes or other obligations apply.
- Strongly protect the admin access (server-side authentication and account-level authorization). The token form is **pilot/admin only**; do not turn it into a public payment form.
- Stripe Connect application fees are not guaranteed take-home profit. Processor fees and chargebacks can affect the platform's balance. Confirm who is responsible for each.
- Leave ShiftStack Premium payments on Google Play Billing. Contractor invoice payments apply only to **real-world physical services**.
- Resolve the separate Google Play payments-account warning in Play Console; this module does not fix that notification.
