# Firestore client-side read audit (2026-10-28)

This change adds only browser Console diagnostics beside existing Firestore queries. No new Firestore calls, writes, persistent storage, Firebase Rules changes, indexes, or altered payment calculations.

In a trusted browser, open Developer Tools > Console and filter `[Firestore Read Audit]`. Records include:
- Payment desktop/mobile: first listener snapshot, month or ALL, documents returned, cache metadata.
- Contract Master MEP: pre-existing `[Payment Read Audit] Contract Master MEP` log.
- Cash Control: plan months, actual-paid months, and project queries, with returned counts.
- Payment Export Excel: Export Watch log-query pages, with returned counts.

Logs disclose aggregate counts/month/project within that user's local developer console. They are not server-side usage logs and are not equivalent to billable read counts; Firestore Usage aggregates all clients and may include reconnect activity invisible to these first-snapshot logs. Do not assume a one-to-one match with Cloud Usage. No raw payment record or identifiers are logged by the new code. Keep indexed-query rollout blocked until all historical records and writer paths are certified.
