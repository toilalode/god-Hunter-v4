/* ============================================================
   GOD HUNTER ONLINE — SERVER CHÍNH (WebSocket, server-authoritative)

   Có thể chạy theo 2 cách:

   CÁCH 1 — Mỗi server 1 process riêng (mỗi lệnh 1 cửa sổ terminal):
     SERVER_TYPE=world_public    node main-server.js   (Port 1000 - Thường)
     SERVER_TYPE=world_private   node main-server.js   (Port 2000 - Riêng Tư)
     SERVER_TYPE=dungeon_public  node main-server.js   (Port 3000 - Dungeon Thường)
     SERVER_TYPE=dungeon_private node main-server.js   (Port 4000 - Dungeon Riêng Tư)

   CÁCH 2 — Chạy cả 4 cùng lúc trong 1 process Node (đơn giản nhất):
     node start-all.js
   ============================================================ */
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { GameRoom, DUNGEON_FLOORS, TICK_MS } = require('./game-engine');
const { checkClientIntegrity } = require('./anti-cheat');

const DEFAULT_PORTS = { world_public:1000, world_private:2000, dungeon_public:3000, dungeon_private:4000 };
const SERVER_LABELS = {
  world_public: '🌐 SERVER THƯỜNG (Map Gốc)',
  world_private: '🔒 SERVER RIÊNG TƯ (Map Gốc)',
  dungeon_public: '🏰 SERVER DUNGEON THƯỜNG (10 Ải)',
  dungeon_private: '🔒🏰 SERVER DUNGEON RIÊNG TƯ (10 Ải)'
};

function startServer(serverTypeArg, portArg) {
  const SERVER_TYPE = serverTypeArg || process.env.SERVER_TYPE || 'world_public';
  const PORT = portArg || process.env.PORT || DEFAULT_PORTS[SERVER_TYPE] || 1000;
  const IS_PRIVATE = SERVER_TYPE.endsWith('_private');
  const IS_DUNGEON = SERVER_TYPE.startsWith('dungeon');
  const SERVER_LABEL = SERVER_LABELS[SERVER_TYPE] || SERVER_TYPE;

  const PUBLIC_DIR = path.join(__dirname, '..', 'client');
  const httpServer = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/online.html' : req.url;
    filePath = path.join(PUBLIC_DIR, filePath.split('?')[0]);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath);
      const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      res.end(data);
    });
  });

  const wss = new WebSocket.Server({ server: httpServer });

  // roomId -> GameRoom    |    roomId -> { passwordHash, ownerId } cho phòng riêng tư
  const rooms = new Map();
  const privateRoomMeta = new Map();
  const clientsById = new Map(); // playerId -> ws

  function nowMs() { return Date.now(); }
  function makeId() { return 'u' + Math.random().toString(36).slice(2, 10) + nowMs().toString(36); }

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
    return h.toString(36);
  }

  function getOrCreateRoom(roomId, floor) {
    if (!rooms.has(roomId)) {
      const mode = IS_DUNGEON ? 'dungeon' : 'world';
      rooms.set(roomId, new GameRoom(roomId, mode, floor || 1));
    }
    return rooms.get(roomId);
  }

  function broadcastRoom(room, msg, exceptWs) {
    const str = JSON.stringify(msg);
    room.players.forEach((p, id) => {
      const cws = clientsById.get(id);
      if (cws && cws !== exceptWs && cws.readyState === WebSocket.OPEN) cws.send(str);
    });
  }
  function sendTo(ws, msg) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }

  wss.on('connection', (ws) => {
    const playerId = makeId();
    let currentRoom = null;
    let joined = false;
    clientsById.set(playerId, ws);

    sendTo(ws, { type:'welcome', id:playerId, serverType:SERVER_TYPE, isPrivate:IS_PRIVATE, isDungeon:IS_DUNGEON, label:SERVER_LABEL, dungeonFloors: IS_DUNGEON ? DUNGEON_FLOORS.map(f=>({floor:f.floor,name:f.name,bossName:f.bossName})) : null });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch(e) { return; }

      // ---- Anti-cheat: kiểm tra báo cáo tích hợp/devtools từ client ----
      if (msg.type === 'integrity_report') {
        const verdict = checkClientIntegrity(msg.report);
        if (!verdict.ok) {
          sendTo(ws, { type:'kicked', reason: verdict.reason });
          ws.close();
        }
        return;
      }

      if (msg.type === 'join') {
        const name = String(msg.name || 'Hunter').slice(0, 24).trim() || 'Hunter';
        let roomId;

        if (IS_PRIVATE) {
          roomId = String(msg.roomCode || '').trim().toUpperCase().slice(0, 12);
          if (!roomId) { sendTo(ws, { type:'join_error', reason:'need_room_code' }); return; }
          const pwHash = simpleHash(String(msg.password || ''));
          if (!privateRoomMeta.has(roomId)) {
            privateRoomMeta.set(roomId, { passwordHash: pwHash, ownerId: playerId });
          } else {
            const meta = privateRoomMeta.get(roomId);
            if (meta.passwordHash !== pwHash) { sendTo(ws, { type:'join_error', reason:'wrong_password' }); return; }
          }
        } else {
          roomId = IS_DUNGEON ? 'public-dungeon' : 'public-world';
        }

        const floor = IS_DUNGEON ? Math.max(1, Math.min(10, parseInt(msg.floor) || 1)) : 1;
        const finalRoomId = IS_DUNGEON ? roomId + ':floor' + floor : roomId;
        currentRoom = getOrCreateRoom(finalRoomId, floor);
        const p = currentRoom.addPlayer(playerId, name);
        joined = true;

        sendTo(ws, { type:'joined', roomId: finalRoomId, you: p, snapshot: currentRoom.getSnapshot(), chatHistory: currentRoom.chatHistory });
        broadcastRoom(currentRoom, { type:'player_joined', name }, ws);
        return;
      }

      if (!joined || !currentRoom) { sendTo(ws, { type:'error', reason:'not_joined' }); return; }

      if (msg.type === 'chat') {
        const pl = currentRoom.players.get(playerId);
        const entry = currentRoom.addChat(pl ? pl.name : '???', msg.text);
        broadcastRoom(currentRoom, { type:'chat', ...entry });
        return;
      }

      if (msg.type === 'switch_floor' && IS_DUNGEON) {
        const p = currentRoom.players.get(playerId);
        const targetFloor = Math.max(1, Math.min(10, parseInt(msg.floor) || 1));
        if (targetFloor > p.unlockedFloor) { sendTo(ws, { type:'floor_locked', floor: targetFloor }); return; }
        const baseId = currentRoom.roomId.split(':floor')[0];
        currentRoom.removePlayer(playerId);
        const newRoom = getOrCreateRoom(baseId + ':floor' + targetFloor, targetFloor);
        const carriedUnlock = p.unlockedFloor;
        newRoom.addPlayer(playerId, p.name);
        newRoom.players.get(playerId).unlockedFloor = carriedUnlock;
        currentRoom = newRoom;
        sendTo(ws, { type:'joined', roomId: newRoom.roomId, you: newRoom.players.get(playerId), snapshot: newRoom.getSnapshot(), chatHistory: newRoom.chatHistory });
        return;
      }

      // ---- Mọi input combat/movement đi qua handleInput (server-authoritative) ----
      const result = currentRoom.handleInput(playerId, msg);
      const p = currentRoom.players.get(playerId);

      if (result.ok) {
        const floorClear = currentRoom.checkFloorClear(playerId);
        broadcastRoom(currentRoom, { type:'input_result', playerId, input: msg.type, key: msg.key, effect: result.effect });
        if (floorClear) sendTo(ws, { type:'floor_cleared', ...floorClear });
      } else {
        sendTo(ws, { type:'input_rejected', input: msg.type, reason: result.reason });
      }

      // Cờ nghi vấn cheat tích lũy quá cao -> kick (kiểm tra dù input có hợp lệ hay không)
      if (p && p.suspicious > 40) {
        sendTo(ws, { type:'kicked', reason:'suspicious_activity' });
        ws.close();
      }
    });

    ws.on('close', () => {
      clientsById.delete(playerId);
      if (currentRoom) {
        const p = currentRoom.players.get(playerId);
        currentRoom.removePlayer(playerId);
        broadcastRoom(currentRoom, { type:'player_left', id: playerId, name: p ? p.name : undefined });
        if (currentRoom.players.size === 0 && IS_PRIVATE) {
          rooms.delete(currentRoom.roomId);
        }
      }
    });
  });

  const tickInterval = setInterval(() => {
    rooms.forEach(room => {
      room.tick();
      if (room.players.size > 0) {
        broadcastRoom(room, { type:'snapshot', snapshot: room.getSnapshot() });
      }
    });
  }, TICK_MS);

  httpServer.listen(PORT, () => {
    console.log('========================================');
    console.log(' GOD HUNTER ONLINE —', SERVER_LABEL);
    console.log(' Đang chạy tại: http://localhost:' + PORT);
    console.log(' WebSocket sẵn sàng nhận kết nối.');
    console.log('========================================');
  });

  return { httpServer, wss, rooms, tickInterval };
}

module.exports = { startServer, DEFAULT_PORTS, SERVER_LABELS };

// Nếu file này được chạy trực tiếp (node main-server.js), tự khởi động 1 server theo SERVER_TYPE
if (require.main === module) {
  startServer();
}
