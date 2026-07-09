# APK signing keystore

`erickson-release.keystore` signs every release APK so each build can
**update-install** over the previous one (Android refuses updates whose
signature changes — a signature change means uninstall/reinstall and losing
the app's local data).

- It is a PKCS12 keystore locked with a long random password. The password is
  **not** in this repo — it lives in the `KEYSTORE_PASSWORD` GitHub Actions
  secret (Settings → Secrets and variables → Actions). Key alias: `erickson262`.
- Committing the (password-protected) keystore is a deliberate trade-off for a
  personal, sideloaded app: it can never be lost, and the CI setup needs
  exactly one secret. It signs nothing but this app; it grants no account
  access of any kind.
- If `KEYSTORE_PASSWORD` is unset, CI still runs but emits an **unsigned** APK
  (not installable) — a toolchain check, not a release.
