# Contract-first candidate lookup V2 — STAGING ONLY

## How contract-first lookup avoids false negatives
The previous draft filtered by `ipcDigitsV2`: dozens of contracts commonly share IPC001, so the query still returned unnecessary documents. This revision filters **by contract number first**, then performs the ORIGINAL complete comparison (Project + Contract + IPC, amount/status/month priority) on all candidates.

- `contractDigitsV2` is a *coarse*, independently verifiable candidate key: take the ASCII digits of `contractNo`, then remove every `1`. Example `CSCECVN-SEA-MEP-LAB-002` → `002`.
- Why ignore digit `1`? The existing production normalization can insert `1` in **EATON PARK P → P1**. If we used all raw digits, equivalent contract numbers might fall into different query buckets. Removing `1` is deliberately conservative, even though some unrelated contracts collide.
- PHU HUNG → PH, punctuation, diacritics, and spacing aliases preserve the remaining ASCII digits. Equal normalized contract numbers therefore always share the same candidate key.
- The Rules calculate `contractNo.replace('[^0-9]','').replace('1','')` and require the value to match. Unlike exact V1 normalization, it is independently checkable by the server.
- All original same-month and cross-month duplicate checks still run on returned candidates, including cross-project, amount, paid status, split payment warnings, and original alias normalization. The coarse key is **never** proof of a duplicate.
- Contract numbers without significant digits, or numbers containing only digit `1`, may have a broad empty key, so their queries can still read many rows. No fixed read-count claim is made.
- Updates of `contractNo` atomically update the V2 field; changes only to IPC do not require changing the contract candidate key.

## Status and release gate
**NOT ACTIVE.** Both `PAYMENT_V2_WRITERS_ENABLED=false` and `PAYMENT_INDEX_V2_QUERY_CODE_ENABLED=false` remain in the branch. PR is Draft. No production Rules, Payment data, migration, marker, or Vercel environment are altered by this PR.

## Before production
1. Obtain an independent restorable production backup and compare the **exact currently deployed** Firestore Rules with the staging V2 candidate; no permissive overlapping allow path.
2. Run emulator tests with Staff/Admin: forged V1/V2 metadata denied, contract edits work atomically, old paid-workflow edits remain functional, and no Cash Control, Archive, UNC, or plan review regression.
3. Rehearse **all** web and external Payment writers on an isolated Firebase staging project with synchronized V2, including all active desktop/mobile clients. An out-of-date client must not silently write a stale key.
4. Coordinate writer + Rules deployment. New Payment creates must already carry V2. Pre-backfill legacy rows may receive workflow updates without V2, but their contract changes must include V2.
5. Audit/backfill **all** Payment documents using `backend/backfill-contract-digits-v2.cjs`, paged read-only by default. Require a restorable backup and explicit separate authorization for `--write`. Only `contractDigitsV2` may be modified, with fresh transactional rechecks.
6. Do **two complete independent audits** after backfill, ensuring mismatch=invalid=errors=0 and verify every writer continues to maintain the contract field.
7. Only then enable BOTH V2 code gates, and set protected Admin-only `systemConfig/paymentLookupV2` marker fields (`ready:true`, `schemaVersion:2`, `rulesVerified:true`, `backfillVerified:true`, `synchronousWritersVerified:true`). Confirm duplicate parity and billed Firestore reads with actual Staff import.

**Do not enable V1 three-YES flags, do not deploy staging Rules alone, and do not activate queries before every historical row is indexed.** The query deliberately fails closed if its verified marker is absent. Legacy production continues to function until the migration is approved and complete.
