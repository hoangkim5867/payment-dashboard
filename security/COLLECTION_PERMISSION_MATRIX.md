# Collection permissions derived from the inherited UI

All tests and mutations use local demo Firebase projects only. These are prototype Rules for review; no production Rules were changed.

| Collection | Reads | Creates / updates | Deletes |
|---|---|---|---|
| authUsers | Own active profile or Admin directory | Existing trusted bootstrap Admin; valid role/status | Trusted bootstrap Admin |
| payments | Approved Admin/Staff, including cross-month duplicate lookup | Payment role/month policy; month/amount/text constraints | Admin or caller-owned Excel batch Undo |
| activityLogs | Approved Admin/Staff | Append only, actor UID and server timestamp | Denied |
| cash_control_private | Approved Cash owner with fixed UID and matching email | Owner; list/map/type validation on create and update | Denied; the inherited Clear/Delete UI edits rows within the document |
| paymentHistorySources2026 | Approved direct get of raw/clean, no list | Trusted bootstrap Admin | Trusted bootstrap Admin |
| systemConfig/paymentLookupV1 | Approved direct get | Trusted bootstrap Admin | Trusted bootstrap Admin |
| contracts | Approved Admin/Staff lookup | Admin CRUD; Staff Excel sync creates own-source records, changes PIC and fills empty master fields | Admin |
| vendorMasters | Approved Admin/Staff lookup | Approved create/upsert bank list; Staff cannot rename stored company | Admin |
| paymentArchives | Approved Admin/Staff | Admin; month identity and list/type validation | Admin |
| paymentArchiveDetails | Approved Admin/Staff | Admin; month identity and row-list validation | Admin |
| cash_flow_monthly_snapshots | Approved Cash owner with fixed UID and matching email | Owner; Cash and Plan share partial merge maps | Owner |
| appSettings/staffDirectory | Approved Admin/Staff | Admin; names map and metadata only | Admin |
| messages | Approved Admin/Staff recent query | Approved append with bounded text/image and server time | Admin moderation only |
| Unknown paths / nested collections | Denied | Denied | Denied |

Compatibility: do not make contracts Admin-only for all writes. Staff Excel import automatically creates contracts, updates PIC and fills blanks, so those paths are explicitly retained. Staff vendor bank upsert also remains available. Plan Review UI remains owner-only; Funding data is owner-only. No public financial data is served by these Rules.

Validators run on resulting document for both create and update. Existing optional fields are retained; unknown paths are denied. Domain list elements in Cash/archive retain existing rich schemas and are not reinterpreted or simplified by these Rules. Read access does not imply write access.

Review security/firestore.rules.PROPOSED_STAGING_ONLY and the test logs before deployment. The complete business acceptance result is tests/BUSINESS_ACCEPTANCE_RESULT.json. Production access requires separate user authorization.
