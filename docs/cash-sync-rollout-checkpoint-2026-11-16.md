# Cash Control → Google Sheets · 35-project rollout checkpoint
Last updated: 2026-11-16 · Draft PR #124 · no background jobs

## Completed: S13-2 / October 2026 (DO NOT REPEAT)

**Production posting complete, original history protected.** Owner's signed-in Admin status:
> S13-2 · GHI VÀ ĐỌC LẠI ĐẠT: 3 khoản, số dư -72.663.856 đ; tab lịch sử 258 dòng giữ nguyên. Không bấm ghi lần nữa.

- 4 independently validated immutable Cash Control source IDs → 3 Google technical-tab records. October expense 138,246,989 VND (salary 81,463,753; meals 3,859,500; Q3 PIT 52,923,736).
- Original history 258 transactions, 2 historical date-order inversions, closing historical balance 65,583,133 VND. No edits to original.
- Signed Admin TEST wrote/read back 3; second TEST run 0 changes. Signed Production preview 3 new, 0 writes. Owner then explicitly confirmed **one** real Production commit; UI returned verified readback. These reports are supplied by the Admin; no separate Google connector read has been executed by this Chat.
- **Write gate re-locked immediately:** Vercel production `CASH_SYNC_MULTI_PRODUCTION_WRITES=NO`, re-deployed READY as `dpl_DnsFMi6ySboNzPUo86NJSKfLVrfZ`. Server target allowlist still contains only S13-2 but cannot authorize writes with NO flag.
- UI follow-up fix in PR: a fresh read-only preview showing 0 changes, 261 VIEW rows (258 history + 3 technical), and closing -72,663,856 displays `ĐÃ ĐỒNG BỘ / KHÔNG BẤM GHI LẠI`; never unlocks a second commit.
- No need to rerun S13 TEST, the 258-line historical audit, source 166/166 count, or company-wide 266-line review.

## Next isolated project: ELYSIAN, October 2026 (READ-ONLY)

- Earlier evidence: Google history 777 transactions, historic balance 9,723,174,700 VND (reported in earlier read-only reconciliation); TEST included **dummy** November/December rows. This is NOT proof that October is released, and those synthetic months are not actual production transactions.
- No signed current-month complete source certification or approved real write. Historical contract/IPC matching, old project aliases, and Google technical mirror state still require scoped review.
- PR now includes `Tiếp ELYSIAN · đối chiếu riêng, chỉ đọc` button that calls the existing `ccSyncCompareProjectGoogleReadOnly()` with a readonly Google OAuth token, after checking Admin and a saved ELYSIAN Google Sheets link. One project Payment read, one Google historic tab review, no 35-project scan, no Google writes.
- The button is only a review path; do not claim ELYSIAN is ready for writing until the actual signed-in Admin result confirms it.

## Other known projects — not authorized for Production

- **PHU HUNG:** pilot/TEST history 160 original transactions, 161 in TEST view with the documented K148 ~0.3 VND reconciliation exception; fixed monthly VIEW design used as reference. Its original Production Google ledger is **not** authorized from these TEST results.
- **FOXCONN:** 271 historic Google transactions; known October grouped export 19 rows, PIT 71,141,977 VND already in history. Earlier October review found 2 potentially new rows, 3 ambiguous locations, 2 missing HĐ/IPC identities, 3 HĐ/IPC conflicts, and 6 historical date inversions. The 5.7bn VND repayment to ELYSIAN was modeled as negative revenue / signed receipt. Keep in REVIEW; do not re-run dummy 1 VND TEST.
- **ELYSIAN, EATON, C17-2 etc.:** prior reviews show unresolved source/history issues; do not treat tests or earlier draft links as release permission.
- **Other members of the 35-project catalog:** no project-by-project live source + Google evidence recorded in this checkpoint. Do not infer 0 activity, 0 source rows, or readiness from missing browser cache or draft links.

## Standard per-project release gate (reuse S13 patterns, no duplicate audits)

1. Owner Admin loads only the target project. Use the **same grouped Xuất Excel Cash Control source** and stable original IDs; source revisions and aliases/transfer offsets checked, no full Payment collection scan.
2. Check original Google metadata/gid, all history balances, missing/duplicate candidates and technical mirror idempotency **read-only**. Do not modify historical sheet.
3. When signed source and Google preview pass, ask explicit owner permission for **that project's exact source rows and month**. No generic `sourceComplete:true` shortcut.
4. Only then configure exact **one project** Vercel allowlist and `CASH_SYNC_MULTI_PRODUCTION_WRITES=YES`, redeploy, require distinct final Admin UI confirmation, commit once, read back, report post-write actuals. On any uncertainty **do not retry**.
5. Return `CASH_SYNC_MULTI_PRODUCTION_WRITES=NO` and redeploy before proceeding to another project. Keep PR #124 Draft until safe to release the general process.

**Costs and safety:** no background listeners, no Apps Script timer, no automatic browser-authenticated scans, no broad Firebase reads. Distinguish local code/tests from real owner-reported Admin observations. Never use a draft Google link as authority to write.

## ELYSIAN signed-in Admin result received 2026-11-17 — source/history REVIEW, not released

User-provided October-onward one-project Payment ↔ Google read-only output:
- Payment browser loaded **630**; exact-canonical Firestore count **631**. A difference of one is NOT proof of a missing business invoice; loaded cache may omit soft-deleted rows or contain legacy aliases. No full Payment history completeness certification.
- Original Google **777** historic rows, date-order inversions **3**, layout errors **0**, balance errors **0**, unidentified date **0**; NEVER resort historic rows.
- October-onward Google **71** rows, Cash Control **76** rows, **70** same-date/seven-category monetary candidates, **6** Cash-only, **1** Google-only.
- Cash-only positions: **35** quarterly personal income tax 2026-10-20; **36** FOXCONN repays ELYSIAN 2026-10-26; **73–76** ELYSIAN subcontract invoices paid on 2026-11-13, with contract/IPC metadata supplied.
- Google-only row **745** dated 2026-10-26 has Chinese repayment description **FOXCONN归还ELYSIAN借款**. Cash row **36** has Vietnamese **FOXCONN hoàn trả ELYSIAN** same date. This is an obvious semantic counterpart **candidate only**: compare signed amounts in all 7 money columns and original source IDs before declaring a duplicate; no automatic pairing.
- Eight rows flagged contract/IPC conflicts (**26–28,32–34,37–38**) are payroll, meals, insurance or union fee. These are **noncontract expense classes**; their company/person metadata may still be unverified, but they must not be presented as missing subcontract HĐ/IPC.
- Three lines flagged missing HĐ/IPC (**68–70**) are employee home leave/family visits; verify the payroll/HR source identity instead of inventing an IPC.
- A separate earlier independent planner reported 14 candidates / 62 blockers, which has DIFFERENT matching granularity. **Do not combine** this count with the authoritative 70/6/1 same-date and 7 money-column scope or suggest 14 new payable rows.
- **No write permission**: ELYSIAN 0 Google writes; Production global write gate stays **NO**.

Code improvements on Draft PR #124:
- `site/assets/js/cash-sync-historical-audit.js` adds pure `reviewElysianExceptions` triage, using current-memory records only, with an explicit exact-date and **signed money-by-category** test for potential FOXCONN repayment counterparts, never an automatic ID match.
- Production Cash Control build injects a concise 70/6/1 source comparison with segregated non-contract HR and FOXCONN transfer warnings; it suppresses the unrelated planner's 14/62 summary in this ELYSIAN view, while retaining all underlying source/history issues and keeping `canWrite:false`.
- Additional regression tests cover personnel/HR categories, signed transfer mismatch and no write safety.
- Existing TESTs, the original 777-row history and the broader 266-row report should NOT be rerun to make progress; the next meaningful step is verifying the specific 6 cash-only / 1 Google-only items, their immutable source IDs and amounts.

This checkpoint is based on the user's authenticated UI report, not a separate Google API read by Chat.

## 2026-11-17 — user requests PHU HUNG presentation & one-sheet-only colleague downloads

**Security caveat:** A hidden Google Sheets tab is **not** access control. Any colleague with access to the ORIGINAL owner workbook may use Google Sheets File → Download (.xlsx), which can include hidden tabs. Never promise that hiding DATA_CASHCONTROL makes whole-workbook exports private. The internal workbook must remain restricted to Admin. For colleagues, share **only** a separately generated single-sheet .xlsx or, after explicit permission to create/share it, an entirely separate Google spreadsheet that contains only the public main tab.

New implementation for Draft PR #124 (source only, no production Google writes):
- `site/assets/js/cash-sync-main-only-export.mjs`: builds ONE new xlsx-js-style workbook and exactly ONE worksheet named by project from the **visible, verified `CASHCONTROL_VIEW`** (or already formatted PHU HUNG main view). Reads only **A:O** (or A:N for PHU HUNG), rejects unexpected headers, formulas/source-column fields and broken running balances; never fetches or includes hidden/internal tabs, `sourceId`, `origin`, mirror or original-history data separately. Uses the PHU HUNG-style Chinese title, period, two-tier grouped headings, zero-hidden number format, sum total, green title row, pale green header and pale blue totals. For FOXCONN preserves a separate import tax/VAT column. Balances are exported as their checked numeric values, not formulas referencing private tabs.
- Existing Production Cash Control UI gets **`Tải Excel · chỉ 1 sheet chính`**, an explicit Admin click using `spreadsheets.readonly` OAuth and the currently selected project's verified link; one metadata GET plus one main-view GET, then local single-sheet XLSX download. If a project has no verified visible main view, it fails closed — NEVER substitutes the original Google ledger or a hidden machine tab.
- `server/cash-sync-multi-project-adapter.cjs` now adds consistent green header/Arial/finance number formatting, column widths, first-row freezing and hides **internal VIEW columns P:R** in future independently approved Google technical VIEW updates. `DATA_CASHCONTROL` stays hidden. No data/formulas/original history requests changed. Existing PHU HUNG original presentation remains untouched.
- Added offline regression tests for one-sheet isolation, grouped finance layout, balances, hidden source IDs and column visibility.
- **This is not the complete 35-project Production release:** S13-2/2026-10 is completed; other projects still require source coverage and original-history identity verification. Vercel production `CASH_SYNC_MULTI_PRODUCTION_WRITES=NO`, and PR stays Draft.

Operational rule: Don't share the internal Google Sheets link with colleagues. They can download the generated one-tab Excel file from a permitted distribution channel. A **separate live, one-tab Google file with staff access** is a distinct upcoming publish feature and must have independent access controls; it has NOT been created, shared or synchronized here.
