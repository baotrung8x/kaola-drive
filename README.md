# Kaola Drive cho Windows (Desktop App)

Ứng dụng đồng bộ hai chiều tự động chuẩn doanh nghiệp giữa máy tính Windows và **Kaola Drive Cloud** (`drive.kaola.vn`).

---

## 1. Cách mở ứng dụng trên Windows (GUI)

Bạn có thể mở ứng dụng theo bất kỳ cách nào dưới đây:
- **Cách 1 (Nhanh nhất):** Nhấp đúp vào biểu tượng **Kaola Drive** ngay ngoài màn hình máy tính (**Desktop**).
- **Cách 2:** Nhấp đúp vào tệp tin [`KaolaDrive.bat`](file:///c:/laragon/www/kaolawork/desktop-app/KaolaDrive.bat) trong thư mục `desktop-app/`.
- **Cách 3:** Mở Terminal tại `desktop-app/` và chạy:
  ```bash
  npm start
  ```

---

## 2. Các tính năng nổi bật trên Windows

1. **Khay hệ thống (System Tray):**
   - Ứng dụng chạy thường trực dưới góc phải thanh Taskbar (cạnh đồng hồ Windows).
   - Nhấp chuột trái: Bật/tắt Bảng điều khiển Kaola Drive.
   - Nhấp chuột phải: Menu tùy chọn nhanh (*Mở bảng điều khiển, Mở thư mục, Mở trên Web, Đồng bộ ngay, Tự khởi động cùng Windows, Thoát*).
   - Khi bấm nút tắt (X) ở góc trên, ứng dụng tự động ẩn về khay hệ thống để tiếp tục đồng bộ ngầm mà không bị tắt đột ngột.

2. **Giao diện Bảng điều khiển (Dashboard):**
   - **Thanh trạng thái trực quan**: Báo trạng thái thời gian thực (*Đã cập nhật / Đang đồng bộ / Lỗi kết nối*).
   - **Đo hạn mức dung lượng Cloud (Quota)**: Hiển thị dung lượng đã dùng trên tổng dung lượng được cấp (kèm thanh phần trăm).
   - **4 nút thao tác nhanh**:
     - 📁 **Mở thư mục**: Mở thư mục `KaolaDrive` trên máy tính bằng Windows File Explorer.
     - 🌐 **Mở Web**: Mở Cổng lưu trữ Kaola Drive trên trình duyệt web mặc định.
     - 🔄 **Đồng bộ ngay**: Ép quét và đồng bộ tức thì không cần chờ chu kỳ 15s.
     - ⚙️ **Cài đặt**: Đổi thư mục lưu trữ, bật/tắt tự chạy cùng Windows, Đăng xuất tài khoản.
   - **Nhật ký hoạt động (Recent Activity)**: Danh sách các tệp vừa được tải lên, tải về hoặc xóa hai chiều.

3. **Chế độ chạy ngầm (CLI Daemon):**
   - Nếu bạn muốn chạy trên máy chủ server không có màn hình GUI:
     ```bash
     npm run cli
     ```
   - Đăng nhập lấy token nhanh qua dòng lệnh:
     ```bash
     npm run login
     ```
   - Tạo lại phím tắt Desktop nếu cần:
     ```bash
     npm run shortcut
     ```
