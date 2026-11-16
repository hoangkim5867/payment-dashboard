# S13-2 · October 2026 · production write release checkpoint

**Status: PROPOSED / NOT AUTHORIZED FOR PRODUCTION WRITES.** Do not turn on production flags or edit historical sheets as a result of this document.

## Confirmed and reusable evidence

- PR #124, read-only Production build: `b4787034c4d44fd1fb082e3a3f899f7af2973048` (READY, 5/5 Actions PASS).
- Authenticated Admin production UI, user-supplied screenshot on 2026-11-16:
  `S13-2 · 10/2026 · Khớp 3/3 dòng với dữ liệu đã ghi TEST. Kiểm tra chỉ đọc. Chưa cấp phép ghi Production.`
- UI logic reports this exact outcome only when `identitiesMatch`, `postingMatches`, and `labelsMatch` are all true and the Cash Control private metadata `revision` and counts match the Admin's local snapshot. This compares source postings with the known TEST fixture; it is **not** fresh Google-original reconciliation.
- Separate, previously confirmed Google TEST replay: 4 Cash Control source IDs grouped into 3 October postings, first run wrote/read back 3 machine rows, second run wrote 0, closing balance `-72,663,856 VND`, original history unchanged. Do **not** re-run this TEST.
- Never re-run the unrelated 266-row monthly audit merely to advance this release.

## Proposed single-project Google destination — not yet authenticated directly

The user's prior `CashControl_GoogleSheets_Links_Draft (3).json` maps:

- Project: `S13-2`
- **Original ledger candidate spreadsheet ID:** `1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg`
- **Original history tab candidate gid:** `1543850344`

The original spreadsheet ID matches the explicit `ORIGINAL` exclusion in `server/cash-sync-s13-test-target.cjs`. The link-list file expressly states it is a **local draft only** and does not authorize sync. Verify via signed-in Admin Google read-only metadata before treating the ID/gid and history content as approved.

Separate TEST clone (NEVER use this as a production destination): `1vmWWQVInXPtT95n5G-tHEY66YobMO0jLCxFftyAKD9k`.

## Prepared example allowlist — DO NOT INSTALL YET

Once destination and source have independent live approval, the **only** proposed value for the server-side `CASH_SYNC_MULTI_ALLOWED_TARGETS` variable is:

```json
{"S13-2":{"spreadsheetId":"1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg","historySheetId":1543850344}}
```

Do not add any of the other 34+ projects or draft targets. **Leave `CASH_SYNC_MULTI_PRODUCTION_WRITES` absent or disabled** until explicit owner approval. Merely preparing this file does not modify Vercel settings and does not enable writes.

## Remaining mandatory go/no-go proof

1. Signed-in Admin checks *original* Google file metadata, tab `gid=1543850344`, historical balance and current October rows **read-only**; confirms October's 3 postings are not already present in original or machine tabs and there are no ambiguous duplicates/history conflicts.
2. Fresh, complete and authenticated Cash Control source proof tied to the same revision and actual source IDs; September/October boundary and correct month opening / historical closing are independently verified. The read-only endpoint always returns `sourceComplete:false`, `canSync:false`. Never silently override these fields.
3. Production manual runner must pass `SOURCE_NOT_VERIFIED` gate without weakening or patching the gate and must verify a fresh signed Google preview before any commit. Preflight should show only S13-2 candidate, all other projects skipped.
4. Admin reviews the exact file ID, gid, expected new rows, projected closing balance, and rollback/skip conditions, and explicitly approves **production writing for S13-2 only**.
5. Only after steps 1–4 and approval: configure the exact server allowlist, then consider `CASH_SYNC_MULTI_PRODUCTION_WRITES=YES`; run narrowly scoped manual commit once, verify Google machine tab and no-op second execution; never write, reorder, rename, hide or delete the original historic sheet.

## Safety invariants

- Do not merge the Draft PR as a side effect of this preparation.
- Preserve all actual Cash Control and historic Google ledger data.
- No all-project Payment document scans, background listeners or automatic sync.
- With absent `CASH_SYNC_MULTI_ALLOWED_TARGETS` and `CASH_SYNC_MULTI_PRODUCTION_WRITES`, the existing server gate remains closed.
