# Payment MASTER — bản tích lũy Stage 6, cập nhật 23/10/2026

> **STAGING ONLY — KHÔNG THAY PRODUCTION.** Đây là bản phát triển trực tiếp từ
> `Payment_MASTER_TICH_LUY_MOI_NHAT_20261023_STAGING.zip`, giữ toàn bộ nâng cấp Stage 1–5.
> **BẢO MẬT:** Hai file `site/payment.html` và `site/payment-mobile-renderer.html`
> vẫn chứa dữ liệu lịch sử tài chính 812 dòng. Không đưa ZIP này lên GitHub công khai,
> không chia sẻ ra ngoài, không deploy lên hosting công khai.

## Những thay đổi đã kế thừa — không mất việc cũ

- Stage 1: CSS chính 7 trang đã tách ra file `site/assets/css/...`.
- Stage 2: Bỏ phần `EDITED_PREVIEW` vô hiệu hóa từ Payment desktop/mobile; giữ nguyên hai nguồn lịch sử 812 dòng mỗi bản.
- Stage 3: Đo số document và thời gian đọc của Import Excel / Contract Master MEP (không tạo thêm request).
- Stage 4: Chặn truy vấn toàn collection khi dữ liệu Excel dán vào trống, thiếu cột bắt buộc hoặc chỉ có header; nhập hợp lệ vẫn kiểm tra trùng xuyên tháng nguyên trạng.

## Hai cải tiến Stage 5 đã kế thừa từ bản tích lũy trước

### 1. Contract Master → MEP: giảm đọc sau khi sửa nhóm

**Trước:** Sau khi lưu sửa một nhóm MEP, ứng dụng gọi `getDocs(paymentsRef)`, tải lại *toàn bộ* chứng từ của công ty.

**Sau:** Sau khi ghi thành công, chỉ đọc lại những chứng từ thuộc nhóm vừa sửa, theo `documentId()` (tối đa 20 ID/truy vấn). Kết quả từ máy chủ cập nhật lại bảng, không dùng giá trị ghi giả trên trình duyệt. Chứng từ bị xóa hoặc không còn thuộc MEP được loại khỏi bảng. Nếu đọc chọn lọc gặp lỗi, tự quay lại tải toàn bộ như cũ. Nút Làm mới chủ động vẫn đọc toàn bộ như cũ.

**Ví dụ minh họa**, nếu công ty có 5.000 chứng từ và nhóm vừa sửa có 3 khoản, bước *đọc lại sau khi lưu* sẽ truy vấn 3 chứng từ thay vì 5.000; đây là ví dụ, chưa phải số reads đo từ Firebase production. Lần đầu mở MEP vẫn đọc toàn bộ dữ liệu.

### 2. Payment → Export Watch: giảm đọc nếu thiếu Firebase Index

**Trước:** Khi Firestore thiếu composite index `(paymentMonth, createdAt)`, Export Watch tải các log của *mọi tháng* kể từ lần xuất Excel gần nhất, sau đó mới lọc về tháng đang xem.

**Sau:** Chỉ trong tình huống thiếu Index, dùng hai phép đếm dữ liệu aggregate của Firestore để chọn cách đọc ít kết quả hơn:

- Log của tháng đang xem; **hoặc**
- Log của các tháng kể từ mốc xuất Excel.

Sau đó lọc theo cả tháng + mốc thời gian và sắp xếp đúng thời điểm thay đổi, bảo toàn nanosecond của Timestamp, không cắt 500 dòng, không reset mốc xuất Excel. Nếu phép đếm không hoạt động, dùng nguyên cơ chế đọc theo thời gian cũ. Khi có composite Index, giữ nguyên truy vấn tối ưu sẵn có.

**Lưu ý:** Hai phép đếm aggregate cũng có thể phát sinh ít lượt đọc index; chỉ sử dụng khi Index bị thiếu, không phải mỗi lần xuất. Không hứa trước mức giảm khi chưa đo production.

## Kiểm tra đã chạy

| Kiểm tra | Kết quả |
|---|---|
| Kiểm tra byte-level kế thừa đúng ZIP người dùng gửi | 90/90 PASS |
| JavaScript syntax (7 trang) | 29/29 PASS |
| Excel Paste preflight | 14/14 PASS |
| MEP đọc đúng danh sách ID, nhóm xóa/đổi loại, phân trang 20 ID | 16/16 PASS |
| Export Watch chọn ít hơn, >500 log, Timestamp ns, fallback | 10/10 PASS |
| `check_production_readiness.py` | BLOCKED (đúng chủ đích) |
| Firebase production live tests | CHƯA CHẠY |
| UI trong trình duyệt thực và end-to-end nghiệp vụ | CHƯA CHẠY |

Các phép kiểm tra Stage 5 đã được giữ lại và chạy lại cùng Stage 6. Kết quả tổng hợp mới xem `tests/RESULTS_STAGE6_20261023.json`.


## Stage 6 — tránh đọc toàn bộ dữ liệu khi Excel không có khoản thanh toán nào để đối chiếu

**Thay đổi trực tiếp trong Payment desktop và mobile**: trước khi tải lịch sử toàn bộ collection `payments`, ứng dụng phân tích bảng dán bằng chính bộ giải mã, tự nhận diện và kiểm tra lỗi hiện có, nhưng hoãn cảnh báo trùng tới lượt thứ hai.

- **Không có bất kỳ `row.data` nào** (mọi dòng không thể dựng thành một khoản thanh toán): bỏ truy vấn toàn bộ lịch sử, giữ nguyên lỗi từng dòng và cách hiển thị preview.
- **Có ít nhất một `row.data`** (kể cả dòng đang có lỗi): vẫn tải lịch sử đầy đủ rồi dựng lại preview, so trùng đúng cả tháng hiện tại và các tháng khác.
- Chức năng lưu, IPC, cảnh báo chia đợt, Contract Master, Undo và toàn bộ dữ liệu trong HTML **không thay đổi**.
- Có thêm `tests/test_import_two_pass.cjs`: 36 kiểm tra route và việc gọi/không gọi lịch sử trên desktop/mobile bằng dữ liệu giả. Không kết nối Firebase thật.
- Các hàm kiểm tra trùng IPC nay nhận danh sách `candidates` đã tính một lần mỗi preview thay vì tái dựng danh sách toàn bộ lịch sử cho từng dòng Excel. Mã so trùng và thứ tự ưu tiên kết quả không đổi; `tests/test_import_duplicate_equivalence.cjs` đối chiếu 406 trường hợp giả lập với mã Stage 5 cũ.
- `tests/stage6_expected.json` + `tests/stage6_delta.py` kiểm tra chữ ký SHA-256 trước/sau đúng các thay đổi đã duyệt, sau đó chạy lại các kiểm tra kế thừa Stage 1–5.

**Giới hạn rõ ràng:** Luồng Import Excel HỢP LỆ vẫn đọc toàn bộ collection `payments`. Đây là giảm đọc dư cho trường hợp nhập lỗi/không có khoản hợp lệ, **không giải quyết tận gốc quota 50.000 reads/ngày**. Muốn bỏ quét toàn bộ cho dữ liệu hợp lệ phải xây chỉ mục đối chiếu có cơ chế cập nhật từ phía server và migration toàn bộ dữ liệu cũ; không được thay bằng query tháng hiện tại hay lọc tên hợp đồng đơn giản vì sẽ bỏ sót trùng IPC xuyên tháng.

## Vì sao bản này chưa được đưa lên web chính?

1. Truy vấn `getDocs(paymentsRef)` vẫn còn trong **lần đầu mở MEP** và **Excel Import hợp lệ**; 2 thay đổi mới chỉ giảm đọc ở tình huống riêng.
2. Dữ liệu lịch sử 812 dòng vẫn nhúng trong HTML. Cần di chuyển sang nguồn được bảo vệ, không tự xóa khi các công cụ đang dùng nó.
3. Firestore Rules production đã gửi chỉ hạn chế sửa `authUsers`; quyền ghi một số collection khác (Payment/Audit) còn quá rộng. Chưa có Rules mới được kiểm thử thực tế và phê duyệt.
4. Chưa kiểm thử live Admin/Staff, Cash Control 825 dòng, UNC, Excel, Plan Review và Archive với phiên bản này.
5. Không được tự ý sửa Git history hoặc deploy production; chưa có kết quả kiểm tra toàn bộ Git history.

## Cách kiểm tra offline (không kết nối Firebase thật)

Từ thư mục gốc trong ZIP:

```bash
python tests/verify_stage2.py
python tests/verify_read_instrumentation.py
python tests/verify_js_syntax.py
node tests/verify_preflight.cjs
node tests/test_import_two_pass.cjs
node tests/test_import_duplicate_equivalence.cjs
node tests/test_mep_targeted_refresh.cjs
node tests/test_export_watch_fallback.cjs
python tests/check_production_readiness.py  # Dự kiến BLOCKED, không phải lỗi kiểm thử
```

**Không đổi Rules, dữ liệu, GitHub, Firebase hoặc Vercel production.** Bản này là mã staging, không phải bản đã nghiệm thu triển khai.
