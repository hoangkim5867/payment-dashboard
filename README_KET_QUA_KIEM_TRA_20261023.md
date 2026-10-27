# Payment MASTER — Kết quả kiểm tra trực tiếp, 23/10/2026

**Nguồn kế thừa:** `Payment_MASTER_SECURE_HISTORY_INDEX_STAGING_20261023.zip` (bao gồm các nâng cấp Stage 1–7). **Chưa deploy và không ghi Firestore production.**

## Thay đổi mới duy nhất trong mã website

- `site/payment.html` và `site/payment-mobile-renderer.html`: chặn race condition khi đăng xuất, đăng nhập lại trong lúc đang chờ SHA-256 xác minh lịch sử. Chốt bằng `privateHistory2026Generation` và tái xác nhận UID/profile sau mỗi phép `await` kiểm tra checksum. Không thay CSS, công thức, nghiệp vụ, UNC hay luồng import.
- Giữ 2 mảng lịch sử **ngoài HTML** như bản staging đầu vào. Các nguồn dữ liệu thật **không nằm trong ZIP**, chỉ còn metadata và mã nhập bảo vệ.
- Bổ sung bài test thực thi hàm loader của **cả desktop và mobile** với dữ liệu giả 812 dòng: tải thành công, cache chỉ dùng 2 reads, nguồn thiếu/sai checksum, đăng xuất giữa lúc hash rồi đăng nhập lại cùng UID. Test riêng so sánh khóa IPC của frontend với backend trên 812 mã định danh trong file nguồn gốc riêng tư (chỉ in số lượng, không in nội dung).

## Bằng chứng kiểm tra offline

- Migration DRY RUN trên HTML gốc cung cấp: hai nguồn **812+812 bản ghi**, SHA-256 **đúng**.
- Dung lượng serialized dự kiến: `raw` **222.882 bytes**, `clean` **243.596 bytes** (<1 MiB mỗi tài liệu). Firestore có overhead riêng; cần xác nhận khi import trên staging thực tế.
- 38 bài `node --test` đạt (30 bài cũ + 6 kiểm tra race + 2 so khóa IPC).
- 36 ca kiểm tra Import, 406 so khớp cảnh báo IPC, 16 MEP, 10 Export Watch, 29 cú pháp JavaScript đều đạt offline.
- Kiểm tra chính xác dữ liệu gốc KHÔNG gọi Firestore production; mã lưu lịch sử chỉ mới được mô phỏng.

## Khối ngăn phát hành (KHÔNG ĐƯỢC BỎ)

1. Chưa áp dụng hoặc kiểm thử thực tế `firestore.rules.PROPOSED_STAGING_ONLY`. Rules production hiện tại của người dùng cho phép mọi hồ sơ `authUsers` ghi rộng tới `payments` và `activityLogs`.
2. Chưa migrate 812+812 nguồn lịch sử vào Firebase thật. **Nếu deploy ngay website sạch, History Center sẽ không đọc được lịch sử.** Không được đổi sang xem dữ liệu trống.
3. Chưa backfill và kiểm thử nhất quán toàn bộ chỉ mục Payment, chưa có bằng chứng mọi đường ghi cập nhật chỉ mục **đồng bộ**. Cloud Functions trigger bất đồng bộ **không đủ để bật indexed reads an toàn**. Không đặt marker `ready:true`.
4. Chưa kiểm thử UI và nghiệp vụ trong trình duyệt có Auth staging; trình duyệt headless không khởi tạo thành công trong môi trường hiện tại.
5. Chưa sao lưu/khôi phục và kiểm thử luồng payment production trong môi trường staging.

**Kết luận:** đây là bản tích lũy đã vá lỗi race có bài test thực thi, không phải Release Candidate được phép thay Vercel production. Không upload vào GitHub public nếu chưa được kiểm toán toàn bộ dữ liệu trong mọi tài nguyên.

## Chạy lại test mà không cần Firebase thật

```
node --test tests/index-v1/*.test.cjs tests/secure/*.test.cjs tests/regression/*.test.cjs
node tests/test_import_two_pass.cjs
node tests/test_import_duplicate_equivalence.cjs
node tests/test_mep_targeted_refresh.cjs
node tests/test_export_watch_fallback.cjs
python tests/verify_js_syntax.py
```

Muốn test thêm 812 mã định danh riêng tư: đặt biến môi trường `PAYMENT_PRIVATE_BASELINE` chỉ tới bản HTML gốc **trên máy riêng**, rồi chạy nhóm `tests/regression/*.test.cjs`. Không đưa bản HTML gốc hoặc các file JSON có số tiền vào `site/` hay GitHub public.
