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

## Owner-reported scoped Admin original-history comparison — 2026-11-16

The owner pasted the output of **`Đối chiếu Payment ↔ Google · chỉ đọc`**, scoped to S13-2 / 2026-10; treat as an authenticated in-app observation, not a direct Google API fetch by the assistant:

| Observed source/history fact | Result |
| --- | --- |
| S13-2 Payment loaded / canonical Firestore project count | 166 / 166 (count equality **does not** prove alias/legacy completeness) |
| Original Google ledger rows observed | 258 |
| Google rows from 2026-10 onward in comparison scope | 0 |
| Cash Control October export rows | 3 |
| Possible new source postings | 3; no already-matched Google posting, no overlapping same-month matches, no ambiguity |
| Unmatched Google October rows | 0 |
| Date-order inversions in existing historical ledger | 2; **do not sort or rewrite original history** |
| Unparseable dates / schema errors / balance-chain discrepancies | 0 / 0 / 0 |
| Reported Google writes | 0 |
| Final state | **CHƯA ĐỦ ĐIỀU KIỆN / no production write permission** |

The three source postings were matched to the prior real Google TEST fixture by the separate authenticated Admin source comparator (3/3); their original IDs remain distinct and include a grouped quarterly tax pair. They sum to **138,246,989 VND** in expense postings:
- 2026-10-02: Chinese employee August salary 81,463,753 VND
- 2026-10-02: August meals 3,859,500 VND
- 2026-10-20: Q3 personal income tax 52,923,736 VND

If (and only if) the **actual production original** historical closing balance equals the prior TEST clone baseline **65,583,133 VND**, then the projected closing after these three rows is **−72,663,856 VND**. The in-app scan reported zero historical balance errors, but did not provide the original balance figure or bind its real Google spreadsheet ID/gid into this shared text report. **Do not take the TEST clone baseline as fresh original-balance verification.**

### Narrow remaining checks, without repeat audits

1. Reuse the focused Admin Google scan above; **do not rerun the 266-row global report or S13-2 TEST writes**.
2. Validate live original spreadsheet ID and historical gid against the saved *draft* pair; capture actual last historical balance and historical max date, preserving two out-of-order dates.
3. Bind 166 indexed Firestore records to the correctly scoped canonical + alias Payment coverage (including deletions/legacy records where applicable), Cash Control source revision and all three immutable October posting IDs. A count match alone cannot certify business completeness; `sourceComplete:false` remains locked.
4. Only once complete, obtain a fresh read-only signed preview from the existing manual Google API for **S13-2 only**, showing the three expected new postings and projected closing balance, before any flag or allowlist change.
5. Ask the owner explicitly before any Production write authorization. Keep PR Draft and environment flags absent meanwhile.

A synthetic, scoped unit regression was added to `tests/cash-multi-project-core.test.cjs`: 258 prior rows, two date inversions, three October S13-2 source IDs, no-op replay and preservation of historic order. This fixture **does not** replace the real Google verification.

## S13-2 original Google history proof — owner-reported live result, 2026-11-16

Production `fdb1fa21148614704cbef98fbe820080122cb4d2` deployed the authenticated, **read-only** S13 original-history preflight with pinned spreadsheet ID `1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg` and historical gid `1543850344`.

The owner ran `Xác minh sổ gốc S13-2 · chỉ đọc` in Production Admin and reported:

> S13-2 · Sổ gốc 258 giao dịch · 2 ngày đảo thứ tự · 0 dòng từ 10/2026 · số dư lịch sử 65.583.133 đ · dự kiến sau 3 khoản -72.663.856 đ. KHỚP MỐC LỊCH SỬ (CHỈ ĐỌC). Chưa chứng nhận nguồn; không cấp phép ghi.

**Pass:** the application checked signed Admin + readonly Google scope, exact pinned original file/gid, 258 rows, two historical date inversions, no October rows and original closing **65,583,133 VND**. This is a scoped in-app observation supplied by owner, not an independent API call from Chat.

**Now completed / never repeat:** Google TEST first/readback/replay with 0 second writes, Cash Control 3/3 live source-to-TEST reference comparison, Google original 258-row history/balance verification, and the one-project read-only Google↔Cash comparison. Original ledger remains unchanged; no Production write approval.

**Still not certified:** 166 canonical Payment records count equality does not prove aliases/renamed project history or complete business source. Existing `cash-sync-project-source-coverage.mjs` purposefully returns `paymentBusinessComplete:false` even at `CANONICAL_COUNT_MATCH_ONLY`. Existing monthly export manifest and manual runner return/block on `sourceComplete:false` / `SOURCE_NOT_VERIFIED`. Do not force these fields to true.

**Next release work:** establish an independent, scoped, canonical+alias Payment source attestation and three October original Cash Control IDs bound to live revision, then an authenticated signed S13-only Google preview. Present exact changes and ask owner before any Production write flag change. Server allowlist remains absent; PR stays Draft. No additional global 266-row review or TEST posting needed.
