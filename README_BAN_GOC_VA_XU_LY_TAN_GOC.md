# Payment MASTER — sửa nguyên nhân truy vấn đọc toàn bộ (staging only)

**Nguồn gốc:** `Payment_MASTER_TICH_LUY_STAGE6_20261023_STAGING.zip`. Giữ Stage 1–6 nguyên trạng trừ 3 trang thêm cơ chế tra cứu V1. **Chưa được thay website chính.**

## Đã làm trong bản này

1. Payment desktop/mobile: thêm truy vấn theo `duplicateKeyV1` của chính các IPC trong Excel (tối đa 20 khóa mỗi truy vấn), vẫn sử dụng hàm so trùng hiện hữu để xác định cùng tháng, khác tháng, số tiền, trạng thái và thứ tự ưu tiên cảnh báo.
2. Contract Master MEP: thêm truy vấn `where("mepLookupV1","==",true)` và tiếp tục lọc qua `isMEPHistoryPayment` cũ. Không sao chép toàn bộ bản ghi sang collection khác.
3. Có logic chuyển đổi: **nếu chưa có chỉ mục được xác minh**, giữ lại đọc đầy đủ và giữ đúng cảnh báo như trước. Lỗi truy vấn khi đã bật sẽ làm lỗi xem trước, không được tự chuyển thành “không trùng”.
4. Backend Cloud Function đề xuất bảo trì 2 trường dẫn xuất trong `payments` khi bất cứ client nào cập nhật, cùng script backfill/audit **chỉ đọc mặc định** và phép so sánh hàm chuẩn hóa với code gốc.
5. **Hai cờ trong website hiện `false`:** `PAYMENT_INDEX_QUERY_CODE_ENABLED`, `MEP_INDEX_QUERY_CODE_ENABLED`; cố ý chặn kích hoạt trước kiểm thử dữ liệu thật. Không đổi Firestore production, không thêm lượt đọc production.

## Không nhầm “có code” với “đã giảm quota thực tế”

Code hiện hoàn chỉnh cho đường dẫn truy vấn theo chỉ mục, **nhưng chưa kích hoạt** vì chưa backfill và chưa xác nhận cập nhật chỉ mục từ mọi nguồn ghi. Vì thế **chưa giảm thực tế 55.000 reads/ngày**. Cần dùng staging Firestore riêng để đo và đối chiếu kết quả, rồi mới xem xét production.

## Cần làm để kích hoạt (có điểm phê duyệt riêng)

1. Chạy backend/index test offline; test luồng Payment/MEP/Export Watch và đối chiếu cả Staff/Admin.
2. Nếu muốn tự duy trì bằng Cloud Functions, cần Firebase **Blaze** và xác nhận chi phí; không tự bật billing. Có thể thay Cloud Function bằng backend sở hữu bởi công ty, miễn đảm bảo index được cập nhật sau mọi đường ghi.
3. Triển khai maintenance trigger trên staging trước; backfill dữ liệu bằng Admin SDK (không đưa khóa dịch vụ lên HTML). Script mặc định audit-only. Dùng bản sao dữ liệu thử, không dùng thật nếu chưa duyệt.
4. Kiểm tra *tất cả* documents có `duplicateKeyV1`, `mepLookupV1`, `paymentLookupSchemaV1=1`, và kiểm thử thay đổi/xóa IPC, chuyển tháng, tách thanh toán, cập nhật nội dung MEP, cập nhật bởi Plan Review/Archive và thiết bị khác. Trigger cập nhật sau ghi có thể trễ, nên cần kiểm tra và thiết kế cơ chế nhất quán khi nhập sát thời điểm chỉnh sửa.
5. Sửa Rules để chỉ Admin được đổi `systemConfig/paymentLookupV1`. **Không chỉ thêm match** vì Rules OR qua catch-all; xem `security/INDEX_V1_RULES_PATCH_FOR_REVIEW.txt`.
6. Marker sau khi xác minh (`ready:true`, `schemaVersion:1`, `continuousMaintenance:true`, `verified:true`) chỉ do Admin tạo; bật 2 code flags trong bản staging; chạy parity tests và thử Staff/production snapshot read budgets. Không dùng fallback quét toàn bộ khi index hoạt động.
7. Chỉ deploy sau khi có backup và regression test. Có thể rollback hai flags về `false` mà không xóa dữ liệu tài chính hoặc chỉ mục. **Chưa có bước nào trên production được thực hiện.**

## Những gì giữ nguyên

Hai khối lịch sử 812 bản ghi, các bước nhập/xuất Excel, UNC, Cash Control 825 bản ghi, workflow Admin/Staff, Payment Archive, Plan Review, Payment, Contract Master, Export Watch. Không xóa hoặc rewrite lịch sử Git. Chưa thay Firebase Rules production.

## Test offline

- `node --test tests/index-v1/index.test.cjs`
- `python tests/verify_js_syntax.py`
- `node tests/test_import_two_pass.cjs`
- `node tests/test_mep_targeted_refresh.cjs`
- `node tests/test_export_watch_fallback.cjs`

Không có kiểm thử Firebase Emulator/production trong bản này. Kết quả có trong `tests/INDEXED_READ_RESULTS.json`.
