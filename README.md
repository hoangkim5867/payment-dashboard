# Payment MASTER

Website đang dùng: https://cscecmep-payment.vercel.app/payment.html

Kho này là mã nguồn chính thức của Payment MASTER RC1 đã phát hành ngày 26/10/2026. Vercel lấy nhánh `main`, dựng website từ `site/`, rồi chỉ phục vụ thư mục `build/site`. Firebase Rules không tự được triển khai khi sửa website.

## Sửa file nào sau này?

- Thanh toán: `site/payment.html`; bản di động: `site/payment-mobile-renderer.html`.
- Cash Control: `site/cash-control.html`.
- Plan Review: `site/plan-review.html`.
- Payment Archive: `site/payment-archive.html`.
- Contract Master: `site/contract-master.html`.
- Trang chủ: `site/index.html`.
- Giao diện và phần dùng chung: `site/assets/css/`, `site/assets/js/`.

Các file HTML cũ ở ngoài cùng đã được chuyển sang cấu trúc nguồn `site/`; không tạo lại bản thứ hai ở ngoài cùng. Địa chỉ website và tên trang người dùng truy cập giữ nguyên.

## Quy trình cập nhật

1. Sửa mã trong `site/` trên một nhánh riêng, giữ nguyên dữ liệu Firebase.
2. Chạy bộ kiểm thử liên quan trong `tests/`; kiểm thử ghi/xóa chỉ trên Emulator hoặc staging riêng.
3. Cập nhật manifest và bằng chứng kiểm thử cho bản thay đổi đã được xem xét. Manifest RC1 hiện tại đóng băng 175 file; thay một file mà chưa cập nhật bằng chứng sẽ bị chặn dựng, có chủ đích.
4. Đưa thay đổi đã kiểm tra vào `main`. Vercel phải hiển thị đúng commit GitHub đó và dựng thành công trước khi phát hành. Cổng production yêu cầu `PAYMENT_APPROVED_MANIFEST_SHA256` khớp manifest được duyệt; không bỏ cổng này để chữa lỗi dựng.
5. Kiểm tra website sau phát hành. Nếu đổi Rules, chuyển dữ liệu hoặc thao tác production khác, phải có xác nhận riêng cho đúng thao tác.

Bạn có thể yêu cầu: “Sửa chức năng …, đồng bộ GitHub và triển khai theo quy trình hiện có.” Không cần tự tải/nhập dữ liệu Firebase khi cập nhật mã website.

## Kiểm tra nhanh trên máy

```text
node tests/verify-release-files.cjs
node --test tests/index-v1/*.test.cjs tests/secure/*.test.cjs tests/regression/*.test.cjs
python tests/verify_js_syntax.py
```

Cấu hình Vercel: Other, Node 24, Build Command `node deployment/build-site.cjs`, Output Directory `build/site`, Production Branch `main`, Root Directory để trống. Install Command lấy nguyên giá trị `installCommand` trong `deployment/vercel-project-settings.json`. Không dựng trực tiếp toàn bộ repo làm website.

Vercel rút gọn `vercel.json` trước khi dựng, làm thay đổi định dạng byte nhưng không đổi nội dung JSON. Install Command so sánh nội dung JSON với bản đã commit trong Git, chỉ khôi phục đúng byte của bản Git khi nội dung khớp. Cổng kiểm tra 175 file RC1 và manifest production đã duyệt chạy ngay sau đó, giữ nguyên; thay đổi nội dung hoặc manifest chưa duyệt vẫn bị chặn. Năm kiểm thử hồi quy riêng kiểm chứng hành vi này.

Manifest RC1: `f7b3a55b90332e9aa34ca941727c48ad67cec569b3c3c2890cceb7981486b95c`.

Lần đồng bộ này không đổi 175 file RC1 đã kiểm thử, không ghi dữ liệu Firebase, không đổi Rules và không viết lại lịch sử Git. Các báo cáo trong `tests/` ghi lại thời điểm kiểm thử trước khi triển khai; các cờ “productionTouched: false” trong bằng chứng đóng băng là trạng thái tại thời điểm đó.

## Dữ liệu và quay lui

Hai bộ lịch sử Payment đã ở Firestore, mỗi bộ 812 dòng, đọc lại khớp SHA-256. Bản sao chứa dữ liệu thật/Auth được lưu riêng; không đưa bản sao, file ngân hàng, `.env`, token hoặc khóa riêng vào kho này.

Bản dự phòng Vercel đã kiểm thử: `dpl_EtuBgpQfYMLn6S9vQYjkPDRU7hwn`. Chỉ promote bản đã xác minh; không quay về deployment cũ nhúng lịch sử công khai và không khôi phục Rules catch-all cũ. Giữ chế độ đọc đầy đủ; tối ưu đọc theo chỉ mục chưa bật trên production.

Xem thêm `DEPLOYMENT_AND_ROLLBACK.md`, `README_RC1.md` và `security/COLLECTION_PERMISSION_MATRIX.md`.
