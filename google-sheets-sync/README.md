# Cash Control → Google Sheets · PHU HUNG TEST pilot

## What's implemented (draft PR #58)
- In Cash Control's **Báo cáo quản trị**, open **Đồng bộ Google Sheets (thử)**.
- Select **PHU HUNG**, month October 2026 or later.
- Preview source totals **without any extra Firestore query**; when Payment project cache is incomplete, actual sync is blocked.
- Explicit Google OAuth permission via Google Identity Services (the owner provides a valid OAuth Web Client ID with the deployment's allowed JavaScript origin).
- Browser requests **Google Sheets API** directly, using a short-lived, memory-only token. No publicly writable Apps Script endpoint or new Firebase.
- The **only writable destination** is the user-supplied TEST copy with ID `1bxY6jQ3qHJ0oTiWDmbH4eeFgZR7goqX3_s1Kz9UlfD4`, tab `DATA_CASHCONTROL`. Original `PHU HUNG` tab is untouched.
- Click **So sánh bản TEST** before a write. Compare stable Cash Control source identifiers; quarter-grouped tax rows use a quarter/date key. SHA-256 of sync fields detects remote edits.
- Click **Ghi thay đổi vào tab TEST** only after comparison with zero conflicts and explicit browser confirmation. Update existing IDs, append new IDs; unchanged are skipped. Missing source IDs and orphaned target IDs block writes. No automatic deletion.
- Retry reads the target first, avoiding duplicate appends after a partial failure when Google's previous operations are visible.

## Safety limits and known gaps
- This is **not production-ready**. The branch is behind main. Do not merge.
- OAuth Client ID and authorized origin are not configured. The connected Apps Script editor does NOT provide a usable browser OAuth client by itself.
- Vercel Preview build is blocked by the repository's separate-Firebase-staging requirement. Do not bypass or weaken that safeguard.
- Browser-side Admin guard is **not a production server-side authorization check**. Production must add a trusted server-side Admin gate.
- No real Google Sheet has been written as part of creating this code. No complete browser end-to-end test yet.
- The TEST tab is a **separate data mirror**, not merged into historical `PHU HUNG` sheet. A later step must reconcile October overlap and preserve Google Sheets' actual opening/closing balance.
- Google API writes are not cross-request atomic. If an update succeeds but append fails, retry safely by re-comparing.
- Changing project, date/month, or source IDs requires explicit reconciliation; old entries are not automatically deleted.
- Source completeness check is conservative: requires project-wide Payment loaded. Cash Control can still change after loading; a stale cache is not authoritative. Don't sync without checking freshness.
- Quarter tax aggregation is driven by the existing Excel export logic. It should be verified against actual data and source IDs before production use.
- User-configured OAuth client ID is stored in localStorage. The OAuth access token is **not** stored there.

## PHU HUNG TEST baseline
The historic tab reportedly has 182 rows, including 30 October transactions. October baseline Google Sheets totals reported in chat should be **re-verified**, not coded as trusted constants. Historical cash balance differs from Cash Control: never copy Cash Control's balance into the history sheet.

## Files
- `site/cash-control.html`: draft UI and TEST Google Sheets API pilot.
- `google-sheets-sync/Code.gs`: optional Apps Script mapping inspection and isolated TEST tab setup.
- This README documents conditions to lift before any real rollout.

## Next verification
1. Use a genuinely isolated test environment with an authorized OAuth origin and a separate Firebase staging project. Do NOT deploy the financial app with production Firebase secrets to preview.
2. Simulate missing source IDs, a manually modified test row, repeated sync, a new transaction, a changed transaction, and a partial write.
3. Verify all 19 columns, exact decimal currency, input dates, grouped taxes and transfer signs.
4. Compare every October transaction against existing historical sheet before any change to that sheet.
5. Only then consider a production endpoint with server-side Admin verification, whitelist of project→spreadsheet IDs, version-based concurrency control, and backup/rollback.

## Mock verification (November 4, 2026)
The isolated JavaScript diff logic was executed with mocked Google Sheets API responses (no real network or user data):
- Initial unsynced source transaction → 1 new, 0 blocked.
- Repeated comparison after matching hash → 0 new, 1 unchanged.
- Manual amount modification on Google side → 1 blocked, 0 updates.
- Cash Control amount change with unchanged Google record → 1 update candidate.
- Source record removed while target remains → blocked orphan, never auto-delete.
- All mock runs issued **0 write requests**.
- Pilot block parsed successfully as JavaScript.

These checks are **not** end-to-end browser, Google OAuth, Vercel or real-data acceptance tests. The known staging/authorization blockers remain.
## October transaction-by-transaction baseline guard (2026-11-04)
- The PHU HUNG Google historical ledger is fetched **read-only** via Sheets API (A:N) when checking October 2026.
- Legacy Google rows are compared against Cash Control by exact normalized date, seven income/expense amounts (to 1e-6), normalized contract number and IPC, with duplicate occurrence counts preserved.
- A mismatch blocks the Write TEST button and reports unmatched row counts. A mismatch in totals alone is not considered evidence of matching transactions.
- Legacy balance column N is never overwritten; even an exact transaction match does not assert equal opening or closing balances.
- This code has **not** yet been executed against real Cash Control October source in the browser. A historical ledger match is pending, not claimed.
- Mock checks show a matching single ledger row passes; an amount mismatch is rejected. The initial mock lacked contract/IPC strictness; that strictness was subsequently added and must still be regression-tested before release.

## Additional safeguards (2026-11-04)
- Compare the historical PHU HUNG ledger on **every sync month from October 2026**, not October alone. If there are manually pasted transactions in a later month, a date/amount/contract/IPC mismatch blocks the write. If that month has zero historical rows, the separate mirror can accept new transactions.
- Block concurrent compare/write operations while a TEST write is in progress.
- After Google reports a write, read back every changed row and verify its project, month and SHA-256 content before claiming success.
- A branch-only Node test suite and GitHub Actions workflow were added. The CI outcome must be checked; commits alone do not mean CI passed.
- All protections apply to the separate pilot mirror; they do NOT authorize a production rollout or imply the historical balance has been reconciled.

## Preview deployment blocker verified (2026-11-04)
- Inspected Vercel project `cscec-mep-payment` environment-variable metadata (no secret values read).
- There is no `PAYMENT_FIREBASE_STAGING_CONFIG` environment variable for Preview, so the existing `deployment/build-site.cjs` safety gate cannot build a Cash Control preview.
- Do **not** deploy the entire Cash Control production Firebase configuration to a separate test domain, or bypass `validateStagingConfig`. The Google Cloud OAuth project `cash-sheets-sync-test` is **not** itself a configured Firebase staging project.
- Real end-to-end Cash Control → Google Sheets TEST browser verification is blocked until a separate Firebase staging project's config is provisioned for the Vercel Preview environment.
- The isolated Google OAuth page already confirmed read-only Google Sheets API access, and Apps Script independently confirmed write access; neither proves the PR's direct Cash Control write flow.

## PHU HUNG running-balance audit (November 5, 2026)
- Added an **Admin-only, read-only** "Kiểm tra số dư PHU HUNG (chỉ đọc)" button to the TEST interface.
- Before reporting, the browser validates the selected spreadsheet ID, TEST title and historical tab; then reads PHU HUNG A:N values and the N-column formula representation.
- For adjacent dated transactions in the same calendar month, compare next balance to previous balance + income - six expense columns, using exact millionth-unit comparison. Missing/non-numeric amounts and balances are reported as unverified. Formula cells are counted but **not edited**.
- Separators, summaries, headers and month transitions are **not** automatically bridged. A passing result is a partial consistency check, not an approval to insert rows or change the ledger.
- Node mock tests cover matching and mismatching balances, headings/month boundaries, and missing balances. **CI outcome not yet confirmed** for the new head; Vercel Preview is READY but that only confirms deployment.
- The validated direct mirror flow remains separate from the historical running-balance ledger. No automatic posting into PHU HUNG has been enabled. A trusted server-side Admin authorization gate, complete historical opening/closing balance verification, transaction ordering, safe row insertion/formula handling, backup/rollback and user acceptance are still required before production release.

## Calculated PHU HUNG consolidated TEST ledger (November 5, 2026)

**Purpose:** Avoid modifying historical rows/formulas when new Cash Control payments must appear in a continuously balanced ledger.

- The Google Sheets TEST copy is the **only authorized destination**.
- New button: **Tạo sổ tự tính TEST (tab riêng)**. Requires signed-in Admin, active Google token and explicit confirmation. It creates a new timestamped AUTO_PHU_HUNG_TEST tab; it never writes, deletes or inserts any row in the original PHU HUNG tab.
- Each run reads the original PHU HUNG history A:N (values and separate formulas) and the existing DATA_CASHCONTROL mirror. It does **not** query Firebase, so no extra Firestore reads.
- Before generating: confirm all historical arithmetic transitions, N/G/H:M formula-reference coverage, historic transaction order and stable Cash Control IDs. The first dated transaction N5 is an **opening seed**, not a missing previous transaction.
- Infer the opening numeric anchor from the first historic closing balance and net flow; independently replay **every** historic balance. Reject mismatch, gap, broken formula references or decreasing original date order. No historical row is moved.
- Validate mirror project, month, stable IDs and row hashes; reject manual mirror edits and collisions with historical transaction fingerprints. Merge historical and mirror rows in an independent, date-sorted TEST view.
- Only generated N-column formulas are sent as USER_ENTERED: first row uses opening anchor in Q2, subsequent rows use previous N + current G - SUM(current H:M). All descriptions and other cells use RAW, preventing formula injection.
- Read back the whole new tab and its formulas, verifying row count, source IDs, formulas and every computed closing balance. On partial write failure, leave the incomplete TEST tab for inspection; never claim success and never overwrite another tab.
- **Not yet continuous real-time synchronization:** the generated TEST tab updates its own running balances automatically when its inputs change, but the full view is rebuilt only when the Admin triggers the button. New transactions must first reach DATA_CASHCONTROL via the existing pilot. There is no background Firebase listener and no deployment to main.
- Regression tests cover the opening seed, historical balance mismatch, formula drift, mirror tampering, duplicate protection, reordered historic dates and backdated new transactions. A mocked API write/readback path was exercised, but GitHub CI remains unconfirmed.

**Reported live TEST read-only checks:** 151 same-month pairs correct; 8/8 month transitions arithmetically correct; 160 dated formulas with 159 references to a prior dated balance (first dated row N5 is the opening seed); 178 formula cells total.

Passing those checks authorizes an **isolated generated TEST tab**, not modifying the original financial ledger or launching production synchronization.

## History-only calculated TEST view without DATA_CASHCONTROL (November 5, 2026)
- Updated the new TEST-only computed-ledger workflow to no longer block when DATA_CASHCONTROL has not been initialized. An absent tab is explicitly treated as zero mirrored Cash Control transactions.
- Still reads and verifies the PHU HUNG historical tab in full and creates a **new** independently calculated TEST view with formulas. Does not invent or read production Cash Control records and does not create a fake DATA_CASHCONTROL mirror.
- Both the confirmation and result clearly state that the generated view is **history-only, NOT Cash Control synced** when no mirrored transactions are present.
- Once DATA_CASHCONTROL has been safely populated and reconciled, a later generated view can include those new rows; prior generated views are not automatically overwritten.
- Branch regression covers historical-only construction; isolated mocked Google Sheets API exercised both with and without the mirror, including formula write and readback. Neither was yet verified by writing a real Google Sheet.
