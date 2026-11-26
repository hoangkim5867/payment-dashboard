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
