/* ============================================================
   GOD HUNTER ONLINE — SERVER GAME ENGINE (authoritative)
   Toàn bộ HP/Mana/Damage/Cooldown được tính TẠI ĐÂY.
   Client chỉ gửi input (ví dụ "tôi bấm skill Z"), server tính
   kết quả thật và đẩy lại cho mọi người trong phòng.
   ============================================================ */
const SHARED = require('../shared/combat-data.js').GH_SHARED;

const TICK_MS = 100; // 10 tick/giây — đủ mượt cho 2D, nhẹ tải server
const PLAYER_MAX_HP = 10000000000;
const PLAYER_MAX_MANA = 10000;
const MANA_REGEN_PER_TICK = MANA_REGEN_PER_SEC => MANA_REGEN_PER_SEC / (1000/TICK_MS);

// ---- Cấu hình 10 ải Dungeon: quái/boss tăng dần sức mạnh ----
const DUNGEON_FLOORS = Array.from({length:10}, (_, i) => {
  const floor = i + 1;
  const mobMult = 1 + i * 0.6;     // ải 10 quái mạnh gấp ~6.4x ải 1
  const bossMult = 1 + i * 0.9;    // boss tăng nhanh hơn quái
  return {
    floor,
    name: `Ải ${floor} — ${floor < 4 ? 'Hắc Lâm' : floor < 7 ? 'Vực Hỗn Mang' : floor < 10 ? 'Địa Ngục Thần' : 'Ngai Vàng Thượng Đế'}`,
    mobCount: Math.min(3 + Math.floor(i/2), 9),
    mobHp: Math.floor(5000 * mobMult),
    mobDmg: Math.floor(80 * mobMult),
    bossHp: Math.floor(10000 * bossMult * (floor === 10 ? 3 : 1)), // ải 10 = siêu boss
    bossDmg: Math.floor(150 * bossMult * (floor === 10 ? 2 : 1)),
    bossName: floor === 10 ? '👑 THƯỢNG ĐẾ HỖN MANG (Siêu Boss Tối Thượng)' : `👹 Chaos Boss Ải ${floor}`
  };
});

function nowMs() { return Date.now(); }

function makeNewPlayerState(id, name) {
  return {
    id, name,
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    mana: PLAYER_MAX_MANA, maxMana: PLAYER_MAX_MANA,
    x: 200, y: 0, facing: 1,
    form: 1, weapon: 1, skillMode: 0,
    isDragonCoreSemi: false, dragonFlying: false,
    buffDamageActive: false, buffDefenseActive: false,
    immortalActive: false, infiniteMana: false,
    reflectActive: false, reflectUntil: 0,
    dimensionalWallActive: false,
    kills: 0, alive: true,
    cooldowns: {}, // key -> timestamp khi hết cooldown
    lastInputAt: nowMs(),
    floor: 1, // ải dungeon hiện tại (chỉ áp dụng phòng loại dungeon)
    unlockedFloor: 1, // ải cao nhất đã mở khoá
    suspicious: 0 // điểm nghi ngờ cheat, tích lũy -> kick
  };
}

function makeMonster(opts) {
  return {
    id: opts.id, name: opts.name, hp: opts.hp, maxHp: opts.hp,
    dmg: opts.dmg, x: opts.x, isBoss: !!opts.isBoss,
    isDead: false, deadAt: 0, isStunned: false, stunnedUntil: 0,
    frozen: false, frozenUntil: 0
  };
}

class GameRoom {
  constructor(roomId, mode, floor) {
    this.roomId = roomId;
    this.mode = mode; // 'world' (map gốc) | 'dungeon'
    this.floor = floor || 1;
    this.players = new Map(); // playerId -> state
    this.monsters = [];
    this.lastTick = nowMs();
    this.chatHistory = [];
    this.initMonsters();
  }

  initMonsters() {
    if (this.mode === 'world') {
      this.monsters = [
        makeMonster({ id:'boss', name:'👹 CHAOS BOSS', hp:10000, dmg:150, x:650, isBoss:true }),
        makeMonster({ id:'mob', name:'👾 Quái Thường', hp:5000, dmg:80, x:400 }),
        ...Array.from({length:9}, (_, i) => makeMonster({
          id:'extra'+(i+1), name:'Quái #'+(i+1), hp:5000, dmg:80, x:900+i*150
        }))
      ];
    } else {
      const cfg = DUNGEON_FLOORS[this.floor-1];
      this.monsters = [
        makeMonster({ id:'boss', name:cfg.bossName, hp:cfg.bossHp, dmg:cfg.bossDmg, x:650, isBoss:true }),
        ...Array.from({length:cfg.mobCount}, (_, i) => makeMonster({
          id:'mob'+(i+1), name:'Quái Ải '+this.floor+' #'+(i+1), hp:cfg.mobHp, dmg:cfg.mobDmg, x:300+i*180
        }))
      ];
    }
  }

  addPlayer(id, name) {
    const p = makeNewPlayerState(id, name);
    this.players.set(id, p);
    return p;
  }
  removePlayer(id) { this.players.delete(id); }

  addChat(name, text) {
    const entry = { name, text: String(text).slice(0,200), at: nowMs() };
    this.chatHistory.push(entry);
    if (this.chatHistory.length > 50) this.chatHistory.shift();
    return entry;
  }

  // ---- Combat: tính damage THẬT theo đúng công thức gốc, server quyết định ----
  computeM1(player) {
    const ctx = { form:player.form, skillMode:player.skillMode, weapon:player.weapon, isDragonCoreSemi:player.isDragonCoreSemi };
    let dmg = SHARED.getM1Damage(ctx);
    dmg = SHARED.applyDamageMultipliers(dmg, { form:player.form, skillMode:player.skillMode, buffDamageActive:player.buffDamageActive });
    return { dmg, title: SHARED.getM1Title(ctx) };
  }

  dealDamageNear(player, dmg, title, range) {
    range = range || 250;
    let totalDealt = 0;
    let killed = [];
    this.monsters.forEach(m => {
      if (m.isDead) return;
      if (Math.abs(m.x - player.x) > range) return;
      m.hp -= dmg;
      totalDealt += dmg;
      if (m.hp <= 0) {
        m.hp = 0; m.isDead = true; m.deadAt = nowMs();
        player.kills += m.isBoss ? 2 : 1;
        killed.push(m.id);
      }
    });
    return { totalDealt, killed, title };
  }

  applyStunNear(player, durationMs, range) {
    range = range || 250;
    let hit = false;
    this.monsters.forEach(m => {
      if (m.isDead) return;
      if (Math.abs(m.x - player.x) > range) return;
      m.isStunned = true; m.stunnedUntil = nowMs() + durationMs; hit = true;
    });
    return hit;
  }

  // ---- Xử lý 1 input từ client: { type:'m1'|'m2'|'m3'|'mainSkill'|'subSkill'|'chemical'|'move'|'selectForm'|... } ----
  handleInput(playerId, input) {
    const p = this.players.get(playerId);
    if (!p || !p.alive) return { ok:false, reason:'not_found_or_dead' };

    // Anti-cheat: rate-limit theo TỪNG LOẠI input riêng (chặn spam 1 nút nhanh hơn người thật có thể bấm),
    // không chặn chéo giữa các loại input khác nhau (move + skill khác phím vẫn xử lý đồng thời được).
    const t = nowMs();
    const minIntervalByType = { m1:80, m2:120, move:16 };
    const minInterval = minIntervalByType[input.type] ?? 30;
    p._lastByType = p._lastByType || {};
    const lastOfType = p._lastByType[input.type] || 0;
    if (t - lastOfType < minInterval) { p.suspicious += 1; return { ok:false, reason:'rate_limited' }; }
    p._lastByType[input.type] = t;
    p.lastInputAt = t;

    switch (input.type) {
      case 'move': {
        if (typeof input.x === 'number' && typeof input.facing === 'number') {
          // Giới hạn dịch chuyển mỗi tick để chặn teleport-cheat (tối đa 6 đơn vị / input)
          const maxDelta = 8;
          const delta = Math.max(-maxDelta, Math.min(maxDelta, input.x - p.x));
          p.x += delta;
          p.facing = input.facing === -1 ? -1 : 1;
        }
        return { ok:true };
      }
      case 'm1': {
        const { dmg, title } = this.computeM1(p);
        const res = this.dealDamageNear(p, dmg, title);
        return { ok:true, effect:{ kind:'damage', dmg, title, killed:res.killed } };
      }
      case 'm2': {
        const res = this.dealDamageNear(p, SHARED.M2_DMG, 'Cú Đá');
        return { ok:true, effect:{ kind:'damage', dmg:SHARED.M2_DMG, title:'Cú Đá', killed:res.killed } };
      }
      case 'm3': {
        const key = 'm3';
        if (this.onCooldown(p, key)) return { ok:false, reason:'cooldown' };
        this.setCooldown(p, key, 3000);
        const res = this.dealDamageNear(p, SHARED.M3_DMG, 'Parry Strike');
        return { ok:true, effect:{ kind:'damage', dmg:SHARED.M3_DMG, title:'Parry Strike', killed:res.killed } };
      }
      case 'selectForm': {
        if ([1,2,3].includes(input.form)) p.form = input.form;
        return { ok:true };
      }
      case 'selectWeapon': {
        if ([1,2,3,4].includes(input.weapon)) p.weapon = input.weapon;
        return { ok:true };
      }
      case 'selectSkillMode': {
        if (Number.isInteger(input.skillMode)) p.skillMode = input.skillMode;
        return { ok:true };
      }
      case 'mainSkill': {
        return this.handleMainSkill(p, input.key);
      }
      case 'subSkill': {
        return this.handleSubSkill(p, input.key);
      }
      case 'chemical': {
        if (p.form === 3) return { ok:false, reason:'not_in_god_form_required' };
        if (p.skillMode !== 2) return { ok:false, reason:'lightning_required' };
        const key = 'chemical';
        if (this.onCooldown(p, key)) return { ok:false, reason:'cooldown' };
        this.setCooldown(p, key, 30000);
        const res = this.dealDamageNear(p, SHARED.CHEMICAL_REACTION_DMG, '⚡ Chemical Reaction: 1 TỶ DMG');
        p.kills += 2;
        return { ok:true, effect:{ kind:'damage', dmg:SHARED.CHEMICAL_REACTION_DMG, title:'Chemical Reaction', killed:res.killed, cutscene:['THIÊN LÔI KIẾM CẢNH','Không gian tối sầm, hai mắt Thợ Săn phát sáng rực rỡ luồng điện lam tím.'] } };
      }
      default:
        return { ok:false, reason:'unknown_input' };
    }
  }

  onCooldown(p, key) { return p.cooldowns[key] && p.cooldowns[key] > nowMs(); }
  setCooldown(p, key, ms) { p.cooldowns[key] = nowMs() + ms; }

  handleMainSkill(p, key) {
    const table = SHARED.getMainSkillTable(p.form, p.skillMode);
    if (!table || !table[key]) return { ok:false, reason:'no_skill' };
    const sk = table[key];
    const cdKey = 'main_'+key;
    if (this.onCooldown(p, cdKey)) return { ok:false, reason:'cooldown' };
    this.setCooldown(p, cdKey, 1200); // cooldown ngắn cố định chống spam, không đổi gameplay gốc

    switch (sk.type) {
      case 'dmg': {
        let dmg = SHARED.applyDamageMultipliers(sk.dmg, { form:p.form, skillMode:p.skillMode, buffDamageActive:p.buffDamageActive });
        const res = this.dealDamageNear(p, dmg, sk.title);
        return { ok:true, effect:{ kind:'damage', dmg, title:sk.title, killed:res.killed, cutscene:sk.cutscene } };
      }
      case 'dmg_infinite': {
        const res = this.dealDamageNear(p, Number.MAX_SAFE_INTEGER/1e6, sk.title); // đủ để xóa sổ HP hiện có trong tầm
        return { ok:true, effect:{ kind:'damage', dmg:'INFINITE', title:sk.title, killed:res.killed, cutscene:sk.cutscene } };
      }
      case 'dmg_stun': {
        const res = this.dealDamageNear(p, sk.dmg, sk.title);
        this.applyStunNear(p, sk.stunMs);
        return { ok:true, effect:{ kind:'damage_stun', dmg:sk.dmg, title:sk.title, stunMs:sk.stunMs, killed:res.killed } };
      }
      case 'dmg_reflect': {
        const res = this.dealDamageNear(p, sk.dmg, sk.title);
        p.reflectActive = true; p.reflectUntil = nowMs() + sk.reflectMs;
        return { ok:true, effect:{ kind:'damage', dmg:sk.dmg, title:sk.title, killed:res.killed } };
      }
      case 'dmg_lifesteal': {
        const res = this.dealDamageNear(p, sk.dmg, sk.title);
        p.hp = Math.min(p.maxHp, p.hp + sk.healAmount);
        return { ok:true, effect:{ kind:'damage_heal', dmg:sk.dmg, heal:sk.healAmount, title:sk.title, killed:res.killed } };
      }
      case 'dmg_delayed': {
        setTimeout(() => { this.dealDamageNear(p, sk.dmg, sk.title); }, sk.delayMs);
        return { ok:true, effect:{ kind:'delayed', title:sk.title, delayMs:sk.delayMs } };
      }
      case 'special_full_heal': {
        p.hp = p.maxHp;
        return { ok:true, effect:{ kind:'heal_full', title:sk.title } };
      }
      case 'special_regen': {
        let tick = 0;
        const id = setInterval(() => {
          tick++; p.hp = Math.min(p.maxHp, p.hp + sk.perTick);
          if (tick >= sk.ticks) clearInterval(id);
        }, 1000);
        return { ok:true, effect:{ kind:'regen_started', title:sk.title } };
      }
      case 'special_infinite_mana': {
        p.infiniteMana = true; p.mana = p.maxMana;
        setTimeout(() => { p.infiniteMana = false; }, sk.durationMs);
        return { ok:true, effect:{ kind:'buff', title:sk.title } };
      }
      case 'special_immortal_toggle': {
        p.immortalActive = !p.immortalActive;
        return { ok:true, effect:{ kind:'toggle', active:p.immortalActive, title:sk.title } };
      }
      case 'special_flight_toggle': {
        p.dragonFlying = !p.dragonFlying;
        return { ok:true, effect:{ kind:'toggle', active:p.dragonFlying, title:sk.title } };
      }
      case 'special_semidragon_toggle': {
        p.isDragonCoreSemi = !p.isDragonCoreSemi;
        return { ok:true, effect:{ kind:'toggle', active:p.isDragonCoreSemi, title:sk.title } };
      }
      case 'special_dimwall_toggle': {
        p.dimensionalWallActive = !p.dimensionalWallActive;
        return { ok:true, effect:{ kind:'toggle', active:p.dimensionalWallActive, title:sk.title } };
      }
      case 'special_reflect_toggle': {
        p.reflectActive = !p.reflectActive;
        p.reflectUntil = p.reflectActive ? Infinity : 0;
        return { ok:true, effect:{ kind:'toggle', active:p.reflectActive, title:sk.title } };
      }
      case 'special_reflect_timed': {
        p.reflectActive = true; p.reflectUntil = nowMs() + sk.reflectMs;
        return { ok:true, effect:{ kind:'buff', title:sk.title } };
      }
      case 'special_freeze_toggle':
      case 'special_freeze_all_10s': {
        const willFreeze = sk.type === 'special_freeze_all_10s' ? true : !this.monsters.some(m=>m.frozen && !m.isDead);
        this.monsters.forEach(m => {
          if (m.isDead) return;
          m.frozen = willFreeze;
          m.frozenUntil = willFreeze ? nowMs() + 10000 : 0;
        });
        return { ok:true, effect:{ kind:'freeze', active:willFreeze, title:sk.title } };
      }
      case 'special_temporal_slow': {
        this.temporalSlowUntil = nowMs() + 10000;
        return { ok:true, effect:{ kind:'buff', title:sk.title } };
      }
      case 'noop':
      default:
        return { ok:true, effect:{ kind:'noop', title:sk.title } };
    }
  }

  handleSubSkill(p, key) {
    const effect = SHARED.getSubSkillEffect(p.weapon, key);
    if (!effect) return { ok:false, reason:'no_subskill' };
    if (p.form === 3) return { ok:false, reason:'not_in_god_form' };
    if (!p.infiniteMana) {
      if (p.mana < SHARED.SUB_SKILL_MANA_COST) return { ok:false, reason:'no_mana' };
      p.mana -= SHARED.SUB_SKILL_MANA_COST;
    }
    switch (effect.type) {
      case 'dmg_stun': {
        const res = this.dealDamageNear(p, effect.dmg, effect.title);
        this.applyStunNear(p, effect.stunMs);
        return { ok:true, effect:{ kind:'damage_stun', dmg:effect.dmg, title:effect.title, killed:res.killed } };
      }
      case 'dmg_infinite': {
        const res = this.dealDamageNear(p, Number.MAX_SAFE_INTEGER/1e6, effect.title);
        return { ok:true, effect:{ kind:'damage', dmg:'INFINITE', title:effect.title, killed:res.killed } };
      }
      case 'dmg': {
        const res = this.dealDamageNear(p, effect.dmg, effect.title);
        return { ok:true, effect:{ kind:'damage', dmg:effect.dmg, title:effect.title, killed:res.killed } };
      }
      case 'special_buff_dmg': {
        p.buffDamageActive = true;
        setTimeout(()=>{ p.buffDamageActive = false; }, effect.durationMs);
        return { ok:true, effect:{ kind:'buff', title:effect.title } };
      }
      case 'special_buff_def': {
        p.buffDefenseActive = true;
        setTimeout(()=>{ p.buffDefenseActive = false; }, effect.durationMs);
        return { ok:true, effect:{ kind:'buff', title:effect.title } };
      }
      case 'special_stun': {
        this.applyStunNear(p, effect.stunMs);
        return { ok:true, effect:{ kind:'stun', title:effect.title } };
      }
      default:
        return { ok:true, effect:{ kind:'noop', title:effect.title } };
    }
  }

  // ---- Kiểm tra điều kiện qua ải (dungeon): boss ải hiện tại chết -> mở ải sau ----
  checkFloorClear(playerId) {
    if (this.mode !== 'dungeon') return null;
    const boss = this.monsters.find(m => m.isBoss);
    if (boss && boss.isDead) {
      const p = this.players.get(playerId);
      if (p && p.unlockedFloor === this.floor && this.floor < 10) {
        p.unlockedFloor = this.floor + 1;
        return { clearedFloor: this.floor, nextFloor: this.floor + 1 };
      }
    }
    return null;
  }

  // ---- Tick định kỳ: hồi sinh quái/boss, hồi mana, hết hiệu lực buff ----
  tick() {
    const t = nowMs();
    // Hồi sinh quái/boss sau 5 giây
    this.monsters.forEach(m => {
      if (m.isDead && t - m.deadAt >= 5000) {
        m.isDead = false; m.hp = m.maxHp; m.isStunned = false; m.frozen = false;
      }
      if (m.isStunned && t > m.stunnedUntil) m.isStunned = false;
      if (m.frozen && m.frozenUntil && t > m.frozenUntil) m.frozen = false;
    });
    // Hồi mana người chơi
    this.players.forEach(p => {
      if (!p.infiniteMana) p.mana = Math.min(p.maxMana, p.mana + 1000/10); // ~1000/giây ở 10 tick/s
      if (p.reflectActive && p.reflectUntil !== Infinity && t > p.reflectUntil) p.reflectActive = false;
    });
  }

  // ---- Trạng thái rút gọn gửi cho client (đủ để vẽ, không lộ logic nội bộ) ----
  getSnapshot() {
    return {
      roomId: this.roomId, mode: this.mode, floor: this.floor,
      monsters: this.monsters.map(m => ({ id:m.id, name:m.name, hp:m.hp, maxHp:m.maxHp, x:m.x, isBoss:m.isBoss, isDead:m.isDead, isStunned:m.isStunned, frozen:m.frozen })),
      players: [...this.players.values()].map(p => ({
        id:p.id, name:p.name, hp:p.hp, maxHp:p.maxHp, mana:p.mana, maxMana:p.maxMana,
        x:p.x, facing:p.facing, form:p.form, weapon:p.weapon, skillMode:p.skillMode,
        kills:p.kills, alive:p.alive, unlockedFloor:p.unlockedFloor
      }))
    };
  }
}

module.exports = { GameRoom, DUNGEON_FLOORS, TICK_MS, PLAYER_MAX_HP, PLAYER_MAX_MANA };
