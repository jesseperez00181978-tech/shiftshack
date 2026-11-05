# ShiftStack Android (Trusted Web Activity)

Bubblewrap-generated Android wrapper for the existing ShiftStack web app.

## App configuration

- Launch origin: `https://shiftshack.vercel.app`
- Launch path: `/`
- Android application ID: `com.jesseperez.shiftstack`
- Version code: `4`
- Version name: `1.0.4`
- Bubblewrap CLI: `1.27.0`

The web app itself is not copied or modified here. The TWA loads the deployed site, so its current web features and browser-managed data remain owned by that site. Browser storage is scoped by origin; data saved under the previous GitHub Pages origin will not automatically appear under the Vercel origin. Use ShiftStack's existing export/import flow if data must be moved between origins.

## Build locally

1. Install Node.js 18+, JDK 17, and Android SDK command-line tools.
2. Accept the Android SDK licenses and install `platforms;android-36` and `build-tools;36.0.0`.
3. Install Bubblewrap CLI `1.27.0` and configure its JDK and SDK paths.
4. Provide the existing upload keystore at a private path. Do not add it to this project or commit it.
5. Set `BUBBLEWRAP_KEYSTORE_PASSWORD` and `BUBBLEWRAP_KEY_PASSWORD`, then run from this directory:

   ```sh
   bubblewrap build --signingKeyPath=/private/path/to/existing-upload-key.jks --signingKeyAlias="$SHIFTSTACK_KEY_ALIAS"
   ```

Bubblewrap produces a signed APK and AAB. Keep the signing credentials outside the repository.

## GitHub Actions build

The manual standalone workflow at `.github/workflows/build-android.yml` builds the APK and AAB and uploads them as workflow artifacts. In the existing `shiftshack` repository, use the root workflow at `../.github/workflows/build-shiftstack-android.yml`. Neither workflow has a Play publishing step. Configure these repository or environment secrets before running it:

- `SHIFTSTACK_KEYSTORE_BASE64`: base64 of the existing ShiftStack upload keystore
- `SHIFTSTACK_KEY_ALIAS`: alias for that same existing upload identity
- `BUBBLEWRAP_KEYSTORE_PASSWORD`
- `BUBBLEWRAP_KEY_PASSWORD`

The workflow writes the keystore to the runner's temporary directory, never to the checkout, and removes it when the job ends. Do not use a different key; Android updates must retain the existing signing identity.

## Trusted Web Activity verification

A TWA needs a matching Digital Asset Links statement at:

`https://shiftshack.vercel.app/.well-known/assetlinks.json`

That live endpoint must include package `com.jesseperez.shiftstack` and the SHA-256 fingerprint of the existing upload certificate. This project does not alter or deploy the web site. Verify that association before distributing a build; otherwise Android may open the site in a browser-style Custom Tab.
