/* ============================================================
   GOD HUNTER ONLINE — CLIENT LOGIC
   ============================================================ */

let ws = null;
let myId = null;
let myState = null;
let serverInfo = null;
let latestSnapshot = { monsters:[], players:[] };
let chosenServerType = 'world_public';
// Port riêng (dùng khi tự chạy server/start-all.js trên máy/LAN của bạn)
const SERVER_PORTS = { world_public:1000, world_private:2000, dungeon_public:3000, dungeon_private:4000 };

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ---------------- ANTI-CHEAT: DevTools detection ---------------- */
let devtoolsOpenCount = 0;
let suspiciousCalls = 0;
let inputTimestamps = [];

(function devtoolsWatcher() {
  const threshold = 160; // px — chênh lệch lớn giữa outer/inner thường do panel devtools chiếm chỗ
  setInterval(() => {
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    const likelyOpen = widthDiff > threshold || heightDiff > threshold;
    if (likelyOpen) {
      devtoolsOpenCount++;
      document.getElementById('devtoolsWarning').classList.remove('hidden');
      reportIntegrity();
    } else {
      document.getElementById('devtoolsWarning').classList.add('hidden');
    }
  }, 1000);

  // Bẫy console.log gọi bất thường nhiều lần liên tiếp trong thời gian ngắn (dấu hiệu thử nghiệm console)
  const origLog = console.log;
  let logBurst = 0, logBurstWindowStart = Date.now();
  console.log = function(...args) {
    const now = Date.now();
    if (now - logBurstWindowStart > 2000) { logBurst = 0; logBurstWindowStart = now; }
    logBurst++;
    if (logBurst > 30) suspiciousCalls++;
    return origLog.apply(console, args);
  };
})();

function reportIntegrity() {
  const now = Date.now();
  inputTimestamps = inputTimestamps.filter(t => now - t < 1000);
  const maxInputRate = inputTimestamps.length;
  send({ type:'integrity_report', report:{ devtoolsOpenCount, suspiciousCalls, maxInputRate } });
}
setInterval(reportIntegrity, 3000);

/* ---------------- SERVER SELECT UI ---------------- */
function selectServerType(type) {
  chosenServerType = type;
  document.querySelectorAll('#serverSelectScreen button.serverChoiceBtn').forEach(b => {
    b.style.opacity = '0.45';
    b.style.boxShadow = 'none';
    b.style.transform = 'scale(1)';
  });
  const btn = event.target.closest('button');
  btn.style.opacity = '1';
  btn.style.transform = 'scale(1.03)';
  btn.style.boxShadow = '0 0 18px currentColor';
  const isPrivate = type.endsWith('_private');
  document.getElementById('privateRoomFields').classList.toggle('hidden', !isPrivate);
}

function connectToServer() {
  const name = document.getElementById('playerNameInput').value.trim() || 'Hunter';
  const hostRaw = document.getElementById('serverHostInput').value.trim();
  const statusEl = document.getElementById('connectStatus');

  let url;
  if (!hostRaw || hostRaw === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostRaw)) {
    // Không nhập gì, hoặc nhập localhost/IP LAN -> dùng kiểu PORT riêng (tự chạy start-all.js)
    const port = SERVER_PORTS[chosenServerType];
    url = `ws://${hostRaw || 'localhost'}:${port}`;
  } else {
    // Nhập domain thật (ví dụ tên-app.onrender.com) -> dùng kiểu 1 PORT + path (unified-server.js trên Render)
    const isSecure = !hostRaw.includes('localhost');
    const scheme = isSecure ? 'wss' : 'ws';
    const cleanHost = hostRaw.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
    url = `${scheme}://${cleanHost}/ws/${chosenServerType}`;
  }

  statusEl.style.color = '#ffaa00';
  statusEl.textContent = 'Đang kết nối tới ' + url + ' ...';

  try { ws = new WebSocket(url); }
  catch(e) { statusEl.style.color = '#ff5555'; statusEl.textContent = '❌ Không thể tạo kết nối: ' + e.message; return; }

  ws.onopen = () => {
    statusEl.style.color = '#88ff88';
    statusEl.textContent = '✅ Đã kết nối! Đang vào phòng...';
    const joinMsg = { type:'join', name };
    if (chosenServerType.endsWith('_private')) {
      joinMsg.roomCode = document.getElementById('roomCodeInput').value.trim();
      joinMsg.password = document.getElementById('roomPasswordInput').value;
      if (!joinMsg.roomCode) { statusEl.style.color='#ff5555'; statusEl.textContent='⚠️ Cần nhập Mã phòng cho server riêng tư'; ws.close(); return; }
    }
    if (chosenServerType.startsWith('dungeon')) joinMsg.floor = 1;
    send(joinMsg);
  };
  ws.onclose = () => {
    if (document.getElementById('hud').classList.contains('hidden')) {
      statusEl.style.color = '#ff5555';
      statusEl.textContent = '❌ Mất kết nối tới server. Kiểm tra server đã chạy chưa (xem README).';
    } else {
      addLog('🔴 Mất kết nối tới server.');
    }
  };
  ws.onerror = () => {
    statusEl.style.color = '#ff5555';
    statusEl.textContent = '❌ Lỗi kết nối. Server có thể chưa chạy hoặc sai địa chỉ/port.';
  };
  ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch(e) { return; }
    handleServerMessage(msg);
  };
}

function send(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function sendInput(obj) {
  inputTimestamps.push(Date.now());
  send(obj);
}

/* ---------------- SERVER MESSAGE HANDLING ---------------- */
function handleServerMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      myId = msg.id;
      serverInfo = msg;
      break;
    case 'joined':
      myState = msg.you;
      latestSnapshot = msg.snapshot;
      document.getElementById('serverSelectScreen').style.display = 'none';
      document.getElementById('hud').classList.remove('hidden');
      document.getElementById('serverLabel').textContent = serverInfo ? serverInfo.label : '';
      if (serverInfo && serverInfo.isDungeon) {
        document.getElementById('dungeonFloorPanel').classList.remove('hidden');
        document.getElementById('currentFloorText').textContent = msg.roomId.includes(':floor') ? msg.roomId.split(':floor')[1] : '1';
      }
      (msg.chatHistory||[]).forEach(c => renderChatLine(c));
      addLog('✅ Đã vào phòng: ' + msg.roomId);
      updateHUD();
      break;
    case 'snapshot':
      latestSnapshot = msg.snapshot;
      updatePlayerListUI();
      // Đồng bộ lại HP/Mana của chính mình từ snapshot (server-authoritative)
      const me = latestSnapshot.players.find(p => p.id === myId);
      if (me) { myState = Object.assign(myState||{}, me); updateHUD(); }
      break;
    case 'input_result':
      handleInputResultVisual(msg);
      break;
    case 'input_rejected':
      if (msg.reason === 'cooldown') { /* im lặng, tránh spam log */ }
      else addLog('⚠️ Hành động bị từ chối: ' + msg.reason);
      break;
    case 'chat':
      renderChatLine(msg);
      break;
    case 'player_joined':
      addLog('👋 ' + msg.name + ' đã vào phòng.');
      break;
    case 'player_left':
      addLog('🚪 ' + (msg.name||'Một người chơi') + ' đã rời phòng.');
      break;
    case 'floor_locked':
      alert('Ải ' + msg.floor + ' chưa được mở khoá! Hãy đánh bại boss ải hiện tại trước.');
      break;
    case 'floor_cleared':
      addLog('🎉 ĐÃ HẠ BOSS ẢI ' + msg.clearedFloor + '! Ải ' + msg.nextFloor + ' đã được mở khoá!');
      break;
    case 'join_error':
      alert('Không thể vào phòng: ' + (msg.reason === 'wrong_password' ? 'Sai mật khẩu phòng' : msg.reason === 'need_room_code' ? 'Cần nhập mã phòng' : msg.reason));
      break;
    case 'kicked':
      alert('Bạn đã bị kick khỏi server. Lý do: ' + (msg.reason === 'devtools_detected' ? 'Phát hiện mở DevTools' : msg.reason === 'suspicious_activity' ? 'Hành vi đáng nghi (có thể do spam/cheat)' : msg.reason));
      window.location.reload();
      break;
  }
}

function handleInputResultVisual(msg) {
  const e = msg.effect;
  if (!e) return;
  if (e.title) {
    let line = `✨ <b>${e.title}</b>`;
    if (typeof e.dmg === 'number') line += ` — ${formatBig(e.dmg)} DMG`;
    else if (e.dmg === 'INFINITE') line += ` — VÔ HẠN DMG`;
    if (e.killed && e.killed.length) line += ` <span style="color:#ff5555">[Hạ gục: ${e.killed.join(', ')}]</span>`;
    addLog(line);
  }
  if (e.cutscene) playCutscene(e.cutscene[0], e.cutscene[1]);
}

function formatBig(n) {
  if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

/* ---------------- HUD UPDATE ---------------- */
function updateHUD() {
  if (!myState) return;
  document.getElementById('hpText').textContent = formatBig(myState.hp);
  document.getElementById('hpBar').style.width = Math.max(0, myState.hp/myState.maxHp*100) + '%';
  document.getElementById('manaText').textContent = formatBig(myState.mana);
  document.getElementById('manaBar').style.width = Math.max(0, myState.mana/myState.maxMana*100) + '%';
  document.getElementById('killText').textContent = myState.kills;
}

function updatePlayerListUI() {
  const body = document.getElementById('playerListBody');
  body.innerHTML = latestSnapshot.players.map(p => {
    const isMe = p.id === myId;
    return `<div style="${isMe?'color:#ffcc00;font-weight:bold;':''}">${isMe?'➤ ':''}${p.name} — HP ${formatBig(p.hp)} | Kills ${p.kills}</div>`;
  }).join('');
}

let logLines = [];
function addLog(html) {
  logLines.unshift(html);
  if (logLines.length > 6) logLines.pop();
  document.getElementById('combatLog').innerHTML = logLines.map(l =>
    `<div style="background:rgba(10,5,25,0.75);border-left:3px solid #9945ff;padding:4px 8px;border-radius:4px;color:#ddd;font-size:10px;">${l}</div>`
  ).join('');
}

function playCutscene(title, desc) {
  addLog(`🎬 <b>${title}</b>: ${desc}`);
}

/* ---------------- CHAT ---------------- */
function renderChatLine(c) {
  const box = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.innerHTML = `<span style="color:#ffcc00;">${escapeHtml(c.name)}:</span> ${escapeHtml(c.text)}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  send({ type:'chat', text });
  input.value = '';
}
document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

/* ---------------- FORM / WEAPON / SKILL SELECT ---------------- */
function selectForm(form) { send({ type:'selectForm', form }); closeAllPopups(); addLog('🧍 Đổi Form'); }
function selectWeapon(weapon) { send({ type:'selectWeapon', weapon }); closeAllPopups(); addLog('🗡️ Đổi Vũ Khí'); }
function selectSkillMode(skillMode) { send({ type:'selectSkillMode', skillMode }); closeAllPopups(); addLog('🌀 Đổi Sức Mạnh'); }

/* ---------------- DUNGEON FLOOR SELECT ---------------- */
function openFloorSelect() {
  const list = document.getElementById('floorSelectList');
  const unlocked = myState ? myState.unlockedFloor || 1 : 1;
  list.innerHTML = '';
  for (let f = 1; f <= 10; f++) {
    const locked = f > unlocked;
    const btn = document.createElement('button');
    btn.style = `padding:10px; border-radius:8px; border:2px solid ${locked?'#555':'#2ecc71'}; background:${locked?'#33333322':'#2ecc7122'}; color:${locked?'#777':'#2ecc71'}; font-weight:bold; font-size:12px; text-align:left;`;
    btn.textContent = (locked ? '🔒 ' : '⚔️ ') + 'Ải ' + f + (locked ? ' (Chưa mở khoá)' : '');
    btn.onclick = () => { send({ type:'switch_floor', floor:f }); closeAllPopups(); };
    list.appendChild(btn);
  }
  openPopup('popupFloorSelect');
}

/* ---------------- POPUP HELPERS ---------------- */
function closeAllPopups() { ['popupForm','popupSkill','popupWeapon','popupSkillPad','popupFloorSelect'].forEach(id=>document.getElementById(id).classList.add('hidden')); document.getElementById('popupBackdrop').classList.add('hidden'); }
function openPopup(id) { closeAllPopups(); document.getElementById('popupBackdrop').classList.remove('hidden'); document.getElementById(id).classList.remove('hidden'); }
function closePopup(id) { document.getElementById(id).classList.add('hidden'); document.getElementById('popupBackdrop').classList.add('hidden'); }

/* ---------------- JOYSTICK (di chuyển) ---------------- */
let touchMove = { active:false, id:null, startX:0, startY:0, dx:0 };
let myFacing = 1;
let myX = 200;

function setupJoystick() {
  const base = document.getElementById('joystickBase');
  const knob = document.getElementById('joystickKnob');
  const maxDist = 42;
  function onStart(e) {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    touchMove.active = true;
    touchMove.id = e.changedTouches ? t.identifier : 'mouse';
    touchMove.startX = t.clientX;
  }
  function onMove(e) {
    if (!touchMove.active) return;
    let t = null;
    if (e.changedTouches) { for (const ct of e.changedTouches) if (ct.identifier === touchMove.id) t = ct; if (!t) return; }
    else t = e;
    let dx = t.clientX - touchMove.startX;
    dx = Math.max(-maxDist, Math.min(maxDist, dx));
    touchMove.dx = dx / maxDist;
    knob.style.transform = `translate(${dx}px, 0px)`;
  }
  function onEnd(e) {
    touchMove.active = false; touchMove.dx = 0;
    knob.style.transform = 'translate(0px, 0px)';
  }
  base.addEventListener('touchstart', e => { e.preventDefault(); onStart(e); }, { passive:false });
  window.addEventListener('touchmove', onMove, { passive:true });
  window.addEventListener('touchend', onEnd, { passive:true });
  base.addEventListener('mousedown', onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);

  // Bàn phím desktop A/D cũng hoạt động song song joystick
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyA') touchMove.dx = -1;
    if (e.code === 'KeyD') touchMove.dx = 1;
  });
  window.addEventListener('keyup', e => {
    if ((e.code === 'KeyA' && touchMove.dx < 0) || (e.code === 'KeyD' && touchMove.dx > 0)) touchMove.dx = 0;
  });
}
setupJoystick();

setInterval(() => {
  if (Math.abs(touchMove.dx) > 0.05) {
    myX += touchMove.dx * 6;
    myFacing = touchMove.dx > 0 ? 1 : -1;
    sendInput({ type:'move', x: myX, facing: myFacing });
  }
}, 100);

/* ---------------- RENDER LOOP (đơn giản: vẽ vị trí người chơi/quái/boss) ---------------- */
function render() {
  ctx.fillStyle = '#0a0518';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const groundY = canvas.height * 0.75;
  ctx.strokeStyle = '#3a2a6a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(canvas.width, groundY); ctx.stroke();

  const camOffsetX = (myState ? myX : 200) - canvas.width/2;

  // Quái/boss
  latestSnapshot.monsters.forEach(m => {
    if (m.isDead) return;
    const sx = m.x - camOffsetX;
    if (sx < -50 || sx > canvas.width+50) return;
    ctx.fillStyle = m.isBoss ? '#ff3333' : '#aa6622';
    const w = m.isBoss ? 60 : 36, h = m.isBoss ? 80 : 50;
    ctx.fillRect(sx-w/2, groundY-h, w, h);
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(m.name, sx, groundY-h-18);
    // HP bar
    const pct = Math.max(0, m.hp/m.maxHp);
    ctx.fillStyle = '#330000'; ctx.fillRect(sx-w/2, groundY-h-12, w, 5);
    ctx.fillStyle = m.isBoss ? '#ff3333' : '#ffaa33'; ctx.fillRect(sx-w/2, groundY-h-12, w*pct, 5);
    if (m.isStunned) { ctx.fillStyle = '#ffff00'; ctx.fillText('💫', sx, groundY-h-26); }
    if (m.frozen) { ctx.fillStyle = '#88ddff'; ctx.fillText('❄️', sx+14, groundY-h-26); }
  });

  // Người chơi
  latestSnapshot.players.forEach(p => {
    if (!p.alive) return;
    const sx = p.x - camOffsetX;
    if (sx < -50 || sx > canvas.width+50) return;
    const isMe = p.id === myId;
    ctx.fillStyle = isMe ? '#ffcc00' : '#00ccff';
    ctx.fillRect(sx-16, groundY-46, 32, 46);
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
    ctx.fillText(p.name, sx, groundY-54);
  });

  requestAnimationFrame(render);
}
render();
