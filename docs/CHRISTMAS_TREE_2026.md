# Christmas Tree 2026 — Admin preview

- Separate shadow DOM, CSS and JS. Payment business logic unchanged.
- Admin-only mount after approved profile. Unmount on auth state change. No Firebase reads, writes, listeners or external messages.
- Local data keyed by Firebase UID: own tree and explicitly sample colleague. Pastel / Chalet, 4 colors, 16 ornaments, click placement, undo, greeting and preview reveal.
- Preview link only opens own Admin demo, not a real shared tree. Staff and signed-out users have no entry point.
- Future internal release: shared tree collection, authenticated approved profiles only, on-demand reads, per-message writes, server/rules enforcement of recipient-only content and Dec 25 2026 00:00 Asia/Ho_Chi_Minh reveal. Do not enable until Admin approves.
