# Deploy Server lên Render — Hướng dẫn từ Điện thoại (không cần máy tính)

Vì điện thoại không thể tự chạy Node.js server 24/7, cách thực tế nhất
là đưa code server lên **Render** (dịch vụ hosting miễn phí, hỗ trợ
WebSocket) — họ chạy server hộ bạn liên tục, bạn và bạn bè chỉ cần mở
`online.html` trên điện thoại và kết nối vào.

## Tổng quan các bước
1. Đưa code lên GitHub (qua app GitHub hoặc trình duyệt)
2. Tạo tài khoản Render, nối với GitHub
3. Tạo "Web Service" trên Render, chỉ vào đúng thư mục `server`
4. Lấy địa chỉ Render cấp (dạng `ten-gi-do.onrender.com`)
5. Mở `online.html`, nhập địa chỉ đó vào, chọn server, chơi

---

## Bước 1 — Đưa code lên GitHub

1. Cài app **GitHub** (Google Play / App Store) hoặc dùng trình duyệt
   vào github.com, đăng nhập/tạo tài khoản.
2. Tạo **repository mới** (nút "+" → "New repository"):
   - Tên: ví dụ `god-hunter-online` (tên gì cũng được)
   - Để **Public** (Render free tier cần repo public hoặc bạn nối
     tài khoản đầy đủ quyền riêng tư)
3. Tải lên **toàn bộ thư mục `godhunter_online`** đã tải từ Claude
   (gồm `server/`, `client/`, `shared/`) — giữ đúng cấu trúc thư mục
   này, không đổi tên hay di chuyển file ra ngoài:
   - Trên app GitHub: vào repo vừa tạo → "Add file" → "Upload files"
     → chọn hết các file/thư mục trong `godhunter_online`
   - Hoặc trên trình duyệt: github.com → repo của bạn → "Add file" →
     "Upload files" → kéo thả hoặc chọn từ bộ nhớ máy

> Quan trọng: phải giữ nguyên cấu trúc `server/` và `client/` và
> `shared/` nằm cùng cấp nhau trong repo, vì code server cần đọc file
> ở `../client/` và `../shared/`.

---

## Bước 2 — Tạo tài khoản Render

1. Vào **render.com** bằng trình duyệt điện thoại
2. "Get Started" → đăng ký bằng tài khoản GitHub (nhanh nhất, tự nối
   luôn không cần nhập lại gì)

---

## Bước 3 — Tạo Web Service

1. Trong Render Dashboard → **"New +"** → **"Web Service"**
2. Chọn repo `god-hunter-online` (hoặc tên bạn đã đặt) vừa tạo ở
   GitHub — Render sẽ tự liệt kê nếu đã nối tài khoản
3. Điền các ô cấu hình:
   - **Name**: tên gì cũng được, ví dụ `god-hunter-online`
   - **Root Directory**: gõ `server` (chữ thường) — **bước này quan
     trọng nhất**, nếu bỏ trống sẽ lỗi vì Render tìm `package.json`
     sai chỗ
   - **Runtime**: chọn `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: chọn **Free**
4. Bấm **"Create Web Service"**
5. Đợi vài phút, Render sẽ tự `npm install` rồi chạy server. Khi log
   hiện dòng giống:
   ```
   GOD HUNTER ONLINE — UNIFIED SERVER (1 port, 4 loại)
   Đang chạy tại port: 10000
   ```
   là server đã chạy thành công.

---

## Bước 4 — Lấy địa chỉ server

Trên trang Web Service vừa tạo, Render hiện sẵn 1 địa chỉ dạng:
```
https://god-hunter-online-xxxx.onrender.com
```
Đây chính là địa chỉ bạn sẽ nhập vào game. **Bỏ phần `https://` đi**,
chỉ giữ lại phần `god-hunter-online-xxxx.onrender.com`.

---

## Bước 5 — Vào chơi

1. Mở `god_hunter_pc.html` hoặc `god_hunter_mobile.html` trên điện
   thoại (mở trực tiếp file, hoặc nếu bạn cũng up file `client/` lên
   đâu đó có thể truy cập qua link thì mở link đó)
2. Bấm **🌐 CHƠI ONLINE**
3. Nhập tên Hunter
4. Ở ô **"Địa chỉ server"**, dán vào: `god-hunter-online-xxxx.onrender.com`
   (đúng địa chỉ Render cấp cho bạn ở Bước 4)
5. Chọn loại server (Thường / Riêng Tư / Dungeon...)
6. Bấm **KẾT NỐI & VÀO GAME**

Bạn bè ở xa cũng làm y vậy — chỉ cần họ có file `god_hunter_pc.html`/
`god_hunter_mobile.html` (gửi qua Zalo/Messenger là được, file HTML
gửi qua đâu cũng mở được) và biết địa chỉ Render của bạn.

---

## Lưu ý quan trọng về Render Free Tier

- **Tự "ngủ" sau 15 phút không có ai chơi** — lần đầu vào lại sau khi
  ngủ sẽ mất khoảng 30-60 giây để "thức dậy", sau đó chơi bình thường
  cho tới khi không ai chơi 15 phút tiếp.
- **Không cần thẻ tín dụng** để dùng free tier.
- **Tất cả 4 loại server (Thường/Riêng tư/Dungeon Thường/Dungeon Riêng
  tư) đều chạy chung trên 1 địa chỉ Render** — `unified-server.js` tự
  phân biệt bằng đường dẫn, bạn không cần tạo 4 Web Service riêng.

## Nếu deploy lỗi

- **"Cannot find module"**: kiểm tra lại Root Directory đã gõ đúng
  `server` chưa, và file `package.json` có nằm trong thư mục `server`
  đã upload lên GitHub không.
- **Kết nối được nhưng vào phòng không thấy gì**: kiểm tra đã upload
  cả thư mục `client/` và `shared/` lên GitHub cùng cấp với `server/`
  chưa (server cần đọc file ở `../client` và `../shared`).
- **Trang Render hiện "Application failed to respond"**: vào tab
  "Logs" trên Render xem dòng lỗi đỏ, thường là thiếu file hoặc sai
  Root Directory.
