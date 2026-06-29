# GOD HUNTER ONLINE — Hướng dẫn Multiplayer

> 📱 **Chỉ có điện thoại, không có máy tính?** Đọc file
> [`DEPLOY_RENDER.md`](./DEPLOY_RENDER.md) — hướng dẫn đưa server lên
> hosting miễn phí (Render) hoàn toàn từ điện thoại, không cần máy tính.

Bổ sung cho `god_hunter_pc.html` và `god_hunter_mobile.html`: chế độ
**Chơi Online** với 4 server (Thường/Riêng Tư × Map Gốc/Dungeon 10 Ải),
chat, và chống gian lận bằng cơ chế **server-authoritative** (server tự
tính HP/Mana/Sát thương — sửa biến qua console trên máy bạn không có
tác dụng gì với kết quả trận đấu thật).

## 1. Chơi offline như cũ — không đổi gì

Mở `client/god_hunter_pc.html` hoặc `client/god_hunter_mobile.html` như
bình thường. Toàn bộ gameplay gốc giữ nguyên 100%. Chỉ có thêm **1 nút
"🌐 CHƠI ONLINE"** ở góc màn hình — không bấm vào thì mọi thứ y như cũ.

## 2. Chạy server Online

### Cách A — Tự chạy trên máy bạn (Windows/Mac/Linux), 4 port riêng

#### Bước 1 — Cài Node.js
Tải tại https://nodejs.org (bản LTS) nếu máy chưa có.

#### Bước 2 — Cài thư viện
```bash
cd server
npm install
```

#### Bước 3 — Khởi động cả 4 server cùng lúc
```bash
node start-all.js
```
Sẽ thấy:
```
1000 → Server Thường (Map Gốc)
2000 → Server Riêng Tư (Map Gốc)
3000 → Server Dungeon Thường (10 Ải)
4000 → Server Dungeon Riêng Tư (10 Ải)
```
Hoặc chạy riêng từng server (mỗi server 1 cửa sổ terminal):
```bash
SERVER_TYPE=world_public    node main-server.js   # Port 1000
SERVER_TYPE=world_private   node main-server.js   # Port 2000
SERVER_TYPE=dungeon_public  node main-server.js   # Port 3000
SERVER_TYPE=dungeon_private node main-server.js   # Port 4000
```

### Cách B — Deploy lên hosting free (Render...), 1 port duy nhất

Dùng khi bạn chỉ có điện thoại, hoặc muốn bạn bè ở xa (ngoài mạng LAN)
cũng vào chơi được. Xem hướng dẫn chi tiết từng bước trong
[`DEPLOY_RENDER.md`](./DEPLOY_RENDER.md).

Tóm tắt: thay vì `start-all.js` (mở 4 port), dùng `server/unified-server.js`
— gộp cả 4 loại server vào đúng 1 port (phù hợp giới hạn của hosting free
chỉ cho mở 1 port), phân biệt bằng đường dẫn:
```
wss://<domain>/ws/world_public
wss://<domain>/ws/world_private
wss://<domain>/ws/dungeon_public
wss://<domain>/ws/dungeon_private
```
Lệnh chạy: `npm start` (đã cấu hình sẵn trong `package.json` để chạy
`unified-server.js`).

## 3. Vào chơi Online

1. Mở `god_hunter_pc.html` hoặc `god_hunter_mobile.html`
2. Bấm nút **🌐 CHƠI ONLINE** (mở tab/trang mới: `online.html`)
3. Nhập tên Hunter
4. Chọn 1 trong 4 loại server:
   - **Server Thường** — vào ngay, chung phòng với mọi người, đánh
     Chaos Boss + quái như map gốc.
   - **Server Riêng Tư** — nhập **Mã phòng** (ví dụ `PARTY1`) và
     **Mật khẩu**. Nếu mã phòng đó chưa ai tạo, phòng mới sẽ được tạo
     với mật khẩu bạn nhập; người sau muốn vào cùng phòng phải nhập
     đúng cả mã phòng và mật khẩu đó.
   - **Dungeon Thường / Dungeon Riêng Tư** — tương tự nhưng vào
     Dungeon 10 Ải thay vì map gốc.
5. Nhập địa chỉ vào ô "Địa chỉ server":
   - **Để trống** (hoặc `localhost`) nếu server đang chạy trên cùng
     máy/mạng LAN bằng `start-all.js` (Cách A).
   - **Dán domain thật** (ví dụ `ten-app.onrender.com`) nếu server đã
     deploy lên Render hoặc hosting khác (Cách B) — game tự nhận diện
     đây là domain thật và tự chuyển sang kiểu kết nối path (`wss://`)
     phù hợp, không cần chọn gì thêm.
6. Bấm **KẾT NỐI & VÀO GAME**.

## 4. Dungeon 10 Ải

- Tất cả người chơi trong server thấy cùng 1 bản đồ, cùng đánh chung
  quái/boss của ải đó (không phải bản đồ riêng từng người).
- Ải sau chỉ mở khi đã hạ được boss ải hiện tại — tăng dần theo thứ tự
  1 → 10. Ải 10 có "👑 THƯỢNG ĐẾ HỖN MANG", boss mạnh nhất.
- Bấm **"Chọn Ải"** (góc trên phải khi đang ở dungeon) để xem ải nào
  đã mở khoá và di chuyển qua lại giữa các ải đã mở.

## 5. Chat

Khung chat luôn hiện khi đang chơi Online (góc dưới trái). Gõ tin
nhắn, Enter hoặc bấm "Gửi" — mọi người trong cùng phòng/ải thấy được.

## 6. Vì sao không thể chỉnh sửa HP/Mana/Sát thương qua Console (F12)?

Ở chế độ Online, **toàn bộ con số quan trọng (HP, Mana, sát thương gây
ra, kết quả mỗi đòn đánh) đều được tính và lưu trên server**, không
phải trên máy của người chơi. Khi bạn bấm một nút kỹ năng, trình duyệt
chỉ gửi "tôi vừa bấm nút Z" lên server; server tự tính damage thật theo
đúng công thức của trò chơi, áp dụng vào HP của quái/boss, rồi gửi kết
quả về cho mọi người. Nếu ai đó mở Console và gõ lệnh sửa biến `S.hp =
999999`, biến đó chỉ tồn tại trên máy họ — server không bao giờ đọc
hay tin theo biến đó, nên trận đấu thật không bị ảnh hưởng.

Ngoài ra, hệ thống còn:
- **Phát hiện DevTools đang mở** (dựa trên kích thước cửa sổ trình
  duyệt thay đổi bất thường) và cảnh báo/kick nếu phát hiện nhiều lần.
- **Giới hạn tốc độ gửi lệnh** (rate-limit) — nếu một tài khoản gửi
  lệnh nhanh hơn khả năng bấm phím của người thật, hệ thống sẽ từ chối
  lệnh đó và tích điểm nghi vấn; tích lũy đủ nhiều sẽ tự kick khỏi
  server.

Đây là cách duy nhất thực sự đáng tin cậy để chống gian lận trong môi
trường nhiều người chơi — không có cách nào ở phía trình duyệt (client)
chặn được 100% việc sửa biến nếu người dùng có quyền truy cập DevTools
trên máy của chính họ, nên chuyển toàn bộ phép tính quan trọng sang
server là điều bắt buộc.

## 7. Cấu trúc file

```
shared/
  combat-data.js     — Bảng số liệu damage/skill dùng chung (đúng số liệu bản gốc)

server/
  game-engine.js     — Lớp GameRoom: toàn bộ luật chơi server-authoritative
  anti-cheat.js       — Đánh giá báo cáo tích hợp (devtools/spam) từ client
  main-server.js      — Server WebSocket (Cách A: 4 port riêng, tự chạy máy/LAN)
  unified-server.js   — Server WebSocket (Cách B: 1 port + path, dùng để deploy Render...)
  start-all.js        — Chạy cả 4 server (Cách A) cùng lúc trong 1 process
  package.json

client/
  god_hunter_pc.html      — Bản gốc + nút "🌐 CHƠI ONLINE"
  god_hunter_mobile.html  — Bản gốc + nút "🌐 CHƠI ONLINE"
  online.html             — Giao diện chọn server / dungeon / chat
  online-client.js        — Logic kết nối WebSocket, render, joystick, anti-cheat client
```

## 8. Giới hạn hiện tại (để minh bạch)

- Phần lớn cơ chế combat chính (M1/M2/M3, 9 chiêu chính theo từng
  nhánh sức mạnh, 4 chiêu phụ theo vũ khí, Chemical Reaction) đã được
  chuyển sang server-authoritative đầy đủ. Một số cơ chế phụ rất chi
  tiết của bản gốc (ví dụ nội tại "Ép Quỳ" tự động của God Form) chưa
  được port sang server ở bản này — có thể bổ sung thêm nếu cần.
- Hiển thị trong `online.html` hiện ở dạng đơn giản hoá (chấm vuông
  đại diện người chơi/quái) để tập trung vào tính đúng của hệ thống
  server-authoritative/multiplayer/anti-cheat; có thể nâng cấp hình ảnh
  giống bản gốc ở bước sau nếu bạn muốn.
- Lưu trữ phòng riêng tư/Guild hiện ở bộ nhớ (RAM) của server, mất khi
  tắt server. Nếu cần lưu lâu dài qua việc khởi động lại server, có thể
  bổ sung lưu file JSON tương tự cách Guild được lưu ở bản 3D trước.
