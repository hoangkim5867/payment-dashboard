# Payment MASTER RC1 — triển khai và rollback

## Phạm vi đã kiểm chứng

RC1 đã kiểm thử trên Firestore/Auth Emulator độc lập, PDF ngân hàng thật chỉ đọc cục bộ, Drive thật bằng file/dòng giả riêng, và audit Vercel read-only. READY_FOR_REVIEW không phải quyền triển khai production. Không có dữ liệu riêng trong gói.

Chế độ phát hành là COMPLETE_HISTORY: build ép Payment desktop/mobile và Contract Master đọc đủ lịch sử, marker không bật. Mã chỉ mục và writer đồng bộ vẫn giữ nguyên. Chỉ bật optimized reads trong một bản được chứng nhận writer cũ/ngoài gói riêng. Không được sửa gate hoặc marker để bỏ qua điều kiện.

## Đích đã xác minh

- Firebase production dự kiến: cscecmep-payment. Phải đối chiếu project thật một lần nữa sau khi có xác nhận production.
- Vercel project: cscec-mep-payment, ID prj_ip8IblGA7BCY0f32iOLOjjTJ0d6u.
- Domain: cscecmep-payment.vercel.app.
- Git: hoangkim5867/payment-dashboard, nhánh main; commit đang deploy khi audit: 19d9ab964c86b8cac463e15001983e10c4d08096.
- Deployment hiện tại: dpl_EQTSGPMgU66xZ2XrHN1dhy99eSAo. Đây là điểm nhận diện, KHÔNG tự coi là rollback an toàn nếu chưa kiểm lịch sử nhúng và tương thích Rules.
- Dashboard: Root Directory trống, Other, Node 24.x, build/output/install override tắt. Không cần tự đổi các mục này để dùng vercel.json của RC.

## Chạy lại cục bộ

1. Giải nén RC ở thư mục riêng. Dùng Node 24/Python 3.12; Java 21 cho Emulator. Cài dependency trong tests/firebase-rules theo lockfile hiện có; không mang credentials production vào môi trường test.
2. Chạy node tests/verify-release-files.cjs trước khi sửa hay chạy test có ghi báo cáo. Manifest xác minh toàn bộ file RC đã đóng băng. Sửa bất kỳ file nào thì phải tạo lại bằng chứng/manifest và duyệt lại, không sửa hash lịch sử Stage cũ.
3. Chạy RUN_TESTS_WINDOWS.bat từ gốc để kiểm offline hiện tại. Các script Stage1–6 còn nguyên để truy nguyên và không được dùng hash cũ làm chuẩn cho thay đổi RC mới đã review.
4. Từ tests/firebase-rules chạy Firebase Emulator với cấu hình ../../firebase.emulator.json, chỉ Firestore/Auth, project demo-payment-security. Các test chỉ chấp nhận 127.0.0.1. Chạy script emulator trong package.json để kiểm role, collection, writer, lookup, disabled Auth và tải lớn.
5. Migration: cung cấp PAYMENT_PRIVATE_SOURCE trỏ HTML riêng gốc, FIRESTORE_EMULATOR_HOST=127.0.0.1:8080. Chạy migration-live.test.cjs để kiểm 812×2, nội dung/hash, idempotence và từ chối xung đột. Không sao chép HTML riêng vào site hoặc repo công khai.
6. UI: chạy tests/build-emulator-site.cjs; seed-ui.cjs với cả Auth và Firestore host cục bộ, cùng PAYMENT_PRIVATE_CASH_SEED nếu cần. Bộ UI dùng bản sinh ở emulator-site cạnh source và chặn endpoint dữ liệu production. Chạy ui-smoke.cjs và business-acceptance.cjs tuần tự, vì cùng dùng cổng 4173. Nếu chạy test Rules cùng project trước đó, seed lại UI.
7. Backup/restore rehearsal: đặt PAYMENT_PRIVATE_BACKUP_DIR là thư mục riêng ngoài site/source; chạy tests/firebase-rules/rollback-rehearsal.cjs. Chỉ project demo-payment-rollback-rehearsal bị sửa/xóa dữ liệu giả; report không chứa payload backup. Đã kiểm khôi phục hai bộ 812 dòng và Cash payload/timestamp bằng checksum toàn bộ.
8. PDF thật: report REAL_BANK_PDF_RESULTS.json ghi SHA-256 nguồn và số assertion. Dữ liệu mong đợi riêng, PDF và ảnh render ở ngoài RC; không dùng chúng trong CI công khai. Parser có 12 regression synthetic để chạy không cần chứng từ riêng.

Các báo cáo sinh lại sẽ thay hash file report. Lượt test thành công cần đóng băng lại manifest trước khi build/deploy; không dùng manifest cũ cho mã hay bằng chứng đã thay đổi.

## Build tách môi trường

vercel.json chạy node deployment/build-site.cjs và chỉ xuất build/site.

- Preview/staging: bắt buộc PAYMENT_FIREBASE_STAGING_CONFIG là JSON web config của Firebase staging riêng, projectId có staging và không phải cscecmep-payment. Auth domain/storage phải cùng project. Thiếu/lẫn config production thì build từ chối. Chưa tạo hay triển khai project staging cloud trong lượt này.
- Production: dùng config production kế thừa trong source. Gate kiểm READY_FOR_REVIEW, tất cả check PASS, COMPLETE_HISTORY, marker false và manifest nguyên vẹn. Ngoài ra PAYMENT_APPROVED_MANIFEST_SHA256 phải bằng SHA-256 của RC1_FILE_MANIFEST.json đã được người dùng xác nhận riêng. Không tự đặt biến này khi chưa có xác nhận.
- Source không dùng trực tiếp làm preview. Không upload cả thư mục gốc làm nội dung website. Backend Cloud Functions không tự chạy trên Vercel; RC không cần dựa vào trigger async để bảo đảm chỉ mục của writer trong gói.

## Kế hoạch production — chỉ sau xác nhận riêng

Người dùng duyệt đúng RC/ZIP checksum, manifest checksum, project/domain và trình tự bên dưới. Xác nhận này mới cho phép bắt đầu thao tác production; việc review RC hoặc chạy Emulator không thay thế xác nhận.

1. **Đọc và backup trước:** xác nhận project/account/deployment/Git commit không đổi, lưu Rules hiện hữu, Auth profile cần thiết và backup Firestore bằng cơ chế được duyệt. Kiểm tra backup có thể đọc, metadata/checksum/counts và quyền lưu backup riêng. Không xuất dữ liệu vào site hoặc artifact công khai.
2. **Preflight hiện trạng:** xác minh UID/email owner Cash đúng bản sửa và profile active, bootstrap Admin UID đúng; liệt kê schema/role lệch Rules; kiểm hai history docs và checksum, marker và client đang dùng. Nếu marker đang bật hoặc có dữ liệu không khớp, dừng trước mọi ghi; không tự ghi đè để ép phù hợp.
3. **Điểm rollback website:** lưu deployment/source sạch được duyệt và kiểm tương thích với history private/Rules mới trên môi trường riêng. Không mặc nhiên rollback về HTML cũ có tài chính nhúng, hoặc bản Staff import thiếu creator UID. Nếu chưa có rollback website an toàn, dừng trước khi thay domain.
4. **Chuẩn bị deployment chưa gán domain:** dùng đúng mã đã duyệt, kiểm build/gate/header/routes/asset và đăng nhập tại deployment bảo vệ. Nếu có deploy production nhưng chưa gán domain, chưa promote khi chưa đạt smoke. Không tạo bypass/share link công khai cho dữ liệu nhạy cảm.
5. **Migration có kiểm tra xung đột:** chỉ tạo history còn thiếu từ nguồn riêng đã xác minh, đọc lại đủ 812×2/nội dung/hash; existing khác phải dừng. Không xóa hay thay lịch sử để rollback. Backfill trường phụ nếu thuộc kế hoạch được duyệt; giữ marker false.
6. **Rules và website:** triển khai Rules prototype đã được review và site đúng thứ tự tương thích đã xác minh. Chỉ promote deployment đã kiểm tra; không push main hoặc đổi alias trước khi có xác nhận production cụ thể.
7. **Kiểm chứng sau triển khai:** Admin/Staff/disabled, Cash owner, đọc lịch sử, query xuyên tháng, trang chính và link UNC/Archive; kiểm headers và production endpoint đúng project. So counts/totals/hash trước/sau cho dữ liệu migration. Không dùng chứng từ đang vận hành để thử ghi/xóa. Nếu lỗi thì dừng rollout và dùng điểm rollback đã kiểm.

## Rollback

- Trước promote, nếu deployment mới lỗi: giữ deployment/domain đang chạy, không chuyển traffic sang bản lỗi.
- Sau promote: khôi phục website sạch đã lưu và kiểm tương thích ở bước 3. Không chọn deployment cũ chỉ vì API đánh dấu isRollbackCandidate; nội dung cũ có thể lộ lịch sử hoặc không tương thích quyền mới.
- Giữ COMPLETE_HISTORY, không bật marker. Không xóa trường chỉ mục hay history private để rollback UI.
- Rules chỉ khôi phục bản an toàn đã backup và kiểm trên staging; không mở public/catch-all để chữa cháy.
- Nếu thật sự cần restore dữ liệu, chỉ dùng backup được xác minh và kế hoạch restore production được duyệt riêng. Rehearsal Emulator đã so checksum toàn bộ không thay cho việc kiểm backup production thực tế.
- Xác minh counts, totals, content hash và quyền sau rollback. Giữ audit và nhật ký triển khai; không viết lại lịch sử Git.

## Giới hạn minh bạch

Đã hoàn tất phần chuẩn bị và kiểm chứng RC theo các ca ghi trong báo cáo. Chưa thao tác production và chưa chạy smoke từ xa cho chính RC. Không khẳng định bao phủ mọi đầu vào, sự cố mạng/quota hay mọi writer ngoài gói. Chế độ đọc đầy đủ bảo vệ tính đúng khi optimization chưa được kích hoạt. Các điều kiện preflight production bắt buộc thực hiện sau xác nhận riêng; dừng nếu bất kỳ điều kiện nào không khớp.
