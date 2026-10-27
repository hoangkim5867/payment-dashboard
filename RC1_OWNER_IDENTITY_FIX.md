# RC1 — sửa quyền chủ Cash Control

Đã sửa và kiểm thử trên Emulator, chưa áp dụng production.

Lỗi trước đây: Rules yêu cầu email_verified=true, trong khi tài khoản chủ nội bộ đang có emailVerified=false. Bản sửa yêu cầu đồng thời UID cố định HTx2QuATHxh8zgAawwreg88w65M2, email lehoangoanh@cscecmep.internal và profile hợp lệ/hoạt động. Không chỉnh cờ xác minh, email hay quyền tài khoản thật. Plan Review vẫn cần vai trò Admin.

Kết quả mới: **147 test Node PASS**, gồm 66 offline, 78 Rules/writer/Auth trên Emulator và 3 migration. **14 lượt trang Admin/Staff PASS**, **7 ca Cash/Contract CRUD qua UI và server readback PASS**, không có page error hoặc yêu cầu tới endpoint dữ liệu production. Tài khoản chủ fixture được tạo với emailVerified=false, có ca đăng nhập Auth Emulator thực và kiểm claim false; Cash và Plan hoạt động, profile disabled chặn token hiện hữu. Hai bộ lịch sử vẫn 812 dòng và đúng SHA-256.

Chín ca mới tập trung vào lỗi identity; các ca từ chối giả UID/email, thiếu hoặc khóa profile, phá schema và xóa nguyên Cash document đều đạt. Không phải chứng nhận bao phủ mọi tình huống bảo mật. Rules vẫn là prototype cần review.

**Chưa phát hành website.** Xác nhận triển khai trước của người dùng vẫn được ghi nhận; lỗi owner đã được sửa cục bộ nhưng các điều kiện backup/restore production, source/rollback và kiểm thử deployment từ xa chưa hoàn tất. Không dùng kết quả Emulator để thay thế các điều kiện đó.

Collection users có 60 tài liệu presence trong bản sao production; mã site trong RC không có tham chiếu users/forceStatus/lastSeen. Chưa xác nhận writer cũ/ngoài gói, vì vậy chưa kết luận có thể thay Rules production chỉ dựa trên RC. Không xóa dữ liệu này và không tự mở thêm quyền.

Các báo cáo trước được giữ để truy nguyên. File này và tests/OWNER_IDENTITY_FIX_RESULT.json mô tả bản sửa hiện tại, thay cho giả định chủ Cash phải verified trong báo cáo cũ.
