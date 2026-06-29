/* ============================================================
   GOD HUNTER ONLINE — SHARED COMBAT DATA
   Dùng chung giữa server (authoritative) và client (hiển thị/dự đoán).
   Số liệu lấy đúng từ god_hunter_pc.html / god_hunter_mobile.html bản gốc.
   Chạy được cả trong Node (module.exports) và trong browser (window.GH_SHARED).
   ============================================================ */
(function(root){

// Base M1 theo vũ khí (Normal Form, GỐC)
const WEAPON_BASE_DMG = { 1: 20, 2: 17, 3: 12 };

// skillMode: 0 goc,1 merge,2 lightning,3 space,4 time,5 recovery,6 resurrection,7 dragon
// formId: 1 normal, 2 shapeshift, 3 god

// Damage cố định của M1 theo (form, skillMode, weapon, isDragonSemi)
function getM1Damage(ctx) {
  const { form, skillMode, weapon, isDragonCoreSemi } = ctx;
  if (form === 3) return weapon === 4 ? 150 : 60; // Super God Blade
  if (skillMode === 1 && weapon === 1) return 400; // Chaos Harmony M1 x10
  if (skillMode === 7) return isDragonCoreSemi ? 180 : 30; // Dragon claw
  return WEAPON_BASE_DMG[weapon] || 20;
}

function getM1Title(ctx) {
  const { form, skillMode, weapon } = ctx;
  if (form === 3) return 'Super God Blade True DMG';
  if (skillMode === 1 && weapon === 1) return 'M1 Sovereign Edge Crit';
  if (skillMode === 7) return 'Blazing Dragon Claw';
  return 'Chém Thường';
}

const M2_DMG = 15;     // Cú đá
const M3_DMG = 50000;  // Parry Strike

// Bảng chiêu chính (Z X C V B N M J F) theo skillMode/form.
// type: 'dmg' (gây damage cố định), 'special' (xử lý riêng không qua damage chuẩn)
const GOD_FORM_SKILLS = {
  Z:{type:'dmg', dmg:180, title:'Divine Wrath Strike'},
  X:{type:'dmg', dmg:250, title:'Galaxy One-Shot', cutscene:['HEAVENLY GALAXY SLASH','Nhát chém tối thượng chém đôi vũ trụ song song, không thể né đỡ.']},
  C:{type:'dmg', dmg:200, title:'Galaxy Manipulation'},
  V:{type:'dmg', dmg:200, title:'Godly Will Space Crush'},
  B:{type:'special_freeze_toggle', title:'Eternal Freeze'},
  N:{type:'special_full_heal', title:'Kiến tạo vũ trụ'},
  M:{type:'noop', title:'Dark Galaxy Core'},
  J:{type:'dmg_infinite', title:'APOCALYPSE: VÔ HẠN DMG', cutscene:['TRUTH OF GOD - APOCALYPSE','Xóa sổ hoàn toàn tên và sự tồn tại của kẻ địch khỏi đa vũ trụ.']},
  F:{type:'dmg', dmg:250, title:'Cosmic Storm San Phẳng Map', cutscene:['ETERNAL COSMIC STORM','Đại chiêu bão lôi đình vũ trụ nổ tung liên tiếp 10 hành tinh.']}
};

const MERGE_SKILLS = { // skillMode 1
  Z:{type:'dmg', dmg:160, title:'Quintuple Energy Cannon'},
  X:{type:'dmg', dmg:165, title:'Galaxy Eraser Slash'},
  C:{type:'dmg', dmg:170, title:'Planetary Chaos Burst'},
  V:{type:'dmg', dmg:180, title:'Five-Element Impact Beam'},
  B:{type:'dmg', dmg:180, title:'Cosmic Fracture'},
  N:{type:'dmg', dmg:175, title:'Void Vortex Blackhole'},
  M:{type:'dmg', dmg:200, title:'Molecular Acceleration'},
  J:{type:'dmg', dmg:250, title:'Samsara Destruction One-Shot'},
  F:{type:'dmg', dmg:300, title:'Chaos Extinction', cutscene:['CHAOS EXTINCTION','Cắm kiếm phát nổ năng lượng nuốt chửng toàn server.']}
};

const DRAGON_SKILLS = { // skillMode 7
  Z:{type:'dmg', dmg:55, title:'Pyro Dragon Blast'},
  X:{type:'dmg', dmg:70, title:'Fatal Dragon Strike'},
  C:{type:'dmg', dmg:65, title:'Heavenly Dragon Inferno'},
  V:{type:'special_flight_toggle', title:'Flying Dragon Ascent'},
  B:{type:'special_semidragon_toggle', title:'Semi-Dragon'},
  N:{type:'dmg_stun', dmg:60, stunMs:10000, title:'Dragon Spirit Roar'},
  M:{type:'dmg', dmg:100, title:'Draconic Comet Fall'},
  J:{type:'dmg', dmg:50, title:'Dragonic Soul Devour'},
  F:{type:'dmg', dmg:375, title:'Dragon Ultimate', cutscene:['WESTERN DARK DRAGON GOD','Tây Phương Hắc Long Thần phóng hơi thở bóng tối nuốt chửng chiến trường.']}
};

const LIGHTNING_SKILLS = { // skillMode 2, form 1/2 only
  Z:{type:'dmg', dmg:35, title:'Thunder Dash'},
  X:{type:'dmg', dmg:50, title:'Nine Heavens Thunderbolt'},
  C:{type:'dmg', dmg:40, title:'Electric Claw Strike'},
  V:{type:'dmg_reflect', dmg:35, reflectMs:8000, title:'Static Shield'},
  B:{type:'dmg_stun', dmg:30, stunMs:3000, title:'Voltage Lock'},
  N:{type:'dmg_reflect', dmg:15, reflectMs:8000, title:'Storm Field'},
  M:{type:'dmg', dmg:65, title:'Lightning Dragon Burst'},
  J:{type:'dmg', dmg:80, title:'Ultimate Catastrophe'},
  F:{type:'dmg_stun', dmg:90, stunMs:5000, title:'Tê Liệt Vĩnh Viễn'}
};

const SPACE_SKILLS = { // skillMode 3
  Z:{type:'dmg', dmg:30, title:'Spatial Grip'},
  X:{type:'special_dimwall_toggle', title:'Dimensional Wall'},
  C:{type:'dmg', dmg:35, title:'Space Turbulence'},
  V:{type:'dmg', dmg:65, title:'Void Collapse'},
  B:{type:'dmg', dmg:55, title:'Spatial Slasher'},
  N:{type:'special_reflect_toggle', title:'Eternal Mirror Reflection'},
  M:{type:'dmg', dmg:40, title:'Void Chains'},
  J:{type:'dmg', dmg:150, title:'Space Shatter'},
  F:{type:'dmg', dmg:100, title:'Đập Nát Không Gian'}
};

const TIME_SKILLS = { // skillMode 4
  Z:{type:'special_freeze_all_10s', title:'Time Stop'},
  X:{type:'noop', title:'Time Acceleration'},
  C:{type:'special_temporal_slow', title:'Temporal Slow'},
  V:{type:'dmg', dmg:45, title:'Aging Touch'},
  B:{type:'special_reflect_timed', reflectMs:8000, title:'Temporal Echo'},
  N:{type:'noop', title:'Time Reversal'},
  M:{type:'dmg_delayed', dmg:100, delayMs:5000, title:'Damage Delay'},
  J:{type:'dmg', dmg:90, title:'Time Loop'},
  F:{type:'special_reflect_timed', reflectMs:6000, title:'Vòng Lặp Thời Gian'}
};

const RECOVERY_SKILLS = { // skillMode 5
  Z:{type:'special_full_heal', title:'Divine Healing'},
  X:{type:'special_regen', perTick:15, ticks:20, title:'Cell Regeneration'},
  C:{type:'special_regen', perTick:20, ticks:20, title:'Restoration Field'},
  V:{type:'noop', title:'Soul Purification'},
  B:{type:'special_infinite_mana', durationMs:300000, title:'Infinite Mana'},
  N:{type:'special_immortal_toggle', title:'Immortality'},
  M:{type:'noop', title:'Energy Equilibrium'},
  J:{type:'noop', title:'Absolute Assimilation'},
  F:{type:'dmg_lifesteal', dmg:100, healAmount:100, title:'Hút Máu Hồi Phục'}
};

function getMainSkillTable(form, skillMode) {
  if (form === 3) return GOD_FORM_SKILLS;
  if (skillMode === 1) return MERGE_SKILLS;
  if (skillMode === 7) return DRAGON_SKILLS;
  if (form === 1 || form === 2) {
    if (skillMode === 2) return LIGHTNING_SKILLS;
    if (skillMode === 3) return SPACE_SKILLS;
    if (skillMode === 4) return TIME_SKILLS;
    if (skillMode === 5) return RECOVERY_SKILLS;
  }
  return null;
}

// Hệ số khuếch đại damage chung (buff +50%, Shapeshift +15%)
function applyDamageMultipliers(rawDmg, ctx) {
  let dmg = rawDmg;
  if (ctx.buffDamageActive) dmg = Math.floor(dmg * 1.5);
  if (ctx.form === 2 && ctx.skillMode !== 1) dmg = Math.floor(dmg * 1.15);
  return dmg;
}

const SUB_SKILL_MANA_COST = 30;

function getSubSkillEffect(weapon, key) {
  if (weapon === 2) {
    if (key === 'R') return { type:'dmg_stun', dmg:100, stunMs:10000, title:'Xích Cầu Vồng Trói Chặt' };
    if (key === 'T') return { type:'dmg_infinite', title:'RAINBOW ERASE: VÔ HẠN DMG' };
    if (key === 'Y') return { type:'dmg', dmg:150, title:'Clone Target Đấm Phản' };
    if (key === 'U') return { type:'dmg', dmg:150, title:'Bộc Phá Cầu Vồng' };
  } else if (weapon === 3) {
    if (key === 'R') return { type:'special_buff_dmg', durationMs:15000, title:'Buff +50% Sát thương' };
    if (key === 'T') return { type:'special_stun', stunMs:10000, title:'Stun Grand God Sword' };
    if (key === 'U') return { type:'special_buff_def', durationMs:15000, title:'Khiên Chắn' };
  }
  return null;
}

const CHEMICAL_REACTION_DMG = 1000000000; // 1 tỷ - chỉ Lightning, không God Form

root.GH_SHARED = {
  WEAPON_BASE_DMG, M2_DMG, M3_DMG, CHEMICAL_REACTION_DMG, SUB_SKILL_MANA_COST,
  getM1Damage, getM1Title, getMainSkillTable, applyDamageMultipliers, getSubSkillEffect,
  GOD_FORM_SKILLS, MERGE_SKILLS, DRAGON_SKILLS, LIGHTNING_SKILLS, SPACE_SKILLS, TIME_SKILLS, RECOVERY_SKILLS
};

})(typeof module !== 'undefined' ? module.exports : (typeof window !== 'undefined' ? window : this));
