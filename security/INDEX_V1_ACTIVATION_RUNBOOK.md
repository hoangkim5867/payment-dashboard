# Payment Index V1 — Safe one-time activation checklist

**Status: NOT ACTIVATED by repository deployment.** The Payment site already implements key-scoped Excel duplicate checks, gated by `systemConfig/paymentLookupV1`. This tool only prepares the previously unindexed payment documents. It never touches invoice amounts, documents, UNC, payment progress, or the index readiness marker.

## Preconditions (production)

1. Confirm the **exact deployed Firestore Rules** (not just `security/firestore.rules.PROPOSED_STAGING_ONLY`). Staff must NOT be able to create/update/delete `systemConfig/paymentLookupV1`. Firestore allow rules are OR-composed, so a broad catch-all can defeat the dedicated marker rule. Validate with local Emulator tests using exact deployed rules.
2. Confirm all clients and server writers of `payments` (desktop, mobile, Contract Master, Cash Control, archives, scripts, console, imports) maintain `duplicateKeyV1`, `mepLookupV1`, `paymentLookupSchemaV1` atomically. The six web pages use `site/assets/js/firestore-payment.mjs`; this does not prove unknown external integrations are safe.
3. Verify an independent **restorable backup** and select a low-traffic period **after quota reset**; the migration costs real reads/writes once. Never run in response to a quota-exceeded warning.
4. Do not enable `ready` during a partial audit, before backfill, or when duplicate key bytes exceed 1000.

## Bounded migration (manual, NOT triggered by deployment)

In an authenticated, trusted operator environment with `firebase-admin` dependencies installed:

- Read-only page (default): `GOOGLE_CLOUD_PROJECT=cscecmep-payment node backend/backfill-index.cjs --max-docs=120`
- Continue with `--start-after=<nextAfter>` from the previous JSON. Every page displays only counts and the opaque cursor; it does not log financial rows.
- After backup + Rules audit and explicit approval: set `PAYMENT_PRODUCTION_APPROVED=YES PAYMENT_BACKUP_VERIFIED=YES PAYMENT_RULES_AUDITED=YES`, then run `node backend/backfill-index.cjs --write --production-approved --max-docs=120 --max-writes=60`. Continue with nextAfter until the end. The script re-reads changed documents *in transactions*, then updates **only 3 derived index fields**, never stale business data.
- Re-run the **read-only full audit** from the beginning. Complete only if every page ends with `reachedEnd:true`, and all pages show **mismatch=0**, **invalid=0**, **errors=0**. Do a second clean audit while staff can still write, and verify all observed writers update the index. If any mismatch reappears, DO NOT activate.
- `--mark-ready` is intentionally refused by the CLI.

## Controlled manual activation only after all checks

The trusted Admin must first deploy/test Rules that prevent Staff from writing the marker. Only then set `systemConfig/paymentLookupV1` to:

```json
{
  "ready": true,
  "schemaVersion": 1,
  "continuousMaintenance": true,
  "verified": true,
  "synchronousWritersVerified": true,
  "historySourceSeparated": true
}
```

Observe an isolated emulator-equivalent test and a low-volume real import: same-month warnings, cross-month warnings, mixed projects, aliases, concurrent Staff imports, and add/edit/delete. The client re-reads the marker each lookup; when enabled the first Excel preview uses targeted `duplicateKeyV1 in [...]` (groups of 20) and fetches matching Payments only. **It still costs a small number of reads; not zero.**

**Rollback:** trusted Admin changes marker `ready:false`. This immediately returns to complete-history checking in the next preview (expensive but avoids silent false negatives). Never delete Payment rows or older lookup fields to roll back. Do not use a stale cache to authorize an import.

## Safety / limitations

The script reads at most 120 documents per call by default (up to 200); additional transaction reads (and retries) occur only for rows needing repair. It writes at most 60 by default (up to 100), with all source data untouched. It is **not** a zero-cost migration. An audit must inspect every existing document at least once to prove coverage. A live deployment cannot establish production readiness without a real, approved audit and Rules inspection.

For expensive current production operations until activation, the previously merged PR #42 prevents repeated full-history scans for the same Excel keys within a 60-second preview window and forces fresh verification before import.
