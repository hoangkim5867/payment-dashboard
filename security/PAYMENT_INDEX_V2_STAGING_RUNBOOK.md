# Secure IPC candidate index V2 — STAGING ONLY

## Why this is different from the blocked V1 index
V1 used `duplicateKeyV1` supplied by browser code. Firestore Rules cannot independently reproduce its full Unicode/alias normalization, so a modified client could write a misleading V1 key and hide a real duplicate. Do not activate V1.

V2 is a **Rules-verifiable coarse index**, NOT an exact duplicate key:

- `ipcDigitsV2` = keep ASCII digits from IPC (`IPC017` → `017`). Firestore Rules computes and validates the same expression on **every** Payment create/update, including Admin and Staff.
- All original Project + Contract + IPC comparisons, month/status/amount warning priority, and in-paste duplicate checks remain unchanged on the **returned candidate documents**.
- Equality after the existing IPC normalization always implies the same ASCII-digit sequence; the V2 query therefore overselects (not underselects) candidates. Some IPC patterns with no ASCII digits will have a broad key and may use more reads.
- Browser writer adapter updates the key in the same Firestore commit as changing IPC. Its V2 configuration cannot write the old V1 fields. Workflow-only updates preserve the existing V2 field.
- No background listener, extra scan, or post-write trigger is required to maintain V2.

## Current release status
**NOT ACTIVE.** Both `PAYMENT_V2_WRITERS_ENABLED` and `PAYMENT_INDEX_V2_QUERY_CODE_ENABLED` are `false`. Existing production Rules and payment rows are untouched; normal Excel paste still takes the legacy fallback. This change cannot honestly be called a production quota fix yet.

## Required ordered rollout (no shortcut)
1. Verify a restorable backup and get the exact current deployed production Rules. Compare every existing match block with `security/firestore.rules.V2_STAGING_ONLY`, especially any overlapping allow rules.
2. Run Firebase Emulator tests for both Staff and Admin using synthetic data. Confirm V1 spoofing is denied, V2 values must match IPC even when the user bypasses the website, Staff can add/edit/workflow correctly, and no unrelated cash/UNC/Archive permission regresses.
3. Rehearse switching **all** Payment writers (desktop, mobile, Plan Review, Contract Master, other clients) to V2 in a separate staging Firebase; ensure they never write V1. Re-run all business parity tests and Excel UI tests.
4. Publish verified V2 Rules together with the updated writers in a coordinated staged release. Do not enable indexed queries yet. The staging Rules permit non-IPC workflow edits on legacy rows without V2 while backfilling, but require a verified V2 field if their IPC changes. New creates require V2; coordinate the writer+Rules rollout to avoid old cached clients creating without V2.
5. Audit/backfill every payment using `backend/backfill-ipc-digits-v2.cjs`, default read-only with `--max-docs=120` and bounded continuation cursors. Only after explicit backup, Rules and write approval may `--write --production-approved` run. Never run this process automatically on opening the app.
6. Complete **two full clean audits** showing `mismatch=0`, `invalid=0`, `errors=0`, including documents changed during rollout; verify every writer still maintains V2.
7. Protect `systemConfig/paymentLookupV2` from Staff, then enable the **two V2 build gates together**, and set the Admin-controlled V2 marker `ready:true,schemaVersion:2,rulesVerified:true,backfillVerified:true,synchronousWritersVerified:true`. Check real read counts and Staff duplicate warnings after activation.

Never enable the V1 three-YES controls as a substitute. A missing V2 marker **fails closed** on the V2 route; it does not silently run a full-collection scan or proceed without warnings.

## Tests
- `node --test tests/index-v1/v2-coarse-index.test.cjs`
- `tests/firebase-rules/package.json`: emulator script includes `v2-ipc-digits.rules.test.cjs`.
- GitHub PR checks: verify, emulator, browser. All must pass before anything is proposed for production.

## Important production caveat
Only a staged implementation and Rules candidate are in this PR. Neither a real production Rules deployment nor a complete production backfill is part of the PR. Until those are verified, a zero-read guarantee or safe production activation would be misleading.
