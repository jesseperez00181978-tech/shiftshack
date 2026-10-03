# ShiftStack Premium billing

The existing subscription is `shiftstack_premium`. The application ID is
`com.jesseperez.shiftstack`, matching the repository manifest; confirm it also
matches the Play Console application before testing a purchase.

## Required production configuration

In the Vercel **shiftshack** project, add `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` as an
encrypted production environment variable containing a real Google service-account
JSON key. Never commit it. Give that service account access to the ShiftStack app
in Google Play Console, with the permissions needed to view purchases and manage
subscriptions. Enable the Google Play Android Developer API in its Cloud project.
Redeploy after changing environment variables.

`GET /api/shiftstack-billing` returns `ready:true` when credential fields are present.
This does not prove Play Console permissions or subscription availability.

Activate the `shiftstack_premium` monthly base plan in Google Play Console and
verify its price, territories, and availability for the test track. Checkout shows
the price returned by Google Play, not a hard-coded price.

## Release verification

Use a licensed test account with the app installed from its Google Play test track.
The Android wrapper must enable Digital Goods / Play Billing and have the correct
Digital Asset Links association for the website origin. This repository does not
contain the Android wrapper or signing certificate, so those cannot be verified
from these files.

- Open Premium: the monthly price loads and Subscribe becomes available only when
  both the backend and Google Play product are available.
- Complete a test subscription: the backend verifies its state and expiry, then
  acknowledges it before returning active access.
- Cancel checkout: no access is granted.
- Restore on an existing subscription: Premium unlocks without another purchase.
- Pending, expired, paused and on-hold subscriptions remain locked; canceled
  subscriptions retain access until their paid-through expiry.
- Manage subscription opens Google Play. Cancellation takes effect according to
  the subscription's remaining paid period.

Local backend and simulated client checks: `node --test tests/*.test.mjs`.
Vercel builds use their own same-origin billing endpoint; the GitHub Pages copy
uses the production Vercel endpoint. The backend permits its exact Vercel-provided
deployment origin for preview testing, not arbitrary Vercel domains.
The client has a five-minute verification window, refreshed while visible.
These local career tools use a client-side UI gate; they are not server-hosted
protected content. New paid server features must enforce entitlement server-side.
