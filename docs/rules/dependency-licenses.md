# Dependency licenses

Third-party dependency licenses are governed by [`license-policy.json`](../../license-policy.json) at the repo root and enforced by `scripts/check-licenses.mjs`.

- The core is licensed GPL-3.0-only. Third-party code under GPL, AGPL, LGPL, SSPL, or other strong copyleft is rejected.
- Permissive licenses (MIT, BSD-2/3-Clause, ISC, Apache-2.0, 0BSD, Unlicense, CC0-1.0) and the weak file-level copyleft MPL-2.0 are allowed.
- Unknown or unlicensed packages fail unless they are explicitly allowlisted in `license-policy.json` with a reason and a review date.
- The future closed-source `internal/pro/` directory forbids all third-party copyleft, including MPL-2.0.

Run the check locally with `npm run check:licenses`. Generate (or refresh) `THIRD_PARTY_NOTICES.md` with `npm run check:licenses -- --write-notices`.
