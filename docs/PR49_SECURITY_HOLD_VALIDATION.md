# PR #49: Staff lookup metadata containment

Validated locally on 2026-11-03 against Firestore and Auth Emulators. No live
Firestore documents were changed. Production Rules and deployment verification
remain pending Firebase authentication. Keep this PR draft until that release
check is complete.

## Behavior

- Staff cannot create the three V1 metadata fields or change/remove existing
  metadata through updates, replacement, merge, FieldPath, batches or transactions.
- Removing a field that never existed is a harmless no-op; the attack test now
  distinguishes that from deleting an existing protected value.
- The production adapter exports native SDK writers while V1 is held. It does
  not calculate metadata, add transaction reads, restrict valid FieldPaths or
  reinterpret SDK write overloads. Read instrumentation remains intact.
- Legacy duplicate behavior is preserved: existing IPCs produce a supplemental
  payment warning; identical rows within a single paste are blocked.
- Existing metadata may become stale after a valid business edit. It is not
  authoritative. Indexed V1 reads stay blocked at build time, irrespective of
  the three approval environment variables. No marker/backfill is activated.

## Rules provenance

The supplied file `Văn bản đã dán (1)(20261103-091615).txt` has SHA-256
`8fab1d39c707b1a9d80b3a249f21d72647df134317a7ad7ac078dca64c3ffbc6`.
The candidate Rules have SHA-256
`34dff4ba9eb09394afe0e8d7712418d489c402882100c0d8edc8466bdfbac96b`.
Comparison with the supplied Rules shows only the Staff metadata create/update
restriction, relocation of the unchanged paid-workflow helper, and comments.
Other collection policies and Admin/Staff business permissions are unchanged.
The supplied file is a baseline, not proof of the currently deployed release.

## Validation

- 197 offline regression tests passed.
- The complete configured Emulator suite passed 91 tests. The expanded boundary
  suite then passed all 6 tests (one additional case beyond that full run).
- Staff load tests: 400 + 450 creates, 450 IPC updates, four concurrent sessions
  with 40 increments, failed-chunk atomicity, owned Undo and unrelated-row retention.
- Actual Chrome / Firebase Web SDK 10.12.2: Admin and Staff on desktop and mobile
  each passed manual save, Excel import, server readback, no metadata synthesis,
  existing-IPC warning, in-paste duplicate rejection and import Undo. Production
  backend requests were blocked by the browser harness.
- Additional offline checks: 14 preflight, 36 two-pass import, 406 duplicate
  equivalence, 16 MEP refresh and 10 export fallback assertions passed.
- Deployment JavaScript gate passed: 32 inline blocks across nine HTML files.

The configured `emulator` command now includes the metadata attack test; the
large-writer test checks the actual legacy hold behavior rather than requiring
Staff to write forbidden indexes. Dormant index-adapter tests remain for future
development and do not certify V1 activation.

## Release checks still required

1. Authenticate to `cscecmep-payment`, read the exact active default-database Rules
   release and compare with the supplied baseline. Investigate any extra changes.
2. Require the PR checks to pass on the final commit. Publish the native-writer
   frontend and the tested Rules together; verify the production deployment SHA.
3. Read back the active Rules release and compare its content with the tested
   candidate. No deployment is considered verified until that comparison matches.

Do not set any of the three YES approvals, change `systemConfig/paymentLookupV1`,
backfill indexes, or modify production Payment data. An already-open old browser
can still attempt the old metadata writes and will need a refresh after release.
