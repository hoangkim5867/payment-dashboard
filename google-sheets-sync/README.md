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