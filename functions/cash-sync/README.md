# PHU HUNG Cash → Sheets | Firestore event outbox (staging only)

## What exists now
- Cloud Functions v2 Firestore triggers for `cash_control_private/lehoangoanh` and `payments/{id}`.
- Only `PHU HUNG` is considered; old and new affected months are retained when a date changes.
- No polling, no `getDoc` / `getDocs` in the event handler. An eligible event creates one small, idempotent `cash_sync_outbox/{sha256(event)}` record; duplicate deliveries do not create duplicate records.
- Noncash Payment metadata changes and unpaid Payment plan edits produce no outbox write.
- Changes to legacy overrides/deletions where the affected history is not in the event are marked `needs-review`. This is intentionally fail-closed.
- This is **event capture only**. Outbox items marked `awaiting-reconciler` are NOT automatically synchronized to Sheets. **Do not describe this as unattended Google Sheets delivery.**

## Why it is not turned on
The existing browser OAuth token cannot be used by a server after the browser closes. To finish unattended delivery, a separately authorized Google service account must be granted editor access on the intended TEST spreadsheet. The worker must read the authoritative source and historical balance baseline, revalidate row hashes, serialize concurrent updates, retry idempotently, and then mark a job complete. It must never write the original `PHU HUNG` historical tab. There is no approved credential, release gate or deployed worker yet.

## Deployment is deliberately NOT performed
This package is separate from Vercel; a Vercel READY status does not deploy Firebase Functions. The following is a deployment design, **not a request to execute**:
1. Validate the Firebase project is **cash-control-staging**, not `cscecmep-payment`; verify Firebase billing, Cloud Functions/Eventarc permissions and Firestore Rules for `cash_sync_outbox`.
2. Install dependencies within `functions/cash-sync` and run the Node tests from the repository root.
3. Only after an authorized deployment review, use the separate Firebase configuration:
   `firebase deploy --config firebase.cash-sync.json --project cash-control-staging --only functions`
4. Even after deployment, leave `CASH_SHEETS_OUTBOX_ENABLED` unset until a worker, monitoring and rollback exist. Deploying triggers with the flag unset may still incur function invocations, but creates no outbox documents.

## Cost model
There is no new Firestore polling loop and no extra Firestore document read in the event receiver. Firestore events / Cloud Functions invocations may be billable. Enqueuing a relevant event incurs **one outbox document write**, plus any storage or subsequent consumer work. When a worker is implemented, its Firestore reads/writes, Google Sheets calls and cloud processing will require separate measurement. Never promise zero total billable operations.

## Data security
The queue stores no bank numbers, payees, amounts, or source JSON. Only a project key, affected month(s), trigger identity, brief reason codes and status are saved. Event IDs are deterministically hashed for deduplication. An admin-only server credentials and Rules review is required before activation. No Google OAuth token or service-account secret may be embedded in HTML or committed to GitHub.

## Regression
`node --test tests/cash-sync-outbox.test.cjs`
CI/Vercel build also runs this suite, but it tests only the pure event selection and outbox client adapter; it is not a deployed Cloud Functions emulator test or a live Google Sheets integration test.
