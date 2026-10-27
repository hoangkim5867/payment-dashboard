# Private 2026 history

- Documents: `paymentHistorySources2026/raw`, `paymentHistorySources2026/clean`.
- Fields: `schemaVersion=1`, `rowCount=812`, `sha256` (SHA-256 của JSON ổn định sắp xếp các khóa object), `rows` (mảng đầy đủ), không trùng lặp sang `payments`.
- `rows` cần single-field index exemption để tránh index mảng lớn. File ví dụ: `firestore.indexes.HISTORY_EXEMPTION_SAMPLE.json` (PHẢI MERGE với file Index hiện hữu, không thay đè cấu hình khác).
- Quyền đọc: verified `authUsers` (theo Rules được duyệt); quyền ghi: trusted UID Admin, danh sách bị từ chối.
- 2 documents dung lượng JSON ~223KB + ~243KB; verify Firestore document under 1MiB limit, và không thay đổi 825 record Cash Control.
- Bộ migration chỉ dùng original source trên máy riêng, không xuất JSON thanh toán gốc vào ZIP public.
- Bật **index query marker** là vấn đề KHÁC với chuyển history. Không được bật `ready` trước khi index đồng bộ và rules khóa quyền sửa marker.
