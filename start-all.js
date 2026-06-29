/* ============================================================
   GOD HUNTER ONLINE — Khởi động CẢ 4 SERVER cùng lúc
   Chạy:  node start-all.js
   ============================================================ */
const { startServer } = require('./main-server');

startServer('world_public', 1000);
startServer('world_private', 2000);
startServer('dungeon_public', 3000);
startServer('dungeon_private', 4000);

console.log('\n🎮 TẤT CẢ 4 SERVER ĐÃ SẴN SÀNG! 🎮');
console.log('   1000 → Server Thường (Map Gốc)');
console.log('   2000 → Server Riêng Tư (Map Gốc)');
console.log('   3000 → Server Dungeon Thường (10 Ải)');
console.log('   4000 → Server Dungeon Riêng Tư (10 Ải)\n');
