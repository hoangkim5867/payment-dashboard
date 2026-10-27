# Drive/OAuth — component test thật

Đã chạy ngày 24/10/2026, dùng OAuth client hiện hữu Payment UNC Web. Người dùng đã xác nhận riêng việc thêm `http://localhost:4173` vào Authorized JavaScript origins; origin website hiện tại giữ nguyên. Không thay cấu hình Firebase.

Chạy lại: từ thư mục này chạy `node server.cjs`, mở `http://localhost:4173` trong trình duyệt, bấm **Kết nối Google**, rồi **Chạy thử file giả**. Mỗi lượt tạo thư mục mới và một PDF giả. Không đọc/sửa file có sẵn, không dùng Firebase, không gọi API chia sẻ công khai. Token ở bộ nhớ trang và không được ghi vào báo cáo hay ổ đĩa.

`payment-drive-functions.js` lấy nguyên các hàm HTTP, tạo tên, multipart upload và thay nội dung từ Payment RC1. Hàm `driveApi` bên ngoài kiểm soát để chỉ cho phép tạo thư mục thử và ghi file mới thuộc lượt thử này.

Đã PASS:

- Upload PDF giả phiên bản 1, tải nội dung về, so SHA-256.
- Thay bằng PDF giả phiên bản 2, tải nội dung về, so SHA-256.
- ID file không đổi, do đó liên kết file không đổi.

Hai hash khác nhau giữa hai phiên bản đúng như mong đợi. JSON bằng chứng là `LIVE_RESULT_20261024.json`; không chứa access token.

Thư mục thử: https://drive.google.com/drive/folders/1R2bwQeGmeLK4T0T2f1D2Ix3H7i9Sup07

File thử: https://drive.google.com/file/d/1BX5qQN7nRqpCWoPD_evwCkeRtTV2Dzzn/view

Giới hạn: chưa kiểm thử public sharing, PDF ngân hàng thật, và cập nhật liên kết UNC vào Payment/Archive trong một quy trình đầy đủ. Component PASS không có nghĩa toàn bộ RC được phát hành.

Cập nhật sau lượt component: luồng ứng dụng thật Payment → Drive → Archive → thay PDF → Archive đã PASS bằng dữ liệu giả; xem APP_E2E_RESULT_20261024.json. Các file giả mới của luồng ứng dụng có quyền reader anyone-with-link theo mã kế thừa, khác component riêng không gọi API chia sẻ. Chưa chứng nhận PDF ngân hàng thật hoặc phát hành RC.
