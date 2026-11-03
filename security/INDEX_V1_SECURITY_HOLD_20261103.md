# Payment index V1 security hold — 2026-11-03

Status: **NOT production Rules certification. NOT a complete closure of the client-key vulnerability.**

The supplied production Rules file SHA-256 is `8fab1d39c707b1a9d80b3a249f21d72647df134317a7ad7ac078dca64c3ffbc6` (original uploaded bytes). It differs from the repository's staging-only Rules. No production Rules or Payment data were written during this audit.

## Confirmed issue

Local Firestore Emulator 1.19.8, synthetic documents, exact supplied production Rules:

- Staff can create arbitrary `duplicateKeyV1`, `mepLookupV1`, `paymentLookupSchemaV1`.
- Staff can modify only those fields, modify them alongside a permitted IPC change, or delete them.
- Staff cannot enable/delete the readiness marker. Protected financial fields remain denied in the exercised cases.

`index-trust-boundary.audit.test.cjs` is a diagnostic reproduction, not a passing security certification. Its KNOWN UNSAFE tests intentionally demonstrate successful attacks. Run with `PAYMENT_RULES_AUDIT_FILE` pointing to the exact Rules file and `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`. Without the file override it audits the repository staging prototype.

A client adapter is not a security boundary. Simply removing the three fields from Staff's allowlist blocks legitimate source changes; requiring source fields to change alongside metadata still permits forgery. Type checks and a schema number do not validate the normalized key. The existing asynchronous Cloud Function leaves an interval of missing/stale query results and is not synchronous enforcement.

## Changes in this branch

- Production indexed V1 builds refuse to run, including direct `buildSite(enableIndexQueries:true)` and the three-YES environment path. The refusal happens before output creation. Normal builds keep legacy duplicate checking.
- Fix public SDK `FieldPath` selection in mergeFields and supported lookup-field updates; indexes follow the actual selected source fields atomically.
- Reject unsupported source transforms on add/full-set paths consistently with transactional paths.
- Preserve Staff workflow edits on legacy PAID rows: workflow-only writes no longer opportunistically add/repair forbidden lookup metadata. Source changes still recompute atomically. This intentionally leaves legacy repair to the privileged bounded migration, while indexed reads remain blocked.
- Permission/writer tests can load the exact production Rules through `PAYMENT_RULES_AUDIT_FILE`.

## Verification

- 43 emulator tests pass against the exact uploaded Rules: 4 diagnostic/release-hold tests, 28 permission tests, 11 writer tests. This includes successful attack reproductions and therefore is NOT a statement that Rules are secure.
- 183 regression/index tests pass.
- Deployment syntax gate: 32 script blocks, 9 HTML files.
- Production build succeeds with optimization disabled; eight Firebase configs and three guards verified.
- Vercel production at inspection: deployment `dpl_EANci6kMqmnRWXVCToddQfGqbhEc`, READY, main commit `347a6e9865c6c4972a7632633ef807800fcf2918`.
- Vercel environment inspection found only the existing `PAYMENT_APPROVED_MANIFEST_SHA256`; none of the three YES approvals was set. No environment variables were changed.

## Remaining release blockers

1. Implement an authoritative synchronous validation/write boundary that produces the exact Unicode-normalized V1 key and MEP classification, while retaining existing Rules authorization for every operation. A trusted server write path or server-issued validation proof requires coordinated backend/client/Rules rollout and end-to-end tests. Do not claim that a browser calculation proves an adversarial client wrote a valid key.
2. Replace diagnostic attack acceptance with denial assertions against the candidate and exact deployed Rules. Cover Staff create, update, deleteField, merges, batches, transactions, paid workflow, Admin and fixed-owner permissions.
3. Verify deployed Rules identity and all external Admin SDK/console writers. The uploaded file establishes supplied content, not live deployment identity.
4. Obtain current, inspectable backfill and restorable-backup evidence. Prior chat claims of two clean 1,999-row audits are not current release evidence; no live audit was run here.
5. Remove the release hold only in a separately verified implementation. Do not set any of the three YES values or the readiness marker until all checks are established.

No changes to production data, deployed Firestore Rules, marker, backup, or backfill were made. This branch is a safety mitigation and writer-correctness fix, not authorization to activate V1.
