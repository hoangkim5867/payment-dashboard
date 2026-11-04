# Kết nối Cash Control → Google Sheets (giai đoạn an toàn)

## Trạng thái
- PR #58: chỉ kiểm tra dữ liệu Cash Control đang ở trong bộ nhớ, chưa gọi thêm Firestore.
- Script ở thư mục này: chỉ hỗ trợ kiểm tra mapping và xem trước Sheet đích, **không ghi dữ liệu**.
- Chưa có URL/ID Google Sheets thật trong repo. Không thể ghép 13 dự án vào file đích bằng cách đoán tên.
- Chưa có luồng ủy quyền an toàn từ nút Cash Control sang Google; **không được xuất bản Apps Script như Web App công khai để nhận dữ liệu tài chính**.
- Chưa được phép merge hoặc bật đồng bộ thật.

## Mapping cần tạo
Một tệp Google Sheet cho mỗi dự án. Dùng Spreadsheet ID lấy từ URL:
`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

Dự án thuộc danh mục Cash Control, không dùng tên viết tay của người dùng làm chìa khóa duy nhất:
- PHU HUNG
- ELYSIAN
- EATON
- 红鹤别墅1.1区
- C17-2
- FOXCONN
- OCEAN LINK
- SSIS
- Các dự án còn lại từ danh mục thực tế

**Chưa tự khẳng định** EATON = EATON P1, C17-2 = C17, hay 红鹤别墅1.1区 = HONGHAC 1.1; phải xác nhận trước khi map.

Trong Apps Script, cấu hình `SHEET_MAP_JSON` trong Script Properties:
`{"PHU HUNG":{"spreadsheetId":"ID_...","sheetName":"DATA_CASHCONTROL"}}`

Không dùng ID giả để ghi thật. Sheet `DATA_CASHCONTROL` nên tạo mới hoặc bản sao trước, không ghi trực tiếp vào vùng dữ liệu người dùng đang chỉnh tay.

## Cách triển khai dự kiến
1. Lấy danh sách Sheet thật và xác nhận quyền của tài khoản phụ trách. Sao lưu từng file.
2. Kiểm thử script preview đọc header và phân loại trạng thái Sheet (không ghi).
3. Kiểm tra ID và danh tính giao dịch Cash Control, cách xử lý 2 chiều điều chuyển, gộp thuế, đổi tháng, xóa giao dịch.
4. Tạo endpoint trung gian có **xác thực Admin máy chủ, chống replay, rate limit, kiểm tra mapping server-side**. Không đặt service key trong HTML.
5. Đồng bộ staging lên bản sao Sheet, so sánh số dòng/tổng thu/chi/số dư theo từng dự án/tháng và bảo vệ chỉnh tay.
6. Chỉ bật ghi thật sau khi kiểm thử đạt, có bản sao lưu và thao tác khôi phục.

## Firestore
Bộ xem trước trong PR #58 không gọi `getDocs` mới, nhưng mở/truy cập trang Cash Control vẫn có thể phát sinh các reads theo logic hiện hữu. Ghi Google Sheets sẽ chịu giới hạn/quota Google, không sử dụng Firestore mới nếu payload đã có đủ trong bộ nhớ.

## Quy tắc tuyệt đối
Không đoán mapping, không tự tạo bảng đích cho dự án chưa xác nhận, không ghi đè toàn bộ vùng hiện có, không biến hàm xem trước thành ghi thật, không tự động tải Payment nếu thiếu.
