# Christmas Tree 2026 — Admin preview

- Separate shadow DOM, CSS and JS. Payment business logic unchanged.
- Admin-only mount after approved profile. Unmount on auth state change. No Firebase reads, writes, listeners or external messages.
- Local data keyed by Firebase UID: own tree and explicitly sample colleague. Pastel / Chalet, 4 colors, 16 ornaments, click placement, undo, greeting and preview reveal.
- Preview link only opens own Admin demo, not a real shared tree. Staff and signed-out users have no entry point.
- Future internal release: shared tree collection, authenticated approved profiles only, on-demand reads, per-message writes, server/rules enforcement of recipient-only content and Dec 23 2026 00:00 Asia/Ho_Chi_Minh reveal. Do not enable until Admin approves.

- Personal mini tree visible at lower-right on Payment, shows actual local tree color/style/ornaments; clicking opens own editor, minus/plus toggles persisted per UID. No sample colleague data on mini tree; no new network data calls.

- User-defined tree nickname (up to 32 characters), shown in editor and mini tree; default is localized My tree, not account full name. Preview reveal date is December 23, 2026, 00:00 Vietnam time.

## Shared storage implementation
Published trees, gift metadata and private wishes use noelTrees2026 only; staff gate noelTreeConfig2026/settings. Staff checks one config doc on sign-in; directory and gifts fetched on demand. Admin must paste ONLY security/noel-tree-2026.rules.fragment into verified current live Rules and test actual sending before clicking Enable staff. Do not deploy a historical full ruleset. Own miniature updates when receiving a refresh/open, not realtime. Existing preview items stay local. Shared ornaments are distinct from local decorations. Wishes unlocked server-side December 23 00:00 UTC+7; Admin preview button only reveals local test messages.

## Expanded personal appearance
Five display widths XS 112, S 165, M 240, L 325, XL 420 px (bounded by viewport), local per UID; three caption modes; 12 tree colors; 81 ornament designs with six themed categories, multilingual search, and reusable inline SVG/emoji artwork. Old IDs remain valid. The shared client and proposed Rules accept the same catalog; Firebase Rules still require live activation. No new reads or writes for appearance changes.

## Staff release
Both Admin and Staff can select Winter Blue, Chalet or Off; existing preferences remain. Tree editor available to approved Staff, initially collapsed for new Staff. Demo tab and demo link removed. Share my tree publishes the user's name, color, style and own ornament positions (no private messages), then copies the real UID link. No gate read at login. Shared Firestore access opens to approved users only once the updated fragment is merged into LIVE rules. Until then, local decorating works, shared errors are explicitly reported and no false success is shown. No other collections or Rules are modified.

## Current release hold — supersedes Staff tree release above
Christmas tree feature mounts for Admin only, including direct tree links. Staff retains independent Winter Blue / Chalet / Off theme selector. Existing local decorations remain untouched. Proposed Noel-only Rules fragment is Admin-only until explicit Staff release; this change does not publish live Rules.

## Staff release authorized — 2026-11-26
The temporary release hold is lifted at the owner's request. Approved Admin and Staff can use the tree, with Staff initially collapsed if they have no saved preference. The Noel rules fragment now allows approved users. Live Firestore Rules still must be updated by the project administrator (only noelEnabled2026 return expression); no other rules or financial data changed. No end-to-end gift persistence test is asserted.

## Received gift arrangement
Only the receiving tree owner can move or hide/show received gifts. Hidden gifts remain in the owner's selector and their private wishes remain intact. Shared viewing excludes hidden gifts. The new `allow update` clause in gifts must be inserted into current live Firebase Rules; no other permission changes. Each arrangement is a single explicit gift metadata write; no realtime listeners.

## Noel garden release
Page capacity 40 canopy ornaments + 8 ground gifts; older ornaments preserved, excess is displayed on additional pages without rewriting old documents. The owner may choose page colors and a local featured tree, move ornaments between pages, scale and rotate or explicitly auto-arrange the current tree. Personal decoration maximum 300; page maximum 100. Gift and wish reads are on-demand and no longer silently truncate at 100. Wishes remain private and locked by server Rules until Dec 23 Vietnam time. Replace only the Noel fragment in live Rules with the current revision; old gift documents remain compatible. Do not replace the full Payment rules.

Capacity increased to 40 with 40 distinct canopy arrangement positions. Dense arrangements use smaller ornaments only when the owner explicitly runs auto arrange; manual positions are not rewritten. Legacy unassigned ornaments are laid out against the new capacity and may appear on an earlier page. No Rules changes required.
