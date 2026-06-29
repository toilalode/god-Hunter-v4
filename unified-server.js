/* ============================================================
   GOD HUNTER ONLINE — UNIFIED SERVER (1 port, 4 loại server theo path)
   Dùng để deploy lên các dịch vụ hosting free chỉ cho 1 port public
   (Render, Railway, Fly.io...). Logic combat/room y hệt main-server.js,
   chỉ khác tầng kết nối: phân biệt loại server theo URL path thay vì
   port riêng.

   WebSocket endpoints:
     wss://<domain>/ws/world_public     — Server Thường (Map Gốc)
     wss://<domain>/ws/world_private    — Server Riêng Tư (Map Gốc)
     wss://<domain>/ws/dungeon_public   — Server Dungeon Thường (10 Ải)
     wss://<domain>/ws/dungeon_private  — Server Dungeon Riêng Tư (10 Ải)

   Chạy local:  node unified-server.js          (cổng 8080 mặc định)
   Trên Render: tự dùng biến môi trường PORT do Render cấp.
   ============================================================ */
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { GameRoom, DUNGEON_FLOORS, TICK_MS } = require('./game-engine');
const { checkClientIntegrity } = require('./anti-cheat');

const PORT = process.env.PORT || 8080;
const SERVER_LABELS = {
  world_public: '🌐 SERVER THƯỜNG (Map Gốc)',
  world_private: '🔒 SERVER RIÊNG TƯ (Map Gốc)',
  dungeon_public: '🏰 SERVER DUNGEON THƯỜNG (10 Ải)',
  dungeon_private: '🔒🏰 SERVER DUNGEON RIÊNG TƯ (10 Ải)'
};
const VALID_TYPES = Object.keys(SERVER_LABELS);

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

// noServer mode: tự xử lý upgrade theo path để route tới đúng "server ảo"
const wss = new WebSocket.Server({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const match = url.pathname.match(/^\/ws\/([a-z_]+)$/);
  const serverType = match ? match[1] : null;
  if (!VALID_TYPES.includes(serverType)) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.__serverType = serverType;
    wss.emit('connection', ws, req);
  });
});

// roomId -> GameRoom    |   roomId -> { passwordHash, ownerId }
const rooms = new Map();
const privateRoomMeta = new Map();
const clientsById = new Map();

function nowMs() { return Date.now(); }
function makeId() { return 'u' + Math.random().toString(36).slice(2, 10) + nowMs().toString(36); }
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}

function getOrCreateRoom(serverType, roomId, floor) {
  const key = serverType + ':' + roomId;
  if (!rooms.has(key)) {
    const mode = serverType.startsWith('dungeon') ? 'dungeon' : 'world';
    rooms.set(key, new GameRoom(key, mode, floor || 1));
  }
  return rooms.get(key);
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
  const SERVER_TYPE = ws.__serverType;
  const IS_PRIVATE = SERVER_TYPE.endsWith('_private');
  const IS_DUNGEON = SERVER_TYPE.startsWith('dungeon');
  const SERVER_LABEL = SERVER_LABELS[SERVER_TYPE];

  const playerId = makeId();
  let currentRoom = null;
  let joined = false;
  clientsById.set(playerId, ws);

  sendTo(ws, { type:'welcome', id:playerId, serverType:SERVER_TYPE, isPrivate:IS_PRIVATE, isDungeon:IS_DUNGEON, label:SERVER_LABEL, dungeonFloors: IS_DUNGEON ? DUNGEON_FLOORS.map(f=>({floor:f.floor,name:f.name,bossName:f.bossName})) : null });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }

    if (msg.type === 'integrity_report') {
      const verdict = checkClientIntegrity(msg.report);
      if (!verdict.ok) { sendTo(ws, { type:'kicked', reason: verdict.reason }); ws.close(); }
      return;
    }

    if (msg.type === 'join') {
      const name = String(msg.name || 'Hunter').slice(0, 24).trim() || 'Hunter';
      let roomId;

      if (IS_PRIVATE) {
        roomId = String(msg.roomCode || '').trim().toUpperCase().slice(0, 12);
        if (!roomId) { sendTo(ws, { type:'join_error', reason:'need_room_code' }); return; }
        const metaKey = SERVER_TYPE + ':' + roomId;
        const pwHash = simpleHash(String(msg.password || ''));
        if (!privateRoomMeta.has(metaKey)) {
          privateRoomMeta.set(metaKey, { passwordHash: pwHash, ownerId: playerId });
        } else {
          const meta = privateRoomMeta.get(metaKey);
          if (meta.passwordHash !== pwHash) { sendTo(ws, { type:'join_error', reason:'wrong_password' }); return; }
        }
      } else {
        roomId = IS_DUNGEON ? 'public-dungeon' : 'public-world';
      }

      const floor = IS_DUNGEON ? Math.max(1, Math.min(10, parseInt(msg.floor) || 1)) : 1;
      const finalRoomId = IS_DUNGEON ? roomId + ':floor' + floor : roomId;
      currentRoom = getOrCreateRoom(SERVER_TYPE, finalRoomId, floor);
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
      const baseId = currentRoom.roomId.split(':floor')[0].replace(SERVER_TYPE + ':', '');
      currentRoom.removePlayer(playerId);
      const newRoom = getOrCreateRoom(SERVER_TYPE, baseId + ':floor' + targetFloor, targetFloor);
      const carriedUnlock = p.unlockedFloor;
      newRoom.addPlayer(playerId, p.name);
      newRoom.players.get(playerId).unlockedFloor = carriedUnlock;
      currentRoom = newRoom;
      sendTo(ws, { type:'joined', roomId: newRoom.roomId, you: newRoom.players.get(playerId), snapshot: newRoom.getSnapshot(), chatHistory: newRoom.chatHistory });
      return;
    }

    const result = currentRoom.handleInput(playerId, msg);
    const p = currentRoom.players.get(playerId);

    if (result.ok) {
      const floorClear = currentRoom.checkFloorClear(playerId);
      broadcastRoom(currentRoom, { type:'input_result', playerId, input: msg.type, key: msg.key, effect: result.effect });
      if (floorClear) sendTo(ws, { type:'floor_cleared', ...floorClear });
    } else {
      sendTo(ws, { type:'input_rejected', input: msg.type, reason: result.reason });
    }

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

setInterval(() => {
  rooms.forEach(room => {
    room.tick();
    if (room.players.size > 0) {
      broadcastRoom(room, { type:'snapshot', snapshot: room.getSnapshot() });
    }
  });
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log('========================================');
  console.log(' GOD HUNTER ONLINE — UNIFIED SERVER (1 port, 4 loại)');
  console.log(' Đang chạy tại port:', PORT);
  console.log(' Endpoints:');
  VALID_TYPES.forEach(t => console.log('   /ws/' + t + '  →  ' + SERVER_LABELS[t]));
  console.log('========================================');
});
