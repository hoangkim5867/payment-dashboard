# Export Watch — chỉ mục đề xuất, chưa triển khai

- File `firestore.indexes.export-watch.SAMPLE.json` là **mẫu** composite index cho `activityLogs` với `paymentMonth` ASC và `createdAt` ASC.
- Tại code `payment.html`, `loadExportWatchChanges()` có query kết hợp hai field; khi thiếu composite index, code bắt lỗi `failed-precondition` và tải log theo thời gian **không lọc theo tháng ở Firebase**, có thể tốn lượt đọc.
- Index đúng có thể giúp Firebase giới hạn kết quả theo tháng. Không có số đo reads production trước/sau nên **không cam kết giảm cụ thể**.
- Đây không phải file đầy đủ từ Firebase Console. **Không dùng mẫu để overwrite** danh sách Index đã tồn tại; cần merge sau khi xuất cấu hình thật.
- Không sửa Rules/production và không tạo Index thật trong đợt kiểm tra này.
