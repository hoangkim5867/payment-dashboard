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
