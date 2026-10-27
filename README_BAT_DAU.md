# Payment MASTER — bảo vệ lịch sử 2026 và arming indexed reads

**Mốc mã nguồn kế thừa:** `Payment_MASTER_ONE_PACKAGE_FINAL_REVIEW_20261023.zip` (Stage 1–7 tích lũy). Tất cả các trang khác tiếp tục từ mốc đó.

## Đã sửa mã nguồn, có thể xác minh offline

1. `site/payment.html`, `site/payment-mobile-renderer.html`: **đã xóa hẳn 2 mảng lịch sử tài chính khỏi HTML**. Không tách mảng này ra `.json` hoặc `.js` công khai. Các hàm nghiệp vụ lịch sử cũ được giữ lại.
2. Đọc lịch sử **chỉ sau khi Firebase Auth và `authUsers` hợp lệ**, từ `paymentHistorySources2026/raw` và `/clean`. Hai tài liệu 812 dòng được kiểm tra `rowCount`, schema và SHA-256 canonical trước khi hiển thị; lỗi thì báo lỗi, không âm thầm coi lịch sử trống. Đọc tối đa 2 tài liệu mỗi lần tải và cache trong phiên. Đăng xuất/chuyển người dùng sẽ hủy dữ liệu đã cache.
3. `site/contract-master.html` và Payment desktop/mobile: **đã mở cờ mã đường truy vấn tối ưu**, nhưng chỉ sử dụng khi tài liệu marker `systemConfig/paymentLookupV1` được tải trực tiếp từ server và có đủ `ready/schemaVersion/continuousMaintenance/verified/synchronousWritersVerified/historySourceSeparated`. Nếu marker chưa được duyệt, sử dụng truy vấn cũ, đảm bảo không bỏ sót IPC.
4. Bản Rules bảo vệ **riêng** `paymentHistorySources2026` và marker; sửa broad catch-all để không cấp quyền qua một match khác. Duy trì Rules đã biết của các collection còn lại, chưa tự động đẩy Rules thật lên Firebase.
5. Migration tool `migration/history-import.cjs` **không chứa** bất kỳ dòng thanh toán gốc nào. Nó đọc nguồn HTML gốc từ ổ đĩa của quản trị viên, kiểm tra SHA gốc, chỉ ghi sau khi yêu cầu `--apply`, từ chối ghi đè tài liệu cũ khác checksum và xác minh dữ liệu sau khi ghi. Ghi production cần phê duyệt đa lớp. **Không chạy script trên Firestore production khi chưa có backup/quota/kiểm thử.**
6. Hai khối `HISTORY_2026_EDITED_PREVIEW` vẫn là `null` như phiên bản tích lũy.
7. Sửa kiểm tra giới hạn khóa truy vấn dùng **byte UTF-8**, tránh Firestore cắt bớt chỉ mục với ký tự Unicode dài.

## Vì sao CHƯA THỂ thay ngay web chính?

Trang web HTML không còn lịch sử gốc; vì vậy **bắt buộc** chuyển 2 bộ lịch sử có kiểm tra vào Firestore được bảo vệ *trước* khi deploy. Điều này **chưa được thực hiện trên production**. Không thể sửa frontend rồi deploy đơn lẻ: các chức năng lịch sử/MEP sẽ báo thiếu dữ liệu.

Để tránh marker cũ vô tình bật cơ chế indexed, bản mới bổ sung hai điều kiện `synchronousWritersVerified:true` và `historySourceSeparated:true`. **Không được đặt chúng bằng tay nếu chưa có bằng chứng.** Đường chỉ mục cũng chưa thể bật thực sự chỉ với cờ frontend. Marker chưa được bảo vệ trên Rules production hiện tại, dữ liệu `payments` hiện chưa được backfill, và backend trigger theo sự kiện là **bất đồng bộ**, có thể trễ sau ghi. Phải kiểm thử đầy đủ toàn bộ các nguồn cập nhật Payment (Payment, Plan Review, Archive, Cash Control, Admin batches) hoặc chuyển sang đường ghi đồng bộ. Nếu không, có thể bỏ sót IPC mới sửa. **Không tự động đặt marker `ready:true`.**

## Điều kiện phát hành theo đúng thứ tự

1. Backup/restore dữ liệu và xác nhận số liệu, quyền Admin/Staff production; chuẩn bị Firebase staging khác production.
2. Kiểm thử Rules đề xuất (`security/firestore.rules.PROPOSED_STAGING_ONLY`) bằng Firestore Emulator **hoặc staging riêng**; Staff chỉ được đọc tài liệu lịch sử nếu có hồ sơ, chỉ UID Admin được ghi. Kiểm tra các Rules còn lại không bị ảnh hưởng.
3. Chuyển 2 bộ lịch sử từ HTML gốc trên máy riêng vào staging bằng `migration/history-import.cjs`; xác minh SHA-256 bằng đọc lại.
4. Kiểm thử toàn bộ History Center + MEP (desktop/mobile), xuất Excel, UNC, Payment Archive, Plan Review và chốt số liệu. Đảm bảo không tải lại 812 dòng nếu không dùng đến.
5. Backfill `payments` trong staging bằng `backend/backfill-index.cjs` sau khi xác nhận tất cả writer. Kiểm tra lại truy vấn chỉ mục với dữ liệu thực và thử đồng thời thêm/sửa/xóa nhiều phiên, nhập trùng xuyên tháng. **Trigger async một mình không đảm bảo chỉ mục đồng bộ tại thời điểm đọc**.
6. Áp dụng Rules production có kiểm thử, migrate history có backup, rồi mới deploy site sạch vào preview được bảo vệ. Khi đã có bằng chứng backfill và bảo trì đồng bộ, Admin mới đặt marker `ready:true` cho đường đọc indexed và theo dõi số read thực tế.
7. Đưa production sau khi toàn bộ kiểm thử đạt và có rollback về website trước đó. KHÔNG upload lại HTML cũ chứa mảng dữ liệu tài chính.

## Kiểm tra hiện tại (offline)

```sh
node --test tests/index-v1/*.test.cjs tests/secure/*.test.cjs
node tests/test_import_two_pass.cjs
node tests/test_mep_targeted_refresh.cjs
node tests/test_export_watch_fallback.cjs
python tests/verify_js_syntax.py
node migration/history-import.cjs --source=/duong-dan-rieng/payment.html
```

Lệnh migration cuối cùng ở chế độ `DRY RUN`, không kết nối Firebase.

## Phạm vi phân quyền lịch sử

Quy tắc đề xuất hiện cho **mọi hồ sơ `authUsers` được duyệt** đọc hai tài liệu lịch sử (để giữ chức năng tra mã MEP của Staff); **chỉ UID Admin đã được tin cậy được ghi**. Đây là cải thiện so với dữ liệu từng nằm công khai trong HTML, nhưng **chưa phải phân quyền hàng dữ liệu theo tháng**. Không hiểu nhầm là chỉ Admin mới đọc được 812 dòng. Nếu cần Staff chỉ xem lịch sử giới hạn, phải tạo tập dữ liệu MEP/lookup tách riêng.

## Giới hạn xác minh

Kiểm thử hiện tại là tĩnh và giả lập loader; **chưa chạy Firestore Emulator**, chưa có quyền xác nhận Rules production đã publish, chưa backfill production, chưa đo quota mới hay kiểm thử giao diện bằng browser trên hệ thống thật. Không gọi bản này là production-ready.
