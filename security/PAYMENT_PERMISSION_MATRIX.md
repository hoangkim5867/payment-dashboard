# Payment permission matrix derived from the inherited UI

No production change. Applied and tested only against local Emulator.

| Operation | Admin profile | Staff profile |
|---|---|---|
| Read Payment for month UI, cross-month duplicate and MEP lookup | Yes | Yes; full historic lookup retained because the existing preview uses it |
| Create pending Payment | Any valid month | Chosen valid plan month, as the existing Add/Excel month control permits; creator UID must match caller; no admin result/workflow flags |
| Edit pending Payment | Yes | Existing row in current month, not deleted/paid/cancelled/carried; inherited form/bulk fields include moving its plan month |
| Approval, Banking, actual payment result | Yes | No |
| Cancel/carry/archive, Plan Review fields, UNC metadata | Yes | No |
| Physical delete | Yes | Only own Excel import rows across their chosen months, supporting Undo Last Import |
| Read authUsers | Own or Admin | Own only; directory/config reads remain separate |
| Write profiles/roles | Existing trusted bootstrap Admin UID only | No |
| Cash private | Approved fixed owner UID and matching email | No other accounts |
| Audit logs | Append with actor UID and server timestamp | Same; no rewrite/delete |

Sources: applyPaymentResultRoleUI, applyRoleUI, canSelectPaymentRow, isPaymentWorkflowLocked,
cancelPayment, carryPaymentForward, soft-delete handler, confirmBulkProcessBtn, Excel import/undo.
Profile role and active flags are checked from server-held authUsers, not request payload.

Important compatibility details: historical read-only UI remains unchanged; server denies historical
Staff writes even after temporary viewing access is granted. Admin paid-history correction remains
available. Import now stamps createdByUid so Undo can be authorized; old rows without creator proof
require Admin to undo. This is fail-closed handling of unverifiable legacy ownership, not data deletion.
Current month follows the task's UTC+7 locale and rolls over using server request time.
