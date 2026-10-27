**Cập nhật sau production preflight:** xem [RC1_OWNER_IDENTITY_FIX.md](RC1_OWNER_IDENTITY_FIX.md). Lỗi owner đã sửa, 147 test Node PASS; chưa triển khai production do các điều kiện backup/rollback còn thiếu. Nội dung dưới đây là báo cáo lượt trước, không thay thế cập nhật này.

# Payment MASTER RC1 — READY_FOR_REVIEW

Bản RC đã có bằng chứng kiểm thử để người dùng review. Chưa cấp phép hay thực hiện triển khai production.

Đọc AUDIT_RC1_20261024.md, DEPLOYMENT_AND_ROLLBACK.md và tests/RELEASE_STATUS.json. Báo cáo ngày cũ giữ nguyên để truy nguyên.

- Một RC1 duy nhất; đủ 16 file site kế thừa, diff đã kiểm.
- Dữ liệu lịch sử Payment/Cash, PDF ngân hàng thật và backup riêng không được đóng gói.
- Chế độ phát hành dùng đọc đủ lịch sử; không bật marker/indexed reads khi writer ngoài gói chưa được chứng nhận. Mã nâng cấp và chỉ mục ghi đồng bộ vẫn được giữ và kiểm thử.
- Vercel chỉ xuất build/site do deployment/build-site.cjs tạo. Preview yêu cầu config staging riêng, không dùng config production mặc định.
- Build kiểm manifest; production còn yêu cầu PAYMENT_APPROVED_MANIFEST_SHA256 đúng hash đã được người dùng xác nhận riêng. Không tự đặt biến này để vượt chặn.
- Firebase source config trỏ project hiện hữu: không mở source làm staging trực tiếp. Dùng tests/build-emulator-site.cjs cho localhost.
- Không dùng HTML cũ có dữ liệu tài chính nhúng làm rollback.
