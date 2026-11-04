# Contract-first candidate lookup V2 — controlled production activation

## How contract-first lookup avoids false negatives
The previous draft filtered by `ipcDigitsV2`: dozens of contracts commonly share IPC001, so the query still returned unnecessary documents. This revision filters **by contract number first**, then performs the ORIGINAL complete comparison (Project + Contract + IPC, amount/status/month priority) on all candidates.

- `contractDigitsV2` is a *coarse*, independently verifiable candidate key: take the ASCII digits of `contractNo`, then remove every `1`. Example `CSCECVN-SEA-MEP-LAB-002` → `002`.
- Why ignore digit `1`? The existing production normalization can insert `1` in **EATON PARK P → P1**. If we used all raw digits, equivalent contract numbers might fall into different query buckets. Removing `1` is deliberately conservative, even though some unrelated contracts collide.
- PHU HUNG → PH, punctuation, diacritics, and spacing aliases preserve the remaining ASCII digits. Equal normalized contract numbers therefore always share the same candidate key.
- The Rules calculate `contractNo.replace('[^0-9]','').replace('1','')` and require the value to match. Unlike exact V1 normalization, it is independently checkable by the server.
- All original same-month and cross-month duplicate checks still run on returned candidates, including cross-project, amount, paid status, split payment warnings, and original alias normalization. The coarse key is **never** proof of a duplicate.
- Contract numbers without significant digits, or numbers containing only digit `1`, may have a broad empty key, so their queries can still read many rows. No fixed read-count claim is made.
- Updates of `contractNo` atomically update the V2 field; changes only to IPC do not require changing the contract candidate key.

## Current production migration state (4 November 2026)
- The Admin reports one verified encrypted backup and two full clean audits of **2,003** Payment documents: 0 mismatches, 0 errors. Treat the user-reported audit as evidence, not a permanent invariant: new writes can happen between verification and activation.
- Production currently has **TRANSITION Rules** published and V2 automatic writers deployed. The legacy duplicate scan is still active; no readiness marker was activated.
- Strict production candidate: `security/firestore.rules.V2_STRICT_REVIEW_ONLY` (same compiled Rules as Emulator-tested `V2_STAGING_ONLY`; the test asserts exact equality below the header).
- The new HTML release has V2 candidate code compiled, but it requires **marker activationVersion=3**. Without that marker it ALWAYS runs the original full-history duplicate check, preserving functionality.
- The release metadata `contractV2ReadyToActivate` is true only on the production build if both Payment pages and the writer are present; staging builds forcibly disable V2.

## Final activation order
1. Instruct **all Staff to close and hard-refresh old Payment tabs**; confirm no one is writing Payment during the Rules swap. Old clients not writing the V2 key will be denied by strict Rules.
2. In Firestore Console publish `security/firestore.rules.V2_STRICT_REVIEW_ONLY` (not the transition file). Preserve/export the current Rules as a rollback copy, and ensure no unexpected modifications since last comparison.
3. Verify Staff/Admin can still save and edit **synthetic, nonfinancial test rows in Emulator** and that production users can read their ordinary Payment view. Do not create synthetic financial rows in production.
4. Deploy the controlled V2 release built from this PR: it does not require a marker to keep legacy duplicate checks working, and V1 remains disabled.
5. Admin uses `admin-index-v2-contract.html` → Step 4, confirms strict Rules, backup, current Staff code, then clicks **Kiểm tra lần cuối và bật V2**. This explicitly initiates ONE final full server audit (about 2,003 reads). The marker is created only if every current document has a correct `contractDigitsV2` and an activated V2 production build is verified. The marker stores `ready:true,schemaVersion:2,activationVersion:3,candidateType:'contractDigitsV2',rulesVerified:true,backfillVerified:true,synchronousWritersVerified:true,continuousMaintenance:true,verifiedPaymentCount:<count>`.
6. Verify same/cross-month Excel warnings for Admin and Staff, and use Firebase Usage and browser `?firestoreAudit=1` to confirm reads have decreased; client audit counts are not billed reads.
7. If a problem occurs, Admin clicks **Tắt tra cứu nhanh V2**. This sets marker `ready:false` and restores full-history duplicate checks (read-heavy but correct), without altering any payment data.

**Never enable V1 / the three historical YES switches.** A missing/unreadable V2 marker means the app uses the original full duplicate scan; no new functionality is blocked during staging. No automatic background reads or production data writes are initiated by merely opening the Admin page.
