/* ============================================================
   GOD HUNTER ONLINE — ANTI-CHEAT (server-side verdict)
   Nguyên tắc cốt lõi: server-authoritative combat (HP/Mana/Damage
   luôn tính ở server) là lớp chống cheat THẬT SỰ hiệu quả — vì dù
   người chơi sửa biến JS trên máy họ qua console, con số đó không
   bao giờ được server tin dùng để tính kết quả trận đấu.

   Phần dưới đây xử lý thêm lớp giám sát: client tự phát hiện dấu
   hiệu mở DevTools / thay đổi bất thường và báo cáo lên server;
   server quyết định có kick hay không. Đây là lớp RĂN ĐE bổ sung,
   không phải lớp chống cheat duy nhất — vì không có client-side
   detector nào chặn được 100% (luôn có cách bypass), nhưng kết hợp
   với server-authoritative thì việc mở devtools sửa biến cũng
   không giúp người chơi gây dame giả hay có HP giả trên server.
   ============================================================ */

function checkClientIntegrity(report) {
  if (!report || typeof report !== 'object') return { ok:true };

  // devtoolsOpenCount: số lần client phát hiện kích thước cửa sổ bất thường (dấu hiệu DevTools dock)
  if (report.devtoolsOpenCount && report.devtoolsOpenCount >= 3) {
    return { ok:false, reason:'devtools_detected' };
  }
  // Phát hiện client cố gọi hàm nội bộ debug không tồn tại trong luồng chơi bình thường
  if (report.suspiciousCalls && report.suspiciousCalls > 5) {
    return { ok:false, reason:'suspicious_client_calls' };
  }
  // Tốc độ input client báo cáo bất thường (vượt xa giới hạn người chơi thật)
  if (report.maxInputRate && report.maxInputRate > 30) { // >30 input/giây là không thể với người thật
    return { ok:false, reason:'input_flood' };
  }
  return { ok:true };
}

module.exports = { checkClientIntegrity };
