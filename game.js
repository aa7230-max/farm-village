'use strict';
/* 팜게임 v5 — 마을을 지켜라
 * 구성: 로그인/시작 · 3D 마을 · 전투(히트스톱·흔들림·넉백·진동) · 레벨업 스킬 선택 · 스테이지 유물 · 5일마다 보스 · 저장
 */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DEBUG = /debug/.test(location.search);
function showErr(m) { if (!DEBUG) return; const d = $('err'); d.style.display = 'block'; d.textContent += m + '\n'; }
window.addEventListener('error', e => showErr('ERR: ' + e.message + ' ' + (e.filename || '') + ':' + (e.lineno || '')));

/* ================= 상수 · 데이터 ================= */
const DAY_LEN = 56, NIGHT_LEN = 40, CYCLE = DAY_LEN + NIGHT_LEN;
let BUILD_R = 11, LIM = 22, SPAWN_R = 26;
const LAKE = { x: -17, z: -11, r: 4.6 }, MAYOR = { x: 3, z: -3 };
const RUN_KEY = 'farm-v5-run', PROF_KEY = 'farm-v5-profile', SET_KEY = 'farm-v5-set';

const CLS = {
  mage:    { name: '마법사', icon: '🧙', skill: '☄ 운석 낙하', short: '☄ 운석', cd: 9, rng: 4.6, rate: .75, dmg: 1.0, skillName: 'chain' },
  archer:  { name: '궁수',   icon: '🏹', skill: '🏹 불화살',   short: '🔥 불화살', cd: 12, rng: 5.6, rate: .85, dmg: .9,  skillName: 'rain' },
  warrior: { name: '전사',   icon: '⚔',  skill: '🌀 꼬리치기', short: '🌀 꼬리치기', cd: 10.5, rng: 2.4, rate: .6,  dmg: 1.25, skillName: 'spin' }
};
const BUILD = {
  HOUSE: { wood: 8, stone: 5, name: '집', hp: 30 },
  TOWER: { wood: 10, stone: 8, name: '망루', hp: 40 },
  APT:   { wood: 13, stone: 10, name: '아파트', hp: 60 },
  MINE:  { wood: 7, stone: 7, name: '광산', hp: 24 },
  WALL:  { wood: 2, stone: 3, name: '성벽', hp: 45 },
  LAMP:  { wood: 2, stone: 2, name: '전등', hp: 10 },
  TRAP:  { wood: 3, stone: 3, name: '가시 덫', hp: 10 },
  WEAVE: { wood: 6, stone: 4, fiber: 5, name: '직조 집', hp: 24 }
};
const MODEL3D = {};   // 3D 동물 모델 (펫·적)
const MON = {
  skeleton:   { unlock: 1, hp: 4, spd: 1.35, rng: 0, sc: 3.1, dmg: 7, xp: 1, w: 35 },
  goblin:     { unlock: 2, hp: 3, spd: 2.25, rng: 0, sc: 2.7, dmg: 5, xp: 1, w: 25 },
  mushroom:   { unlock: 3, hp: 5, spd: 1.0,  rng: 4.2, sc: 2.9, dmg: 4, xp: 2, w: 18, proj: 'mushroom', cool: 1.9 },
  flying_eye: { unlock: 4, hp: 4, spd: 1.5,  rng: 4.8, sc: 3.0, dmg: 4, xp: 2, w: 18, proj: 'flying_eye', cool: 1.7, fly: 2.2 },
  sky_bat:    { unlock: 3, hp: 3, spd: 2.5,  rng: 0, sc: 2.6, dmg: 5, xp: 2, w: 16, fly: 3.4, sprite: 'flying_eye', tint: [.7, .92, 1.3] },
  wolf:       { unlock: 2, hp: 1, spd: 2.2,  rng: 0, sc: 2.6, dmg: 6, xp: 2, w: 14, model: 'wolf', walk: 'Walking' },
  dragon:     { unlock: 5, hp: 1, spd: 1.3,  rng: 0, sc: 4.2, dmg: 12, xp: 5, w: 6, model: 'dragon', walk: 'Dragon_Flying', atk: 'Dragon_Attack', hit: 'Dragon_Hit', death: 'Dragon_Death', fly: 2.2 }
};
const BOSS = {
  skeleton_king:  { name: '해골 대왕',   sprite: 'skeleton', sc: 4.0, hp: 60,  spd: .95, dmg: 12, xp: 12, ring: true },
  mushroom_queen: { name: '독버섯 여왕', sprite: 'mushroom', sc: 4.3, hp: 90,  spd: .8,  dmg: 10, xp: 16, ring: true },
  zombie_king:    { name: '거대 좀비 왕', sprite: 'skeleton', sc: 6.4, hp: 150, spd: .72, dmg: 16, xp: 20, ring: true, tint: [.6, 1, .55] }
};
BOSS.snow_wolf = { name: '눈 늑대왕', model: 'wolf', walk: 'Walking', sc: 4.4, hp: 90, spd: .95, dmg: 12, xp: 16, ring: true, tint: [.82, .95, 1.25] };
const SPR_FILES = {
  skeleton: ['move', 'atk', 'atk2', 'atk3', 'hit', 'death'],
  goblin: ['move', 'atk', 'atk2', 'atk3', 'hit', 'death'],
  mushroom: ['move', 'atk', 'atk2', 'atk3', 'hit', 'death', 'proj'],
  flying_eye: ['move', 'atk', 'atk2', 'atk3', 'hit', 'death', 'proj']
};
// 레벨업 선택지 (중복 가능, 상한 있음)
const UPGRADES = [
  { id: 'dmg',  ic: '🗡', t: '공격력 +25%',      d: '모든 공격이 더 아파요' },
  { id: 'rate', ic: '⚡', t: '공격 속도 +18%',   d: '자동 공격이 더 자주 나가요' },
  { id: 'spd',  ic: '👟', t: '이동 속도 +12%',   d: '마을을 더 빨리 달려요' },
  { id: 'hp',   ic: '❤',  t: '최대 체력 +20',    d: '회복도 함께 돼요' },
  { id: 'cd',   ic: '⏱', t: '스킬 쿨다운 -15%', d: '스킬을 더 자주 써요' },
  { id: 'mag',  ic: '🧲', t: '보석 줍기 범위 +', d: '떨어진 보석을 멀리서도 주워요' },
  { id: 'crit',  ic: '💥', t: '치명타 확률 +15%', d: '가끔 피해가 두 배로 들어가요' },
  { id: 'regen', ic: '💚', t: '초당 체력 회복 +0.8', d: '싸우는 중에도 천천히 회복돼요' },
  { id: 'aura',  ic: '🌀', t: '주변 기운 링', d: '가까운 적에게 주기적으로 피해를 줘요' },
  { id: 'skill', ic: '✨', t: '스킬 강화', d: '', special: true }
];
const SKILL_UP = {
  mage:    { t: '체인 +1 · 피해 +', d: '번개가 더 많은 적에게 튀어요' },
  archer:  { t: '화살 +6 · 범위 +', d: '화살비가 더 넓고 촘촘해요' },
  warrior: { t: '회전 범위 +',      d: '베기 반경이 더 넓어져요' }
};
const RELICS = [
  { id: 'charm',  ic: '🔮', t: '수정 부적',   rar: 'rare', d: '광산 보석 +1' },
  { id: 'feather',ic: '🪶', t: '바람 깃털',   rar: 'common', d: '이동 속도 +10%' },
  { id: 'glove',  ic: '🥊', t: '강철 장갑',   rar: 'common', d: '공격력 +1' },
  { id: 'fire',   ic: '🔥', t: '불꽃 구슬',   rar: 'epic', d: '스킬 피해 +40%' },
  { id: 'stone',  ic: '🪨', t: '수호 돌',     rar: 'rare', d: '집 내구도 +10' },
  { id: 'seed',   ic: '🌰', t: '황금 씨앗',   rar: 'epic', d: '나무·돌 채집 +1' },
  { id: 'bell',   ic: '🔔', t: '행운의 종',   rar: 'rare', d: '경험치 +20%' },
  { id: 'horn',   ic: '📯', t: '고대 뿔',     rar: 'epic', d: '보스 피해 +30%' }
];
const STORY = {
  0: ['촌장님: 여기는 작은 농장 마을이에요. 마을 한가운데 수정 다이아몬드를 품은 신비한 나무가 있어요.', '촌장님: 이 나무가 이 세계를 땅에 붙잡고 있어요. 그런데 해골 좀비 무리가 다이아몬드를 빼앗으려 해요!', '촌장님: 나무가 쓰러지면 행성이 이 세계로 떨어져 내려요. 우리가 꼭 나무를 지켜야 해요!'],
  1: ['촌장님: 밤마다 그림자 떼가 몰려와요. 집 안의 보석을 꼭 지켜요.'],
  2: ['촌장님: 고블린 도둑이 나타났어요. 도망치는 도둑은 보석을 가져가요.'],
  3: ['촌장님: 독버섯 포자가 날아다녀요. 망루를 세우면 도움이 될 거예요.'],
  4: ['촌장님: 눈알 박쥐가 하늘에서 내려와요. 높은 곳을 조심해요.'],
  5: ['촌장님: 오래된 해골 대왕이 깨어났어요! 마을의 가장 큰 시련이에요.'],
  10: ['촌장님: 독버섯 여왕이 숲에서 나왔어요. 이 밤만 버티면 우리 마을은 한숨 돌릴 수 있어요.']
};
const GENERIC = ['촌장님: 무사히 아침을 맞았네요. 고마워요.', '촌장님: 오늘 얻은 보물을 잘 써 봐요.'];

/* ================= 상태 ================= */
function newRun(cls) {
  return {
    cls, lvl: 1, xp: 0, need: 5, pendingLvl: 0, hp: 100, maxHp: 100,
    day: 1, res: { wood: 20, stone: 20, fiber: 20, gems: 20 }, b: { '-3,-3': { t: 'HOUSE', hp: 30, g: 0 } },
    up: { dmg: 0, rate: 0, spd: 0, hp: 0, cd: 0, mag: 0 }, skillLv: 0, relics: {}, kills: 0,
    cycT: 0, px: 0, pz: 5, relicsPicked: 0, bossKills: 0
  };
}
let G = null;               // 현재 런 상태
const PAL_COL = [0xffd34d, 0xff8fb8, 0x7fd0ff, 0x8fe08a, 0xb99cff, 0xff9f5a];
let profile = { nick: '', cls: 'mage', color: 0 };
let settings = { sfx: true, vib: true, bgm: 50, sfxVol: 100, camDist: 19 };   // bgm·sfxVol: 0~100
let world, scene, camera, renderer, cv, app;
let xhOn = true;
let coreObj = null, coreRing = null, coreHalo = null, coreGem = null, coreHit = 0;
function ensureCore() {
  if (coreObj || !scene) return;
  coreObj = new THREE.Group();
  // 수정 다이아몬드 한 개: 브릴리언트 컷(위·아래 면이 많은 다이아 모양), 빛을 받아 반짝여요
  const prof = [[0, -1.25], [.95, -.3], [1.05, .05], [.66, .5], [.3, .62], [0, .62]].map(([r, y]) => new THREE.Vector2(r, y));
  const cutGeo = new THREE.LatheGeometry(prof, 8);
  coreGem = new THREE.Mesh(cutGeo, new THREE.MeshPhongMaterial({ color: 0xff8fe6, emissive: 0x7a1a6a, specular: 0xffffff, shininess: 140, flatShading: true, transparent: true, opacity: .95 }));
  coreGem.scale.setScalar(1.05); coreGem.position.set(0, 2.4, 0); coreObj.add(coreGem);
  // 다이아 주변을 도는 작은 반짝이 조각들
  coreSpk = new THREE.Group(); coreSpk.position.set(0, 2.4, 0); coreObj.add(coreSpk);
  for (let i = 0; i < 6; i++) {
    const sh = new THREE.Mesh(new THREE.OctahedronGeometry(.16, 0), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xbff4ff : 0xffe9ff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }));
    const a2 = i / 6 * Math.PI * 2; sh.position.set(Math.cos(a2) * 1.9, Math.sin(i * 1.7) * .5, Math.sin(a2) * 1.9); coreSpk.add(sh);
  }
  // 기울어진 두 고리가 다이아를 감싸며 돌아요
  coreRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.7, .035, 6, 48), new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
  coreRing2.position.set(0, 2.4, 0); coreRing2.rotation.x = Math.PI / 2.6; coreObj.add(coreRing2);
  coreRing3 = new THREE.Mesh(new THREE.TorusGeometry(2.1, .03, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffd0f5, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false }));
  coreRing3.position.set(0, 2.4, 0); coreRing3.rotation.z = Math.PI / 3; coreObj.add(coreRing3);
  coreRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.2, 48), new THREE.MeshBasicMaterial({ color: 0xff8fe0, transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false }));
  coreRing.rotation.x = -Math.PI / 2; coreRing.position.y = .06; coreObj.add(coreRing);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, 9, 8), new THREE.MeshBasicMaterial({ color: 0xffb3ec, transparent: true, opacity: .3, depthWrite: false }));
  beam.position.y = 4.5; coreObj.add(beam);
  coreHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex('ring'), color: 0xff8fe0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  coreHalo.scale.set(7, 7, 1); coreHalo.position.y = 2.4; coreHalo.position.z = .6; coreObj.add(coreHalo);
  scene.add(coreObj);
}
let crackGroup = null, lastCoreFx = 0, coreSpk = null, coreRing2 = null, coreRing3 = null;
let coreToastT = 0;
function coreHitFx() {   // 보석이 맞으면 번쩍, 흔들림, 금 가기, 불꽃
  if (!coreGem || performance.now() - lastCoreFx < 280) return; lastCoreFx = performance.now();
  tweenTo(1.5, 1, .38, v => coreGem.scale.setScalar(v), 'back');
  puff(0, 0, 18, 0xff8fe6); shake = Math.max(shake, .5);
  if (performance.now() - (coreToastT || 0) > 1500) { coreToastT = performance.now(); toast('💥 보석이 금이 갔어요! 지켜 주세요'); }
  if (!crackGroup) { crackGroup = new THREE.Group(); coreGem.add(crackGroup); }
  const cr = new THREE.Mesh(new THREE.BoxGeometry(.08, .85, .08), new THREE.MeshBasicMaterial({ color: 0x2a0a1a }));
  cr.position.set(rnd(-.45, .45), rnd(-.45, .45), rnd(-.45, .45)); cr.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
  crackGroup.add(cr); if (crackGroup.children.length > 14) crackGroup.remove(crackGroup.children[0]);
  const gx = 0, gy = coreGem.position.y, gz = 0;
  glowAt(gx, gy, gz, 2.6, 0xff7a2a, .3);
  for (let i = 0; i < 7; i++) {
    const sp = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 5), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb347 : 0xff5a1f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(gx, gy, gz); scene.add(sp);
    const a = rnd(0, Math.PI * 2), up = rnd(1.2, 2.6), out = rnd(1.2, 2.2);
    tweenTo(0, 1, .55, v => { sp.position.set(gx + Math.cos(a) * out * v, gy + up * v - 1.6 * v * v, gz + Math.sin(a) * out * v); sp.material.opacity = 1 - v; }, 'out', i * .02, () => { scene.remove(sp); sp.geometry.dispose(); sp.material.dispose(); });
  }
}
function coreAnim(t) {
  if (!coreObj) return;
  coreGem.rotation.y = t * .9; coreGem.position.y = 2.4 + Math.sin(t * 2) * .2;
  if (coreSpk) { coreSpk.rotation.y = t * 1.4; coreSpk.position.y = 2.4 + Math.sin(t * 2) * .2; }
  if (coreRing2) { coreRing2.rotation.z = t * .9; coreRing2.position.y = coreGem.position.y; }
  if (coreRing3) { coreRing3.rotation.x = t * .5; coreRing3.position.y = coreGem.position.y; }
  const p = Math.sin(t * 3);
  coreHalo.material.opacity = .6 + p * .2; coreRing.material.opacity = .5 + p * .25; coreRing.scale.setScalar(1 + p * .03);
  coreGem.material.emissive.setRGB(coreHit > 0 ? .8 : .6, .1, .4);
}
let player = null, playerModel = null, mayor = null, ring = null, blobPlayer = null;
let creatureProto = null, mayorProto = null, antlersProto = null;
let running = false, freeze = false, modalOpen = false, walking = false, gameT = 0, last = performance.now();
let px = 0, pz = 5, rotY = 0, vx = 0, vz = 0, facing = 0, runKey = false, runLock = false;
const IS_COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
const PERCH_H = 7.4;
let py = 0, perchKey = null, sniper = false, snipeCd = 0, aimRing = null;
let scopeHold = false, scopeLock = false, scopeBlend = 0;
const scopeOn = () => scopeHold || scopeLock;
let camYaw = 0, camPitch = .12, lastDrag = -10, autoCam = true, shake = 0, hitstop = 0, invul = 0;
let attackHeld = false, pointerFired = false;
let atkCd = 0, skillCd = 0, spawnQ = 0, spawnT = 0, prevNight = false, bossSpawned = false;
let midGiantDone = false, giantRef = null, camYawT = null;
let pendingRelicDay = null, storyQueue = [], lineIdx = 0, mode = 'FIELD';
let buildMode = false, selType = 'HOUSE', buildTarget = null, ghostB = null, ghost = null;
let fpMode = false, fpBlend = 0;
const joy = { x: 0, z: 0 }, keys = {};
const mons = [], projs = [], drops = [], bmesh = {}, partPool = [], fxList = [];
const nodes = { tree: [], rock: [], bush: [] };
let bossRef = null;
let auraT = 0;
// ===== v7 신규 시스템 =====
let weather = 'clear', rainObj = null, pet = null, villagers = [], comboCd = 0, waveT = 0;
const PET_DEF = {
  cat: { ic: '🐱', model: 'cat', name: '고양이', cd: 1.0, dmg: 1.0, rng: 3.0 },
  pig: { ic: '🐷', model: 'pig', name: '돼지', cd: 1.3, dmg: .9, rng: 2.6 },
  fox: { ic: '🦊', model: 'fox', name: '여우', cd: .8, dmg: 1.1, rng: 3.4 },
  sheep: { ic: '🐑', model: 'sheep', name: '양', cd: 1.5, dmg: .8, rng: 2.2 },
  llama: { ic: '🦙', model: 'llama', name: '라마', cd: 1.2, dmg: .95, rng: 3.2 }
};
const PROMO = {
  mage:    { a: { ic: '⚡', t: '뇌신 전직', d: '번개 체인이 4마리 더 튀고 모든 피해 +30%' }, b: { ic: '❄', t: '빙결 전직', d: '스킬에 맞은 적이 1.5초 동안 느려져요' } },
  archer:  { a: { ic: '🔥', t: '화염 전직', d: '화살이 불타 모든 피해 +30%' }, b: { ic: '🎯', t: '관통 전직', d: '화살비가 1.5배 많이 떨어져요' } },
  warrior: { a: { ic: '🛡', t: '강철 전직', d: '회전 베기 반경 +1.5, 모든 피해 +30%' }, b: { ic: '🌪', t: '광풍 전직', d: '스킬 쿨다운이 30% 짧아져요' } }
};
const PROMO2 = [
  { id: 'p2a', ic: '🌟', t: '정점 각성', d: '스킬 피해 +50%' },
  { id: 'p2b', ic: '💠', t: '신비의 가호', d: '최대 체력 +40, 체력 회복' }
];
const MILESTONES = [[10, 5], [30, 10], [60, 15], [100, 25]];
const KC_NAMES = { skeleton: '해골', goblin: '고블린', mushroom: '버섯', flying_eye: '날개눈', sky_bat: '하늘박쥐', skeleton_king: '해골 대왕', mushroom_queen: '독버섯 여왕' };
function promoMul() { return G && G.promo === 'a' ? 1.3 : 1; }
function emojiSprite(e, scale) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.font = '96px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, 64, 70);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sp.scale.setScalar(scale || 1.2); return sp;
}
// 동료 펫: 따라다니며 적을 공격하고 보석을 물어 옴
function petObj(d) {   // 펫은 3D 동물 모델로 보여줘요 (모델이 없으면 이모지)
  const P = d.model && MODEL3D[d.model];
  if (!P) return emojiSprite(d.ic, 1.1);
  const g = new THREE.Group(); const root = THREE.SkeletonUtils.clone(P.obj); root.scale.setScalar(1.05); g.add(root); return g;
}
function ensurePet() {
  if (G && G.pet && !pet) { const d = PET_DEF[G.pet]; pet = { def: d, obj: petObj(d), x: px, z: pz, cd: 0, ph: 0 }; scene.add(pet.obj); }
  else if (pet && (!G || !G.pet)) { scene.remove(pet.obj); pet = null; }
}
function updPet(dt) {
  ensurePet(); if (!pet) return;
  pet.ph += dt;
  let gx = px - Math.sin(rotY) * 1.3 + Math.cos(rotY) * .9, gz = pz - Math.cos(rotY) * 1.3 - Math.sin(rotY) * .9;
  let best = null, bd = 7;
  drops.forEach(d => { const dd = Math.hypot(d.m.position.x - pet.x, d.m.position.z - pet.z); if (dd < bd) { bd = dd; best = d; } });
  if (best && bd < .9) {
    scene.remove(best.m); drops.splice(drops.indexOf(best), 1); G.res.gems += 1;
    puff(pet.x, pet.z, 4, 0xa6e6ff); toast(pet.def.ic + ' 보석을 물어 왔어요!'); persistRun();
  } else if (best) { gx = best.m.position.x; gz = best.m.position.z; }
  const dx = gx - pet.x, dz = gz - pet.z, dd = Math.hypot(dx, dz);
  if (dd > .05) { const st = Math.min(dd, (best ? 6 : 4.5) * dt); pet.x += dx / dd * st; pet.z += dz / dd * st; }
  pet.obj.position.set(pet.x, .75 + Math.abs(Math.sin(pet.ph * 8)) * .15, pet.z);
  pet.cd -= dt;
  if (pet.cd <= 0) {
    const t = nearestMon(pet.def.rng, pet.x, pet.z);
    if (t) { hitEnemy(t, (1 + .15 * (G.lvl || 1)) * pet.def.dmg, { kb: .25 }); pet.cd = pet.def.cd; glowAt(pet.x, .5, pet.z, 1.2, 0xfff1a0, .2); }
    else pet.cd = .15;
  }
}
// 합동 콤보 (1인 플레이: 쌍둥이 동료가 대신 합을 맞춤 / 2인 온라인은 M2에서 실제 파트너와 연동)
function comboStrike() {
  const t = nearestMon(7); if (!t) return false;
  comboCd = 20;
  const o = t.obj.position;
  glowAt(o.x, 1, o.z, 3, 0xff9ad5, .4);
  hitEnemy(t, baseHit(t) * 1.8);
  popup(o.x, 1.6, o.z, '💞 합동!', '#ffc2e6');
  toast('💞 합동 콤보!');
  return true;
}
// 건물 강화
const UPG_COST = [null, null, { wood: 3, stone: 2 }, { wood: 5, stone: 4 }];
const _kxy = new Map();
function keyXY(k) { let v = _kxy.get(k); if (!v) { const p = k.split(','); v = [+p[0], +p[1]]; _kxy.set(k, v); } return v; }
function nearBuilding(maxD) {
  let best = null, bd = maxD;
  for (const k in G.b) { const [bx, bz] = keyXY(k); const d = Math.hypot(bx - px, bz - pz); if (d < bd) { bd = d; best = { k, b: G.b[k] }; } }
  return best;
}
function upgradeBuilding(k) {
  const b = G.b[k]; const lv = b.lv || 1; if (lv >= 3) return;
  const c = UPG_COST[lv + 1];
  if (G.res.wood < c.wood || G.res.stone < c.stone) { toast('🪵 나무 ' + c.wood + ' · 🪨 돌 ' + c.stone + '이 필요해요'); return; }
  G.res.wood -= c.wood; G.res.stone -= c.stone; b.lv = lv + 1;
  { const bonus = BUILD[b.t].hp * (b.t === 'WALL' ? .6 : .4); b.hp = (b.hp || BUILD[b.t].hp) + bonus; }
  if (b.t === 'APT') { const old = bmesh[k]; if (old) { world.remove(old); delete bmesh[k]; } addBuildingMesh(k, b); if (sniper && perchKey === k) py = aptH(b.lv) + .32; }
  const m = bmesh[k];
  if (m) { const base = m.userData.baseS || (m.userData.baseS = m.scale.x); tweenTo(base, base * 1.14, .22, v => m.scale.setScalar(v), 'back', 0, () => tweenTo(base * 1.14, base, .2, v => m.scale.setScalar(v), 'out')); }
  const [bx, bz] = k.split(',').map(Number);
  glowAt(bx, 1.4, bz, 3.2, 0xffe08a, .5); puff(bx, bz, 10, 0xffe9a8); popup(bx, 2.6, bz, '⬆ ' + b.lv + '단계!', '#ffe76a'); sfx('lvl');
  toast('⬆ ' + BUILD[b.t].name + ' ' + b.lv + '단계로 강화!'); persistRun();
}
// 날씨: 비 입자 (LineSegments)
function updRain(dt) {
  if (!rainObj) {
    const g = new THREE.BufferGeometry(); const n = 260;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    rainObj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: .55, depthWrite: false }));
    rainObj.frustumCulled = false; scene.add(rainObj);
    rainObj.userData.seed = []; for (let i = 0; i < n; i++) rainObj.userData.seed.push([rnd(-14, 14), rnd(0, 9), rnd(-14, 14)]);
  }
  rainObj.visible = weather === 'rain'; if (!rainObj.visible) return;
  const arr = rainObj.geometry.attributes.position.array, seed = rainObj.userData.seed;
  for (let i = 0; i < seed.length; i++) {
    seed[i][1] -= dt * 14; if (seed[i][1] < 0) { seed[i][1] = 9; seed[i][0] = rnd(-14, 14); seed[i][2] = rnd(-14, 14); }
    const x = px + seed[i][0], z = pz + seed[i][2], y = seed[i][1];
    arr[i * 6] = x; arr[i * 6 + 1] = y + .6; arr[i * 6 + 2] = z; arr[i * 6 + 3] = x - .1; arr[i * 6 + 4] = y; arr[i * 6 + 5] = z;
  }
  rainObj.geometry.attributes.position.needsUpdate = true;
}
// 마을 주민 (거래)
const VIL_DEF = [
  { name: '대장장이', ic: '🔨', col: 0x8a5a3c, x: 12, z: 4, trade: 'stone' },
  { name: '농부', ic: '🌾', col: 0x6fb35a, x: -11, z: 8, trade: 'wood' },
  { name: '약사', ic: '🧪', col: 0xa67bd6, x: 2, z: 13, trade: 'heal' }
];
function makeVillagers() {
  if (villagers.length) return;
  VIL_DEF.forEach(d => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.32, .4, 1.1, 10), new THREE.MeshStandardMaterial({ color: d.col, roughness: .7 }));
    body.position.y = .55; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd9b8, roughness: .8 }));
    head.position.y = 1.4; g.add(head);
    const lbl = emojiSprite(d.ic, .9); lbl.position.y = 2.2; g.add(lbl);
    g.position.set(d.x, 0, d.z); world.add(g);
    villagers.push({ def: d, g, ph: rnd(0, 6) });
  });
}
function nearVillager(maxD) {
  let best = null, bd = maxD;
  villagers.forEach(v => { const dd = Math.hypot(v.g.position.x - px, v.g.position.z - pz); if (dd < bd) { bd = dd; best = v; } });
  return best;
}
function tradeWith(v) {
  const t = v.def.trade;
  if (t === 'heal') {
    if (G.res.gems < 3) { toast('💎 보석 3개가 필요해요'); return; }
    G.res.gems -= 3; G.hp = Math.min(G.maxHp, G.hp + 30); toast('🧪 약사: 기운을 채워 드릴게요!');
  } else {
    if (G.res.gems < 2) { toast('💎 보석 2개가 필요해요'); return; }
    G.res.gems -= 2;
    if (t === 'stone') { G.res.stone += 3; toast('🔨 대장장이: 돌 3개 드릴게요!'); }
    else { G.res.wood += 3; toast('🌾 농부: 나무 3개 드릴게요!'); }
  }
  puff(v.g.position.x, v.g.position.z, 8, 0xfff1c2); sfx('gem'); persistRun();
}
// 도감
function openCodex() {
  freeze = true; modalOpen = true;
  const kc = G.kc || {};
  const cells = Object.keys(MON).concat(Object.keys(BOSS)).map(k => {
    const n = kc[k] || 0;
    return '<div class="cdx">' + (n ? '✅ <b>' + KC_NAMES[k] + '</b>' : '❔ <b>???</b>') + '<small>처치 ' + n + '</small></div>';
  }).join('');
  const relics = RELICS.map(r => '<span title="' + r.t + '" style="opacity:' + ((G.relics || {})[r.id] ? 1 : .3) + '">' + r.ic + '</span>').join('');
  const tot = G.kills || 0; const next = MILESTONES.find(m => tot < m[0]);
  $('codexBody').innerHTML = '<div class="cdx-grid">' + cells + '</div>' +
    '<div style="margin-top:8px"><b>유물 ' + Object.keys(G.relics || {}).length + '/' + RELICS.length + '</b></div><div class="relics">' + relics + '</div>' +
    '<div style="margin-top:8px;font-size:12px">총 처치 ' + tot + '마리 · ' + (next ? '다음 보상: ' + next[0] + '마리 → 💎 ' + next[1] : '모든 도감 보상을 받았어요!') + '</div>';
  $('codexModal').classList.add('show');
}
function closeCodex() { $('codexModal').classList.remove('show'); freeze = false; modalOpen = false; }
const VILLAGE = {};

/* ================= 저장 ================= */
function persistRun() {
  if (!G || !running) return;
  try {
    const g = Object.assign({}, G, { px, pz, cycT: G.cycT });
    localStorage.setItem(RUN_KEY, JSON.stringify(g));
  } catch (e) { }
}
function loadRun() { try { return JSON.parse(localStorage.getItem(RUN_KEY) || 'null'); } catch (e) { return null; } }
function loadProfile() { try { Object.assign(profile, JSON.parse(localStorage.getItem(PROF_KEY) || '{}')); } catch (e) { } }
function saveProfile() { try { localStorage.setItem(PROF_KEY, JSON.stringify(profile)); } catch (e) { } }
function loadSettings() { try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { } }
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) { } }


/* ================= 배경음악: 코드로 만든 잔잔한 마을 곡 · 전투 곡 (파일 없이 바로 재생) ================= */
const MOODS = {
  // 잔잔한 곡들 (마을·준비 시간)
  field: [
    { name: 'C 잔잔', bpm: 84, sets: [[[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], [[60, 64, 67], [53, 57, 60], [57, 60, 64], [55, 59, 62]]], pats: [[0, 1, 2, 1, 0, 2, 1, 2], [0, 2, 1, 2, 0, 1, 2, 1], [0, 1, 0, 2, 1, 2, 1, 0]], lead: 'triangle', leadVol: .07, pad: true, drums: false, bass: false },
    { name: 'A 몽환', bpm: 74, sets: [[[57, 60, 64], [53, 57, 60], [60, 64, 67], [52, 55, 59]], [[57, 60, 64], [52, 55, 59], [53, 57, 60], [55, 59, 62]]], pats: [[0, 1, 2, 1, 2, 1, 0, 1], [0, 2, 1, 0, 2, 1, 2, 0]], lead: 'sine', leadVol: .06, pad: true, drums: false, bass: false },
    { name: 'F 여유', bpm: 96, sets: [[[53, 57, 60], [48, 52, 55], [50, 53, 57], [55, 59, 62]], [[53, 57, 60], [57, 60, 64], [50, 53, 57], [48, 52, 55]]], pats: [[0, 2, 1, 2, 0, 1, 2, 1], [0, 1, 2, 2, 1, 0, 1, 2]], lead: 'triangle', leadVol: .07, pad: false, drums: true, bass: false }
  ],
  // 전투 곡들 (적이 살아 있을 때)
  battle: [
    { name: 'A 긴박', bpm: 140, sets: [[[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59]], [[57, 60, 64], [48, 52, 55], [53, 57, 60], [52, 56, 59]]], pats: [[0, 2, 1, 2, 0, 2, 1, 2], [0, 1, 2, 1, 0, 2, 0, 2]], lead: 'square', leadVol: .03, pad: false, drums: true, bass: true },
    { name: 'D 긴장', bpm: 150, sets: [[[50, 53, 57], [58, 62, 65], [53, 57, 60], [57, 61, 64]], [[50, 53, 57], [53, 57, 60], [58, 62, 65], [57, 61, 64]]], pats: [[0, 1, 2, 1, 0, 2, 1, 2], [0, 2, 0, 2, 1, 2, 1, 0]], lead: 'sawtooth', leadVol: .025, pad: false, drums: true, bass: true },
    { name: 'E 질주', bpm: 128, sets: [[[52, 55, 59], [48, 52, 55], [57, 60, 64], [59, 62, 66]], [[52, 55, 59], [57, 60, 64], [48, 52, 55], [59, 62, 66]]], pats: [[0, 2, 1, 2, 0, 2, 1, 2]], lead: 'square', leadVol: .03, pad: false, drums: true, bass: true }
  ]
};
const KICKS = [[0, 4], [0, 2, 4, 6], [0, 3, 4, 6], [0, 4, 6]];
const MUS = { cur: null, track: null, gain: null, timer: null, swap: null, next: 0, step: 0, noise: null, last: null, set: 0, pat: null, oct: 0, padOn: true, kicks: [0, 4], hatAll: false };
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
function musVol() { return settings.bgm / 100 * .22; }
function musGain() {
  const a = audio(); if (!a) return null;
  if (!MUS.gain) { MUS.gain = a.createGain(); MUS.gain.gain.value = 0; MUS.gain.connect(a.destination); }
  return MUS.gain;
}
function musNote(t, midi, dur, type, vol, dest) {
  const a = AC, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = midiHz(midi);
  g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .025); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + .05);
}
function musKick(t, dest) {
  const a = AC, o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
  g.gain.setValueAtTime(.8, t); g.gain.exponentialRampToValueAtTime(.0001, t + .18);
  o.connect(g).connect(dest); o.start(t); o.stop(t + .2);
}
function musHat(t, dest) {
  const a = AC;
  if (!MUS.noise) { const b = a.createBuffer(1, a.sampleRate * .1 | 0, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; MUS.noise = b; }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = MUS.noise; f.type = 'highpass'; f.frequency.value = 7000;
  g.gain.setValueAtTime(.22, t); g.gain.exponentialRampToValueAtTime(.0001, t + .05);
  src.connect(f).connect(g).connect(dest); src.start(t); src.stop(t + .06);
}
function pickTrack(name) {   // 같은 곡이 연달아 나오지 않게 골라요
  const L = MOODS[name]; let T;
  do { T = L[(Math.random() * L.length) | 0]; } while (L.length > 1 && T === MUS.last);
  MUS.last = T; return T;
}
function musTick() {
  const T = MUS.track; if (!T || !AC) return;
  const dest = musGain(); if (!dest) return;
  const sd = 60 / T.bpm / 2;   // 8분음표 한 칸
  while (MUS.next < AC.currentTime + .15) {
    const s = MUS.step % 8, bar = Math.floor(MUS.step / 8), t = MUS.next;
    if (s === 0) {   // 마디마다 조금씩 바뀌는 리믹스
      if (bar % 4 === 0) MUS.set = (Math.random() * T.sets.length) | 0;
      MUS.pat = T.pats[(Math.random() * T.pats.length) | 0];
      const r = Math.random(); MUS.oct = r < .15 ? -12 : r < .3 ? 12 : 0;
      MUS.padOn = Math.random() < .8;
      MUS.kicks = KICKS[(Math.random() * KICKS.length) | 0];
      MUS.hatAll = Math.random() < .3;
    }
    const ch = T.sets[MUS.set || 0][bar % 4];
    if (s === 0 && T.pad && MUS.padOn) ch.forEach(n => musNote(t, n - 12, sd * 8 * 1.1, 'sine', .05, dest));
    musNote(t, ch[MUS.pat[s]] + 12 + MUS.oct, sd * 1.8, T.lead, T.leadVol, dest);
    if (T.bass && s % 2 === 0) musNote(t, ch[0] - 24, sd * 1.9, 'sawtooth', .045, dest);
    if (T.drums) { if (MUS.kicks.includes(s)) musKick(t, dest); if (s % 2 === 1 || MUS.hatAll) musHat(t, dest); }
    MUS.next += sd; MUS.step++;
  }
}
function setTrack(name) {   // 'field' | 'battle' | null, 부드럽게 바꿔요
  if (MUS.cur === name) return; MUS.cur = name;
  const a = audio(); if (!a) return;   // 아직 소리가 허용되지 않았으면 조용히 기다려요
  const g = musGain(); if (!g) return;
  g.gain.cancelScheduledValues(a.currentTime); g.gain.setTargetAtTime(0, a.currentTime, .08);
  clearTimeout(MUS.swap);
  MUS.swap = setTimeout(() => {
    MUS.track = name ? pickTrack(name) : null; MUS.step = 0; MUS.next = AC.currentTime + .1;
    g.gain.setTargetAtTime(name ? musVol() : 0, AC.currentTime, .3);
  }, 350);
  if (!MUS.timer) MUS.timer = setInterval(musTick, 40);
}
function applyMusicVol() { const a = AC, g = MUS.gain; if (g && a && MUS.track) g.gain.setTargetAtTime(musVol(), a.currentTime, .1); }

/* ================= 사운드 · 진동 ================= */
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type, vol, slide, delay) {
  if (!settings.sfx) return;
  const a = audio(); if (!a) return;
  const t0 = a.currentTime + (delay || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
  g.gain.setValueAtTime(vol * (settings.sfxVol / 100), t0);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + .03);
}
const SFX = {
  hit:   () => tone(560, .08, 'square', .045, 240),
  kill:  () => { tone(660, .1, 'triangle', .08, 1100); tone(990, .12, 'sine', .05, 1400, .05); },
  hurt:  () => tone(170, .28, 'sawtooth', .09, 60),
  lvl:   () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, .18, 'triangle', .08, 0, i * .09)); },
  boss:  () => { tone(90, .7, 'sine', .3, 40); tone(140, .4, 'triangle', .12, 60, .1); },
  place: () => tone(320, .08, 'sine', .08, 460),
  skill: () => tone(880, .22, 'sine', .07, 220),
  relic: () => { [660, 880, 1320].forEach((f, i) => tone(f, .16, 'sine', .07, 0, i * .07)); },
  gem:   () => tone(1200, .09, 'sine', .05, 1600)
};
const VIB = { key: [6], hit: [10], kill: [22], boss: [60, 40, 90], hurt: [70, 40, 70], lvl: [25, 35, 25], place: [8], relic: [30, 30, 30] };
function vib(k) { if (!settings.vib || !navigator.vibrate) return; try { navigator.vibrate(VIB[k]); } catch (e) { } }
function sfx(k) { if (SFX[k]) SFX[k](); }

/* ================= 텍스처 · 공용 재료 ================= */
function makeRadialTex(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
const glowTex = makeRadialTex('rgba(255,255,230,1)', 'rgba(255,200,0,0)');
const blobTex = makeRadialTex('rgba(40,30,20,.55)', 'rgba(40,30,20,0)');
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: .9 });
const blobGeo = new THREE.PlaneGeometry(1.6, 1.6);
const dmgCache = {};
function dmgTex(txt, col) {
  const key = txt + col; if (dmgCache[key]) return dmgCache[key];
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const q = c.getContext('2d');
  q.font = '900 46px sans-serif'; q.textAlign = 'center'; q.lineWidth = 9; q.strokeStyle = '#4a2a10'; q.strokeText(txt, 64, 50);
  q.fillStyle = col; q.fillText(txt, 64, 50);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; dmgCache[key] = t; return t;
}
const partGeo = new THREE.SphereGeometry(.12, 6, 5);
const partMats = {};
function partMat(col) { if (!partMats[col]) partMats[col] = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, fog: false }); return partMats[col]; }

/* ================= 텍스처 · 로딩 ================= */
function loadTex(url) {
  return new Promise(res => new THREE.TextureLoader().load(url, tx => {
    tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.encoding = THREE.sRGBEncoding;
    tx.frames = Math.max(1, Math.round(tx.image.width / tx.image.height)); res(tx);
  }, undefined, () => res(null)));
}
const SPR = {};
async function loadSprites() {
  const jobs = [];
  for (const k in SPR_FILES) { SPR[k] = {}; for (const n of SPR_FILES[k]) jobs.push(loadTex(`assets/monsters/${k}/${n}.png`).then(tx => { SPR[k][n] = tx; })); }
  await Promise.all(jobs);
}
function cloneTex(base) { const t = base.clone(); t.needsUpdate = true; t.repeat.set(1 / base.frames, 1); t.offset.set(0, 0); t.frames = base.frames; return t; }
function loadFBX(b64, resPath) {
  if (!b64 || !THREE.FBXLoader) return null;
  try {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new THREE.FBXLoader().parse(u.buffer, resPath || '');
  } catch (e) { showErr('FBX: ' + e.message); return null; }
}
function glbBuf(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
function parseGLB(b64) { return new Promise((res, rej) => { try { new THREE.GLTFLoader().parse(glbBuf(b64), '', g => res(g.scene), e => rej(e)); } catch (e) { rej(e); } }); }
function fitTo(obj, maxDim) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), sz = new THREE.Vector3(), c = new THREE.Vector3();
  box.getSize(sz); box.getCenter(c);
  const m = Math.max(sz.x, sz.y, sz.z) || 1, s = maxDim / m;
  obj.scale.multiplyScalar(s);
  obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const g = new THREE.Group(); g.add(obj);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  return g;
}
function dropBase(root) {
  root.updateMatrixWorld(true);
  const full = new THREE.Box3().setFromObject(root), sz = full.getSize(new THREE.Vector3());
  const md = Math.max(sz.x, sz.y, sz.z) || 1, drop = [];
  root.traverse(o => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o), s2 = b.getSize(new THREE.Vector3()); if (s2.y < md * .06 && Math.max(s2.x, s2.z) > md * .5) drop.push(o); } });
  drop.forEach(o => o.parent && o.parent.remove(o));
  return root;
}
function loadGLBUrl(url) {
  return fetch(url).then(r => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); })
    .then(buf => new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, '', res, rej)));
}
async function loadAnimalModels() {   // 구름 앱의 3D 동물: 고양이·돼지(펫), 늑대·드래곤(적)
  const jobs = ['cat', 'pig', 'fox', 'sheep', 'llama', 'wolf', 'dragon'].map(k => loadGLBUrl('assets/animals/' + k + '.glb').then(g => { MODEL3D[k] = { obj: fitTo(g.scene, 1), clips: g.animations }; }));
  await Promise.all(jobs.map(p => p.catch(e => showErr('animal ' + (e.message || e)))));
}
async function loadModels() {
  await loadAnimalModels();
  const VIL_SIZE = { house_a: 2.5, house_b: 2.5, torii: 2.6, lamp: 2.2, fountain: 1.5, bamboo: 2.4, rock: 1.1 };
  if (window.VILLAGE_GLB && THREE.GLTFLoader) {
    await Promise.all(Object.keys(VIL_SIZE).filter(k => window.VILLAGE_GLB[k]).map(k =>
      parseGLB(window.VILLAGE_GLB[k]).then(o => { VILLAGE[k] = fitTo(k.startsWith('house') ? dropBase(o) : o, VIL_SIZE[k]); })
        .catch(e => showErr('village ' + k + ': ' + (e.message || e)))));
  }
  try { const mj = loadFBX(window.HINYO_FBX); if (mj) mayorProto = fitTo(mj, 1.6); } catch (e) { showErr('mayor ' + e.message); }
  try { const an = loadFBX(window.ANTLERS_FBX); if (an) antlersProto = fitTo(an, .9); } catch (e) { showErr('antlers ' + e.message); }

  try {
    const obj = loadFBX(window.PLAYER_FBX, 'assets/player_tex/');
    if (obj) {
      creatureProto = fitTo(obj, 1.15);
      creatureProto.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m) { m.side = THREE.DoubleSide; m.alphaTest = 0; m.transparent = false; } }); });
    }
  } catch (e) { showErr('player ' + e.message); }
}

/* ================= 씬 · 렌더러 · 조명 ================= */
function initScene() {
  cv = $('c'); app = $('app');
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  // 화면이 검게 멈추면(그래픽 문맥 손실) 자동으로 다시 그려요
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); toast('화면을 다시 그리는 중이에요…'); setTimeout(() => location.reload(), 600); }, false);
  const big = window.innerWidth > 900;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_COARSE ? 1.25 : big ? 1.75 : 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(0xcde9f2), 42, 92);
  camera = new THREE.PerspectiveCamera(50, 1, .1, 400);
  world = new THREE.Group(); scene.add(world);
  window.addEventListener('resize', resize); resize();

  // 조명: 반구광 + 태양광(그림자 범위를 마을 크기에 맞춤)
  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x6b8f4a, .85));
  window.sun = new THREE.DirectionalLight(0xfff0d2, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(big ? 2048 : 1024, big ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 160 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.0006; sun.shadow.normalBias = .03; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);

  // 하늘 · 구름 · 별
  const sl = new THREE.TextureLoader();
  const skyTex = f => { const t = sl.load('assets/world/' + f + '.webp'); t.encoding = THREE.sRGBEncoding; return t; };
  window.skyDay = new THREE.MeshBasicMaterial({ map: skyTex('day'), side: THREE.BackSide, fog: false, depthWrite: false, transparent: true });
  window.skyDusk = new THREE.MeshBasicMaterial({ map: skyTex('dusk'), side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0 });
  window.skyNight = new THREE.MeshBasicMaterial({ map: skyTex('night'), side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0 });
  [skyDay, skyDusk, skyNight].forEach((m, i) => { const d = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), m); d.renderOrder = -10 - i; scene.add(d); });
  window.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(4.5, 20, 16), new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false }));
  window.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 16), new THREE.MeshBasicMaterial({ color: 0xeaf0ff, fog: false }));
  scene.add(sunMesh, moonMesh);
  const sp = []; for (let i = 0; i < 420; i++) { const a = rnd(0, Math.PI * 2), e = rnd(.1, 1.4); sp.push(Math.cos(a) * Math.cos(e) * 130, Math.sin(e) * 130, Math.sin(a) * Math.cos(e) * 130); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  window.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0, fog: false, depthWrite: false });
  scene.add(new THREE.Points(sg, starMat));
  const ct = sl.load('assets/world/cloud.webp'); ct.encoding = THREE.sRGBEncoding;
  window.clouds = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, opacity: .92 }));
    const w = rnd(16, 30); s.scale.set(w, w * .45, 1); s.position.set(rnd(-75, 75), rnd(18, 26), rnd(-70, 70)); s.userData.v = rnd(.4, 1.1);
    scene.add(s); clouds.push(s);
  }

  // 땅 · 광장 · 호수
  const gt = sl.load('assets/world/grass.webp'); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.encoding = THREE.sRGBEncoding; gt.repeat.set(34, 34);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshLambertMaterial({ map: gt }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  window.groundMesh = ground;   // 맵 테마 교체용 (아래 setGroundTheme)
  const pt = sl.load('assets/world/stone_path.webp'); pt.wrapS = pt.wrapT = THREE.RepeatWrapping; pt.encoding = THREE.sRGBEncoding; pt.repeat.set(6, 6);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(BUILD_R * 2 + 2, BUILD_R * 2 + 2), new THREE.MeshLambertMaterial({ map: pt, color: 0xfff6e6, transparent: true, opacity: .8 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = .004; plaza.receiveShadow = true; plaza.material.depthWrite = false; plaza.renderOrder = -2; world.add(plaza);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 48), new THREE.MeshPhongMaterial({ color: 0x8fd6f2, shininess: 110, transparent: true, opacity: .94 }));
  lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE.x, .03, LAKE.z); scene.add(lake);
  const shore = new THREE.Mesh(new THREE.RingGeometry(LAKE.r, LAKE.r + .5, 48), new THREE.MeshLambertMaterial({ color: 0xf2e2a6 }));
  shore.rotation.x = -Math.PI / 2; shore.position.set(LAKE.x, .02, LAKE.z); scene.add(shore);

  // 공용 재료
  window.GEM_GEO = new THREE.OctahedronGeometry(.22, 0);
  window.GEM_MAT = new THREE.MeshPhongMaterial({ color: 0x7fd8ff, emissive: 0x1f6e9e, shininess: 110, flatShading: true });
  ghost = new THREE.Mesh(new THREE.RingGeometry(.52, .66, 30), new THREE.MeshBasicMaterial({ color: 0x7bd389, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
  ghost.rotation.x = -Math.PI / 2; ghost.visible = false; scene.add(ghost);
  window.ring = null;
}
function resize() {
  const w = app.clientWidth || innerWidth, h = app.clientHeight || innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

/* ================= 바깥 자원 · 장식 ================= */
function makeNodeMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'tree') {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.14, .2, .9, 7), new THREE.MeshLambertMaterial({ color: 0x9b7b58 })); tr.position.y = .45; tr.castShadow = true;
    const cn = new THREE.Mesh(new THREE.IcosahedronGeometry(.95, 1), new THREE.MeshLambertMaterial({ color: [0x7bbf5c, 0x8fcf66, 0x6aad52][(Math.random() * 3) | 0] })); cn.position.y = 1.4; cn.scale.set(1, rnd(.85, 1.15), 1); cn.castShadow = true;
    g.add(tr, cn); g.userData.cn = cn;
  } else if (kind === 'rock') {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.42, 0), new THREE.MeshLambertMaterial({ color: 0x9e978c })); r.scale.y = .7; r.position.y = .25; r.castShadow = true; g.add(r);
  } else {
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.3, 10, 8), new THREE.MeshLambertMaterial({ color: 0x5fa84c })); b.position.set(rnd(-.3, .3), .25, rnd(-.3, .3)); b.castShadow = true; g.add(b); }
  }
  return g;
}
function freeSpot() {
  for (let i = 0; i < 60; i++) {
    const x = rnd(-LIM + 2, LIM - 2), z = rnd(-LIM + 2, LIM - 2);
    if (Math.abs(x) < BUILD_R + 1.5 && Math.abs(z) < BUILD_R + 1.5) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1.5) continue;
    return { x, z };
  }
  return null;
}
function addNode(kind) { const p = freeSpot(); if (!p) return; const g = makeNodeMesh(kind); g.position.set(p.x, 0, p.z); g.rotation.y = rnd(0, 6.28); world.add(g); nodes[kind].push({ g, alive: true, rt: 0, kind }); }
function buildNodes() {
  for (let i = 0; i < 110; i++) addNode('tree');
  for (let i = 0; i < 40; i++) addNode('rock');
  for (let i = 0; i < 35; i++) addNode('bush');
  for (let i = 0; i < 80; i++) {
    const x = rnd(-LIM + 2, LIM - 2), z = rnd(-LIM + 2, LIM - 2);
    if (Math.abs(x) < BUILD_R && Math.abs(z) < BUILD_R) continue;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1) continue;
    const f = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 6), new THREE.MeshLambertMaterial({ color: [0xff9eb8, 0xffe27a, 0xc7a9ef, 0xffffff][i % 4] }));
    f.position.set(x, .08, z); world.add(f);
  }
}
// 마을 바깥을 둘러싼 숲: 나무 줄기 + 두 겹의 잎 덩어리를 인스턴스로 묶어 가볍게 그려요
/* ================= 설원 모드: 눈 덮인 소나무 · 눈보라 · 차가운 안개 ================= */
const SNOW_FOG = new THREE.Color(0xe4f2ff);
let snowOn = false, snowGroup = null, snowPts = null, snowPos = null;
function buildSnowDecor() {
  const N = 700, R1 = 30, R2 = 90;
  snowGroup = new THREE.Group(); snowGroup.visible = false; scene.add(snowGroup);
  const trunkG = new THREE.CylinderGeometry(.14, .22, 1.2, 6); trunkG.translate(0, .6, 0);
  const layerG = new THREE.ConeGeometry(1, 1.4, 7); layerG.translate(0, .7, 0);   // 초록빛 파란 솔잎 층
  const capG = new THREE.ConeGeometry(.62, .7, 7); capG.translate(0, .35, 0);      // 위에 쌓인 눈
  const mk = (g, col) => new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: col, flatShading: true }), N);
  const trunks = mk(trunkG, 0x5a4330), low = mk(layerG, 0x7fb3a4), mid = mk(layerG, 0x8cc2b0), top = mk(layerG, 0x9dcfbd), c1 = mk(capG, 0xffffff), c2 = mk(capG, 0xffffff), c3 = mk(capG, 0xffffff);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), yA = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random() * (R2 * R2 - R1 * R1) + R1 * R1);
    p.set(Math.sin(a) * r, 0, Math.cos(a) * r);
    const k = .8 + Math.random() * .5;
    q.setFromAxisAngle(yA, Math.random() * 6);
    const put = (mesh, sx, sy, sz, oy) => { sc.set(sx * k, sy * k, sz * k); m.compose(new THREE.Vector3(p.x, oy * k, p.z), q, sc); mesh.setMatrixAt(i, m); };
    put(trunks, 1, 1, 1, 0);
    put(low, 1.5, 1, 1.5, .9);  put(c1, 1.1, 1, 1.1, 1.85);
    put(mid, 1.15, 1, 1.15, 1.6); put(c2, .8, 1, .8, 2.45);
    put(top, .75, 1, .75, 2.3); put(c3, .5, 1, .5, 3.0);
  }
  for (const mesh of [trunks, low, mid, top, c1, c2, c3]) { mesh.instanceMatrix.needsUpdate = true; snowGroup.add(mesh); }
  // 눈송이: 플레이어 주변에서 천천히 내려요
  const SN = 500; snowPos = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) { snowPos[i * 3] = (Math.random() - .5) * 60; snowPos[i * 3 + 1] = Math.random() * 22; snowPos[i * 3 + 2] = (Math.random() - .5) * 60; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  snowPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: .16, transparent: true, opacity: .9, depthWrite: false }));
  snowPts.visible = false; scene.add(snowPts);
}
function setSnowMode(on) {
  if (!snowGroup) return;
  snowOn = on;
  snowGroup.visible = on; snowPts.visible = on;
  (window.forestMeshes || []).forEach(mesh => { mesh.visible = !on; });
  setGroundTheme(on ? 'snow' : null);
}
function updSnow(dt) {   // 매 프레임: 눈 내리기 + 설원 모드 맞추기
  if (!snowGroup) return;
  const want = !!(G && G.day >= 10);
  if (want !== snowOn) setSnowMode(want);
  if (!snowOn || !snowPts) return;
  const cx = px, cz = pz;
  for (let i = 0; i < snowPos.length; i += 3) {
    snowPos[i + 1] -= dt * (1.6 + (i % 7) * .08);
    snowPos[i] += Math.sin(gameT * .8 + i) * dt * .3;
    if (snowPos[i + 1] < 0) { snowPos[i + 1] = 20 + Math.random() * 3; snowPos[i] = (Math.random() - .5) * 60; snowPos[i + 2] = (Math.random() - .5) * 60; }
  }
  snowPts.geometry.attributes.position.needsUpdate = true;
  snowPts.position.set(cx, 0, cz);
  snowPts.position.y = 0;
}
function addForest() {
  const N = 2000, R1 = 30, R2 = 90;
  const trunkG = new THREE.CylinderGeometry(.16, .26, 1.7, 6); trunkG.translate(0, .85, 0);
  const leafG = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x6e4f33 }), N);
  const big = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), N);
  const small = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), N);
  const pal = [0x3c8a38, 0x4a9a44, 0x56a64c, 0x2f7433, 0x6cb55a, 0x2a6a3a, 0x7fbf5e].map(h => new THREE.Color(h));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc3 = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(rnd(R1 * R1, R2 * R2));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const hidden = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 1;
    const sc = hidden ? 0 : rnd(.9, 1.8);
    q.setFromAxisAngle(yAxis, rnd(0, 6.28));
    p.set(x, 0, z); sc3.set(sc, sc, sc); m.compose(p, q, sc3); trunks.setMatrixAt(i, m);
    const cy = 1.9 * sc; sc3.set(sc * rnd(1.1, 1.5), sc * rnd(1.0, 1.35), sc * rnd(1.1, 1.5));
    p.set(x, cy, z); m.compose(p, q, sc3); big.setMatrixAt(i, m); big.setColorAt(i, pal[(Math.random() * pal.length) | 0]);
    sc3.set(sc * rnd(.6, .9), sc * rnd(.6, .8), sc * rnd(.6, .9));
    p.set(x + rnd(-.6, .6) * sc, cy + .7 * sc, z + rnd(-.6, .6) * sc); m.compose(p, q, sc3); small.setMatrixAt(i, m); small.setColorAt(i, pal[(Math.random() * pal.length) | 0]);
  }
  window.forestMeshes = [trunks, big, small];
  for (const mesh of [trunks, big, small]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; scene.add(mesh); }
}
// 모서리 전등(노란 등)은 공격을 맞힐수록 충전되고, 10번 차면 폭발해 주변 적에게 피해를 줘요
const CANISTERS = [];
function registerCanister(o, x, z) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.6, 40), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, .08, z); scene.add(ring);
  CANISTERS.push({ x, z, o, ring, charge: 0 });
}
function chargeCanisterAt(x, z) {
  for (const c of CANISTERS) {
    if (Math.hypot(c.x - x, c.z - z) > 1.8) continue;
    c.charge++;
    c.ring.material.opacity = .15 + .6 * c.charge / 10;
    glowAt(c.x, 1.9, c.z, 1.4 + c.charge * .08, 0xffc040, .18);
    popup(c.x, 2.8, c.z, '⚡ ' + c.charge + '/10', '#ffe76a');
    if (c.charge >= 10) explodeCanister(c);
    return;
  }
}
function explodeCanister(c) {
  c.charge = 0; c.ring.material.opacity = 0;
  const x = c.x, z = c.z, R = 4.6, dmg = (3 + G.skillLv * .5) * skillDmgMul();
  for (const m of mons) {
    if (m.dead) continue;
    if (Math.hypot(m.obj.position.x - x, m.obj.position.z - z) < R) hitEnemy(m, dmg * bossDmgMul(m), { kb: .8 });
  }
  // 충격파
  const shock = new THREE.Mesh(new THREE.RingGeometry(.4, .6, 48), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  shock.rotation.x = -Math.PI / 2; shock.position.set(x, .1, z); scene.add(shock);
  tweenTo(1, R * 2.2, .45, v => shock.scale.setScalar(v), 'out');
  tweenTo(.95, 0, .55, v => { shock.material.opacity = v; }, 'in', 0, () => { scene.remove(shock); shock.material.dispose(); });
  // 불기둥: 가운데에서 불꽃이 솟구쳐요
  if (!flameTex) flameTex = makeRadialTex('rgba(255,250,200,1)', 'rgba(255,90,10,0)');
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.SpriteMaterial({ map: flameTex, color: i % 2 ? 0xff7a1a : 0xffd060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const sp = new THREE.Sprite(mat); sp.position.set(x + rnd(-.8, .8), .5, z + rnd(-.8, .8)); scene.add(sp);
    tweenTo(.6, 4 + rnd(0, 2.5), 1.1, v => { sp.position.y = v; sp.scale.setScalar(2.2 - v * .25); }, 'out', i * .05);
    tweenTo(1, 0, .9, v => { mat.opacity = v; }, 'in', .35 + i * .05, () => { scene.remove(sp); mat.dispose(); });
  }
  // 불바다: 0.3초마다 주변에 불이 번지며 약 3초 동안 타요
  for (let i = 0; i < 14; i++) {
    tweenTo(0, 1, .001, () => {}, 'out', i * .22, () => {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R * .9;
      igniteAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
      puff(x + Math.cos(a) * r, z + Math.sin(a) * r, 5, 0xff9a3a);
    });
  }
  // 불덩이 폭발 빛
  glowAt(x, 1.4, z, 6, 0xffa030, .6); glowAt(x, 1, z, 3, 0xfff0a0, .4);
  puff(x, z, 24, 0xffb347);
  igniteAt(x, z);
  screenFlash('#ffd9a0', .3, .35); hitStop(.07); sfx('skill'); vib('hit');
  toast('💥 전등 폭발! 불이 번지고 있어요');
}
function addVillageDecor() {
  const put = (k, x, z, ry) => { const pv = VILLAGE[k]; if (!pv) return null; const o = pv.clone(); o.position.set(x, 0, z); o.rotation.y = ry || 0; world.add(o); return o; };
  const E = BUILD_R + 1.2;
  CANISTERS.length = 0;
  for (const [x, z] of [[E, E], [-E, E], [E, -E], [-E, -E]]) { const o = put('lamp', x, z); if (o) registerCanister(o, x, z); }
  put('torii', 0, BUILD_R + 3.4, 0); put('fountain', -(BUILD_R + 3.5), 0, Math.PI / 2);
  for (let i = 0; i < 12; i++) { const p = freeSpot(); if (p) put('bamboo', p.x, p.z, rnd(0, 6.28)); }
  for (let i = 0; i < 8; i++) { const p = freeSpot(); if (p) put('rock', p.x, p.z, rnd(0, 6.28)); }
}

/* ================= 캐릭터 · 촌장 ================= */
function fallbackChar() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.3, .36, .75, 14), new THREE.MeshLambertMaterial({ color: 0x4fc3f7 })); body.position.y = .45; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 16, 14), new THREE.MeshLambertMaterial({ color: 0xffe1c2 })); head.position.y = 1.1; head.castShadow = true;
  g.add(body, head); return g;
}
function gear(cls) {
  const g = new THREE.Group(); const std = c => new THREE.MeshLambertMaterial({ color: c });
  if (cls === 'mage') {
    const hat = new THREE.Mesh(new THREE.ConeGeometry(.34, .85, 12), std(0x4b3f9e)); hat.position.y = 1.42; hat.userData.hat = true;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .06, 14), std(0x4b3f9e)); brim.position.y = 1.0; brim.userData.hat = true;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(.07), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffb347, emissiveIntensity: .8 })); star.position.y = 1.9;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.4, 6), std(0x7a5636)); staff.position.set(.5, .75, .12);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 10), new THREE.MeshStandardMaterial({ color: 0x9fe6ff, emissive: 0x6fd3ff, emissiveIntensity: 1.2 })); orb.position.set(.5, 1.5, .12);
    g.add(hat, brim, star, staff, orb);
  } else if (cls === 'archer') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3f7d3a)); hood.position.y = 1.1; hood.userData.hat = true;
    const feather = new THREE.Mesh(new THREE.ConeGeometry(.07, .25, 6), std(0xffd166)); feather.position.set(-.18, 1.42, -.1); feather.rotation.z = .4;
    const bow = new THREE.Mesh(new THREE.TorusGeometry(.5, .03, 6, 16, Math.PI), std(0x8b5e3c)); bow.position.set(.5, .8, .12); bow.rotation.z = Math.PI / 2;
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .6, 8), std(0x6b4a2b)); quiver.position.set(-.3, .9, -.18); quiver.rotation.z = .3;
    g.add(hood, feather, bow, quiver);
  } else {
    const helm = new THREE.Mesh(new THREE.SphereGeometry(.31, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xc9d3df)); helm.position.y = 1.12; helm.userData.hat = true;
    const plume = new THREE.Mesh(new THREE.ConeGeometry(.08, .35, 6), std(0xe05a4f)); plume.position.set(0, 1.45, 0);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.07, .85, .03), std(0xdfe6ee)); blade.position.set(.52, .75, .12);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(.2, .06, .06), std(0x8b5e3c)); hilt.position.set(.52, .32, .12);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(.06, .55, .42), std(0x3f7fc2)); shield.position.set(-.42, .65, 0);
    g.add(helm, plume, blade, hilt, shield);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// 내 캐릭터 색: 같은 모델이라도 색을 살짝 입혀서 친구와 헷갈리지 않게 해요
const TINT_BASE = new WeakMap();   // 메쉬별 원래 색 (복제된 재질만 건드려요: 세계·다른 캐릭터 재질은 그대로)
function tintPlayer() {
  if (!playerModel) return;
  const pal = new THREE.Color(PAL_COL[(profile.color | 0) % PAL_COL.length]);
  const k = new THREE.Color(1, 1, 1).lerp(pal, .8);
  playerModel.traverse(o => {
    if (!o.isMesh || !o.material) return;
    if (!TINT_BASE.has(o)) {
      const src = Array.isArray(o.material) ? o.material : [o.material];
      TINT_BASE.set(o, src.map(m => (m.color ? m.color.clone() : null)));
      o.material = Array.isArray(o.material) ? src.map(m => m.clone()) : src[0].clone();
    }
    const base = TINT_BASE.get(o), cur = Array.isArray(o.material) ? o.material : [o.material];
    cur.forEach((m, i) => { if (m.color && base[i]) m.color.copy(base[i]).multiply(k); });
  });
  if (ring) ring.material.color.copy(pal);
  paintHat(playerModel, pal);
}
function makePlayer() {
  if (player) scene.remove(player);
  player = new THREE.Group();
  playerModel = new THREE.Group();
  const body = (creatureProto && THREE.SkeletonUtils) ? THREE.SkeletonUtils.clone(creatureProto) : fallbackChar();
  playerModel.add(body);
  playerModel.add(gear(profile.cls));
  if (profile.cls === 'archer' && antlersProto) { const an = antlersProto.clone(); an.position.set(0, 1.3, 0); playerModel.add(an); }
  player.add(playerModel);
  blobPlayer = new THREE.Mesh(blobGeo, blobMat); blobPlayer.rotation.x = -Math.PI / 2; blobPlayer.position.y = .02; player.add(blobPlayer);
  ring = new THREE.Mesh(new THREE.RingGeometry(.38, .46, 32), new THREE.MeshBasicMaterial({ color: 0x7bd389, transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .03; player.add(ring);
  player.position.set(px, 0, pz);
  tintPlayer();
  scene.add(player);
}
function makeMayor() {
  mayor = mayorProto ? mayorProto.clone() : fallbackChar();
  mayor.visible = false;   // 안내자(하얀 물체)는 숨겨요
  mayor.position.set(MAYOR.x, 0, MAYOR.z); mayor.rotation.y = -.8;
  world.add(mayor);
}

/* ================= 건물 ================= */
const WALLS = [0xf3c99a, 0x9fd3e6, 0xe9b3c8, 0xb9dd9a, 0xf6e28a];
function winMat() { return new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0xffd26b, emissiveIntensity: 0 }); }
const winMats = [], towerLamps = [];
function makeBuilding(tp, x, z, lv) {
  const g = new THREE.Group();
  if (tp === 'HOUSE' && VILLAGE.house_a) {
    const body = VILLAGE[(Math.abs(x * 3 + z * 5) % 2) ? 'house_b' : 'house_a'].clone(); g.add(body);
    const h = new THREE.Box3().setFromObject(body).max.y;
    const gems = new THREE.Group(); gems.position.set(0, h + .25, 0); g.add(gems);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(GEM_GEO, GEM_MAT); c.position.set((i - 1) * .3, 0, 0); c.visible = false; gems.add(c); }
    g.userData.gems = gems; g.userData.gemY = h + .25;
  } else if (tp === 'HOUSE' || tp === 'WEAVE') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), new THREE.MeshLambertMaterial({ color: WALLS[Math.abs(x * 3 + z * 5) % WALLS.length] })); body.position.y = .55;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, .9, 4), new THREE.MeshLambertMaterial({ color: 0xd9765f })); roof.position.y = 1.55; roof.rotation.y = Math.PI / 4;
    const door = new THREE.Mesh(new THREE.BoxGeometry(.35, .6, .06), new THREE.MeshLambertMaterial({ color: 0x8d6b4f })); door.position.set(0, .3, .67);
    const wm = winMat(); winMats.push(wm);
    const win = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, .06), wm); win.position.set(.45, .65, .67);
    g.add(body, roof, door, win);
    const gems = new THREE.Group(); gems.position.set(0, 2.35, 0); g.add(gems);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(GEM_GEO, GEM_MAT); c.position.set((i - 1) * .36, 0, 0); c.visible = false; gems.add(c); }
    g.userData.gems = gems;
  } else if (tp === 'APT') {
    const H = aptH(lv || 1);
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, H, 2.5), new THREE.MeshLambertMaterial({ color: WALLS[Math.abs(x * 7 + z * 3) % WALLS.length] })); body.position.y = H / 2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, .3, 2.8), new THREE.MeshLambertMaterial({ color: 0x8a6f5a })); roof.position.y = H + .15;
    const wm = winMat(); winMats.push(wm);
    const wg = new THREE.BoxGeometry(.28, .32, .05);
    const nf = Math.floor((H - 1) / 1.5);
    for (let f = 0; f < nf; f++) for (let c = 0; c < 2; c++) { const w = new THREE.Mesh(wg, wm); w.position.set(-.62 + c * 1.24, 1.1 + f * 1.5, 1.27); g.add(w); }
    g.add(body, roof);
    // 계단: 아파트 +x 쪽에서 6단으로 지붕까지 올라갑니다
    for (let st = 0; st < 6; st++) {
      const sh = H * (1 - st / 6), sb = new THREE.Mesh(new THREE.BoxGeometry(4 / 6 - .02, Math.max(.05, sh), 1.4), new THREE.MeshLambertMaterial({ color: 0xc9bfae }));
      sb.position.set(1.5 + (st + .5) * (4 / 6), sh / 2, 0); g.add(sb);
    }
  } else if (tp === 'TOWER') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.6, .75, 2, 8), new THREE.MeshLambertMaterial({ color: 0xcfc6b5 })); base.position.y = 1;
    const top = new THREE.Mesh(new THREE.ConeGeometry(.9, .8, 8), new THREE.MeshLambertMaterial({ color: 0xc96f5e })); top.position.y = 2.4;
    const lm = new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0xffb347, emissiveIntensity: 0 }); towerLamps.push(lm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 10), lm); lamp.position.y = 1.9;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(.5, .25, .04), new THREE.MeshLambertMaterial({ color: 0xffd54f })); flag.position.set(.3, 2.9, 0);
    g.add(base, top, lamp, flag); g.userData.flag = flag;
  } else if (tp === 'WALL') {
    const wm2 = new THREE.MeshLambertMaterial({ color: 0xbdb5a3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(.96, 1.0, .96), wm2); body.position.y = .5;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, .16, 1.0), new THREE.MeshLambertMaterial({ color: 0x9c9482 })); cap.position.y = 1.08;
    g.add(body, cap);
  } else if (tp === 'LAMP') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 1.7, 6), new THREE.MeshLambertMaterial({ color: 0x5d4a3a })); pole.position.y = .85;
    const bm = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffc860, emissiveIntensity: 0 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 10), bm); bulb.position.y = 1.85;
    const halo = new THREE.Mesh(new THREE.CircleGeometry(2.6, 28), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = .05;
    g.add(pole, bulb, halo); g.userData.bulb = bm; g.userData.halo = halo;
  } else if (tp === 'TRAP') {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.9, .08, .9), new THREE.MeshLambertMaterial({ color: 0x7a6a5a })); plate.position.y = .04;
    const sp = new THREE.Group(); sp.position.y = .08; sp.scale.y = .35; g.add(plate, sp); g.userData.spikes = sp;
    const sm = new THREE.MeshLambertMaterial({ color: 0xc9d1d9 });
    for (const [ox, oz] of [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.08, .5, 5), sm); c.position.set(ox, .25, oz); sp.add(c); }
  } else {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.9, 0), new THREE.MeshLambertMaterial({ color: 0xb8b0a6 })); rock.scale.y = .6; rock.position.y = .4;
    const crys = new THREE.Group(); crys.position.y = .9; g.add(rock, crys);
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(GEM_GEO, GEM_MAT); c.scale.setScalar(1.3); const a = i / 4 * Math.PI * 2; c.position.set(Math.cos(a) * .45, (i % 2) * .3, Math.sin(a) * .45); c.rotation.y = a; crys.add(c); }
    g.userData.crys = crys;
  }
  g.position.set(x, 0, z);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const bkey = (x, z) => x + ',' + z;
function addBuildingMesh(k, b) {
  const [x, z] = k.split(',').map(Number);
  const m = makeBuilding(b.t, x, z, b.lv); world.add(m); bmesh[k] = m;
  if (b.t === 'HOUSE') updateGems(k);
  if (b.t === 'APT') mapExpand();
}
function updateGems(k) {
  const b = G.b[k], m = bmesh[k]; if (!b || !m || !m.userData.gems) return;
  m.userData.gems.children.forEach((c, i) => { c.visible = i < (b.g || 0); });
}
function removeBuildingMesh(k, done) {
  const m = bmesh[k]; if (!m) { done && done(); return; }
  delete bmesh[k];
  tweenTo(1, 0, .25, v => m.scale.setScalar(Math.max(.001, v)), 'in', 0, () => { world.remove(m); done && done(); });
}

/* ================= 트윈 · 파티클 · 이펙트 ================= */
const EASE = { out: t => 1 - Math.pow(1 - t, 3), in: t => t * t, back: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
const tweens = [];
function tweenTo(from, to, dur, set, ease, delay, done) { tweens.push({ from, to, dur, set, ease: EASE[ease] || EASE.out, delay: delay || 0, done, t: 0 }); }
function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const k = tweens[i]; k.t += dt; if (k.t < k.delay) continue;
    const p = clamp((k.t - k.delay) / k.dur, 0, 1); k.set(lerp(k.from, k.to, k.ease(p)));
    if (p >= 1) { tweens.splice(i, 1); k.done && k.done(); }
  }
}
function puff(x, z, n, col) {
  for (let i = 0; i < (n || 6); i++) {
    if (partPool.length > 160) break;
    const m = new THREE.Mesh(partGeo, partMat(col || 0xf6ecd2));
    m.position.set(x + rnd(-.2, .2), .35, z + rnd(-.2, .2)); scene.add(m);
    partPool.push({ m, vx: rnd(-1.8, 1.8), vy: rnd(1.6, 3.2), vz: rnd(-1.8, 1.8), life: rnd(.45, .85), max: 0.85 });
  }
}
function stepParts(dt) {
  for (let i = partPool.length - 1; i >= 0; i--) {
    const p = partPool[i]; p.life -= dt;
    p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt; p.m.position.y += p.vy * dt; p.vy -= 5 * dt;
    const s = Math.max(.05, p.life / p.max); p.m.scale.setScalar(s);
    if (p.life <= 0) { scene.remove(p.m); partPool.splice(i, 1); }
  }
}
function glowAt(x, y, z, scale, color, life) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: color || 0xffe44d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sp.position.set(x, y, z); sp.scale.setScalar(scale); scene.add(sp);
  tweenTo(1, 0, life || .3, v => { sp.material.opacity = v; sp.scale.setScalar(scale * (.6 + v * .5)); }, 'in', 0, () => { scene.remove(sp); sp.material.dispose(); });
}
function popup(x, y, z, txt, col) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dmgTex(txt, col || '#fff6c2'), transparent: true, depthWrite: false, fog: false }));
  sp.position.set(x, y + 1.2, z); sp.scale.set(1.3, .65, 1); scene.add(sp);
  tweenTo(0, 1, .7, v => { sp.position.y = y + 1.2 + v * .9; }, 'out');
  tweenTo(1, 0, .7, v => { sp.material.opacity = v; }, 'in', .2, () => { scene.remove(sp); sp.material.dispose(); });
}
// 노란 번개: 흰 코어 + 노란 외곽 (선 3가닥, 깜빡임)
function bolt(pts, col) {
  const group = new THREE.Group(); scene.add(group); const mats = [];
  [{ c: 0xffffff, a: .05 }, { c: col || 0x33c2ff, a: .13 }, { c: 0x9fe6ff, a: .2 }].forEach(L => {
    const jit = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], seg = Math.max(4, Math.round(a.distanceTo(b) * 4));
      for (let s = 0; s < seg; s++) { const f = s / seg; jit.push(new THREE.Vector3(lerp(a.x, b.x, f) + rnd(-L.a, L.a), lerp(a.y, b.y, f) + rnd(-L.a, L.a), lerp(a.z, b.z, f) + rnd(-L.a, L.a))); }
    }
    jit.push(pts[pts.length - 1].clone());
    const mat = new THREE.LineBasicMaterial({ color: L.c, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    mats.push(mat); group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(jit), mat));
  });
  pts.forEach((p, i) => { if (i > 0) glowAt(p.x, p.y, p.z, 1.0, 0x5ad8ff, .25); });
  for (let k = 0; k < 4; k++) { const a = pts[0], b = pts[pts.length - 1], f = (k + .5) / 4 + rnd(-.08, .08); glowAt(lerp(a.x, b.x, f), lerp(a.y, b.y, f) + rnd(-.1, .1), lerp(a.z, b.z, f), .55, 0x7fe4ff, .16); }
  let flick = 0;
  tweenTo(1, 0, .48, v => { flick += 1; mats.forEach((m, i) => m.opacity = v * (i % 2 ? .6 + .4 * Math.abs(Math.sin(flick + i)) : 1)); }, 'in', 0, () => {
    scene.remove(group); group.children.forEach(l => { l.geometry.dispose(); l.material.dispose(); });
  });
}
function dropGems(x, z, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(GEM_GEO, GEM_MAT); m.position.set(x + rnd(-.5, .5), .4, z + rnd(-.5, .5)); m.castShadow = true; scene.add(m);
    drops.push({ m, t: rnd(0, 6) });
    tweenTo(0, 1, .4, v => m.scale.setScalar(v), 'back', i * .08);
  }
}
// 화면 흔들림 · 히트스톱
function hitFx(strength) { shake = Math.max(shake, strength); }
function hitStop(sec) { hitstop = Math.max(hitstop, sec); }

/* ================= 몬스터 · 보스 ================= */
function pickKind() {
  const dayE = G.endless ? Math.max(G.day, Math.ceil((G.wave || 1) / 2)) : G.day;
  const ks = Object.keys(MON).filter(k => MON[k].unlock <= dayE && (!MON[k].model || MODEL3D[MON[k].model]));
  const kw = k => MON[k].w * (MON[k].fly ? 1 + Math.max(0, dayE - 2) * .5 : 1);
  const tot = ks.reduce((s, k) => s + kw(k), 0); let r = Math.random() * tot;
  for (const k of ks) { r -= kw(k); if (r <= 0) return k; }
  return ks[0];
}
function diffMul() { return 1 + (G.day - 1) * .12 + (G.endless ? (G.wave || 1) * .1 : 0); }
const SPR_PAD = {};
function spritePadFrac(k) {   // 그림 맨 아래 투명 여백 비율 (발이 얼마나 떠 있는지)
  if (SPR_PAD[k] !== undefined) return SPR_PAD[k];
  const tx = SPR[k] && SPR[k].move, im = tx && tx.image;
  if (!im || !im.width) return 0;
  const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
  const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data; let bot = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 40) bot = y;
  SPR_PAD[k] = bot < 0 ? 0 : (cv.height - 1 - bot) / cv.height;
  return SPR_PAD[k];
}
function makeMon(kind, x, z, opts) {
  const d = opts && opts.boss ? BOSS[kind] : MON[kind];
  if (d.model) return makeMon3D(kind, x, z, d, opts);
  const skey = opts && opts.boss ? d.sprite : (d.sprite || kind);
  const sp = SPR[skey];
  if (!sp || !sp.move) return null;
  const atkKeys = ['atk', 'atk2', 'atk3'].filter(k => sp[k]);
  const ak = atkKeys.length ? atkKeys[(Math.random() * atkKeys.length) | 0] : 'move';
  const A = { move: cloneTex(sp.move), atk: cloneTex(sp[ak] || sp.move), hit: cloneTex(sp.hit || sp.move), death: cloneTex(sp.death || sp.move) };
  const obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.move, transparent: true, alphaTest: .05, depthWrite: false, toneMapped: false }));
  const sc = d.sc * (opts && opts.boss ? 1 : 1.2);
  const padY = spritePadFrac(d.sprite || kind) * sc;
  obj.center.set(.5, 0); obj.scale.set(sc, sc, 1); obj.position.set(x, d.fly || 0, z); world.add(obj);
  const shadow = new THREE.Mesh(blobGeo, blobMat); shadow.rotation.x = -Math.PI / 2; shadow.scale.setScalar(sc * .55); shadow.position.set(x, .02, z); world.add(shadow);
  const hpMax = opts && opts.boss ? Math.round(d.hp * diffMul() * (1 + (G.day - 5) * .18)) : 1;
  const m = {
    kind, boss: !!(opts && opts.boss), d, obj, shadow, padY, A, cur: null, loop: false, at: 0, done: false, face: 1,
    hp: hpMax, hpMax, state: 'walk', tk: pickTarget(x, z, kind), carry: 0, cd: rnd(.4, 1.2), hitLock: 0, dead: false,
    fly: d.fly || 0, ph: rnd(0, 6), kx: 0, kz: 0, flash: 0, touchCd: 0, ringCd: 2.4, texs: [A.move, A.atk, A.hit, A.death]
  };
  setAnim(m, 'move', true);
  return m;
}
function makeMon3D(kind, x, z, d, opts) {
  const P = MODEL3D[d.model]; if (!P) return null;
  const boss = !!(opts && opts.boss);
  const root = THREE.SkeletonUtils.clone(P.obj);
  root.scale.setScalar(d.sc);
  if (boss) root.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); if (o.material.color) o.material.color.setRGB(d.tint[0], d.tint[1], d.tint[2]); } });
  const obj = new THREE.Group(); obj.add(root);
  obj.position.set(x, d.fly || 0, z); world.add(obj);
  const shadow = new THREE.Mesh(blobGeo, blobMat); shadow.rotation.x = -Math.PI / 2; shadow.scale.setScalar(d.sc * .55); shadow.position.set(x, .02, z); world.add(shadow);
  const find = n => n && P.clips.find(c => c.name.split('|').pop() === n);
  const clips = { walk: find(d.walk), atk: find(d.atk), hit: find(d.hit), death: find(d.death) };
  const hpMax = boss ? Math.round(d.hp * diffMul() * (1 + (G.day - 5) * .18)) : 1;
  const m = { kind, boss, d, obj, shadow, padY: 0, A: null, mx: new THREE.AnimationMixer(root), clips, clipNow: null, cur: null, loop: false, at: 0, done: false, face: 1,
    hp: hpMax, hpMax, state: 'walk', tk: pickTarget(x, z, kind), carry: 0, cd: rnd(.4, 1.2), hitLock: 0, dead: false,
    fly: d.fly || 0, ph: rnd(0, 6), kx: 0, kz: 0, flash: 0, touchCd: 0, ringCd: 2.4, texs: [] };
  setAnim(m, 'move', true);
  return m;
}
function set3DClip(m, name) {
  const c = m.clips, want = name === 'atk' ? (c.atk || c.walk) : name === 'hit' ? (c.hit || c.walk) : name === 'death' ? c.death : c.walk;
  if (!m.mx || !want || m.clipNow === want) return;
  const act = m.mx.clipAction(want); act.reset(); act.setLoop(m.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); act.clampWhenFinished = true; act.fadeIn(.15).play();
  if (m.clipNow) m.mx.clipAction(m.clipNow).fadeOut(.15);
  m.clipNow = want;
}
function setAnim(m, name, loop) {
  if (m.A === null) {   // 3D 몬스터는 애니메이션 클립으로 움직여요
    if (m.cur === name && m.loop === loop) return;
    m.cur = name; m.loop = loop; m.at = 0; m.done = false; set3DClip(m, name); return;
  }
  if (m.cur === name && m.loop === loop) return;
  m.cur = name; m.loop = loop; m.at = 0; m.done = false;
  m.obj.material.map = m.A[name]; m.obj.material.needsUpdate = true;
}
function stepAnim(m, dt) {
  if (m.A === null) {
    m.at += dt; if (m.mx) m.mx.update(dt);
    if (m.cur === 'death') { m.obj.rotation.z = Math.min(Math.PI / 2, m.at * 2.5); if (m.at > 1) m.done = true; }
    else { m.obj.rotation.y = m.face > 0 ? Math.PI / 2 : -Math.PI / 2; if (!m.loop && m.at > .5) m.done = true; }
    return;
  }
  const tx = m.A[m.cur], n = tx.frames;
  m.at += dt; let f = Math.floor(m.at * 9);
  if (m.loop) f = f % n; else if (f >= n) { f = n - 1; m.done = true; }
  tx.offset.x = m.face > 0 ? f / n : (f + 1) / n;
  tx.repeat.x = m.face > 0 ? 1 / n : -1 / n;
}
function removeMon(m) {
  world.remove(m.obj); if (m.obj.material) m.obj.material.dispose(); if (m.mx) m.mx.stopAllAction(); world.remove(m.shadow);
  if (m.texs) { m.texs.forEach(t => t.dispose()); m.texs = null; }
  const i = mons.indexOf(m); if (i >= 0) mons.splice(i, 1);
  if (m.boss && bossRef === m) { bossRef = null; $('bossBar').style.display = 'none'; }
  if (giantRef === m) giantRef = null;
}
function pickTarget(x, z, kind) {
  let best = null, bd = Infinity;
  for (const k in G.b) {
    if (G.b[k].t !== 'HOUSE') continue;
    const [bx, bz] = k.split(',').map(Number);
    const d = Math.hypot(bx - x, bz - z) - ((G.b[k].g || 0) > 0 ? (kind === 'dragon' ? 30 : 6) : 0);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}
function spawnGiant(kind) {
  if (guestMode()) return;
  const a = rnd(0, Math.PI * 2), x = Math.sin(a) * SPAWN_R, z = Math.cos(a) * SPAWN_R;
  const m = makeMon(kind, x, z, { boss: true }); if (!m) return;
  mons.push(m); m.kingGate = true; giantRef = m; puff(x, z, 10, 0x9fe07a); glowAt(x, 1, z, 4, 0x9fe07a, .5);
  toast('👑 거대 좀비 왕이 나타났어요!'); sfx('boss'); vib('boss');
}
// 매 밤 중간에 한 마리: 크기 1.9배, 체력 3배, HP 바 표시 (처치 보상 있음, 새벽 게이트는 아님)
function spawnMidGiant() {
  if (guestMode()) return;
  const a = rnd(0, Math.PI * 2), x = Math.sin(a) * SPAWN_R, z = Math.cos(a) * SPAWN_R;
  const m = makeMon(pickKind(), x, z, {}); if (!m) return;
  m.giant = true; m.hp = m.hpMax = Math.round(m.hp * 12);   // 10번 이상 맞아야 쓰러져요
  m.obj.scale.multiplyScalar(1.9); m.shadow.scale.multiplyScalar(1.9);
  mons.push(m); if (!giantRef || giantRef.dead) giantRef = m;
  puff(x, z, 8, 0xffd0a0); toast('🧟 거대한 좀비가 나타났어요! 처치해 주세요.'); vib('boss');
}
// 난이도: 적의 공격력을 조금 올려요
for (const k in MON) MON[k].dmg = Math.round(MON[k].dmg * 1.25 * 10) / 10;
function spawnMon(kind, boss) {
  if (guestMode()) return;
  const a = rnd(0, Math.PI * 2), x = Math.sin(a) * SPAWN_R, z = Math.cos(a) * SPAWN_R;
  const m = makeMon(boss ? kind : (kind || pickKind()), x, z, { boss });
  if (!m) return;
  mons.push(m); puff(x, z, 6, 0xd9f0c0);
  if (boss) { bossRef = m; $('bossBar').style.display = 'block'; $('bossName').textContent = BOSS[kind].name + ' · ' + G.day + '일차'; sfx('boss'); vib('boss'); }
}
function electricBurst(bx, bz, R, n) {   // 전기 아크가 사방으로 튀어요
  const cy = 1.9;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-.25, .25), rr = R * rnd(.65, 1);
    bolt([new THREE.Vector3(bx, cy, bz), new THREE.Vector3(bx + Math.cos(a) * rr, rnd(.3, 1.1), bz + Math.sin(a) * rr)], 0x6fe0ff);
  }
  glowAt(bx, cy, bz, R * 1.5, 0xd8f8ff, .35);
}
function lampBlast(bx, bz) {   // 전등이 부서지면 전기가 크게 터지고, 주변 적과 건물이 맞아요
  const R = 2.6;
  electricBurst(bx, bz, R * 1.2, 12); electricBurst(bx, bz, R * .6, 6);
  hitFx(.5); hitStop(.07); sfx('boss');
  for (const k2 of Object.keys(G.b)) {
    const [x2, z2] = k2.split(',').map(Number);
    if (G.b[k2] && G.b[k2].t !== 'LAMP' && Math.hypot(x2 - bx, z2 - bz) <= R) hurtBuildingAt(k2, 4, null);
  }
  for (const m of mons.slice()) if (!m.dead && Math.hypot(m.obj.position.x - bx, m.obj.position.z - bz) <= R) hitEnemy(m, m.boss ? 30 : 9999, { kb: 1.4 });
  toast('⚡ 전등이 전기 폭발을 일으켰어요!');
}
function lampZap(k) {   // 공격이 전등에 닿으면 전기가 튀고, 전등이 찌그러지며 번쩍여요
  const [bx, bz] = k.split(',').map(Number);
  const mesh = bmesh[k];
  electricBurst(bx, bz, 1.6, 5); sfx('hit'); sfx('skill'); hitFx(.22); hitStop(.05); vib('hit');
  if (mesh) {
    tweenTo(1.3, 1, .3, v => { mesh.scale.set(v, 1 / v, v); }, 'back');
    tweenTo(.6, 1, .25, v => { if (mesh.userData.halo) mesh.userData.halo.scale.setScalar(2.2 * v); }, 'out');
  }
  glowAt(bx, 1.9, bz, 2.2, 0xffffff, .2);
  hurtBuildingAt(k, 2, null, true);
}
function hurtBuildingAt(k, dmg, m, zap) {
  const b = G.b[k]; if (!b) return;
  if (b.t === 'LAMP') dmg = zap ? 2 : 1;   // 전등은 적에게 10번, 플레이어 공격에는 5번 맞으면 부서져요
  else if (m && !zap) dmg *= 1 + .6 * weakDefense();   // 건물이 적으면 적이 더 쉽게 뚫고 들어와요
  b.hp -= dmg;
  const mesh = bmesh[k]; if (mesh) tweenTo(1.08, 1, .2, v => mesh.scale.set(v, 1 / v, v), 'out');
  const [bx, bz] = k.split(',').map(Number);
  puff(bx, bz, 4, 0xd9b98a);
  if (b.hp <= 0) {
    const g = b.g || 0, wasLamp = b.t === 'LAMP';
    removeBuildingMesh(k); delete G.b[k]; netSend('remove', { k });
    if (wasLamp) lampBlast(bx, bz);
    if (m) { m.carry = (m.carry || 0) + g; m.state = 'flee'; m.tk = null; toast('🏚 집이 무너졌어요! 도둑이 보석을 훔쳐 가요!'); }
    else { if (g) dropGems(bx, bz, g); toast('🏚 집이 무너졌어요! 보석이 떨어졌어요.'); }
    puff(bx, bz, 14, 0xc9a27a); hitFx(.35); persistRun();
  }
}
function spawnProj(kind, x, z, opts) {
  const base = SPR[kind] && SPR[kind].proj; if (!base) return;
  const tx = cloneTex(base);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
  sp.scale.set(.7, .7, 1); sp.position.set(x, kind === 'flying_eye' ? 2.1 : .9, z); scene.add(sp);
  projs.push({ sp, tx, n: tx.frames, tk: opts.tk || null, vx: opts.vx || 0, vz: opts.vz || 0, at: 0, toPlayer: !!opts.toPlayer, dmg: opts.dmg || 4, life: opts.life || 3 });
}
function updProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.at += dt;
    const f = Math.floor(p.at * 12) % p.n; p.tx.offset.x = f / p.n; p.tx.repeat.x = 1 / p.n;
    if (p.toPlayer) {
      p.sp.position.x += p.vx * dt; p.sp.position.z += p.vz * dt;
      if (Math.hypot(p.sp.position.x - px, p.sp.position.z - pz) < .7) { hurtPlayer(p.dmg, { x: p.sp.position.x, z: p.sp.position.z }); scene.remove(p.sp); p.sp.material.dispose(); p.tx.dispose(); projs.splice(i, 1); continue; }
      if (p.at > p.life) { scene.remove(p.sp); p.sp.material.dispose(); p.tx.dispose(); projs.splice(i, 1); }
      continue;
    }
    const [tx, tz] = p.tk.split(',').map(Number);
    const dx = tx - p.sp.position.x, dz = tz - p.sp.position.z, dd = Math.hypot(dx, dz);
    if (dd < .5 || p.at > 3) { hurtBuildingAt(p.tk, 3, null); scene.remove(p.sp); p.sp.material.dispose(); p.tx.dispose(); projs.splice(i, 1); }
    else { p.sp.position.x += dx / dd * 6 * dt; p.sp.position.z += dz / dd * 6 * dt; }
  }
}
function hurtPlayer(d, src) {
  if (invul > 0 || !G || G.down) return;
  const dmg = Math.max(1, Math.round(d));
  G.hp = Math.max(0, G.hp - dmg);
  invul = .8; hitFx(.8); hitStop(.09); sfx('hurt'); vib('hurt'); screenFlash('rgba(255,50,50,1)', .45, .45);
  popup(px, py + 1.7, pz, '-' + dmg, '#ff5a5a');
  if (src) { const dx = px - src.x, dz = pz - src.z, dl = Math.hypot(dx, dz) || 1; vx += dx / dl * 6; vz += dz / dl * 6; }   // 뒤로 밀려요
  if (player) tweenTo(.8, 1, .3, v => player.scale.setScalar(v), 'back');   // 몸이 찌그러졌다 돌아와요
  if (G.hp <= 0) { popup(px, py + 2.4, pz, '쓰러짐', '#ff5a5a'); playerDown(); }
}
// 체력이 0이 되면 보석(다이아)이 깨져요.
// 방에 살아 있는 친구가 있으면 쓰러진 채로 기다리다가 다음 스테이지를 클리어하면 절반 체력으로 살아나요.
// 혼자이거나 모두 쓰러지면 모험이 끝나요.
function friendsAlive() {
  if (!NET.ch) return 0;
  let n = 0; const st = NET.ch.presenceState();
  for (const k in st) { if (k === NET.me) continue; const e = (st[k] || [])[0]; if (e && !e.d) n++; }
  return n;
}
function playerDown() {
  if (G.down) return;
  const coop = friendsAlive() > 0;
  G.down = true; if (!coop) freeze = true; sfx('boss'); vib('boss'); screenFlash('rgba(255,80,80,1)', .6, .8);
  G.res.gems = 0; persistRun(); trackMe();
  if (coop) {
    modalOpen = false;
    const ov = document.createElement('div'); ov.id = 'downOv';
    ov.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(10,8,20,.7);display:flex;align-items:center;justify-content:center;padding:20px;pointer-events:none';
    ov.innerHTML = '<div style="background:var(--paper);border:3px solid var(--line);border-radius:20px;padding:22px 26px;text-align:center;font-weight:900;color:#4a3320;max-width:320px"><div style="font-size:48px">💎💥</div><div style="font-size:20px;margin:6px 0">쓰러졌어요</div><div style="font-size:13px;font-weight:700">보석이 깨졌어요. 친구가 다음 스테이지를 클리어하면 다시 일어나요.</div></div>';
    document.body.appendChild(ov);
    return;
  }
  modalOpen = true;
  const ov = document.createElement('div'); ov.id = 'downOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(10,8,20,.8);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = '<div style="background:var(--paper);border:3px solid var(--line);border-radius:20px;padding:22px 26px;text-align:center;font-weight:900;color:#4a3320;max-width:320px"><div style="font-size:48px">💎💥</div><div style="font-size:20px;margin:6px 0">보석이 깨졌어요</div><div style="font-size:13px;font-weight:700;margin-bottom:14px">캐릭터가 쓰러져서 모험이 끝났어요.</div></div>';
  const box = ov.firstChild;
  const home = document.createElement('button'); home.className = 'btn primary'; home.textContent = '🏠 홈으로';
  home.onclick = () => { ov.remove(); G.down = false; freeze = false; modalOpen = false; goHome(); };
  box.append(home); document.body.appendChild(ov);
}
/* ================= 친구 방 (Supabase Realtime) ================= */
const SB_URL = 'https://jozajkvlihkzdngstwgl.supabase.co';
const SB_KEY = 'sb_publishable_Vs4P0TfjQ9qCvSYUs-tmaA_CKRVis_D';
const ROOM_RE = /^\d{6}$/;
const NET = { sb: null, ch: null, code: null, me: null, remotes: {}, sendT: 0, started: false, greeted: false, waitList: {}, wantAdmit: false, joinT: null, ready: false, mirrors: {}, monSeq: 0, monT: 0 };
// 친구 화면: 방장이 계산한 적을 그대로 그려요 (적 AI·생성·피해는 방장 쪽에서만 계산해요)
function guestMode() { return !!(NET.ch && !NET.host); }
// 친구 쪽 공격은 mons 목록을 훑으니, 행동 중에만 친구 화면의 적(거울)을 잠깐 목록에 넣어요
function withMirrors(fn) {
  if (!guestMode()) return fn();
  const arr = Object.values(NET.mirrors).filter(m => m && !mons.includes(m));
  arr.forEach(m => mons.push(m));
  try { return fn(); }
  finally { arr.forEach(m => { const i = mons.indexOf(m); if (i >= 0) mons.splice(i, 1); }); }
}
function applyMirrors(list) {
  const seen = {};
  for (const [id, x, z, hp, hpMax, kind, boss, giant] of (list || [])) {
    seen[id] = 1;
    let m = NET.mirrors[id];
    if (!m) {
      m = makeMon(kind, x, z, { boss: !!boss }); if (!m) continue;
      m.nid = id; m.mirror = true;
      if (giant) { m.obj.scale.multiplyScalar(1.9); m.shadow.scale.multiplyScalar(1.9); }
      NET.mirrors[id] = m;
    }
    m.obj.position.x = x; m.obj.position.z = z; m.shadow.position.x = x; m.shadow.position.z = z;
    m.hp = hp; m.hpMax = hpMax;
  }
  for (const id in NET.mirrors) if (!seen[id]) { removeMon(NET.mirrors[id]); delete NET.mirrors[id]; }
}
function nearestMirror(range) {
  let best = null, bd = range;
  for (const id in NET.mirrors) {
    const m = NET.mirrors[id]; if (!m || !m.obj) continue;
    const d = Math.hypot(m.obj.position.x - px, m.obj.position.z - pz);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
function sendMons() {
  const list = [];
  for (const m of mons) {
    if (m.dead || !m.obj) continue;
    if (!m.nid) m.nid = (NET.me || 'h') + '-' + (++NET.monSeq);
    list.push([m.nid, +m.obj.position.x.toFixed(2), +m.obj.position.z.toFixed(2), Math.max(0, Math.round(m.hp)), m.hpMax || 1, m.kind, m.boss ? 1 : 0, m.giant ? 1 : 0]);
  }
  netSend('mons', { l: list });
}
const NET_MAX = 4; // 한 방의 최대 인원 (나 포함)
let netPending = ((location.hash.match(/room=(\d{6})/) || [])[1]) || null;
function netClient() {
  if (!NET.sb && window.supabase) NET.sb = window.supabase.createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 20 } } });
  return NET.sb;
}
function nickOf() { return (profile.nick || '').trim().slice(0, 10); }
function needId() {
  if (nickOf()) return false;
  toast('먼저 로그인 아이디를 입력해 주세요'); const n = $('nick'); if (n) { n.focus(); n.classList.add('need'); setTimeout(() => n.classList.remove('need'), 1500); }
  return true;
}
function netId() { if (!NET.me) NET.me = 'p' + Math.random().toString(36).slice(2, 10); return NET.me; }
function netCreateRoom(code) {
  const sb = netClient(); if (!sb) return Promise.resolve(false);
  return sb.from('farm_rooms').upsert({ code, host_nick: (profile.nick || '촌장').slice(0, 10) }, { onConflict: 'code', ignoreDuplicates: true })
    .then(r => !r.error, () => false);
}
function makeRemote(id, p) {
  const g = new THREE.Group();
  const model = new THREE.Group();
  const body = (creatureProto && THREE.SkeletonUtils) ? THREE.SkeletonUtils.clone(creatureProto) : fallbackChar();
  model.add(body); model.add(gear(p.k || 'mage'));
  if (p.k === 'archer' && antlersProto) { const an = antlersProto.clone(); an.position.set(0, 1.3, 0); model.add(an); }
  g.add(model);
  tintObj(model, PAL_COL[(p.c | 0) % PAL_COL.length]);   // 같은 캐릭터, 색만 다르게
  paintHat(model, PAL_COL[(p.c | 0) % PAL_COL.length]);   // 모자 색으로 구별
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const cx = cv.getContext('2d'); cx.fillStyle = '#' + PAL_COL[(p.c | 0) % PAL_COL.length].toString(16).padStart(6, '0'); cx.fillRect(0, 0, 256, 64);   // 이름표 색 = 친구 색
  cx.fillStyle = '#2b1d12'; cx.font = 'bold 30px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText((p.n || '친구').slice(0, 10), 128, 34);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  label.scale.set(1.8, .45, 1); label.position.y = 2.0;
  g.add(label);
  g.position.set(p.x, 0, p.z); world.add(g);
  return { g, tx: p.x, tz: p.z, rot: p.r || 0, seen: performance.now() };
}
function paintHat(root, hex) {   // 친구와 구별하려고 모자·투구 색을 바꿔요
  root.traverse(o => {
    if (!o.isMesh || !o.userData.hat || !o.material || !o.material.color) return;
    if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; }
    o.material.color.set(hex);
  });
}
function tintObj(root, hex) {   // 캐릭터 몸 색을 입혀요 (복제된 재질만 건드려요)
  const pal = new THREE.Color(hex), k = new THREE.Color(1, 1, 1).lerp(pal, .8);
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    if (!TINT_BASE.has(o)) {
      const src = Array.isArray(o.material) ? o.material : [o.material];
      TINT_BASE.set(o, src.map(m => (m.color ? m.color.clone() : null)));
      o.material = Array.isArray(o.material) ? src.map(m => m.clone()) : src[0].clone();
    }
    const base = TINT_BASE.get(o), cur = Array.isArray(o.material) ? o.material : [o.material];
    cur.forEach((m, i) => { if (m.color && base[i]) m.color.copy(base[i]).multiply(k); });
  });
}

function updFriendChip() {
  const el = $('friendChip'); if (!el) return;
  el.style.display = NET.ch ? '' : 'none';
  const n = NET.ch ? Math.min(NET_MAX, Object.keys(NET.ch.presenceState()).length) : 0;
  el.textContent = '👥 ' + n + '/' + NET_MAX; el.title = NET.code || '';
  const cb = $('chatBox'); if (cb) cb.style.display = NET.ch ? 'flex' : 'none';
}
// 입장 순서(at)로 정렬해 앞의 NET_MAX명만 남기고, 늦게 들어온 사람은 나간다.
// 모든 클라이언트가 같은 presence 상태를 보므로 같은 결론에 도달한다.
function netCheckCapacity(ch) {
  if (NET.ch !== ch) return;
  const st = ch.presenceState(); const list = [];
  for (const key in st) for (const m of st[key]) list.push({ key, at: m.at || 0 });
  list.sort((a, b) => (a.at - b.at) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const idx = list.findIndex(e => e.key === NET.me);
  if (idx < 0) return; // 아직 내 track이 반영되기 전
  if (idx >= NET_MAX) { toast('방이 가득 찼어요. 최대 ' + NET_MAX + '명까지 함께할 수 있어요.'); netLeave(); return; }
  if (!NET.greeted) { NET.greeted = true; netSend('hello', {}); if (NET.wantAdmit) netSend('join', { n: nickOf() || '모험가' }); else toast('👥 방 ' + NET.code + ' 에 연결됐어요!'); }
  updFriendChip(); renderLobby();
}
function netLeave() {
  const sb = netClient();
  if (NET.ch) { if (sb) sb.removeChannel(NET.ch); NET.ch = null; }
  for (const id in NET.remotes) world.remove(NET.remotes[id].g);
  NET.remotes = {}; NET.code = null; NET.greeted = false; NET.host = false; NET.ready = false;
  for (const id in NET.mirrors) removeMon(NET.mirrors[id]); NET.mirrors = {};
  closeLobby();
  updFriendChip();
}
function netConnect(code) {
  const sb = netClient(); if (!sb) { toast('온라인 연결을 준비할 수 없어요.'); return; }
  if (NET.code === code && NET.ch) return;
  if (NET.ch) { sb.removeChannel(NET.ch); NET.ch = null; }
  for (const id in NET.remotes) world.remove(NET.remotes[id].g);
  NET.remotes = {};
  NET.code = code; NET.greeted = false; netId();
  const ch = sb.channel('room:' + code, { config: { broadcast: { self: false }, presence: { key: NET.me } } });
  ch.on('broadcast', { event: 'pos' }, ({ payload }) => {
    if (!payload || payload.id === NET.me) return;
    let r = NET.remotes[payload.id];
    if (!r) { r = NET.remotes[payload.id] = makeRemote(payload.id, payload); updFriendChip(); }
    r.tx = payload.x; r.tz = payload.z; r.rot = payload.r; r.seen = performance.now();
  });
  ch.on('broadcast', { event: 'b' }, ({ payload }) => netRecv(payload));
  ch.on('broadcast', { event: 'chat' }, ({ payload }) => { if (payload && payload.t) addChat(String(payload.n || '친구').slice(0, 10), String(payload.t).slice(0, 40), false); });
  ch.on('presence', { event: 'sync' }, () => { netCheckCapacity(ch); renderLobby(); updFriendChip(); });
  ch.subscribe(status => {
    if (status === 'SUBSCRIBED') { NET.at = Date.now(); ch.track(presenceMeta()); }
    const n = $('lobbyNote');
    if (status === 'SUBSCRIBED' && n) n.textContent = '방에 연결됐어요! 방장이 시작하면 함께 들어가요.';
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { if (n) n.textContent = '방 연결이 끊겼어요 (' + status + '). 네트워크를 확인하고 다시 참가해 주세요.'; toast('방 연결에 실패했어요. 네트워크를 확인해 주세요.'); }
  });
  NET.ch = ch; updFriendChip();
}
async function netStartUp() {
  const code = netPending || (G && G.room);
  if (!code || !ROOM_RE.test(code)) return;
  if (netPending) {
    const sb = netClient(); if (!sb) { toast('온라인 연결을 준비할 수 없어요.'); return; }
    const r = await sb.from('farm_rooms').select('code').eq('code', code).maybeSingle();
    if (r.error || !r.data) { toast('이 초대 방은 없거나 만료됐어요.'); return; }
  }
  netConnect(code);
}
function enterWaiting() {
  // 초대 링크로 들어온 친구: 대기실에서 방장이 시작을 누를 때까지 기다려요 (진행 중인 모험이면 방장이 들여보내 줘요)
  NET.wantAdmit = true; NET.host = false; LOBBY.open = true; LOBBY.seenHost = false;
  showLobby();
  const sb = netClient(); if (!sb) { toast('온라인 연결을 준비할 수 없어요.'); closeLobby(); return; }
  const say = m => { const n = $('lobbyNote'); if (n) n.textContent = m; };
  say('방을 찾는 중이에요…');
  sb.from('farm_rooms').select('code').eq('code', netPending).maybeSingle().then(r => {
    if (r.error) { say('서버 연결 오류: ' + (r.error.message || r.error.code || '알 수 없음') + ' · 다시 참가해 주세요.'); toast('서버에 연결하지 못했어요.'); return; }
    if (!r.data) { say('이 코드의 방을 찾지 못했어요. 코드를 다시 확인해 주세요.'); toast('이 초대 방은 없거나 만료됐어요.'); return; }
    say('방에 연결하는 중이에요…');
    netConnect(netPending);
    NET.joinT = setInterval(() => { if (NET.wantAdmit && NET.ch) netSend('join', { n: nickOf() || '모험가' }); }, 2500);
  });
}
// 채팅: 짧은 문장과 빠른 말풍선만 보내요. 음성은 말을 글자로 바꿔서 보내요
let chatLastT = -1e9, voiceRec = null;
function addChat(n, t, mine) {
  const log = $('chatLog'); if (!log) return;
  const d = document.createElement('div');
  const who = document.createElement('b'); who.textContent = (mine ? '나' : n) + ': '; who.style.color = mine ? '#1f6b3a' : '#8a4b00';
  d.append(who, document.createTextNode(t)); log.appendChild(d);
  while (log.children.length > 8) log.removeChild(log.firstChild);
}
function sendChat(text) {
  text = String(text || '').trim().slice(0, 40);
  if (!text || !NET.ch) return;
  const now = performance.now();
  if (now - chatLastT < 800) { toast('조금 천천히 보내 주세요.'); return; }
  chatLastT = now;
  NET.ch.send({ type: 'broadcast', event: 'chat', payload: { n: nickOf() || '모험가', t: text } });
  addChat('', text, true);
}
function netSend(ev, payload) {
  if (!NET.ch) return;
  NET.ch.send({ type: 'broadcast', event: 'b', payload: Object.assign({ ev, from: NET.me }, payload || {}) });
}
function canAdmitNow() { return !!G; } // 진행 중인 게임에도 초대 코드·링크로 바로 들어올 수 있어요
function updWaitChip() {
  const ids = Object.keys(NET.waitList), el = $('waitChip'); if (!el) return;
  el.style.display = ids.length ? '' : 'none'; el.textContent = '⏳ ' + ids.length + ' 입장';
}
function admitMe() {
  closeLobby();
  if (!running) { startGame(!!loadRun()); trackMe(); }
  setTimeout(() => netSend('hello', {}), 400);   // 방장 마을의 건물 목록을 다시 받아요
  toast('🌿 방장이 들여보내 줬어요! 함께 시작해요');
}
function netRecv(p) {
  if (!p || p.from === NET.me) return;
  if (p.ev === 'admit') { if (p.to === NET.me) admitMe(); return; }
  if (p.ev === 'fx') { showRemoteFx(p); return; }
  if (p.ev === 'join') {
    if (!G || !running) return;
    if (canAdmitNow()) netSend('admit', { to: p.from });
    else { NET.waitList[p.from] = (p.n || '친구').slice(0, 10); updWaitChip(); toast('⏳ ' + (p.n || '친구') + '님이 대기 명단에 올라갔어요'); }
    return;
  }
  if (p.ev === 'cd') { if (LOBBY.open && !LOBBY.cd) startCountdown(p.ms || 5000, NET.host ? beginCoopRun : beginCoopJoin); return; }
  if (p.ev === 'mons') { if (!NET.host && G) applyMirrors(p.l); return; }
  if (p.ev === 'hit') { if (NET.host && G) { const t = mons.find(m => m.nid === p.id); if (t && !t.dead) hitEnemy(t, +p.d || 1, { kb: .6 }); } return; }
  if (!G) return;
  if (p.ev === 'build') {
    if (G.b[p.k]) return;
    G.b[p.k] = { t: p.t, hp: p.hp, g: 0, lv: 1 }; addBuildingMesh(p.k, G.b[p.k]);
  } else if (p.ev === 'remove') {
    if (!G.b[p.k]) return;
    removeBuildingMesh(p.k); delete G.b[p.k];
  } else if (p.ev === 'hello') {
    netSend('snap', { day: G.day, list: Object.keys(G.b).map(k => [k, G.b[k].t, G.b[k].hp, G.b[k].lv || 1]) });
  } else if (p.ev === 'snap') {
    // 친구는 방장의 마을을 그대로 받아요 (같은 맵·같은 건물). 방장은 자기 마을을 유지해요.
    if (NET.host || !G) return;
    for (const k in G.b) { if (bmesh[k]) { world.remove(bmesh[k]); delete bmesh[k]; } }
    G.b = {};
    for (const [k, t, hp, lv] of (p.list || [])) { G.b[k] = { t, hp, g: 0, lv: lv || 1 }; addBuildingMesh(k, G.b[k]); }
    if (p.day) G.day = p.day;
  }
}
function netUpdate(dt) {
  if (!NET.started && running) { NET.started = true; netStartUp(); }
  const now = performance.now();
  if (NET.ch && running && NET.host) {
    NET.monT -= dt;
    if (NET.monT <= 0) { NET.monT = .25; sendMons(); }
  }
  if (NET.ch && running) {
    NET.sendT -= dt;
    if (NET.sendT <= 0) {
      NET.sendT = .1;
      NET.ch.send({ type: 'broadcast', event: 'pos', payload: { id: netId(), x: +px.toFixed(2), z: +pz.toFixed(2), r: +rotY.toFixed(2), c: profile.color | 0, k: G.cls, n: (profile.nick || '모험가').slice(0, 10) } });
    }
  }
  for (const id in NET.remotes) {
    const r = NET.remotes[id];
    if (now - r.seen > 6000) { world.remove(r.g); delete NET.remotes[id]; updFriendChip(); continue; }
    const k = 1 - Math.exp(-dt * 10);
    r.g.position.x += (r.tx - r.g.position.x) * k; r.g.position.z += (r.tz - r.g.position.z) * k; r.g.rotation.y = r.rot;
  }
}

/* ================= 길찾기 · 벽 ================= */
let FN = 2 * LIM + 1, DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BLOCKING = { HOUSE: 1, TOWER: 1, APT: 1, MINE: 1, WALL: 1, WEAVE: 1 };
let flowD = new Float32Array(FN * FN), flowT = 0;
const inGrid = (x, z) => x >= -LIM && x <= LIM && z >= -LIM && z <= LIM;
function computeFlow() {
  flowD.fill(1e9);
  const heap = [];
  const hpush = (d, i) => { heap.push([d, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const hpop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } }
    return top;
  };
  let any = false;
  // 좀비의 목표는 중앙 보석(0,0). 집·벽은 길을 막는 장애물이 됩니다.
  { const i = (0 + LIM) * FN + (0 + LIM); flowD[i] = 0; hpush(0, i); any = true; }
  if (!any) { const x = clamp(Math.round(px), -LIM, LIM), z = clamp(Math.round(pz), -LIM, LIM); const i = (z + LIM) * FN + (x + LIM); flowD[i] = 0; hpush(0, i); }
  while (heap.length) {
    const [d, i] = hpop(); if (d > flowD[i]) continue;
    const cx = i % FN - LIM, cz = Math.floor(i / FN) - LIM;
    for (const [dx, dz] of DIRS4) {
      const nx = cx + dx, nz = cz + dz; if (!inGrid(nx, nz)) continue;
      const b = G.b[nx + ',' + nz];
      const nd = d + 1 + (b && BLOCKING[b.t] ? 12 : 0);
      const ni = (nz + LIM) * FN + (nx + LIM);
      if (nd < flowD[ni]) { flowD[ni] = nd; hpush(nd, ni); }
    }
  }
}
function flowStep(x, z) {
  const cx = Math.round(x), cz = Math.round(z); if (!inGrid(cx, cz)) return null;
  let best = flowD[(cz + LIM) * FN + (cx + LIM)], bx = cx, bz = cz;
  for (const [dx, dz] of DIRS4) {
    const nx = cx + dx, nz = cz + dz; if (!inGrid(nx, nz)) continue;
    const v = flowD[(nz + LIM) * FN + (nx + LIM)]; if (v < best) { best = v; bx = nx; bz = nz; }
  }
  return (bx === cx && bz === cz) ? null : { x: bx, z: bz };
}
// 바닥 높이: 아파트 지붕(이미 위에 있을 때만) 또는 계단 위, 아니면 0
function groundAt(x, z) {
  let h = 0;
  if (!G || !G.b) return 0;
  for (const k in G.b) {
    const b = G.b[k]; if (b.t !== 'APT') continue;
    const [ax, az] = k.split(',').map(Number), H = aptH(b.lv || 1);
    const dx = x - ax, dz = z - az;
    if (Math.abs(dx) <= 1.4 && Math.abs(dz) <= 1.4) { if (py > H * .5) h = Math.max(h, H + .3); }   // 지붕 윗면
    else if (dx >= 1.5 && dx < 5.5 && Math.abs(dz) <= .7) { const st = Math.min(5, Math.floor((dx - 1.5) / (4 / 6))); h = Math.max(h, H * (1 - st / 6)); }
  }
  return h;
}
// 지상에서 플레이어(반경 .35)가 막힌 건물 칸과 겹치는지 검사. 지붕 위(py>=1)는 통과
function blockedAt(x, z) {
  if (py >= 1 || !G || !G.b) return false;
  for (const ox of [-.35, .35]) for (const oz of [-.35, .35]) {
    const b = G.b[Math.round(x + ox) + ',' + Math.round(z + oz)];
    if (b && BLOCKING[b.t]) return true;
  }
  return false;
}
function updMon(m, dt) {
  const o = m.obj;
  if (!isFinite(o.position.x) || !isFinite(o.position.z)) { removeMon(m); return; }
  m.flash = Math.max(0, m.flash - dt);
  if (m.slow > 0) m.slow -= dt;
  const tn = m.d.tint || [1.14, 1.08, 1.08]; if (o.material) o.material.color.setRGB(tn[0], tn[1] * (1 - m.flash * 2.2), tn[2] * (1 - m.flash * 2.2));
  // 넉백 감쇠
  if (Math.abs(m.kx) + Math.abs(m.kz) > .001) { o.position.x += m.kx * dt * 4; o.position.z += m.kz * dt * 4; m.kx *= Math.pow(.02, dt); m.kz *= Math.pow(.02, dt); }
  if (o.center) o.center.set(.5, 0); o.position.y = (m.fly ? m.fly : .09) - (m.padY || 0); m.shadow.position.set(o.position.x, .02, o.position.z);   // 발이 땅에 붙도록 기준점을 아래로   // 날개 있는 몬스터만 떠 있어요
  if (m.dead) { stepAnim(m, dt); if (m.done) removeMon(m); return; }
  const x = o.position.x, z = o.position.z;
  m.ph += dt;
  if (m.state === 'flee') {
    const dd = Math.hypot(x, z) || 1, sp = 2.8 * dt;
    o.position.x += x / dd * sp; o.position.z += z / dd * sp;
    m.face = x >= 0 ? 1 : -1; setAnim(m, 'move', true); stepAnim(m, dt);
    if (dd > SPAWN_R + 1) {
      if (m.carry > 0) { G.lostGems = (G.lostGems || 0) + m.carry; toast(`도둑이 보석 ${m.carry}개를 가지고 도망쳤어요!`); }
      removeMon(m);
    }
    return;
  }
  m.hitLock = Math.max(0, m.hitLock - dt);
  m.touchCd = Math.max(0, m.touchCd - dt);
  if (m.hitLock > 0) { stepAnim(m, dt); return; }
  if (!m.tk || !G.b[m.tk]) m.tk = pickTarget(x, z);
  let tx = px, tz = pz;
  if (m.tk) { [tx, tz] = m.tk.split(',').map(Number); }
  let dx = tx - x, dz = tz - z, dd = Math.hypot(dx, dz);
  // 벽·건물은 길을 막아요. 날개 달린 적은 넘어오고, 플레이어 근처에서는 직진
  let blockK = null, nxt = null;
  if (!m.fly && Math.hypot(px - x, pz - z) > 3.5) {
    nxt = flowStep(x, z);
    if (nxt) {
      const k2 = nxt.x + ',' + nxt.z; const bb = G.b[k2];
      if (bb && BLOCKING[bb.t]) blockK = k2;
      dx = nxt.x - x; dz = nxt.z - z; dd = Math.hypot(dx, dz);
    }
  }
  if (Math.abs(dx) > .05) m.face = dx >= 0 ? 1 : -1;
  // 플레이어 접촉 피해
  const pd = Math.hypot(px - x, pz - z);
  if (pd < (m.boss ? 1.8 : 1.1) && m.touchCd <= 0 && (py < 2 || m.d.rng > 0)) { hurtPlayer(m.d.dmg * .8 * (m.boss ? 1.5 : 1), { x: m.obj.position.x, z: m.obj.position.z }); m.touchCd = .6; }
  m.cd -= dt;
  const inRange = m.d.rng > 0 ? dd < m.d.rng : dd < (m.boss ? 1.8 : 1.25);
  if (m.boss) {
    // 보스 링 공격: 사방으로 탄 발사
    m.ringCd -= dt;
    if (m.ringCd <= 0) {
      m.ringCd = 2.6; setAnim(m, 'atk', false); glowAt(x, 1.2, z, 2.4, 0xff8fb0, .4);
      const n = 8, off = rnd(0, 6.28);
      for (let i = 0; i < n; i++) { const a = off + i / n * Math.PI * 2; spawnProj(m.kind === 'mushroom_queen' ? 'mushroom' : 'skeleton', x, z, { toPlayer: true, vx: Math.cos(a) * 4.2, vz: Math.sin(a) * 4.2, dmg: 6, life: 3.2 }); }
      hitFx(.2);
    }
  }
  const wallHit = !!blockK && Math.hypot(nxt.x - x, nxt.z - z) < 1.15;
  if (wallHit && !inRange) {
    if (m.cd <= 0) { m.cd = 1.1; setAnim(m, 'atk', false); const bb = G.b[blockK]; hurtBuildingAt(blockK, m.boss ? 10 : 6, bb && bb.t === 'HOUSE' ? m : null); }
    if (m.cur === 'atk' && m.done) setAnim(m, 'move', true);
    stepAnim(m, dt);
  } else if (inRange && m.tk) {
    if (m.cd <= 0) {
      m.cd = m.d.rng > 0 ? (m.d.cool || 1.9) : 1.1;
      setAnim(m, 'atk', false);
      if (m.d.rng > 0) spawnProj(m.kind, x, z, { tk: m.tk, dmg: m.d.dmg });
      else if (!m.boss || dd < 2.2) hurtBuildingAt(m.tk, m.boss ? 10 : 6, m);
    }
    if (m.cur === 'atk' && m.done) setAnim(m, 'move', true);
    stepAnim(m, dt);
  } else {
    const sp = m.d.spd * dt * (1 + (G.day - 1) * .02) * (weather === 'rain' ? .85 : 1) * (m.slow > 0 ? .5 : 1) * (sniper ? .4 : 1) * (m.giant ? .6 : 1);
    if (dd > 0) { o.position.x += dx / dd * sp; o.position.z += dz / dd * sp; }
    setAnim(m, 'move', true); stepAnim(m, dt);
  }
  if (m.fly) o.position.y = m.fly + Math.sin(m.ph * 4) * .12 - (m.padY || 0); else o.position.y = .09 - (m.padY || 0);   // 걷는 몬스터는 땅 위
  if (!Number.isFinite(o.position.y)) o.position.y = .09;   // 오류 방지
}
function deathBurst(x, y, z, col) {   // 적이 터지듯이 조각으로 흩어져요
  glowAt(x, y + .6, z, m0Size(col), col, .3); puff(x, z, 8, col);
  for (let i = 0; i < 12; i++) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(.14, .14, .14), new THREE.MeshBasicMaterial({ color: i % 3 ? col : 0xffffff, transparent: true, depthWrite: false }));
    sh.position.set(x, y + .8, z); scene.add(sh);
    const a = rnd(0, Math.PI * 2), out = rnd(1.2, 2.8), up = rnd(1.5, 3.2), spin = rnd(4, 9);
    tweenTo(0, 1, .55, v => { sh.position.set(x + Math.cos(a) * out * v, y + .8 + up * v - 3.2 * v * v, z + Math.sin(a) * out * v); sh.rotation.x += spin * .02; sh.rotation.y += spin * .02; sh.material.opacity = 1 - v * v; sh.scale.setScalar(1 - v * .6); }, 'out', i * .01, () => { scene.remove(sh); sh.geometry.dispose(); sh.material.dispose(); });
  }
}
function m0Size(col) { return col === 0xffd0ff ? 3.2 : 2; }
function hitEnemy(m, dmg, opt) {
  if (!m || m.dead) return;
  if (m.mirror) { if (guestMode() && m.nid) netSend('hit', { id: m.nid, d: Math.max(1, Math.round(dmg)) }); return; }
  opt = opt || {};
  const o = m.obj, d = Math.hypot(o.position.x - px, o.position.z - pz) || 1;
  m.hp -= dmg; m.flash = .14;
  if (opt.slow) m.slow = opt.slow;
  const kb = (opt.kb !== undefined ? opt.kb : .5) * (m.boss ? .25 : 1);
  m.kx += (o.position.x - px) / d * kb; m.kz += (o.position.z - pz) / d * kb;
  const bossHit = m.boss;
  popup(o.position.x, .6, o.position.z, '-' + Math.max(1, Math.round(dmg)), bossHit ? '#ffd0ff' : '#fff6c2');
  fxBurst(o.position.x, .9, o.position.z, bossHit ? 1.8 : 1.1); glowAt(o.position.x, .5, o.position.z, bossHit ? 2.8 : 1.6, bossHit ? 0xffb3ec : 0xfff1a0, .18);
  if (m.hp > 0) { m.hitLock = .12; setAnim(m, 'hit', false); sfx('hit'); vib('hit'); hitStop(bossHit ? .04 : .025); hitFx(bossHit ? .18 : .08); return; }
  // 처치
  m.dead = true; setAnim(m, 'death', false); m.shadow.visible = false;
  deathBurst(o.position.x, o.position.y, o.position.z, m.boss ? 0xffd0ff : 0xfff1a0); fxBurst(o.position.x, 1.1, o.position.z, m.boss ? 3.4 : 2.2); screenFlash('#fff3c0', .14, .18);
  if (m.carry > 0) dropGems(o.position.x, o.position.z, m.carry);
  m.carry = 0; G.kills = (G.kills || 0) + 1;
  G.kc = G.kc || {}; G.kc[m.kind] = (G.kc[m.kind] || 0) + 1;
  G.ms = G.ms || 0;
  while (G.ms < MILESTONES.length && G.kills >= MILESTONES[G.ms][0]) { G.res.gems += MILESTONES[G.ms][1]; toast('📖 도감 보상! 💎 +' + MILESTONES[G.ms][1]); G.ms++; }
  if (m.boss) { G.bossKills = (G.bossKills || 0) + 1; hitFx(.7); hitStop(.12); puff(o.position.x, o.position.z, 22, 0xffd0ff); sfx('boss'); vib('boss'); toast(`👑 ${BOSS[m.kind].name} 쓰러졌어요!`); }
  else { hitStop(.04); hitFx(.12); puff(o.position.x, o.position.z, 10, 0xbfe6a6); sfx('kill'); vib('kill'); }
  gainXp((m.boss ? BOSS[m.kind].xp : MON[m.kind].xp) * (1 + .2 * relicCount('bell')));
  if (m.giant) { gainXp(6); toast('🧟 거대한 좀비 처치! 보상 +XP'); }
  if (bossRef === m) { $('bossBar').style.display = 'none'; bossRef = null; }
}
function nearestMon(maxD, fx, fz, ex) {
  const ax = fx === undefined ? px : fx, az = fz === undefined ? pz : fz;
  let best = null, bd = maxD;
  for (const m of mons) {
    if (m.dead || (ex && ex.includes(m))) continue;
    const d = Math.hypot(m.obj.position.x - ax, m.obj.position.z - az);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/* ================= 공격 · 스킬 ================= */
function relicCount(id) { return (G && G.relics && G.relics[id]) || 0; }
function dmgMul() { return (1 + .25 * G.up.dmg) * CLS[G.cls].dmg * (1 + .25 * 0); }
function flatDmg() { return relicCount('glove'); }
function rateMul() { return 1 + .18 * G.up.rate; }
function skillDmgMul() { return (1 + .4 * relicCount('fire') + (G.promo2 === 'p2a' ? .5 : 0)) * promoMul(); }
function bossDmgMul(m) { return m && m.boss ? 1 + .3 * relicCount('horn') : 1; }
function baseHit(m) { return (1 * dmgMul() + flatDmg()) * bossDmgMul(m) * promoMul() * (Math.random() < .15 * (G.up.crit || 0) ? 2 : 1); }
function c0Range() { return CLS[G.cls] ? CLS[G.cls].rng : 3; }
// 자동 조준 보조: 근처(3.6칸 안) 가장 가까운 적을 향해 몸을 돌려요
function assistAim() {
  let best = null, bd = 3.6;
  for (const m of mons) {
    if (m.dead) continue;
    const d = Math.hypot(m.obj.position.x - px, m.obj.position.z - pz);
    if (d < bd) { bd = d; best = m; }
  }
  if (best) rotY = Math.atan2(best.obj.position.x - px, best.obj.position.z - pz);
}
// 조준: 카메라(시선)가 가리키는 방향. 조준점에 가장 가까운 적을 고르고, 없으면 시선 끝에 쏴요
function aimRay() {
  const o = camera.position.clone(), d = new THREE.Vector3(); camera.getWorldDirection(d);
  return { o, d };
}
// 조준: 화면 중앙 조준점에 보이는 적을 고릅니다. 거리가 멀어도 화면에서 겹치면 맞아요.
function aimTarget(maxD) {
  const W = innerWidth, H = innerHeight, o = camera.position, v = new THREE.Vector3();
  let best = null, bs = 1e9;
  for (const m of mons) {
    if (m.dead || !m.obj) continue;
    v.set(m.obj.position.x, m.obj.position.y + 1, m.obj.position.z);
    const dist = v.distanceTo(o);
    if (dist > maxD || dist < .5) continue;
    v.project(camera);
    if (v.z > 1 || v.z < -1) continue;
    const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
    const d = Math.hypot(sx - W / 2, sy - H / 2);
    const R = 40 + Math.min(40, 220 / Math.max(1, dist));   // 가까우면 조금 관대, 멀면 조준선 근처만
    if (d > R) continue;
    const sc = d + dist * 1.5;
    if (sc < bs) { bs = sc; best = m; }
  }
  return best;
}
function aimPoint(dist) {
  const { o, d } = aimRay();
  let sl = dist;
  if (d.y < -.05) { const gs = (.5 - o.y) / d.y; if (gs > 0 && gs < sl) sl = gs; }
  return o.clone().addScaledVector(d, sl);
}
function camFwd() { return new THREE.Vector3(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch)); }
// 카메라가 보는 쪽에 있는 가장 가까운 적만 고릅니다 (뒤에 있는 적은 제외)
function fwdMon(maxD) {
  const d = camFwd(), L = Math.hypot(d.x, d.z) || 1; let best = null, bd = 1e9;
  for (const m of mons) {
    if (m.dead || !m.obj) continue;
    const dx = m.obj.position.x - px, dz = m.obj.position.z - pz, dist = Math.hypot(dx, dz);
    if (dist > maxD || dist < .01) continue;
    if ((dx * d.x + dz * d.z) / (dist * L) < .5) continue;
    if (dist < bd) { bd = dist; best = m; }
  }
  return best;
}
let chargeOn = false, holdStart = 0, chargeRing = null;
let jv = 0;
function doJump() { if (mode !== 'FIELD' || modalOpen || buildMode || sniper) return; if (Math.abs(py - groundAt(px, pz)) < .05) jv = 7.5; }
let chargeEl = null;
let aimOverride = null, chargePid = null, chargeSX = 0, chargeSY = 0, chargeMoved = false;
function lungeForward(d, dur) {   // 공격하면 바라보는 방향으로 앞으로 나감
  const ox = px, oz = pz, tx = clamp(px + Math.sin(rotY) * d, -LIM, LIM), tz = clamp(pz + Math.cos(rotY) * d, -LIM, LIM);
  tweenTo(0, 1, dur, v => { px = ox + (tx - ox) * v; pz = oz + (tz - oz) * v; }, 'out');
}
function shockwave(x, z, R) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(.3, .4, 48), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, .08, z); scene.add(ring);
  tweenTo(1, R, .35, v => ring.scale.setScalar(v), 'out');
  tweenTo(.9, 0, .45, v => ring.material.opacity = v, 'in', 0, () => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
}
let chargeAssist = false;
function chargeRadius(lv) { return .9 + .8 * lv; }
// 1인칭 조준선(화면 가운데)을 따라 가장 가까이 맞는 적
function aimedMonRay(maxD) {
  const { o, d } = aimRay(); let best = null, bt = 1e9; const c = new THREE.Vector3();
  for (const m of mons) {
    if (m.dead || !m.obj) continue;
    c.set(m.obj.position.x, 1.0, m.obj.position.z);
    const t = c.clone().sub(o).dot(d);
    if (t < 0 || t > maxD || t >= bt) continue;
    if (o.clone().addScaledVector(d, t).distanceTo(c) < .8) { bt = t; best = m; }
  }
  return best;
}
function fpShot(c) { return withMirrors(() => fpShotRaw(c)); }
function fpShotRaw(c) {   // 1인칭 공격: 조준선으로 곧장 나가서, 처음 맞는 적이 쓰러져요
  const range = c.rng * 1.6 + 4, m = aimedMonRay(range);
  const tp = m ? new THREE.Vector3(m.obj.position.x, 1.0, m.obj.position.z) : aimPoint(range);
  const mz = muzzle();
  sendFx(0, mz, tp);
  throwOrb(mz, new THREE.Vector3(tp.x, m ? 1.0 : Math.max(.3, tp.y), tp.z), 0, () => {
    if (m && !m.dead) hitEnemy(m, baseHit(m), { kb: .6 });
    breakNodesAt(tp.x, tp.z, 1.1);
    scorchAt(tp.x, tp.z, .35);
    puff(tp.x, tp.z, 4, 0x3a2a1a);
  }, G.cls, true);
}
function aimFocus(range) {   // 드래그로 찍은 자리 > 1인칭 조준선의 적 > 화면 조준점 > 가까운 적(3인칭)
  if (aimOverride) return new THREE.Vector3(aimOverride.x, .6, aimOverride.z);
  if (fpMode || scopeOn()) { const m = aimedMonRay(range); if (m) return new THREE.Vector3(m.obj.position.x, .6, m.obj.position.z); return aimPoint(range); }
  const t = aimTarget(range + 8) || fwdMon(range);
  return t ? new THREE.Vector3(t.obj.position.x, .6, t.obj.position.z) : aimPoint(range);
}
// 곡선 번개: 손에서 목표까지 휘어서 뻗어요
function curveBolt(a, b, col, thick) {
  const dir = b.clone().sub(a), side = new THREE.Vector3(-dir.z, 0, dir.x);
  if (side.lengthSq() > 1e-6) side.normalize().multiplyScalar(Math.min(1.6, dir.length() * .18));
  const ctrl = a.clone().lerp(b, .5).add(side); ctrl.y += .6;
  for (let w = 0; w < (thick || 1); w++) {
    const off = ((w - ((thick || 1) - 1) / 2) * .12);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, u = 1 - t;
      pts.push(new THREE.Vector3(u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x + off, u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y, u * u * a.z + 2 * u * t * ctrl.z + t * t * b.z + off * .6));
    }
    bolt(pts, col);
  }
}
let aimLineObj = null, gaugeEl = null;
function muzzle() { return new THREE.Vector3(px + Math.sin(rotY) * .8, (py || 0) + 1.4, pz + Math.cos(rotY) * .8); }   // 지붕 위면 지붕 높이에서 쏴요   // 얼굴·손 앞에서 나가요
function ensureGauge() {
  if (gaugeEl) return gaugeEl;
  if (!document.getElementById('chgCss')) { const st = document.createElement('style'); st.id = 'chgCss'; st.textContent = '#chgGauge{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);width:min(260px,64vw);z-index:9;pointer-events:none;display:none;text-align:center;font-weight:900;font-size:13px;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.5)}#chgGauge .bar{height:16px;border-radius:12px;background:rgba(0,0,0,.45);border:2px solid #fff;overflow:hidden;margin-top:4px}#chgGauge .fill{height:100%;width:0;background:linear-gradient(90deg,#9fe6ff,#ffd34d);transition:width .05s linear}#chgGauge.lv1 .fill{background:linear-gradient(90deg,#ffd34d,#ff9f3d)}#chgGauge.lv2 .fill{background:linear-gradient(90deg,#ff8a3d,#ff3d3d)}#chgGauge.lv2{animation:chgPulse .25s ease-in-out infinite alternate}@keyframes chgPulse{to{transform:translateX(-50%) scale(1.06)}}'; document.head.appendChild(st); }
  gaugeEl = document.createElement('div'); gaugeEl.id = 'chgGauge';
  gaugeEl.innerHTML = '<div class="lbl">🔋 기 모으는 중</div><div class="bar"><div class="fill"></div></div>';
  document.body.appendChild(gaugeEl); return gaugeEl;
}
// 오른쪽 공격: 누르고 있으면 가장 가까운 몬스터에게 자동 조준 (직접 끌어서 조준하면 그쪽을 따라요)
function autoAimUpdate() {
  if (!chargeOn || !chargeEl || chargeEl.id !== 'bHit' || chargeMoved) return;
  const t = nearestMon(CLS[G.cls].rng * 2.6 + 4);
  aimOverride = t ? { x: t.obj.position.x, z: t.obj.position.z } : null;
}
function updateChargeRing() {   // 꾹 누르는 동안: 게이지 + 조준선 + 범위 원
  autoAimUpdate();
  if (!chargeRing) { chargeRing = new THREE.Mesh(new THREE.RingGeometry(.6, .72, 48), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); chargeRing.rotation.x = -Math.PI / 2; scene.add(chargeRing); }
  if (!aimLineObj) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)); aimLineObj = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xfff3a0, dashSize: .3, gapSize: .2, transparent: true, opacity: .85, depthWrite: false })); aimLineObj.frustumCulled = false; scene.add(aimLineObj); }
  const gauge = ensureGauge();
  const held = chargeOn ? (performance.now() - holdStart) / 1000 : 0;
  const on = chargeOn && held > .08 && mode === 'FIELD' && !buildMode && !modalOpen && !sniper;
  chargeRing.visible = on; aimLineObj.visible = on; gauge.style.display = on ? 'block' : 'none';
  if (!on) return;
  const lv = Math.min(held, 2.5), R = chargeRadius(lv), f = aimFocus(CLS[G.cls].rng * (1 + .25 * lv) + 1), m = muzzle();
  chargeRing.position.set(f.x, .09, f.z); chargeRing.scale.setScalar(R / .66);
  chargeRing.material.color.setHex(lv >= 2 ? 0xff8a3d : lv >= 1 ? 0xffd34d : 0xbfe9ff);
  chargeRing.material.opacity = .45 + .4 * (lv / 2.5);
  const pa = aimLineObj.geometry.attributes.position; pa.setXYZ(0, m.x, m.y, m.z); pa.setXYZ(1, f.x, .3, f.z); pa.needsUpdate = true; aimLineObj.computeLineDistances();
  const pct = Math.round(Math.min(1, held / 2.5) * 100);
  gauge.querySelector('.fill').style.width = pct + '%';
  gauge.className = lv >= 2 ? 'lv2' : lv >= 1 ? 'lv1' : '';
  gauge.querySelector('.lbl').textContent = lv >= 2 ? '💥 최대 강타 준비!' : lv >= 1 ? '⚡ 강타 준비 중' : '🔋 기 모으는 중';
}
function screenToGround(cx, cy) {   // 화면 좌표 → 땅 위의 점
  const r = renderer.domElement.getBoundingClientRect(), ndc = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  const hp = new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hp) ? { x: hp.x, z: hp.z } : null;
}
function chargeStart(assist) { chargeOn = !modalOpen && mode === 'FIELD' && !buildMode; chargeAssist = !!assist; holdStart = performance.now(); aimOverride = null; chargeMoved = false; }
// 레이저: 왼쪽 버튼을 누르고 있는 동안 조준점 방향으로 빔이 나가요
let laserMesh = null, laserCd = 0;
function laserAim() {   // 조준선(1인칭·3인칭 공통): 처음 맞는 적과 빔 끝
  const cam = aimRay(), range = CLS[G.cls].rng * 1.8 + 4;
  const mz = muzzle();
  let o = cam.o, dir = cam.d.clone();
  if (aimOverride) { const hx = aimOverride.x - px, hz = aimOverride.z - pz, L = Math.hypot(hx, hz) || 1; dir = new THREE.Vector3(hx / L, dir.y, hz / L).normalize(); o = mz; }
  const fx = dir.x, fz = dir.z, FL = Math.hypot(fx, fz) || 1;
  let best = null, bt = 1e9, bc = null;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (const m of mons) {
    if (m.dead || !m.obj) continue;
    const hx = m.obj.position.x - px, hz = m.obj.position.z - pz;
    if (Math.hypot(hx, hz) < .6) continue;
    if ((hx * fx + hz * fz) / (Math.hypot(hx, hz) * FL) < .2) continue;
    c.set(m.obj.position.x, m.fly ? m.fly + .6 : .9, m.obj.position.z);
    v.copy(c).sub(o);
    const t = v.dot(dir);
    if (t < .2 || t > range + 12 || t >= bt) continue;
    if (v.clone().addScaledVector(dir, -t).length() < .7) { bt = t; best = m; bc = c.clone(); }
  }
  const far = aimRay().o.clone().addScaledVector(dir, aimRay().o.distanceTo(mz) + range);   // 조준선 위의 먼 점 → 화면 가운데로 곧게
  const end = best ? bc : far;
  return { mz, end, best };
}
function fireLightningLine() { return withMirrors(() => fireLightningLineRaw()); }
function fireLightningLineRaw() {   // 왼쪽 공격: 포물선 없이 조준선을 따라 곧게 뻗어나가요. 지나가는 적을 모두 관통해요
  if (sniper) { fireSniper(); return; }   // 지붕 위에서는 저격 판정으로 맞아요
  const cam = aimRay(), range = CLS[G.cls].rng * 2.4 + 6, mz = muzzle();
  let o = cam.o, dir = cam.d.clone();
  const reach = o.distanceTo(mz) + range;
  const far = o.clone().addScaledVector(dir, reach);
  const hits = [], c = new THREE.Vector3(), v = new THREE.Vector3();
  for (const m of mons) {
    if (m.dead || !m.obj) continue;
    const hx = m.obj.position.x - px, hz = m.obj.position.z - pz;
    if (Math.hypot(hx, hz) < .6) continue;
    c.set(m.obj.position.x, m.fly ? m.fly + .6 : .9, m.obj.position.z);
    v.copy(c).sub(o);
    const t = v.dot(dir);
    if (t < 0 || t > reach) continue;
    if (v.clone().addScaledVector(dir, -t).length() < .8 + t * .06) hits.push({ m, t });
  }
  const lampHits = [];
  for (const k of Object.keys(G.b)) {   // 조준선에 전등이 걸리면 전기가 튀어요
    if (!G.b[k] || G.b[k].t !== 'LAMP') continue;
    const [lx, lz] = k.split(',').map(Number);
    c.set(lx, 1.6, lz); v.copy(c).sub(o);
    const t = v.dot(dir);
    if (t < 0 || t > reach) continue;
    if (v.clone().addScaledVector(dir, -t).length() < 1 + t * .05) lampHits.push(k);
  }
  hits.sort((a, b) => a.t - b.t);
  const col = G.cls === 'archer' ? 0xfff1a0 : 0x9fe6ff;
  sendFx(0, mz, { x: far.x, z: far.z });
  throwOrb(mz, far, 0, () => {
    bolt([mz.clone(), far.clone()], col);
    for (const h of hits) if (!h.m.dead) hitEnemy(h.m, h.m.boss ? baseHit(h.m) * 2 : 9999, { kb: .4 });
    for (const k of lampHits) lampZap(k);
    breakNodesAt(far.x, far.z, 1.1);
    sfx('skill'); hitFx(.1);
  }, G.cls, true);
}
function chargeRelease(assist) { return withMirrors(() => chargeReleaseRaw(assist)); }
function chargeReleaseRaw(assist) {
  if (!chargeOn) return;
  const held = (performance.now() - holdStart) / 1000; chargeOn = false; chargePid = null;
  if (mode !== 'FIELD' || modalOpen || buildMode) { aimOverride = null; return; }
  if (sniper) { fireSniper(); return; }
  if (chargeEl && chargeEl.id === 'bPadAtk') {   // 왼쪽 버튼: 조준한 방향으로 곧게 쏴요
    fireLightningLine(); aimOverride = null; chargeEl = null; return;   // 왼쪽 버튼: 번개가 조준선과 영점이 맞게 곧장 나가요
  }
  if (aimOverride) { const lv = Math.min(Math.max(held, .3), 2.5); chargedZap(lv); aimOverride = null; return; }   // 드래그한 자리에 떨어뜨려요
  if (assist || chargeAssist) assistAim();
  if (held < .35) { attackNow(true); atkCd = Math.max(atkCd, .2 / rateMul() / CLS[G.cls].rate); return; }   // 짧게 누르면 일반 공격
  chargedZap(Math.min(held, 2.5));
}
// 강타: 모은 시간만큼 번개가 굵어지고, 범위가 넓어지고, 세져요
function chargedZap(lv) {
  const c = CLS[G.cls], range = c.rng * (1 + .25 * lv) + 1;
  const focus = aimFocus(range);
  const thick = 1 + Math.min(3, Math.floor(lv * 1.5));
  const mz = muzzle();
  sendFx(lv, mz, focus);
  throwOrb(mz, new THREE.Vector3(focus.x, .6, focus.z), lv, () => {
    breakNodesAt(focus.x, focus.z, chargeRadius(lv) + .3);
    for (let w = 0; w < thick; w++) bolt([new THREE.Vector3(focus.x + (w - (thick - 1) / 2) * .14, 9, focus.z), new THREE.Vector3(focus.x, .6, focus.z)], lv >= 1.5 ? 0xff8a3d : (lv >= .8 ? 0xbff4ff : undefined));
    const R = chargeRadius(lv);
    glowAt(focus.x, .4, focus.z, R * 1.6, 0x9fe6ff, .35);
    shockwave(focus.x, focus.z, R * 2.2);
    for (const m of mons) { if (!m.dead && Math.hypot(m.obj.position.x - focus.x, m.obj.position.z - focus.z) < R * 1.8 + .6) m.slow = Math.max(m.slow || 0, 1.2 + lv * 1.8); }   // 강하게 모을수록 적이 더 오래 느려져요
    scorchAt(focus.x, focus.z, R * .5);
    mons.slice().forEach(m => {
      if (m.dead) return;
      if (Math.hypot(m.obj.position.x - focus.x, m.obj.position.z - focus.z) <= R) hitEnemy(m, baseHit(m) * (1 + .8 * lv) + lv, { kb: .6 + .5 * lv });
    });
    hitFx(.2 + .15 * lv); hitStop(.03 + .02 * lv); sfx('skill'); vib('hit');
  });
  atkCd = Math.max(atkCd, .25);
}

function attackNow(manual, power) { return withMirrors(() => attackNowRaw(manual, power)); }
function attackNowRaw(manual, power) {
  const c = CLS[G.cls], chg = (power || 1) > 1;
  if (manual && !chg && (fpMode || scopeOn()) && !sniper) { fpShot(c); return true; }
  if (manual && !scopeOn()) { const d = camFwd(); if (Math.hypot(d.x, d.z) > .05) rotY = Math.atan2(d.x, d.z); }  // 캐릭터가 조준 방향을 봐요
  const t = scopeOn() ? scopeTarget()
    : (manual ? (aimTarget(c.rng + 14) || (fpMode ? null : fwdMon(c.rng))) : nearestMon(c.rng));
  if (!t && guestMode()) {   // 친구 화면: 가까운 적을 때리면 방장에게 알려요 (피해 계산은 방장 쪽)
    const mm = nearestMirror(c.rng + 1.5);
    if (mm) { const dm = baseHit(mm); zapFx(mm.obj.position, () => netSend('hit', { id: mm.nid, d: dm }), mm); return true; }
  }
  if (!t) {
    if (!manual) return false;              // 자동 공격은 적이 있을 때만 나가요
    const nd = mode === 'FIELD' && !fpMode ? aimNode(5) : null;
    if (nd) { harvest(nd); return true; }   // 앞의 나무·돌을 멀리서 쓰러뜨려요
    zapFx(aimPoint(c.rng * 1.6));           // 조준한 곳으로 번개를 쏴요 (맞은 자리는 그을려요)
    if (scopeOn()) toast('조준점에 좀비를 맞춰 주세요.');
    return true;
  }
  const mt = t.obj.position;
  const dmgT = chg ? baseHit(t) * 3.5 + 2 : baseHit(t);
  zapFx(mt, () => { if (!t.dead) hitEnemy(t, dmgT, { kb: chg ? 1.6 : .6 }); }, t);
  if (G.cls === 'warrior') glowAt(px + Math.sin(rotY) * 1.2, 1, pz + Math.cos(rotY) * 1.2, 2.4, 0xffe9b0, .2);
  if (chg) { shockwave(px, pz, 2.2 * c.rng * .5); hitFx(.45); hitStop(.06); }
  return true;
}
// 일반 공격: 손끝에서 전기가 뻗어 나가고, 튄 자리와 발밑이 그을려요
let scorchGeo = null; const scorchQ = [], scorchPool = [];
// 그을림 자국은 재질을 다시 만들지 않고 풀에서 꺼내 써요 (연속 공격 때 끊김 방지)
function releaseScorch(m) {
  scene.remove(m); const i = scorchQ.indexOf(m); if (i >= 0) scorchQ.splice(i, 1);
  m.userData.tk = (m.userData.tk || 0) + 1; scorchPool.push(m);
}
function scorchAt(x, z, r) {
  if (!scorchGeo) scorchGeo = new THREE.CircleGeometry(1, 14);
  let m = scorchPool.pop();
  if (!m) { m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ color: 0x1b1108, transparent: true, opacity: .8, depthWrite: false })); m.rotation.x = -Math.PI / 2; }
  m.material.opacity = .8; m.position.set(x, .04, z); m.scale.setScalar(r * (.75 + Math.random() * .5));
  scene.add(m); scorchQ.push(m);
  if (scorchQ.length > 40) releaseScorch(scorchQ[0]);
  const tk = m.userData.tk = (m.userData.tk || 0) + 1;
  tweenTo(.8, 0, 6, v => { if (m.userData.tk === tk) m.material.opacity = v; }, 'in', 8, () => { if (m.userData.tk === tk) releaseScorch(m); });
}
function sendFx(lv, a, b) { netSend('fx', { f: [+a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2)], t: [+b.x.toFixed(2), +b.z.toFixed(2)], lv, k: G.cls }); }
function showRemoteFx(p) {   // 친구가 쏜 공격을 똑같이 보여 줘요
  if (!scene || !p.f || !p.t) return;
  const from = new THREE.Vector3(p.f[0], p.f[1], p.f[2]), to = new THREE.Vector3(p.t[0], .6, p.t[1]), lv = p.lv || 0;
  throwOrb(from, to, lv, () => {
    bolt([new THREE.Vector3(to.x + rnd(-.4, .4), 9, to.z + rnd(-.4, .4)), new THREE.Vector3(to.x, .6, to.z)], (p.k || 'mage') === 'archer' ? 0xfff1a0 : 0x9fe6ff);
    scorchAt(to.x, to.z, .42 + lv * .2);
    puff(to.x, to.z, 4, 0x3a2a1a);
  }, p.k || 'mage');
}
function throwOrb(from, to, lv, onHit, cls, flat) {   // 얼굴 앞에서 던진 번개 구슬: 거리에 따라 날아가는 시간이 달라요 (flat이면 직선)
  const dist = from.distanceTo(to), dur = flat ? .05 + dist * .02 : .16 + dist * .035 + lv * .05, h = flat ? 0 : 1 + dist * .12 + lv * .4;
  const col = lv >= 1.5 ? 0xff8a3d : (lv >= .8 ? 0xbff4ff : ((cls || G.cls) === 'archer' ? 0xfff1a0 : 0x9fe6ff));
  const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(.16 + lv * .07, 12, 10), mat); orb.position.copy(from); scene.add(orb);
  let lastTrail = 0;
  tweenTo(0, 1, dur, v => {
    const x = from.x + (to.x - from.x) * v, z = from.z + (to.z - from.z) * v;
    const y = from.y + (to.y - from.y) * v + 4 * h * v * (1 - v);   // 포물선
    orb.position.set(x, y, z);
    if (v - lastTrail > .12) { lastTrail = v; glowAt(x, y, z, .6 + lv * .3, col, .22); }
  }, 'out', 0, () => {
    scene.remove(orb); orb.geometry.dispose(); mat.dispose();
    glowAt(to.x, .5, to.z, 1.4 + lv * .6, col, .25);
    if (onHit) onHit();
  });
}
function breakNodesAt(x, z, R) {   // 떨어진 자리 근처의 나무·돌·풀을 부숴요
  for (const kind in nodes) for (const n of nodes[kind]) {
    if (!n.alive) continue;
    if (Math.hypot(n.g.position.x - x, n.g.position.z - z) <= R) harvest(n);
  }
}
function zapFx(mt, onHit, tgt) {   // 얼굴 앞에서 던져서, 도착한 자리에 번개가 떨어져요
  const ty = mt.y != null && mt.y > .5 ? mt.y + .6 : .6;
  const mz = muzzle();
  sendFx(0, mz, mt);
  throwOrb(mz, new THREE.Vector3(mt.x, ty, mt.z), 0, () => {
    const lx = tgt && !tgt.dead ? tgt.obj.position.x : mt.x, lz = tgt && !tgt.dead ? tgt.obj.position.z : mt.z;   // 도착 순간 적이 있는 곳
    breakNodesAt(lx, lz, 1.1);
    bolt([new THREE.Vector3(lx + rnd(-.4, .4), 9, lz + rnd(-.4, .4)), new THREE.Vector3(lx, .6, lz)], G.cls === 'archer' ? 0xfff1a0 : 0x9fe6ff);
    scorchAt(lx, lz, .42);
    chargeCanisterAt(lx, lz);
    puff(lx, lz, 4, 0x3a2a1a);
    igniteAt(lx, lz);
    if (onHit) onHit();
  });
}

function igniteAt(x, z) {
  if (!flameTex) flameTex = makeRadialTex('rgba(255,250,200,1)', 'rgba(255,90,10,0)');
  for (let i = 0; i < 5; i++) {
    let sp = flamePool.pop();
    if (!sp) sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sp.material.color.setHex(i % 2 ? 0xffa030 : 0xffd060); sp.material.opacity = 1;
    const ox = rnd(-.3, .3), oz = rnd(-.3, .3), h = rnd(.6, 1.1), sc0 = rnd(.35, .55);
    sp.position.set(x + ox, .25, z + oz); sp.scale.setScalar(sc0); scene.add(sp);
    const tk = sp.userData.tk = (sp.userData.tk || 0) + 1;
    const back = () => { if (sp.userData.tk !== tk) return; scene.remove(sp); flamePool.push(sp); sp.userData.tk++; };
    tweenTo(0, h, rnd(.45, .7), v => { if (sp.userData.tk === tk) { sp.position.y = .25 + v; sp.scale.setScalar(sc0 * (1 - v / 2.2)); } }, 'out', i * .03);
    tweenTo(1, 0, .6, v => { if (sp.userData.tk === tk) sp.material.opacity = v; }, 'in', .15 + i * .03, back);
  }
  glowAt(x, .5, z, .9, 0xff8a2a, .3);
}
// 스킬: 하늘에서 낙뢰가 떨어져요. 넓은 범위에 여러 줄기가 차례로 내리치고, 맞은 적과 땅이 불타요
// ===== 레벨업으로 얻는 추가 스킬 (스킬 버튼 아래 작은 버튼) =====
const XSKILLS = {
  meteor: { ic: '☄', name: '운석 떨어뜨리기', btn: '☄ 운석', d: '조준한 곳에 운석이 떨어져 큰 불을 내요' },
  water:  { ic: '💦', name: '물대포 쏘기',     btn: '💦 물대포', d: '앞으로 물줄기를 쏘아 적을 밀어내요' },
  laser:  { ic: '🔴', name: '레이저빔',        btn: '🔴 레이저', d: '조준한 방향으로 긴 빔을 쏘아 꿰뚫어요' }
};
const XCD = { meteor: 9, water: 5, laser: 3 };
const XMAX = 3;
let xCd = {}, xGeo = null, xMat = null;
function xLv(k) { return (G && G.xs && G.xs[k]) || 0; }
function xHit(m, dmg, kb, inside) { if (!m || m.dead || !m.obj) return; hitEnemy(m, dmg * bossDmgMul(m), { kb: kb || .6 }); }
function meteorStrike(lv, dmg) {
  const p = aimPoint(14), x = p.x, z = p.z, R = 2.6 + lv * .5;
  const ring = new THREE.Mesh(new THREE.RingGeometry(R * .55, R, 40), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, .08, z); scene.add(ring);
  tweenTo(0, .8, .6, v => { ring.material.opacity = v; });
  if (!flameTex) flameTex = makeRadialTex('rgba(255,250,200,1)', 'rgba(255,90,10,0)');
  const mat = new THREE.SpriteMaterial({ map: flameTex, color: 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const sp = new THREE.Sprite(mat); sp.position.set(x, 22, z); sp.scale.setScalar(2.4 + lv * .3); scene.add(sp);
  tweenTo(22, .7, .65, v => { sp.position.y = v; }, 'in', .4, () => {
    scene.remove(sp); mat.dispose(); scene.remove(ring); ring.geometry.dispose(); ring.material.dispose();
    for (const m of mons) if (!m.dead && m.obj && Math.hypot(m.obj.position.x - x, m.obj.position.z - z) < R) xHit(m, dmg * 1.7, 1.2);
    igniteAt(x, z); for (let i = 0; i < 6; i++) igniteAt(x + rnd(-R, R) * .7, z + rnd(-R, R) * .7);
    puff(x, z, 22, 0xff8a2a); glowAt(x, 1.2, z, 6, 0xffa030, .6);
    screenFlash('#ffb070', .25, .3); hitStop(.05); sfx('skill'); vib('hit');
  });
}
function waterCannon(lv, dmg, d) {
  const L = Math.hypot(d.x, d.z) || 1, dx = d.x / L, dz = d.z / L, len = 6 + lv * 1.3, half = 1.2 + lv * .2;
  const hx = px + dx * .6, hz = pz + dz * .6;
  for (const m of mons) {
    if (m.dead || !m.obj) continue;
    const ex = m.obj.position.x - hx, ez = m.obj.position.z - hz, a = ex * dx + ez * dz, perp = Math.abs(-ex * dz + ez * dx);
    if (a > 0 && a < len && perp < half) xHit(m, dmg * 1.2, 1.3);
  }
  if (!xGeo) { xGeo = new THREE.SphereGeometry(.13, 6, 6); xMat = new THREE.MeshBasicMaterial({ color: 0x7fd6ff, transparent: true, opacity: .9 }); }
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Mesh(xGeo, xMat); scene.add(g);
    const side = rnd(-half, half) * .6, up = rnd(-.2, .5), dur = .42 + rnd(0, .12);
    tweenTo(0, 1, dur, t => {
      const s = len * t;
      g.position.set(hx + dx * s - dz * side * t, 1.3 + up * t - 2.2 * t * t + .3, hz + dz * s + dx * side * t);
    }, 'out', i * .01, () => { scene.remove(g); });
  }
  puff(hx + dx * 2, hz + dz * 2, 6, 0xa8e6ff); sfx('hit');
}
function laserBeam(lv, dmg, d) {
  const dir = new THREE.Vector3(d.x, d.y, d.z).normalize(), start = new THREE.Vector3(px, 1.4, pz), L = 18, w = .14 + lv * .04;
  const geo = new THREE.CylinderGeometry(w, w, L, 10);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(geo, mat);
  beam.position.copy(start).addScaledVector(dir, L / 2); beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  scene.add(beam);
  tweenTo(1, 0, .45, v => { mat.opacity = .9 * v; }, 'in', 0, () => { scene.remove(beam); geo.dispose(); mat.dispose(); });
  const p = new THREE.Vector3(), cl = new THREE.Vector3();
  for (const m of mons) {
    if (m.dead || !m.obj) continue;
    p.set(m.obj.position.x, m.obj.position.y + 1, m.obj.position.z).sub(start);
    const t = p.dot(dir); if (t < 0 || t > L) continue;
    cl.copy(start).addScaledVector(dir, t);
    if (p.add(start).distanceTo(cl) < 1.1 + lv * .2) xHit(m, dmg * 1.4, .5);
  }
  const end = start.clone().addScaledVector(dir, L);
  glowAt(end.x, end.y, end.z, 3, 0xff4040, .3); sfx('hit');
}
function useXSkill(k) {
  if (!G || mode !== 'FIELD' || modalOpen || buildMode || sniper || (xCd[k] || 0) > 0 || !xLv(k)) return;
  const lv = xLv(k), d = camFwd(), dmg = (3 + G.skillLv * .5 + lv * 2) * skillDmgMul();
  if (Math.hypot(d.x, d.z) > .05) rotY = Math.atan2(d.x, d.z);
  xCd[k] = Math.max(2.5, XCD[k] * (1 - .08 * (lv - 1)) * (1 - .15 * G.up.cd));
  if (k === 'meteor') meteorStrike(lv, dmg);
  else if (k === 'water') waterCannon(lv, dmg, d);
  else laserBeam(lv, dmg, d);
  persistRun();
}
function renderXSkills() {
  const box = $('xSkills'); if (!box || !G) return; box.innerHTML = '';
  for (const k in XSKILLS) {
    if (!xLv(k)) continue;
    const b = document.createElement('button'); b.className = 'xs'; b.dataset.k = k; b.id = 'xs_' + k;
    b.title = XSKILLS[k].name + ' (Lv ' + xLv(k) + ')';
    b.onclick = () => useXSkill(k);
    box.appendChild(b); wireMovableBtn(b);
  }
  updXSkillsCd();
}
function updXSkillsCd() {
  document.querySelectorAll('#xSkills .xs').forEach(b => {
    const k = b.dataset.k, cd = xCd[k] || 0, label = XSKILLS[k].btn + ' Lv' + xLv(k);
    const txt = cd > 0 ? label + ' ' + Math.ceil(cd) : label;
    if (b.textContent !== txt) b.textContent = txt;
    b.style.opacity = cd > 0 ? .55 : 1;
  });
}
function useSkill() { return withMirrors(() => useSkillRaw()); }
function useSkillRaw() {
  if (mode !== 'FIELD' || skillCd > 0 || modalOpen) return;
  if (G.cls === 'archer') fireArrowRain(); else if (G.cls === 'warrior') tailSweep(); else meteorStrike();
}
// 운석 낙하: 불타는 돌이 하늘에서 떨어져 주변을 쓸어요. 맞은 적은 크게 다쳐요
let meteorZone = null;
const rocks = [];
function spawnRock(x, z, tx, tz, dmg) {   // 해골이 던진 돌: 포물선으로 날아와요
  const g = new THREE.Mesh(new THREE.DodecahedronGeometry(.24, 0), new THREE.MeshStandardMaterial({ color: 0x8a7a68, flatShading: true, emissive: 0x221100 }));
  g.castShadow = true; g.position.set(x, 1.2, z); scene.add(g);
  rocks.push({ g, sx: x, sz: z, tx, tz, t: 0, dur: .9, dmg });
}
function updRocks(dt) {
  for (let i = rocks.length - 1; i >= 0; i--) {
    const r = rocks[i]; r.t += dt;
    const k = Math.min(1, r.t / r.dur), x = r.sx + (r.tx - r.sx) * k, z = r.sz + (r.tz - r.sz) * k;
    r.g.position.set(x, Math.max(.2, 1.2 + 9 * k * (1 - k) - 1.2 * k), z);
    r.g.rotation.x += dt * 9; r.g.rotation.z += dt * 7;
    if (k >= 1) {
      scene.remove(r.g); r.g.geometry.dispose(); r.g.material.dispose(); rocks.splice(i, 1);
      puff(x, z, 5, 0x9a8a78);
      if (Math.hypot(x - px, z - pz) < .9 && (py || 0) < 1.5) hurtPlayer(r.dmg, { x: r.sx, z: r.sz });
    }
  }
}
function throwRocks(dt) {
  if (!G || (G.day || 1) < 3 || mode !== 'FIELD' || modalOpen || freeze) return;
  for (const m of mons) {
    if (m.dead || m.fly || m.boss || m.kind !== 'skeleton' || !m.obj) continue;
    if (m.rockCd === undefined) m.rockCd = rnd(2, 4);
    m.rockCd -= dt;
    if (m.rockCd > 0) continue;
    const d = Math.hypot(px - m.obj.position.x, pz - m.obj.position.z);
    if (d < 10 && d > 2.5) {
      glowAt(m.obj.position.x, 2, m.obj.position.z, 1.4, 0xffb347, .3);   // 던지기 전 예고
      spawnRock(m.obj.position.x, m.obj.position.z, px, pz, 3 + (G.day || 1) * .5);
      m.rockCd = rnd(3, 4.5);
    } else m.rockCd = .4;
  }
}
function meteorStrike() {
  if (mode !== 'FIELD' || modalOpen) return;
  const dayUp = (G.day || 1) - 1, k = skillDmgMul() * (1 + .15 * dayUp), R = 6.5 + G.skillLv * .6 + dayUp * .5, N = 9 + G.skillLv * 2 + Math.floor(dayUp / 2), dmg = (6 + G.skillLv * 1.5) * k;
  const tierCol = G.day >= 8 ? 0x9fe6ff : G.day >= 5 ? 0xc77dff : G.day >= 3 ? 0xffd34d : 0xff8a3d;   // 단계별 색이 바뀌어요
  const cx = px, cz = pz;
  meteorZone = { x: cx, z: cz, R, until: performance.now() + 2600 };
  const warn = new THREE.Mesh(new THREE.RingGeometry(R - .15, R, 64), new THREE.MeshBasicMaterial({ color: tierCol, transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  warn.rotation.x = -Math.PI / 2; warn.position.set(cx, .07, cz); scene.add(warn);
  tweenTo(.75, .3, 1.4, v => { warn.material.opacity = v; }, 'out', 0, () => { scene.remove(warn); warn.material.dispose(); warn.geometry.dispose(); });
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    tweenTo(0, 1, .001, () => {}, 'out', .3 + i * (1.0 / N) + rnd(0, .06), () => dropMeteor(x, z, dmg));
  }
  sfx('skill'); vib('hit'); hitStop(.05); toast('☄ 운석 낙하!');
  skillCd = Math.max(3, CLS[G.cls].cd * (1 - .15 * G.up.cd)) * (G.promo === 'b' ? .7 : 1);
  persistRun();
}
function dropMeteor(x, z, dmg) {   // 불붙은 돌이 하늘에서 떨어져요
  const geo = new THREE.DodecahedronGeometry(.2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, emissive: 0xff6a2a, emissiveIntensity: 1.6, flatShading: true });
  const m = new THREE.Mesh(geo, mat); m.position.set(x, 16, z); m.castShadow = true; scene.add(m);
  tweenTo(16, .4, .6, v => {
    m.position.y = v; m.rotation.x += .25; m.rotation.z += .18;
    glowAt(x, v + .3, z, 1.1, 0xff7a2a, .2);   // 불꼬리
  }, 'in', 0, () => {
    scene.remove(m); geo.dispose(); mat.dispose();
    impactMeteor(x, z, dmg);
  });
}
function impactMeteor(x, z, dmg) {
  glowAt(x, .6, z, 3.6, 0xffb347, .5);
  glowAt(x, .4, z, 2.2, 0xff5a1f, .4);
  scorchAt(x, z, 1.5);
  puff(x, z, 16, 0xff8a3d);
  hitFx(.4); hitStop(.04); sfx('skill'); vib('hit');
  for (let i = 0; i < 10; i++) {   // 불씨가 사방으로 튀어요
    const sp = new THREE.Mesh(new THREE.SphereGeometry(.08, 6, 5), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb347 : 0xff5a1f, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(x, .3, z); scene.add(sp);
    const a = rnd(0, Math.PI * 2), out = rnd(1.2, 2.6), up = rnd(1, 2.4);
    tweenTo(0, 1, .6, v => { sp.position.set(x + Math.cos(a) * out * v, .3 + up * v - 2 * v * v, z + Math.sin(a) * out * v); sp.material.opacity = 1 - v; }, 'out', 0, () => { scene.remove(sp); sp.geometry.dispose(); sp.material.dispose(); });
  }
  let hits = 0;
  mons.slice().forEach(m => {
    if (m.dead) return;
    if (Math.hypot(m.obj.position.x - x, m.obj.position.z - z) < 2.2) { hitEnemy(m, m.boss ? dmg : 9999, { kb: 1.8 }); hits++; }
  });
  breakNodesAt(x, z, 2.2);
  if (hits) toast('☄ 운석에 맞은 적 ' + hits + '마리!');
}
function setSkillCd() { const c = CLS[G.cls]; skillCd = Math.max(3, c.cd * (1 - .15 * G.up.cd)) * (G.promo === 'b' ? .7 : 1); persistRun(); }
function lightningStorm() {
  const c = CLS[G.cls], k = skillDmgMul();
  const R = 7 + G.skillLv * .5, N = 10 + G.skillLv * 2, dmg = (2.5 + G.skillLv * .6) * k;
  const cx = px, cz = pz;
  // 예고: 낙뢰가 떨어질 범위를 먼저 보여줘요
  const warn = new THREE.Mesh(new THREE.RingGeometry(R - .15, R, 64), new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  warn.rotation.x = -Math.PI / 2; warn.position.set(cx, .07, cz); scene.add(warn);
  tweenTo(.8, .25, .6, v => { warn.material.opacity = v; }, 'out', 0, () => { scene.remove(warn); warn.material.dispose(); });
  screenFlash('#e6f6ff', .22, .35);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    tweenTo(0, 1, .001, () => {}, 'out', .25 + i * (.9 / N) + rnd(0, .05), () => strikeAt(x, z, dmg));
  }
  tweenTo(0, 1, .001, () => {}, 'out', .25 + .9 + .35, () => {
    const dome = new THREE.Mesh(new THREE.RingGeometry(.3, .5, 48), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    dome.rotation.x = -Math.PI / 2; dome.position.set(cx, .08, cz); scene.add(dome);
    tweenTo(1, R * 2, .35, v => dome.scale.setScalar(v));
    tweenTo(.9, 0, .4, v => dome.material.opacity = v, 'in', 0, () => { scene.remove(dome); dome.material.dispose(); });
  });
  sfx('skill'); vib('hit'); hitStop(.04);
  toast('⚡ 낙뢰!');
  skillCd = Math.max(3, c.cd * (1 - .15 * G.up.cd)) * (G.promo === 'b' ? .7 : 1);
  persistRun();
}
// 궁수 스킬: 불화살이 하늘에서 비처럼 떨어져요. 떨어진 자리는 불이 붙어요
let arrowGeo = null, arrowMat = null;
function fireArrowRain() {
  const R = 6.5 + G.skillLv * .5, N = 12 + G.skillLv * 2, dmg = (2.2 + G.skillLv * .5) * skillDmgMul();
  const cx = px, cz = pz;
  const warn = new THREE.Mesh(new THREE.RingGeometry(R - .15, R, 64), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  warn.rotation.x = -Math.PI / 2; warn.position.set(cx, .07, cz); scene.add(warn);
  tweenTo(.8, .25, .6, v => { warn.material.opacity = v; }, 'out', 0, () => { scene.remove(warn); warn.material.dispose(); });
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    tweenTo(0, 1, .001, () => {}, 'out', .2 + i * (.9 / N) + rnd(0, .05), () => dropArrow(x, z, dmg));
  }
  const dome = new THREE.Mesh(new THREE.RingGeometry(.3, .5, 48), new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  dome.rotation.x = -Math.PI / 2; dome.position.set(cx, .08, cz);
  tweenTo(0, 1, .001, () => { scene.add(dome); }, 'out', 1.2, () => {});
  tweenTo(1, R * 2, .35, v => dome.scale.setScalar(v), 'out', 1.2);
  tweenTo(.8, 0, .4, v => { dome.material.opacity = v; }, 'in', 1.2, () => { scene.remove(dome); dome.material.dispose(); });
  sfx('skill'); vib('hit'); hitStop(.03);
  toast('🔥 불화살!');
  setSkillCd();
}
function dropArrow(x, z, dmg) {
  if (!flameTex) flameTex = makeRadialTex('rgba(255,250,200,1)', 'rgba(255,90,10,0)');
  if (!arrowGeo) { arrowGeo = new THREE.CylinderGeometry(.035, .035, 1.5, 5); arrowGeo.rotateX(Math.PI / 2); arrowMat = new THREE.MeshBasicMaterial({ color: 0x8a5a2b }); }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(arrowGeo, arrowMat));
  const fmat = new THREE.SpriteMaterial({ map: flameTex, color: 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const fire = new THREE.Sprite(fmat); fire.scale.setScalar(.8); fire.position.z = -.85; g.add(fire);
  const start = new THREE.Vector3(x + rnd(-.6, .6), 20, z + rnd(-.6, .6)), end = new THREE.Vector3(x, .4, z);
  g.position.copy(start); g.lookAt(end); scene.add(g);
  tweenTo(0, 1, .55, v => { g.position.lerpVectors(start, end, v); }, 'in', 0, () => {
    scene.remove(g); fmat.dispose();
    for (const m of mons) { if (!m.dead && Math.hypot(m.obj.position.x - x, m.obj.position.z - z) < 1.5) hitEnemy(m, dmg * bossDmgMul(m), { kb: .3 }); }
    igniteAt(x, z); puff(x, z, 5, 0xffb347); glowAt(x, .5, z, 1.1, 0xff8a2a, .25);
  });
}
// 전사 스킬: 앞으로 대시하며 지나가는 적을 치고, 몸을 돌려 꼬리로 넓게 휩쓸어요
function tailSweep() {
  const R = 4.6 + G.skillLv * .2, dmg = (3 + G.skillLv * .6) * skillDmgMul();
  const sx = px, sz = pz, D = 4.5;
  const tx = clamp(sx + Math.sin(rotY) * D, -LIM, LIM), tz = clamp(sz + Math.cos(rotY) * D, -LIM, LIM);
  const rammed = new Set();
  const ram = () => {
    for (const m of mons) {
      if (m.dead || rammed.has(m)) continue;
      if (Math.hypot(m.obj.position.x - px, m.obj.position.z - pz) < 1.8) { rammed.add(m); hitEnemy(m, dmg * .6 * bossDmgMul(m), { kb: .8 }); }
    }
  };
  tweenTo(0, 1, .22, t => { px = sx + (tx - sx) * t; pz = sz + (tz - sz) * t; ram(); }, 'out', 0, () => {
    const pivot = new THREE.Group(); pivot.position.set(px, .6, pz); scene.add(pivot);
    const arc = new THREE.Mesh(new THREE.RingGeometry(R * .4, R, 40, 1, 0, Math.PI * 1.1), new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    arc.rotation.x = -Math.PI / 2; pivot.add(arc);
    tweenTo(-Math.PI * .9, Math.PI * .9, .35, v => { pivot.rotation.y = v; }, 'out', 0, () => {});
    tweenTo(.9, 0, .4, v => { arc.material.opacity = v; }, 'in', .15, () => { scene.remove(pivot); arc.geometry.dispose(); arc.material.dispose(); });
    for (const m of mons) { if (!m.dead && Math.hypot(m.obj.position.x - px, m.obj.position.z - pz) < R) hitEnemy(m, dmg * bossDmgMul(m), { kb: 1.1 }); }
    puff(px, pz, 14, 0xfff1c2); glowAt(px, 1, pz, R * .8, 0xffe9b0, .3);
    screenFlash('#fff4d6', .18, .25); hitStop(.05); sfx('skill'); vib('hit');
  });
  toast('🌀 꼬리치기!');
  setSkillCd();
}
// 한 줄기 낙뢰: 하늘에서 떨어져 땅을 치고, 근처의 적에게 피해를 주고 불을 남겨요
function strikeAt(x, z, dmg) {
  const top = new THREE.Vector3(x + rnd(-1.2, 1.2), 24, z + rnd(-1.2, 1.2)), gnd = new THREE.Vector3(x, .6, z);
  bolt([top, gnd], 0x33c2ff);
  bolt([top.clone().add(new THREE.Vector3(.25, 0, .15)), gnd.clone().add(new THREE.Vector3(.2, 0, 0))], 0xbfeaff);
  glowAt(x, .8, z, 4.2, 0x9fe6ff, .35);
  glowAt(x, .4, z, 2.4, 0xffb040, .5);
  scorchAt(x, z, 1.25);
  igniteAt(x, z);
  puff(x, z, 6, 0x3a2a1a);
  for (const m of mons.slice()) {
    if (m.dead) continue;
    const d = Math.hypot(m.obj.position.x - x, m.obj.position.z - z);
    if (d < 2.3) hitEnemy(m, dmg * bossDmgMul(m) * (1 - d / 4), { kb: .8 });
  }
}

/* ================= 경험치 · 레벨업 · 유물 ================= */
const FX_COLS = [0xffd84d, 0xff8ad8, 0x7de8ff, 0xb8ff7a, 0xffffff];
function screenFlash(bg, alpha, dur) {
  const f = document.createElement('div');
  f.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50;mix-blend-mode:screen;background:' + bg + ';opacity:' + alpha;
  document.body.appendChild(f);
  const t0 = performance.now();
  const step = () => { const k = (performance.now() - t0) / (dur * 1000); if (k >= 1) { f.remove(); return; } f.style.opacity = alpha * (1 - k); requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function levelFx(lvl) {
  const x = px, z = pz;
  screenFlash('radial-gradient(circle,rgba(255,240,160,.95),rgba(255,130,220,.4) 55%,transparent 85%)', .9, .8);
  hitStop(.09); hitFx(.5); sfx('lvl'); vib('lvl');
  for (let r = 0; r < 3; r++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(.25, .34, 48), new THREE.MeshBasicMaterial({ color: FX_COLS[r % FX_COLS.length], transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, .08 + r * .05, z); scene.add(ring);
    tweenTo(.6, 4.6 + r * 1.5, .6 + r * .14, v => ring.scale.setScalar(v), 'out', r * .08);
    tweenTo(1, 0, .65 + r * .14, v => ring.material.opacity = v, 'in', r * .08, () => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
  }
  for (let i = 0; i < 44; i++) {
    const m = new THREE.Mesh(partGeo, partMat(FX_COLS[i % FX_COLS.length]));
    m.position.set(x, 1.2, z); scene.add(m);
    const a = rnd(0, 6.283), sp = rnd(2.5, 6.5);
    partPool.push({ m, vx: Math.cos(a) * sp, vy: rnd(4, 8), vz: Math.sin(a) * sp, life: rnd(.9, 1.4), max: 1.4 });
  }
  for (let i = 0; i < 7; i++) glowAt(x + rnd(-2.2, 2.2), rnd(.6, 2.6), z + rnd(-2.2, 2.2), rnd(1.2, 2.4), FX_COLS[i % FX_COLS.length], .55);
  popup(x, 2.4, z, 'LEVEL ' + lvl + '!', '#ffe76a');
}
function gainXp(v) {
  G.xp += v;
  while (G.xp >= G.need) { G.xp -= G.need; G.lvl += 1; G.need = 5 + G.lvl * 4; G.pendingLvl += 1; levelFx(G.lvl); mapExpand(); if (G.lvl === 5) G.promoDue = true; if (G.lvl === 10) G.promo2Due = true; }
}
function levelChoices() {
  if (G.promoDue && !G.promo && PROMO[G.cls]) return { forced: true, list: [Object.assign({ kind: 'promo', key: 'a' }, PROMO[G.cls].a), Object.assign({ kind: 'promo', key: 'b' }, PROMO[G.cls].b)] };
  if (G.promo2Due && G.promo) return { forced: true, list: PROMO2.map(p => Object.assign({ kind: 'p2' }, p)) };
  const pool = UPGRADES.filter(u => !u.special || G.skillLv < 5).map(u => Object.assign({ kind: 'up' }, u));
  if (G.lvl >= 2) for (const k in XSKILLS) {
    const lv = xLv(k); if (lv >= XMAX) continue;
    pool.push({ kind: 'xskill', key: k, ic: XSKILLS[k].ic, t: lv ? XSKILLS[k].name + ' 강화 → Lv ' + (lv + 1) : '✨ ' + XSKILLS[k].name + ' 배우기', d: XSKILLS[k].d });
  }
  if (G.lvl >= 3 && !G.pet) {
    // 입양 후보 3마리를 매번 다르게 골라요 (고양이·돼지·여우·양·라마)
    const PETS = [
      { key: 'cat', ic: '🐱', t: '고양이 입양', d: '가까이 있는 적을 할퀴고 보석을 물어 와요' },
      { key: 'pig', ic: '🐷', t: '돼지 입양', d: '튼튼하게 적을 받아치고 보석을 모아요' },
      { key: 'fox', ic: '🦊', t: '여우 입양', d: '빠르게 달려가 적을 물고 보석을 찾아요' },
      { key: 'sheep', ic: '🐑', t: '양 입양', d: '느리지만 든든하게 보석을 지켜요' },
      { key: 'llama', ic: '🦙', t: '라마 입양', d: '멀리 침을 뱉어 적을 쓰러뜨려요' }
    ];
    for (const p of PETS.slice().sort(() => Math.random() - .5).slice(0, 3)) pool.push(Object.assign({ kind: 'pet' }, p));
  }
  return { forced: false, list: pool };
}
function applyChoice(u) {
  if (u.kind === 'promo') { G.promo = u.key; G.promoDue = false; }
  else if (u.kind === 'p2') { G.promo2 = u.id; G.promo2Due = false; if (u.id === 'p2b') { G.maxHp += 40; G.hp = Math.min(G.maxHp, G.hp + 40); } }
  else if (u.kind === 'pet') { G.pet = u.key; ensurePet(); }
  else if (u.kind === 'xskill') { G.xs = G.xs || {}; G.xs[u.key] = xLv(u.key) + 1; renderXSkills(); }
  else if (u.special) G.skillLv += 1;
  else { G.up[u.id] = (G.up[u.id] || 0) + 1; if (u.id === 'hp') { G.maxHp += 20; G.hp = Math.min(G.maxHp, G.hp + 20); } }
}
function showLevelUp() {
  if (G.pendingLvl <= 0 || modalOpen) return;
  G.pendingLvl -= 1;
  const ch = levelChoices();
  let picks;
  if (ch.forced) picks = ch.list.slice(0, 2);
  else { const copy = ch.list.slice(); picks = []; while (picks.length < 3 && copy.length) { const i = (Math.random() * copy.length) | 0; picks.push(copy.splice(i, 1)[0]); } }
  $('lvlNew').textContent = G.lvl;
  const box = $('lvlOpts'); box.innerHTML = '';
  picks.forEach(u => {
    const b = document.createElement('button');
    b.className = 'opt' + (u.kind === 'promo' || u.kind === 'p2' ? ' epic' : u.kind === 'pet' ? ' rare' : '');
    const t = u.kind === 'up' && u.special ? SKILL_UP[G.cls].t + (G.skillLv + 1) : u.t;
    const d = u.kind === 'up' && u.special ? SKILL_UP[G.cls].d : u.d;
    b.innerHTML = `<span class="ic">${u.ic}</span><span>${t}<small>${d}</small></span>`;
    b.onclick = () => {
      applyChoice(u);
      sfx('lvl'); vib('lvl'); $('lvlModal').classList.remove('show'); modalOpen = false;
      toast(`⭐ ${t}`); persistRun();
      setTimeout(() => showLevelUp(), 120);
    };
    box.appendChild(b);
  });
  $('lvlModal').classList.add('show'); modalOpen = true;
}
function showRelics(day) {
  const pool = RELICS.slice(); const picks = [];
  // 희귀도 가중치: common 3 / rare 2 / epic 1
  const w = r => r.rar === 'epic' ? 1 : r.rar === 'rare' ? 2 : 3;
  while (picks.length < 3 && pool.length) {
    const tot = pool.reduce((s, r) => s + w(r), 0); let x = Math.random() * tot, idx = 0;
    for (let i = 0; i < pool.length; i++) { x -= w(pool[i]); if (x <= 0) { idx = i; break; } }
    picks.push(pool.splice(idx, 1)[0]);
  }
  $('relicDay').textContent = day;
  const box = $('relicOpts'); box.innerHTML = '';
  picks.forEach(r => {
    const b = document.createElement('button'); b.className = 'opt ' + (r.rar === 'epic' ? 'epic' : r.rar === 'rare' ? 'rare' : '');
    const tag = r.rar === 'epic' ? '전설' : r.rar === 'rare' ? '희귀' : '일반';
    b.innerHTML = `<span class="ic">${r.ic}</span><span>${r.t}<small>${r.d}</small></span><span class="tagN">${tag}</span>`;
    b.onclick = () => {
      G.relics[r.id] = (G.relics[r.id] || 0) + 1; G.relicsPicked += 1;
      sfx('relic'); vib('relic'); $('relicModal').classList.remove('show'); modalOpen = false;
      toast(`${r.ic} ${r.t} 획득!`); updateRelicChip(); persistRun();
      setTimeout(() => afterRelic(), 200);
    };
    box.appendChild(b);
  });
  $('relicModal').classList.add('show'); modalOpen = true;
}
function afterRelic() { if (G.pendingLvl > 0) showLevelUp(); else startStory(); }
function updateRelicChip() {
  const ids = Object.keys(G.relics || {}); const c = $('relicChip');
  if (!ids.length) { c.style.display = 'none'; return; }
  c.style.display = 'block';
  c.innerHTML = ids.map(id => { const r = RELICS.find(x => x.id === id); return r ? `${r.ic}×${G.relics[id]}` : ''; }).join(' ');
}
function startStory() {
  const lines = STORY[G.day] || GENERIC;
  storyQueue = lines.slice(); openDialog();
}
function openDialog() {
  if (!storyQueue.length) { closeDialog(); return; }
  mode = 'TALK'; $('dialog').style.display = 'block'; $('line').textContent = storyQueue.shift();
}
function closeDialog() { mode = 'FIELD'; $('dialog').style.display = 'none'; }

/* ================= 밤낮 · 웨이브 ================= */
// 새 맵 테마 바닥 (눈·사막·용암). 스테이지 전환 때 호출해요.
const THEME_TEX = { snow: 'assets/maps/snow-ground.jpg', sand: 'assets/maps/sand-ground.jpg', lava: 'assets/maps/lava-ground.jpg' };
const themeCache = {};
function setGroundTheme(name) {
  const g = window.groundMesh; if (!g) return;
  if (!g.userData.homeMap) g.userData.homeMap = g.material.map;   // 처음 바닥(마을 잔디)을 기억해요
  if (!name || !THEME_TEX[name]) { g.material.map = g.userData.homeMap; g.material.needsUpdate = true; return; }
  const tex = themeCache[name] || (themeCache[name] = new THREE.TextureLoader().load(THEME_TEX[name], t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(34, 34); }));
  g.material.map = tex; g.material.needsUpdate = true;
}
// 10일차부터 설원 스테이지: 눈 바닥, 보스는 눈 늑대왕 (9일차 이하는 마을)
function applyStageTheme() {
  if (G.day >= 10) { setGroundTheme('snow'); if (G.day === 10) toast('❄ 설원 스테이지 시작! 눈 늑대왕이 나타나요'); }
  else setGroundTheme(null);
}
function nightF(c) { return sstep(DAY_LEN - 4, DAY_LEN + 6, c) * (1 - sstep(CYCLE - 8, CYCLE, c)); }
function sunTheta(c) { return c < DAY_LEN ? (c / DAY_LEN) * Math.PI : Math.PI + ((c - DAY_LEN) / NIGHT_LEN) * Math.PI; }
const DAY_HEMI = new THREE.Color(0xdff3ff), NIGHT_HEMI = new THREE.Color(0x3b4d7f);
const DAY_FOG = new THREE.Color(0xcde9f2), NIGHT_FOG = new THREE.Color(0x1b2a4d);
// 허술함: 건물이 8개 이상이면 0, 하나도 없으면 1. 건물이 적을수록 적이 더 몰리고 더 쉽게 뚫고 들어와요
function weakDefense() { return clamp((8 - Object.keys(G.b || {}).length) / 8, 0, 1); }
function startNight() {
  const isBoss = G.day % 5 === 0;
  const wk = weakDefense();
  const cnt = Math.min(90, Math.round((9 + G.day * 5) * (1 + .5 * wk)));
  spawnQ = cnt; spawnT = .2;
  const wr = Math.random(); weather = wr < .35 ? 'rain' : wr < .55 ? 'fog' : 'clear'; bossSpawned = false; midGiantDone = false;
  toast(`🌙 ${G.day}일차 밤! 적 ${cnt}마리가 와요.${wk > .3 ? '\n🕳 건물이 부족해서 더 많이 몰려와요!' : ''}${isBoss ? '\n⚠ 보스 등장!' : ''}`);
  if (isBoss) { STORY[G.day] || 0; }
  sfx('boss');
}
// 우주 연출: 'intro' = 시작할 때 운석이 행성으로 날아옴 / 'finale' = 스테이지 10 클리어 시 우주에서 운석이 깨짐
function spaceFx(kind, onDone) {
  if (!document.getElementById('spaceFxCss')) {
    const st = document.createElement('style'); st.id = 'spaceFxCss';
    st.textContent = '#spaceFx{position:fixed;inset:0;z-index:45;pointer-events:none;overflow:hidden;background:radial-gradient(ellipse at 50% 130%,#22346e,#060a1a 72%);opacity:0;transition:opacity .5s}' +
      '#spaceFx.on{opacity:1}' +
      '#spaceFx .s{position:absolute;width:2px;height:2px;background:#fff;border-radius:50%;animation:sfTw 1.4s infinite alternate}' +
      '#spaceFx .pl{position:absolute;left:50%;top:70vh;width:150vmin;height:150vmin;margin:-75vmin 0 0 -75vmin;border-radius:50%;background:radial-gradient(circle at 35% 28%,#b9f2b0,#3f9a62 55%,#1c4a35);box-shadow:0 0 70px 14px rgba(140,230,255,.35)}' +
      '#spaceFx .rk{position:absolute;left:0;top:0;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:42% 58% 52% 48%;background:radial-gradient(circle at 35% 35%,#9b8a78,#4a3d33);box-shadow:0 0 26px 8px rgba(255,130,50,.85);animation:sfFly var(--t) ease-in forwards}' +
      '#spaceFx .fg{position:absolute;left:50%;top:40%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:30%;background:#9b8a78;box-shadow:0 0 10px 3px rgba(255,160,70,.8);animation:sfBurst 1.6s ease-out forwards}' +
      '#spaceFx .fl{position:absolute;left:50%;top:40%;width:50vmin;height:50vmin;margin:-25vmin 0 0 -25vmin;border-radius:50%;background:radial-gradient(#fff,rgba(255,220,140,0) 70%);animation:sfFlash .9s ease-out forwards}' +
      '#spaceFx .msg{position:absolute;left:0;right:0;top:12%;text-align:center;color:#fff;font:900 21px/1.5 system-ui,sans-serif;text-shadow:0 2px 10px #000;opacity:0;animation:sfMsg .6s ease-out .2s forwards}' +
      '@keyframes sfTw{from{opacity:.2}to{opacity:1}}' +
      '@keyframes sfFly{from{transform:translate(82vw,6vh) scale(.5)}to{transform:translate(50vw,38vh) scale(1.1)}}' +
      '@keyframes sfBurst{from{transform:translate(0,0) scale(1);opacity:1}to{transform:translate(var(--dx),var(--dy)) scale(.4) rotate(200deg);opacity:0}}' +
      '@keyframes sfFlash{from{transform:scale(.2);opacity:1}to{transform:scale(2.2);opacity:0}}' +
      '@keyframes sfMsg{to{opacity:1}}';
    document.head.appendChild(st);
  }
  document.getElementById('spaceFx')?.remove();
  const ov = document.createElement('div'); ov.id = 'spaceFx';
  for (let i = 0; i < 70; i++) { const s = document.createElement('span'); s.className = 's'; s.style.left = rnd(0, 100) + '%'; s.style.top = rnd(0, 100) + '%'; s.style.animationDelay = rnd(0, 1.4).toFixed(2) + 's'; ov.appendChild(s); }
  const pl = document.createElement('div'); pl.className = 'pl'; ov.appendChild(pl);
  const msg = document.createElement('div'); msg.className = 'msg'; ov.appendChild(msg);
  const rk = document.createElement('div'); rk.className = 'rk'; ov.appendChild(rk);
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('on'));
  const end = (ms, fn) => setTimeout(fn, ms);
  const close = (ms) => end(ms, () => { ov.classList.remove('on'); end(600, () => { ov.remove(); if (onDone) onDone(); }); });
  if (kind === 'intro') {
    rk.style.setProperty('--t', '3s'); msg.textContent = '☄ 운석이 우리 다이아를 노리고 있어요! 막아 주세요!';
    close(3600);
  } else {
    rk.style.setProperty('--t', '2.2s'); msg.textContent = '🌟 우주에서 운석을 부숴 버렸어요!';
    end(2200, () => {
      rk.remove();
      const fl = document.createElement('div'); fl.className = 'fl'; ov.appendChild(fl);
      for (let i = 0; i < 12; i++) { const f = document.createElement('div'); f.className = 'fg';
        const a = i / 12 * Math.PI * 2; f.style.setProperty('--dx', (Math.cos(a) * rnd(90, 170)).toFixed(0) + 'px'); f.style.setProperty('--dy', (Math.sin(a) * rnd(90, 170)).toFixed(0) + 'px');
        ov.appendChild(f); }
    });
    close(5000);
  }
}
function stageBanner(title, sub) {   // 크게 "클리어!" 문구를 띄워요
  let el = document.getElementById('stageBanner');
  if (!el) {
    const st = document.createElement('style');
    st.textContent = '#stageBanner{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%) scale(.6);z-index:40;text-align:center;pointer-events:none;opacity:0;transition:opacity .35s,transform .45s cubic-bezier(.2,1.4,.4,1);background:linear-gradient(#fff8dc,#ffe08a);border:4px solid #d9a93a;border-radius:24px;padding:14px 26px;box-shadow:0 10px 0 #b8862a,0 18px 30px rgba(60,30,0,.35)} #stageBanner.show{opacity:1;transform:translate(-50%,-50%) scale(1)} #stageBanner b{display:block;font-size:26px;font-weight:900;color:#5a3a00} #stageBanner small{display:block;font-size:14px;font-weight:700;color:#7a5a20;margin-top:4px}';
    document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'stageBanner'; document.body.appendChild(el);
  }
  el.innerHTML = '<b>' + title + '</b><small>' + sub + '</small>';
  el.classList.add('show'); clearTimeout(stageBanner._t);
  stageBanner._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function dawn() {
  mons.forEach(m => { if (!m.dead) { m.state = 'flee'; } });
  bossRef = null; $('bossBar').style.display = 'none';
  if (G.day === 10) spaceFx('finale');
  G.day += 1; mapExpand(); applyStageTheme();
  if (G.down) {   // 쓰러졌던 캐릭터가 스테이지 클리어와 함께 절반 체력으로 살아나요
    G.down = false; freeze = false; G.hp = Math.max(1, Math.ceil(G.maxHp / 2));
    const dov = $('downOv'); if (dov) dov.remove();
    toast('💚 친구 덕분에 다시 일어났어요!'); trackMe();
  }
  stageBanner(`☀ ${G.day - 1}일차 클리어!`, `${G.day}일차 아침이 밝았어요`);
  screenFlash('#ffe9a0', .45, .9); glowAt(px, 2.5, pz, 9, 0xffe9a0, 1.2); hitStop(.1);
  weather = 'clear';
  profile.maxDay = Math.max(profile.maxDay || 0, G.day - 1); saveProfile();
  G.lostGems = 0;
  persistRun();
  toast(`☀ ${G.day}일차 아침이에요!`);
  pendingRelicDay = G.day - 1;
  setTimeout(() => { if (!modalOpen) showRelics(G.day - 1); }, 350);
}
function updateCycle(dt) {
  G.cycT += dt; if (G.cycT >= CYCLE) G.cycT -= CYCLE;
  if (G.endless) G.cycT = DAY_LEN + 4;
  const nf = nightF(G.cycT), now = nf > .5;
  if (now && !prevNight) startNight();
  let holdNight = false;
  if (!now && prevNight && giantRef && giantRef.kingGate && giantRef.hp > 0 && !giantRef.dead) {
    G.cycT = DAY_LEN + 10; holdNight = true; // 거대 좀비 왕을 쓰러뜨리기 전까지 새벽이 오지 않는다
    if (!updateCycle.warned) { updateCycle.warned = true; toast('👑 거대 좀비 왕을 쓰러뜨려야 다음 날로 넘어가요!'); }
  } else if (!now && prevNight) { dawn(); updateCycle.warned = false; }
  prevNight = holdNight ? true : now;
  const th = sunTheta(G.cycT);
  const sunPos = new THREE.Vector3(-Math.cos(th) * 70, Math.sin(th) * 70, 35);
  sun.position.copy(sunPos); sun.target.position.set(0, 0, 0);
  const sunUp = clamp(Math.sin(th) * 1.4 + .15, 0, 1);
  sun.intensity = lerp(sunUp * 1.05, .06, nf);
  scene.children.forEach(c => { if (c.isHemisphereLight) c.intensity = lerp(.85, .34, nf); if (c.isHemisphereLight) c.color.copy(DAY_HEMI).lerp(NIGHT_HEMI, nf); });
  const dayW = sstep(.15, .5, sunUp);
  skyDay.opacity = (1 - nf) * dayW; skyDusk.opacity = (1 - nf) * (1 - dayW); skyNight.opacity = nf;
  scene.fog.color.copy(snowOn ? SNOW_FOG : DAY_FOG).lerp(NIGHT_FOG, nf);
  const fk = 1 - Math.pow(.05, Math.max(dt, .0001));
  scene.fog.near = lerp(scene.fog.near, weather === 'fog' ? 8 : 42, fk);
  scene.fog.far = lerp(scene.fog.far, weather === 'fog' ? 34 : 92, fk);
  starMat.opacity = nf * .9;
  sunMesh.position.copy(sunPos.clone().normalize().multiplyScalar(120)); sunMesh.visible = sunUp > .05;
  moonMesh.position.copy(sunPos.clone().normalize().multiplyScalar(-120)); moonMesh.visible = nf > .25;
  $('dayChip').textContent = (G.endless ? '♾ ' + (G.wave || 1) + '웨이브' : G.day + '일차') + ' · ' + (now ? '🌙 밤' + (weather === 'rain' ? ' 🌧' : weather === 'fog' ? ' 🌫' : '') : '☀ 낮') + ' · 🌳 ' + Math.ceil(G.coreHp == null ? 200 : G.coreHp) + '/200 · 적 ' + mons.length;
  winMats.forEach(m => m.emissiveIntensity = nf * 1.1);
  towerLamps.forEach(m => m.emissiveIntensity = nf * 1.4);
  for (const k in G.b) { if (G.b[k].t !== 'LAMP') continue; const lm = bmesh[k]; if (!lm || !lm.userData.bulb) continue; lm.userData.bulb.emissiveIntensity = nf * 1.8 + .2; lm.userData.halo.material.opacity = nf * .6; }
  if (G.endless) {
    waveT -= dt;
    if (spawnQ <= 0 && waveT <= 0) {
      G.wave = (G.wave || 1) + 1; spawnQ = Math.min(60, 6 + G.wave * 3); spawnT = .2; waveT = 26;
      toast('🌊 ' + G.wave + '웨이브! 적 ' + spawnQ + '마리');
      if (G.wave > (profile.bestWave || 0)) { profile.bestWave = G.wave; saveProfile(); }
    }
  }
  if (spawnQ > 0) {
    spawnT -= dt;
    if (spawnT <= 0) {
      const boss = !G.endless && G.day % 5 === 0 && !bossSpawned && spawnQ === Math.min(40, 6 + G.day * 3);
      if (boss) { bossSpawned = true; spawnMon(G.day >= 10 ? 'snow_wolf' : (G.day % 10 === 5 ? 'skeleton_king' : 'mushroom_queen'), true); if (G.day < 10) spawnGiant('zombie_king'); }
      else if (!G.endless && !midGiantDone && spawnQ === Math.floor(Math.min(40, 6 + G.day * 3) / 2)) { midGiantDone = true; const gn = Math.min(7, 1 + aptLvSum()); for (let gi = 0; gi < gn; gi++) spawnMidGiant(); }
      else spawnMon();
      spawnQ -= 1; spawnT = Math.max(.14, .6 - G.day * .05);
    }
  }
  return nf;
}

/* ================= 건설 ================= */
function setBuildTarget(x, z) { buildTarget = { x: Math.round(x), z: Math.round(z) }; }
function canBuildAt(x, z) {
  if (Math.abs(x) > BUILD_R || Math.abs(z) > BUILD_R) return false;
  if (Math.hypot(x - MAYOR.x, z - MAYOR.z) < 1.5 || Math.hypot(x - px, z - pz) < 1.1) return false;
  const has = !!G.b[bkey(x, z)];
  if (selType === 'MOVE') return G.carry ? (!has && G.carry !== bkey(x, z)) : (has && G.b[bkey(x, z)].t === 'LAMP');
  return selType === 'REMOVE' ? has : !has;
}
let ghostMats = [];   // 미리보기에서 만든 복사 재질 (다시 만들 때 버려요)
function refreshGhostB() {
  if (ghostB) { scene.remove(ghostB); ghostB = null; }
  ghostMats.forEach(m => { try { m.dispose(); } catch (e) { } }); ghostMats = [];
  if (selType === 'REMOVE') return;
  try { ghostB = makeBuilding(selType === 'MOVE' ? 'LAMP' : selType, 0, 0); }
  catch (e) { ghostB = null; toast('⚠ 건물 미리보기를 만들지 못했어요'); return; }
  ghostB.traverse(o => { if (o.isMesh) { const m = o.material.clone(); m.transparent = true; m.opacity = .5; m.depthWrite = false; o.material = m; ghostMats.push(m); o.castShadow = false; o.receiveShadow = false; } });
  ghostB.visible = false; scene.add(ghostB);
}
function canPay(c) { return G.res.wood >= c.wood && G.res.stone >= (c.stone || 0) && (G.res.fiber || 0) >= (c.fiber || 0); }
function pay(c) { G.res.wood -= c.wood; G.res.stone -= (c.stone || 0); G.res.fiber -= (c.fiber || 0); }
function placeAt(x, z) {
  if (!buildTarget) return;
  if (Math.abs(x) > BUILD_R || Math.abs(z) > BUILD_R) { toast('이 땅에는 지을 수 없어요.'); return; }
  const k = bkey(x, z);
  if (Math.hypot(x - MAYOR.x, z - MAYOR.z) < 1.5 || Math.hypot(x - px, z - pz) < 1.1) { toast('이 자리에는 지을 수 없어요.'); return; }
  if (selType !== 'REMOVE' && (Math.hypot(x, z) < 4.3 || (selType === 'APT' && Math.hypot(x + 3.5, z) < 4.6))) { toast('보석 근처에는 지을 수 없어요.'); return; }
  if (selType === 'MINE' && Object.values(G.b).filter(b => b.t === 'MINE').length >= 3) { toast('광산은 최대 3개까지 지을 수 있어요.'); return; }
  if (selType === 'WEAVE' && Object.values(G.b).filter(b => b.t === 'WEAVE').length >= 3) { toast('직조 집은 최대 3개까지 지을 수 있어요.'); return; }
  if (selType === 'MOVE') {   // 🚚 전등 옮기기: 전등을 집고, 원하는 빈 땅에 내려놓아요
    if (!G.carry) {
      if (!G.b[k] || G.b[k].t !== 'LAMP') { toast('옮길 전등을 눌러 주세요.'); return; }
      G.carry = k; puff(x, z, 6, 0xffe08a); sfx('place'); vib('place');
      toast('🏮 전등을 들었어요. 원하는 빈 땅을 눌러 내려놓으세요.'); return;
    }
    if (G.carry === k) { G.carry = null; toast('전등을 그 자리에 두었어요.'); return; }
    if (G.b[k]) { toast('이미 지어진 땅이에요.'); return; }
    const from = G.carry, old = G.b[from]; G.carry = null;
    if (!old) return;
    delete G.b[from]; removeBuildingMesh(from); netSend('remove', { k: from });
    G.b[k] = old; netSend('build', { k, t: 'LAMP', hp: old.hp });
    const m = makeBuilding('LAMP', x, z); world.add(m); bmesh[k] = m;
    m.scale.setScalar(.01); m.position.y = 2.2;
    tweenTo(.01, 1, .5, v => m.scale.setScalar(v), 'back');
    tweenTo(2.2, 0, .5, v => { m.position.y = v; }, 'out');
    puff(x, z, 10, 0xffe08a); sfx('place'); vib('place'); toast('🏮 전등을 옮겼어요!'); persistRun(); return;
  }
  if (selType === 'REMOVE') {
    if (!G.b[k]) { toast('철거할 것이 없어요.'); return; }
    const g = G.b[k].g || 0; G.res.gems += g;
    removeBuildingMesh(k); delete G.b[k]; netSend('remove', { k });
    puff(x, z, 8); toast(g ? `철거했어요. 보석 ${g}개를 돌려받았어요.` : '철거했어요.');
    persistRun(); return;
  }
  if (G.b[k]) { toast('이미 지어진 땅이에요. 🧹로 먼저 철거하세요.'); return; }
  const c = BUILD[selType];
  if (!canPay(c)) { toast(`재료가 부족해요. 🪵${c.wood} 🪨${c.stone}${c.fiber ? ' 🌿' + c.fiber : ''} 필요해요.`); return; }
  pay(c);
  const b = { t: selType, hp: c.hp + relicCount('stone') * 10, g: 0 }; G.b[k] = b;
  netSend('build', { k, t: selType, hp: b.hp });
  const m = makeBuilding(selType, x, z); world.add(m); bmesh[k] = m;
  m.scale.setScalar(.01); m.position.y = 2.2;
  tweenTo(.01, 1, .5, v => m.scale.setScalar(v), 'back');
  tweenTo(2.2, 0, .5, v => { m.position.y = v; }, 'out');
  puff(x, z, 10, 0xf6e6c0); sfx('place'); vib('place');
  toast(`${c.name}을(를) 지었어요!`); persistRun();
}

/* ================= 입력 ================= */
function twoTap(btn, msg, fn) {
  const label = btn.textContent; let armed = false;
  btn.onclick = () => {
    if (!loadRun() || armed) { armed = false; btn.textContent = label; fn(); return; }
    armed = true; btn.textContent = msg;
    setTimeout(() => { if (armed) { armed = false; btn.textContent = label; } }, 4000);
  };
}
function setupInput() {
  const pad = $('pad'), knob = $('knob');
  const joyMove = (cx, cy) => {
    const r = pad.getBoundingClientRect(); let dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy), m = 48; if (d > m) { dx = dx / d * m; dy = dy / d * m; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    const k = Math.hypot(dx, dy) / m, ang = Math.atan2(dy, dx), kk = k < .12 ? 0 : (k - .12) / .88;
    joy.x = Math.cos(ang) * kk; joy.z = Math.sin(ang) * kk;
  };
  let joyId = null;
  pad.addEventListener('pointerdown', e => { e.stopPropagation(); joyId = e.pointerId; pad.setPointerCapture && pad.setPointerCapture(e.pointerId); joyMove(e.clientX, e.clientY); });
  pad.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e.clientX, e.clientY); });
  const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; joy.x = 0; joy.z = 0; knob.style.transform = 'translate(0px,0px)'; };
  pad.addEventListener('pointerup', joyEnd); pad.addEventListener('pointercancel', joyEnd);
  window.addEventListener('keydown', e => { if (e.key.startsWith('Arrow')) e.preventDefault(); keys[e.key.toLowerCase()] = true; });
  document.addEventListener('pointerdown', e => { if (!e.target.closest || !e.target.closest('input,textarea')) { const a = document.activeElement; if (a && a.blur && a !== document.body && !a.closest('input,textarea')) a.blur(); } }, true);
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; if (e.code === 'KeyA' || e.code === 'KeyE') { attackHeld = false; chargeRelease(false); } });
  // 왼손 행동 키: A 공격 · S 스킬 · D 건설 · Z 채집 · X 대화/거래 · Space 건물 놓기
  const KEY_ACT = { KeyA: 'bHit', KeyE: 'bHit', KeyS: 'bSkill', KeyD: 'bBuild', KeyZ: 'bGather', KeyX: 'bTalk', KeyF: 'bSnipe' };
  window.addEventListener('keydown', e => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (!running || modalOpen || e.repeat) return;
    if (e.code === 'KeyQ') { e.preventDefault(); camTurn(-1); return; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { flashKey('Shift', '달리기'); return; }
    if (e.code === 'F3') { e.preventDefault(); toggleFps(); return; }
    if (e.code === 'KeyC') { scopeLock = !scopeLock; flashKey('C', scopeLock ? '줌 조준' : '줌 끔'); return; }
    if (e.code === 'Space' && sniper) { e.preventDefault(); fireSniper(); return; }
    if (e.code === 'Space' && !buildMode) { e.preventDefault(); doJump(); return; }
         if (e.code === 'Space' && buildMode && buildTarget) { e.preventDefault(); flashKey('Space', '건물 놓기'); placeAt(buildTarget.x, buildTarget.z); return; }
    const id = KEY_ACT[e.code]; if (!id) return;
    const el = $(id); if (!el || el.classList.contains('hide-btn') || el.offsetParent === null) return;
    e.preventDefault();
    el.classList.add('kpress'); setTimeout(() => el.classList.remove('kpress'), 140);
    flashKey(e.code.replace('Key', ''), (el.title || '').replace(/\s*\(.*\)$/, ''));
    if (id === 'bHit') { if (!e.repeat) { chargeEl = $('bHit'); chargeStart(false); } return; }
    el.click();
  });
  { const bs = document.createElement('button'); bs.id = 'bSnipe'; bs.className = 'rb skill hide-btn'; bs.innerHTML = '<span id="snipeTxt">🎯 저격</span>'; bs.title = '저격 (F)'; $('bSkill').insertAdjacentElement('afterend', bs); bs.onclick = toggleSniper; wireMovableBtn(bs); }
  [['bHit', 'A'], ['bSkill', 'S'], ['bBuild', 'D'], ['bGather', 'Z'], ['bTalk', 'X'], ['bSnipe', 'F']].forEach(([id, k]) => { $(id).dataset.key = k; });
  // 시선 회전 키 안내는 Q/E 입력 시 표시
  // 건축 중에 다른 버튼을 누르면 건축 모드가 꺼져요
  ['bHit', 'bPadAtk', 'bSkill', 'bJump', 'bRun', 'bTalk', 'bGather', 'bUp', 'bSnipe', 'pause', 'topTog', 'bFp', 'bXh', 'bRunLock', 'bCodex'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('pointerdown', () => { if (buildMode) { buildMode = false; $('palette').style.display = 'none'; $('bBuild').classList.remove('on'); $('bBuild').textContent = '🔨 건설'; ghost.visible = false; if (ghostB) ghostB.visible = false; } }, true);
  });
  $('bJump').addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); doJump(); });
  $('bJump').onclick = () => {}; setupHitGrip();
  $('bHit').title = '공격 (A · E)'; $('bSkill').title = '스킬 (S)'; $('bBuild').title = '건설 (D) · 놓기 Space';
  $('bGather').title = '채집 (Z)'; $('bTalk').title = '대화/거래 (X)';
  // 화면 드래그로 카메라, 짧게 누르면 공격/건설
  let ptr = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
  const pickGround = (cx, cy) => { const r = cv.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane, hitP) ? { x: hitP.x, z: hitP.z } : null; };
  app.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('pointerup', e => { if (e.button === 2) scopeHold = false; });
window.addEventListener('pointercancel', () => { scopeHold = false; });
app.addEventListener('pointerdown', e => {
  if (e.button === 2) { scopeHold = true; e.preventDefault(); return; }
  if (e.button === 0 && scopeOn() && e.target && e.target.tagName === 'CANVAS' && mode === 'FIELD' && !modalOpen) { attackNow(true); }
    if (e.target.closest('button,#palette,#dialog,.modal,#pad,input')) return;
    ptr = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t0: performance.now(), mv: false };
    if (buildMode && !fpMode) { const p = pickGround(e.clientX, e.clientY); if (p) setBuildTarget(p.x, p.z); }
  });
  window.addEventListener('pointermove', e => {
    if (buildMode && !fpMode && e.pointerType === 'mouse') { const p = pickGround(e.clientX, e.clientY); if (p) setBuildTarget(p.x, p.z); }
    if (!ptr || e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.lx, dy = e.clientY - ptr.ly;
    if (Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > 8) ptr.mv = true;
    if (ptr.mv) { camYawT = null; camYaw -= dx * .0065; camPitch = clamp(camPitch - dy * .0045, -.9, 1.5); lastDrag = gameT; }
    if (buildMode && !fpMode && e.pointerType === 'mouse') { const p = pickGround(e.clientX, e.clientY); if (p) setBuildTarget(p.x, p.z); }
    ptr.lx = e.clientX; ptr.ly = e.clientY;
  });
  window.addEventListener('pointerup', e => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const tap = !ptr.mv && performance.now() - ptr.t0 < 350;
    if (tap && mode === 'FIELD' && !modalOpen) {
      if (buildMode) { if (buildTarget) placeAt(buildTarget.x, buildTarget.z); }
      else { attackNow(true); }
    }
    ptr = null;
  });
  // 버튼
  const runBtn = $('bRun');
  runBtn.addEventListener('pointerdown', e => { e.stopPropagation(); runKey = true; runBtn.classList.add('on'); });
  const runOff = () => { runKey = false; runBtn.classList.remove('on'); };
  const rl = $('bRunLock');
  if (rl) rl.onclick = () => { runLock = !runLock; rl.textContent = runLock ? '🏃 고정 켬' : '🏃 고정 끔'; rl.style.background = runLock ? '#ffe2a8' : ''; };
  window.addEventListener('pointerup', runOff); window.addEventListener('pointercancel', runOff);
  // 공격 버튼: 누르고 있으면 기를 모으고, 떼면 발사 (짧게 누르면 일반 공격)
  // 공격 버튼을 누른 채 손가락(마우스)을 움직이면, 그 자리에 번개가 떨어져요
  window.addEventListener('pointermove', e => {
    if (!chargeOn || chargePid === null || e.pointerId !== chargePid) return;
    const hb = chargeEl || $('bHit'), r = hb ? hb.getBoundingClientRect() : null;
    const cx = r ? r.left + r.width / 2 : chargeSX, cy = r ? r.top + r.height / 2 : chargeSY;
    const dx = e.clientX - cx, dy = e.clientY - cy, L = Math.hypot(dx, dy);
    if (L < 6) { aimOverride = null; return; }
    chargeMoved = true;
    // 방향키처럼: 끌어간 방향 = 화면 기준 방향, 많이 끌수록 멀리 떨어뜨려요
    const c = CLS[G.cls], dist = Math.min(1, L / 60) * c.rng * 1.4 + 1.2;
    const nx = dx / L, ny = dy / L;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const wx = rx * nx + fx * (-ny), wz = rz * nx + fz * (-ny);
    aimOverride = { x: px + wx * dist, z: pz + wz * dist };
  });
  const wireAttack = (id, assist) => {
    const el = $(id);
    el.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      if (document.body.classList.contains('btn-edit')) return;   // 위치 조작 중에는 공격하지 않아요
      e.preventDefault(); pointerFired = true;
      if (id === 'bPadAtk') { if (mode === 'FIELD' && !modalOpen && !buildMode) { aimOverride = null; fireLightningLine(); } return; }   // 왼쪽: 누르는 순간 조준선으로 곧장 (기 모으기·끌기 없음)
      chargePid = e.pointerId; chargeEl = el; chargeSX = e.clientX; chargeSY = e.clientY; chargeStart(assist);
    });
    const rel = () => { chargeRelease(assist); setTimeout(() => { pointerFired = false; }, 60); };
    el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel);
    el.onclick = () => { if (document.body.classList.contains('btn-edit')) return; if (pointerFired) { pointerFired = false; return; } if (id === 'bPadAtk') { fireLightningLine(); return; } chargeEl = el; chargeStart(assist); chargeRelease(assist); };
  };
  wireAttack('bHit', false); wireAttack('bPadAtk', true);
  // 채팅 입력 · 빠른 말풍선 · 음성 입력
  const sendIn = () => { const inp = $('chatIn'); sendChat(inp.value); inp.value = ''; };
  $('bChatSend').onclick = sendIn;
  $('chatTog').onclick = () => { const b = $('chatBody'); const open = b.style.display === 'none'; b.style.display = open ? 'flex' : 'none'; $('chatTog').textContent = open ? '💬 채팅 ▴' : '💬 채팅 ▾'; };
  $('chatIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendIn(); } });
  document.querySelectorAll('#chatBox .qk').forEach(b => b.onclick = () => sendChat(b.dataset.q));
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  $('bVoice').onclick = () => {
    if (voiceRec) { voiceRec.stop(); return; }
    if (!SR) { toast('이 브라우저는 음성 입력을 지원하지 않아요. 글자로 입력해 주세요.'); return; }
    const rec = new SR(); rec.lang = 'ko-KR'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    voiceRec = rec; $('bVoice').textContent = '🔴';
    rec.onresult = e => { const t = e.results[0] && e.results[0][0].transcript; sendChat(t); };
    rec.onerror = e => {
      const msg = { 'not-allowed': '마이크 권한이 막혀 있어요. 주소창의 권한을 허용하거나 새 탭에서 열어 주세요.', 'service-not-allowed': '이 화면에서는 음성 인식을 쓸 수 없어요. 새 탭에서 열어 주세요.', 'no-speech': '말소리가 들리지 않았어요. 다시 눌러 말해 주세요.', 'audio-capture': '마이크를 찾을 수 없어요.', 'network': '음성 인식 서버에 연결할 수 없어요.' }[e.error] || '음성을 알아듣지 못했어요.';
      toast(msg);
    };
    rec.onend = () => { voiceRec = null; $('bVoice').textContent = '🎤'; };
    try { rec.start(); } catch (e) { voiceRec = null; $('bVoice').textContent = '🎤'; }
  };
  $('bSkill').onclick = useSkill;
  $('bBuild').onclick = () => {
    buildMode = !buildMode;
    $('palette').style.display = buildMode ? 'flex' : 'none';
    $('bBuild').classList.toggle('on', buildMode);
    $('bBuild').textContent = buildMode ? '✅ 건설 끝' : '🔨 건설';
    if (buildMode && !buildTarget) setBuildTarget(px + Math.sin(rotY) * 3, pz + Math.cos(rotY) * 3);
    if (!buildMode) { ghost.visible = false; if (ghostB) ghostB.visible = false; }
    else { refreshGhostB(); toast('건물을 고르고 땅을 톡 누르면 바로 지어져요.'); }
  };
  (function palSetup() {
    const pal = $('palette'), h = $('palGrip'), op = $('palOp'); if (!pal || !h || !op) return;
    let st = {}; try { st = JSON.parse(localStorage.getItem('farm_pal') || '{}'); } catch (e) { }
    const save = () => { try { localStorage.setItem('farm_pal', JSON.stringify(st)); } catch (e) { } };
    const apply = () => {
      pal.style.opacity = (st.op || 100) / 100; op.value = st.op || 100;
      if (st.x != null) {
        pal.style.left = Math.max(0, Math.min(innerWidth - 80, st.x)) + 'px'; pal.style.top = Math.max(0, Math.min(innerHeight - 60, st.y)) + 'px';
        pal.style.right = 'auto'; pal.style.bottom = 'auto'; pal.style.transform = 'none'; pal.style.width = 'max-content'; pal.style.maxWidth = '92vw';
      }
    };
    apply();
    op.addEventListener('input', () => { st.op = +op.value; apply(); save(); });
    op.addEventListener('pointerdown', e => e.stopPropagation());
    let dr = null;
    h.addEventListener('pointerdown', e => { const r = pal.getBoundingClientRect(); dr = { sx: e.clientX, sy: e.clientY, x: r.left, y: r.top }; h.setPointerCapture(e.pointerId); e.preventDefault(); });
    h.addEventListener('pointermove', e => {
      if (!dr) return;
      st.x = Math.round(dr.x + e.clientX - dr.sx); st.y = Math.round(dr.y + e.clientY - dr.sy); apply();
    });
    const end = () => { if (dr) { dr = null; save(); } };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  })();
  document.querySelectorAll('.pi').forEach((el, i) => { if (i < 9 && !el.querySelector('.kn')) { const b = document.createElement('b'); b.className = 'kn'; b.textContent = String(i + 1); b.style.cssText = 'position:absolute;top:-6px;left:-4px;background:#3a2f36;color:#fff;border-radius:8px;padding:0 5px;font-size:11px;line-height:16px'; el.style.position = 'relative'; el.prepend(b); } });
  window.addEventListener('keydown', e => {   // 건설 모드에서 1~8 숫자 키로 건물을 골라요
    if (!buildMode || modalOpen || !/^[1-9]$/.test(e.key) || (e.target && e.target.closest && e.target.closest('input,textarea'))) return;
    const el = document.querySelectorAll('.pi')[+e.key - 1]; if (el) { e.preventDefault(); el.click(); flashKey(e.key, el.textContent.replace(/\d+/, '').trim().slice(0, 6)); }
  });
  document.querySelectorAll('.pi').forEach(el => { el.onclick = () => { selType = el.dataset.t; document.querySelectorAll('.pi').forEach(x => x.classList.toggle('on', x === el)); if (buildMode) refreshGhostB(); }; });
  $('bGather').onclick = () => { const n = nearestNode(2.6); if (n) harvest(n); };
  $('bTalk').onclick = () => {
    if (mode !== 'FIELD') return;
    const nm = Math.hypot(px - MAYOR.x, pz - MAYOR.z) < 2.8, nv = nearVillager(3.2);
    if (nm || !nv) { storyQueue = (STORY[G.day] || GENERIC).slice(); openDialog(); } else tradeWith(nv);
  };
  $('bUp').onclick = () => { const nb = nearBuilding(3.2); if (nb && mode === 'FIELD') upgradeBuilding(nb.k); };
  $('bCodex').onclick = () => { if (mode === 'FIELD' && !modalOpen) openCodex(); };
  $('bCodexClose').onclick = closeCodex;

  $('bNext').onclick = () => { if (storyQueue.length) openDialog(); else closeDialog(); };
  // 대화 중에는 화면(대화창)을 누르거나 Enter·Space로 다음 줄로 넘어가요
  $('dialog').addEventListener('click', e => { if (e.target.closest('button')) return; $('bNext').click(); });
  window.addEventListener('keydown', e => {
    if (mode !== 'TALK' || (e.key !== 'Enter' && e.key !== ' ')) return;
    if (e.target && e.target.closest && e.target.closest('input,textarea')) return;
    e.preventDefault(); $('bNext').click();
  });
  $('pause').onclick = () => { if (!modalOpen) openPause(); };
  $('bResume').onclick = closePause;
  $('bReset').onclick = () => { if (confirm('처음부터 다시 시작할까요?')) { localStorage.removeItem(RUN_KEY); location.reload(); } };
  $('bFp').onclick = () => { fpMode = !fpMode; syncSettingsBtns(); toast(fpMode ? '1인칭 시점이에요. 몰입해 보세요!' : '3인칭 시점으로 돌아왔어요.'); };
  $('bCodex').onclick = () => { if (mode === 'FIELD' && !modalOpen) openCodex(); };
  $('bInvite').onclick = openInvite; $('bCopy').onclick = copyInvite; $('bShare').onclick = shareInvite;
  $('friendChip').onclick = openInvite; $('waitChip').onclick = () => { const ids = Object.keys(NET.waitList); if (!ids.length) return; ids.forEach(id => netSend('admit', { to: id })); NET.waitList = {}; updWaitChip(); toast('🌿 대기 중인 친구들을 들여보냈어요'); };
  $('hudTog').onclick = () => { try { $('hud').classList.toggle('collapsed'); } catch (e) { showErr('접기: ' + e.message); } };
  $('bXh').onclick = () => { xhOn = !xhOn; $('bXh').textContent = xhOn ? '🎯 조준점 켬' : '🎯 조준점 끔'; };
  $('topTog').onclick = () => { const f = $('topR').classList.toggle('folded'); $('topTog').textContent = f ? '☰' : '✕'; };
  $('bSound').onclick = () => { settings.sfx = !settings.sfx; saveSettings(); syncSettingsBtns(); if (settings.sfx) { audio(); sfx('place'); } };
  $('bVib').onclick = () => { settings.vib = !settings.vib; saveSettings(); syncSettingsBtns(); if (settings.vib) vib('place'); };
  $('bAgain').onclick = () => { localStorage.removeItem(RUN_KEY); location.reload(); };
  $('bMenu').onclick = () => { location.reload(); };
  // 이름 · 직업 · 시작
  document.querySelectorAll('#colorPick .sw').forEach(x => x.classList.toggle('on', +x.dataset.k === (profile.color | 0)));
  document.querySelectorAll('#colorPick .sw').forEach(b => b.onclick = () => {
    profile.color = +b.dataset.k; saveProfile(); tintPlayer();
    document.querySelectorAll('#colorPick .sw').forEach(x => x.classList.toggle('on', x === b));
  });
  document.querySelectorAll('#classPick .cbtn').forEach(b => b.onclick = () => {
    profile.cls = b.dataset.c; saveProfile();
    document.querySelectorAll('#classPick .cbtn').forEach(x => x.classList.toggle('on', x === b));
    $('storyLine').textContent = { mage: '마법사: 번개로 여럿을 한 번에 묶어요.', archer: '궁수: 화살비로 넓은 곳을 쓸어요.', warrior: '전사: 가까이서 회전 베기로 밀어내요.' }[profile.cls];
  });
  // 모험 시작: 저장된 모험이 있으면 이어서, 없으면 새로 시작
  $('bStart').onclick = () => startGame(!!loadRun());
  // 새로 시작 / 함께하기: 저장 기록이 있으면 한 번 더 눌러야 실행 (확인창 confirm()은 샌드박스에서 막힐 수 있어 사용하지 않음)
  twoTap($('bNew'), '⚠ 한 번 더 누르면 기록이 지워져요', () => { localStorage.removeItem(RUN_KEY); startGame(false); });
  $('bCoop').onclick = () => openLobby();   // 👥 함께하기: 먼저 대기실(방)을 만들고, 방장이 시작하면 5초 뒤에 함께 시작해요
  $('bHome').onclick = goHome;
  $('bLobbyStart').onclick = () => (NET.host ? hostStart() : guestStart());
  $('bReady').onclick = () => {
    NET.ready = !NET.ready; if (NET.ch) NET.ch.track(presenceMeta());
    toast(NET.ready ? '✅ 준비 완료! 방장 화면의 시작 버튼에 불이 들어와요' : '준비를 취소했어요');
    renderLobby();
  };
  $('bLobbyShare').onclick = shareLink;
  $('bLobbyCopy').onclick = copyInvite;
  $('bLobbyHome').onclick = goHome;
  $('bContinue').onclick = () => startGame(true);
  // 홈 화면의 업데이트 확인: 설정의 업데이트 확인과 같은 기능을 바로 실행해요
  $('bHomeUpd').onclick = () => { try { const sb = $('bSettings'); if (sb) sb.click(); } catch (e) { } setTimeout(() => { try { checkUpdate(); } catch (e) { } }, 50); };
  // 설정 > 공격·스킬 버튼 위치 조작: 끌어서 옮기고 완료를 누르면 이 기기에 저장돼요
  $('bBtnEdit').onclick = () => {
    const pm = $('pauseModal'); if (pm && pm.classList.contains('show') && typeof closePause === 'function') closePause();
    document.querySelectorAll('.modal.show').forEach(m => m.classList.remove('show'));
    document.body.classList.add('btn-edit'); $('btnEditBar').style.display = 'flex';
    toast('공격·스킬 버튼을 끌어서 원하는 자리에 두세요');
  };
  $('bBtnEditDone').onclick = () => { document.body.classList.remove('btn-edit'); $('btnEditBar').style.display = 'none'; toast('버튼 위치를 저장했어요'); };
  $('bBtnReset').onclick = () => {
    ['bHit', 'bPadAtk', 'bSkill', 'bJump', 'bRun', 'bSnipe'].forEach(id => { try { localStorage.removeItem('farm-btnpos-' + id); } catch (e) { } });
    layoutByOrientation(); toast('버튼을 기본 위치로 되돌렸어요');
  };
  $('bJoin').onclick = () => {
    // 초대 링크를 통째로 붙여넣어도 6자리 코드만 골라내요
    const code = (($('joinCode').value || '').match(/\d{6}/) || [])[0] || '';
    if (!ROOM_RE.test(code)) { toast('초대 링크나 6자리 코드를 붙여넣어 주세요'); return; }
    const nk = (($('joinNick').value || '').trim() || nickOf()).slice(0, 10);
    if (!nk) { toast('아이디를 입력해 주세요'); $('joinNick').focus(); return; }
    profile.nick = nk; saveProfile(); $('nick').value = nk; $('joinNick').value = nk;
    netPending = code; enterWaiting();
  };
  $('nick').value = profile.nick || ''; $('joinNick').value = profile.nick || '';
  $('nick').addEventListener('input', () => { profile.nick = $('nick').value.trim().slice(0, 10); saveProfile(); });
}
// 나무·돌·덤불을 쓰러뜨려 아이템을 얻습니다 (벌목 버튼, 공격 키 모두 이 함수를 씀)
function harvest(n) {
  n.alive = false;
  const gain = 1 + relicCount('seed');
  if (n.kind === 'tree') { G.res.wood += gain; n.rt = 40; toast('🪵 나무 +' + gain); }
  else if (n.kind === 'rock') { G.res.stone += gain; n.rt = 60; toast('🪨 돌 +' + gain); }
  else { G.res.fiber += 1; n.rt = 30; toast('🌿 섬유 +1'); }
  tweenTo(1, 0, .3, v => n.g.scale.setScalar(Math.max(.001, v)), 'in');
  puff(n.g.position.x, n.g.position.z, 6, n.kind === 'rock' ? 0xd9d4c8 : 0xc9e6a2);
  persistRun();
}
// 조준(카메라 방향 또는 캐릭터 정면)에 있는 가장 가까운 채집물 — 멀리서도 쓰러뜨릴 수 있어요
function aimNode(maxD) {
  let best = null, bs = 1e9;
  const aiming = scopeOn() || sniper;
  const fx = aiming ? -Math.sin(camYaw) : Math.sin(rotY), fz = aiming ? -Math.cos(camYaw) : Math.cos(rotY);
  for (const kind in nodes) for (const n of nodes[kind]) {
    if (!n.alive) continue;
    const dx = n.g.position.x - px, dz = n.g.position.z - pz, d = Math.hypot(dx, dz);
    if (d > maxD || d < .01) continue;
    const dot = (dx * fx + dz * fz) / d; if (dot < .55) continue;
    const sc = d * (2 - dot); if (sc < bs) { bs = sc; best = n; }
  }
  return best;
}
function nearestNode(maxD) {
  let best = null, bd = maxD;
  for (const kind in nodes) for (const n of nodes[kind]) {
    if (!n.alive) continue;
    const d = Math.hypot(n.g.position.x - px, n.g.position.z - pz);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}
function syncSettingsBtns() { $('bFp').textContent = fpMode ? '👁 1인칭' : '👁 3인칭'; $('bSound').textContent = settings.sfx ? '🔊 소리 켬' : '🔇 소리 끔'; $('bVib').textContent = settings.vib ? '📳 진동 켬' : '📴 진동 끔'; }
function ensureRoom() {
  if (NET.code && NET.ch) return Promise.resolve(true);   // 이미 방에 있으면 그 방을 그대로 써요
  if (!G.room) G.room = makeRoomCode();
  persistRun();
  return netCreateRoom(G.room).then(ok => {
    if (!ok) { toast('방 만들기에 실패했어요. 잠시 후 다시 눌러 주세요.'); return false; }
    netConnect(G.room); return true;
  });
}
// 초대 링크: claude.ai 안에서는 아티팩트 주소, 독립 사이트에서는 지금 주소를 그대로 써요
const PUBLIC_APP_URL = /claude\.ai$/.test(location.hostname) ? 'https://claude.ai/artifact/7Yvq77hcn7N4UBNfpBqaB1' : location.href.split('#')[0];
function inviteLink() {
  const useHere = /^https?:/.test(location.protocol) && !/claude/i.test(location.hostname);
  return (useHere ? location.href.split('#')[0] : PUBLIC_APP_URL) + '#room=' + (NET.code || (G && G.room));
}
// 복사: 보안 연결이면 클립보드, 아니면 임시 입력칸으로 복사. 그래도 안 되면 링크를 화면에 띄워요
function copyText(t) {
  const fallback = () => {
    const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    if (ok) toast('📋 초대 링크를 복사했어요'); else showLinkBox(t);
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(() => toast('📋 초대 링크를 복사했어요'), fallback);
  else fallback();
}
function showLinkBox(t) { const b = $('inviteBox'); if ($('inviteLink')) $('inviteLink').textContent = t; if (b) b.style.display = 'block'; if ($('inviteCode')) $('inviteCode').textContent = NET.code || ''; }
function copyInvite() { copyText(inviteLink()); }
function openInvite() {
  if (needId()) return;
  openPause();
  ensureRoom().then(ok => { if (!ok) return; $('inviteCode').textContent = NET.code || G.room; $('inviteLink').textContent = inviteLink(); $('inviteBox').style.display = 'block'; });
}
// 공유: 버튼을 누른 그 순간(사용자 제스처 안)에 공유창을 띄워야 모바일에서 열려요
function shareNow() {
  const link = inviteLink(), nm = nickOf() || '모험가';
  const data = { title: '팜게임 함께하기', text: nm + '님이 마을을 같이 지켜 달라고 해요! 초대 코드 ' + (NET.code || ''), url: link };
  if (navigator.share) { navigator.share(data).catch(err => { if (err && err.name === 'AbortError') return; copyText(link); }); return; }
  copyText(link);
}
function shareLink() { shareNow(); }
function shareInvite() {
  if (needId()) return;
  if (NET.code || (G && G.room)) { showLinkBox(inviteLink()); shareNow(); return; }   // 방이 이미 있으면 바로 공유창
  ensureRoom().then(ok => { if (ok) { showLinkBox(inviteLink()); toast('링크가 준비됐어요. 📤 공유를 한 번 더 눌러 주세요'); } });
}
function openPause() {
  freeze = true; modalOpen = true;
  $('pauseStat').textContent = `${G.day}일차 · Lv ${G.lvl} · 처치 ${G.kills || 0}마리`;
  $('pauseRelics').innerHTML = Object.keys(G.relics || {}).map(id => { const r = RELICS.find(x => x.id === id); return r ? `<span>${r.ic} ${r.t} ×${G.relics[id]}</span>` : ''; }).join('') || '<span>아직 유물이 없어요</span>';
  syncSettingsBtns(); $('inviteBox').style.display = 'none';
  $('pauseModal').classList.add('show');
}
function closePause() { freeze = false; modalOpen = false; $('pauseModal').classList.remove('show'); }

/* ================= 카메라 ================= */
const tpP = new THREE.Vector3(), tpL = new THREE.Vector3(), fpP = new THREE.Vector3(), fpL = new THREE.Vector3(), camL = new THREE.Vector3();
let camSmooth = null;
function updateCam(dt, moving) {
  if (camYawT !== null) {
    let d = camYawT - camYaw; while (d < -Math.PI) d += Math.PI * 2; while (d > Math.PI) d -= Math.PI * 2;
    camYaw += d * Math.min(1, dt * 9);
    if (Math.abs(d) < .002) { camYaw = camYawT; camYawT = null; }
  }
  if (autoCam && moving && gameT - lastDrag > 2.2) {
    const ty = Math.atan2(-vx, -vz); let d = ty - camYaw;
    while (d < -Math.PI) d += Math.PI * 2; while (d > Math.PI) d -= Math.PI * 2;
    camYaw += d * Math.min(1, dt * 2.2);
  }
  fpBlend = lerp(fpBlend, fpMode ? 1 : 0, 1 - Math.pow(.02, dt));
  { const vg = $('vig'), xh = $('xhair'); if (vg) vg.style.opacity = fpBlend * (G && G.hp / G.maxHp < .35 ? 1 : .6);
    if (xh) {
      const play = mode === 'FIELD' && !modalOpen && !buildMode;
      xh.style.opacity = !xhOn && !sniper && !scopeOn() ? 0 : (sniper || scopeOn()) ? 1 : (play ? .8 : 0);
      xh.classList.toggle('lock', !!(play && G && CLS[G.cls] && aimTarget(CLS[G.cls].rng + 14)));
    } }
  const el = sniper ? .32 : clamp(.55 - camPitch * .6, .3, 1.25), dist = sniper ? 6.5 : clamp(settings.camDist || 19, 12, 30);   // 3인칭 거리는 설정에서 조절
  tpP.set(px + Math.sin(camYaw) * Math.cos(el) * dist, py + 1.2 + Math.sin(el) * dist, pz + Math.cos(camYaw) * Math.cos(el) * dist);
  { const lk = (sniper ? 3 : 0) + 6 * scopeBlend, lh = lk * Math.cos(camPitch), lv = lk * Math.sin(camPitch) + (sniper ? 0 : Math.max(0, camPitch - .3) * 9); tpL.set(px - Math.sin(camYaw) * lh, py + 1 - .2 * scopeBlend + lv, pz - Math.cos(camYaw) * lh); }
  const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  const moveAmt = clamp(Math.hypot(vx, vz) / 6, 0, 1);
  const bobY = fpBlend * (moving ? Math.abs(Math.sin(gameT * 11)) * .09 * moveAmt : Math.sin(gameT * 1.8) * .02);
  const side = fpBlend * (moving ? Math.sin(gameT * 5.5) * .05 * moveAmt : 0);
  fpP.set(px + Math.cos(camYaw) * side, py + 1.5 + bobY, pz - Math.sin(camYaw) * side);
  fpL.set(px - Math.sin(camYaw) * cp * 10, py + 1.5 + bobY * .5 + sp * 10, pz - Math.cos(camYaw) * cp * 10);
  const target = new THREE.Vector3().lerpVectors(tpP, fpP, fpBlend);
  if (!camSmooth) camSmooth = target.clone(); else camSmooth.lerp(target, 1 - Math.pow(.001, dt));
  camera.position.copy(camSmooth);
  camL.lerpVectors(tpL, fpL, fpBlend);
  camera.lookAt(camL);
  scopeBlend = lerp(scopeBlend, scopeOn() ? 1 : 0, 1 - Math.pow(.001, dt));
  const fov = (50 + 24 * fpBlend + (fpBlend > .5 ? 2 * moveAmt : 0)) * (1 - .58 * scopeBlend);
  if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (playerModel) playerModel.visible = fpBlend < .55;
}

/* ================= 토스트 · HUD ================= */
let toastT = 0;
function toast(m) { const el = $('toast'); el.textContent = m; el.classList.remove('hidden'); el.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { el.style.display = 'none'; }, 2600); }
// 값이 그대로면 DOM을 건드리지 않는다 (매 프레임 레이아웃 재계산 방지)
const _lastDom = {};
function setTxt(id, v) { const t = String(v); if (_lastDom[id] !== t) { _lastDom[id] = t; $(id).textContent = t; } }
function setStyleW(id, w) { const k = 'w:' + id; if (_lastDom[k] !== w) { _lastDom[k] = w; $(id).style.width = w; } }
function setStyleProp(id, prop, v) { const k = 'p:' + id + prop; if (_lastDom[k] !== v) { _lastDom[k] = v; $(id).style.setProperty(prop, v); } }
function updateHud() {
  const stored = Object.values(G.b).reduce((s, b) => s + (b.g || 0), 0);
  setTxt('resTxt', `🪵 ${G.res.wood}  🪨 ${G.res.stone}  🌿 ${G.res.fiber}  💎 ${G.res.gems}  🏠 ${stored}`);
  setTxt('hpTxt', Math.ceil(G.hp)); setStyleW('hpFill', (G.hp / G.maxHp * 100) + '%');
  setTxt('lvLbl', G.lvl); setStyleW('xpFill', (G.xp / G.need * 100) + '%');
  setTxt('clsLbl', CLS[G.cls].icon + ' ' + CLS[G.cls].name);
  const cdP = skillCd > 0 ? Math.min(100, skillCd / Math.max(3, CLS[G.cls].cd * (1 - .15 * G.up.cd)) * 100) : 0;
  setStyleProp('skillCd', '--p', cdP + '%');
  setTxt('skillTxt', (CLS[G.cls].short || CLS[G.cls].skill) + (skillCd > 0 ? ` ${Math.ceil(skillCd)}` : ''));
  updXSkillsCd();
  const gr = giantRef && giantRef.hp > 0 && !giantRef.dead ? giantRef : null;
  const br = gr || (bossRef && bossRef.hp > 0 ? bossRef : null);
  $('bossBar').style.display = br ? 'block' : 'none';
  if (br) {
    if (gr) setTxt('bossName', (gr.kingGate ? '👑 거대 좀비 왕' : '🧟 거대한 좀비') + ' · ' + G.day + '일차');
    setStyleW('bossFill', Math.max(0, br.hp / br.hpMax * 100) + '%');
  }
  updateRelicChip();
}

/* ================= 함께하기 대기실 · 5초 카운트다운 · 홈 화면 ================= */
const LOBBY = { open: false, cd: false, iv: null, seenHost: false };
function makeRoomCode() {
  let c = ''; for (let i = 0; i < 6; i++) c += Math.floor(Math.random() * 10);   // 6자리 숫자 초대 코드
  return c;
}
// 방 명단(presence)에 실리는 정보: 이름, 입장 순서, 방장 여부, 모험 시작 여부
function presenceMeta() {
  return { n: (profile.nick || '모험가').slice(0, 10), at: NET.at || Date.now(), h: NET.host ? 1 : 0, g: (G && running) ? 1 : 0, r: NET.ready ? 1 : 0, d: (G && G.down) ? 1 : 0 };
}
function trackMe() { if (NET.ch) NET.ch.track(presenceMeta()); }
function showLobby() { LOBBY.open = true; $('lobbyModal').classList.add('show'); renderLobby(); }
function closeLobby() {
  LOBBY.open = false; LOBBY.seenHost = false;
  $('lobbyModal').classList.remove('show');
  NET.wantAdmit = false; clearInterval(NET.joinT);
}
function renderLobby() {
  if (!LOBBY.open || !NET.ch) return;
  const st = NET.ch.presenceState(), list = [];
  for (const k in st) for (const m of st[k]) list.push({ k, n: m.n || '친구', h: !!m.h, g: !!m.g, r: !!m.r, at: m.at || 0 });
  list.sort((a, b) => (a.at - b.at) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  $('lobbyCode').textContent = NET.code || '';
  $('lobbyLink').textContent = inviteLink();
  const box = $('lobbyList'); box.textContent = '';
  list.slice(0, NET_MAX).forEach((p, i) => {
    const d = document.createElement('div');
    d.textContent = (i + 1) + '. ' + p.n + (p.h ? ' 👑 방장' : (p.r ? ' ✅ 준비' : '')) + (p.k === NET.me ? ' (나)' : '');
    box.appendChild(d);
  });
  const hostP = list.find(p => p.h);
  if (hostP) LOBBY.seenHost = true;
  if (!NET.host && LOBBY.seenHost && !hostP) { toast('방장이 방을 나갔어요'); goHome(); return; }
  const guestsReady = list.filter(p => !p.h).length > 0 && list.filter(p => !p.h).every(p => p.r);
  $('bLobbyStart').style.display = (NET.host || NET.ready) ? '' : 'none';
  // 친구가 준비하기를 누르면 방장의 시작 버튼에 불이 들어와요
  const readyN = list.filter(p => p.r && !p.h).length;
  const ls = $('bLobbyStart'); ls.classList.toggle('glow', NET.host ? readyN > 0 : guestsReady);
  ls.textContent = readyN > 0 ? '▶ 시작 (준비 ' + readyN + '명 · 5초 뒤)' : '▶ 시작 (5초 뒤)';
  const rb = $('bReady'); if (rb) { rb.style.display = NET.host ? 'none' : ''; rb.textContent = NET.ready ? '↩ 준비 취소' : '✅ 준비하기'; }
  const sb = $('bLobbyShare');
  if (sb) {
    sb.textContent = NET.host ? '📤 초대 보내기' : '👥 같이하기';
    sb.onclick = NET.host ? shareLink : () => { netSend('join', { n: nickOf() || '모험가' }); $('lobbyNote').textContent = '같이하기 요청을 보냈어요. 방장이 들여보내면 바로 들어가요.'; toast('👥 같이하기 요청을 보냈어요'); };
  }
  $('lobbyNote').textContent = NET.host
    ? (list.length < 2 ? '친구가 들어오면 같이 시작해요. 혼자서도 시작할 수 있어요.' : '준비되면 시작을 눌러 주세요. 5초 뒤에 모두 함께 시작해요.')
    : (hostP && hostP.g ? '진행 중인 모험이에요. 방장이 들여보내면 바로 들어가요.' : '방장이 시작하면 5초 뒤에 함께 시작해요.');
}
function openLobby() {
  if (!nickOf()) { profile.nick = '모험가' + Math.floor(10 + Math.random() * 89); saveProfile(); const n = $('nick'); if (n) n.value = profile.nick; }   // 이름이 없으면 자동으로 붙여 줘요
  if (NET.ch) netLeave();
  netPending = null;
  NET.host = true;
  const code = makeRoomCode();
  netCreateRoom(code).then(ok => {
    if (!ok) { NET.host = false; toast('방 만들기에 실패했어요. 잠시 후 다시 눌러 주세요.'); return; }
    netConnect(code);
    showLobby();
  });
}
// 방장이 아닌 친구도, 같이 온 친구들이 모두 준비되어 있으면 시작할 수 있어요
function guestStart() {
  if (!LOBBY.open || NET.host || LOBBY.cd || !NET.ch) return;
  const st = NET.ch.presenceState(), others = [];
  for (const k in st) for (const m of st[k]) if (!m.h) others.push(!!m.r);
  if (!others.length || !others.every(Boolean)) { toast('모두 준비 완료되면 시작할 수 있어요'); return; }
  netSend('cd', { ms: 5000 });
  startCountdown(5000, beginCoopJoin);
}
function hostStart() {
  if (!LOBBY.open || !NET.host || LOBBY.cd || !NET.ch) return;
  netSend('cd', { ms: 5000 });            // 친구들 화면에도 같은 카운트다운을 띄워요
  startCountdown(5000, beginCoopRun);
}
function startCountdown(ms, done) {
  if (LOBBY.cd) return;
  LOBBY.cd = true;
  const ov = $('cdOverlay'), num = $('cdNum');
  let left = Math.max(1, Math.round(ms / 1000));
  ov.style.display = 'flex'; num.textContent = left;
  LOBBY.iv = setInterval(() => {
    left--;
    if (left > 0) { num.textContent = left; return; }
    clearInterval(LOBBY.iv); LOBBY.iv = null; LOBBY.cd = false;
    ov.style.display = 'none';
    done();
  }, 1000);
}
function beginCoopRun() {
  if (!NET.ch) return;
  const code = NET.code;
  closeLobby();
  startGame(!!loadRun());
  if (!G) return;
  G.room = code; persistRun();
  trackMe();
  toast('🌿 함께 시작해요! 같이 마을을 지켜요');
}
function beginCoopJoin() {
  if (!NET.ch) return;
  closeLobby();
  startGame(!!loadRun());
  trackMe();
  setTimeout(() => netSend('hello', {}), 400);   // 방장 마을의 건물 목록을 받아요
  toast('🌿 함께 시작해요! 같이 마을을 지켜요');
}
// 🏠 홈 화면: 모험은 저장하고, 방에서 나와 시작 화면으로 돌아가요
function goHome() {
  clearInterval(LOBBY.iv); LOBBY.iv = null; LOBBY.cd = false;
  $('cdOverlay').style.display = 'none';
  if (running && G) { G.room = null; persistRun(); }
  netPending = null;
  netLeave();
  closePause();
  running = false; NET.started = false; buildMode = false;
  ['hud', 'topR', 'actions', 'pad', 'bPadAtk'].forEach(id => $(id).classList.add('hidden'));
  $('palette').style.display = 'none';
  $('login').classList.remove('hidden');
}

/* ================= 게임 흐름 ================= */
function startGame(cont) {
  audio();
  const savedRun = loadRun();
  if (cont) {
    if (!savedRun) { toast('이어할 모험이 없어요. 새로 시작해 주세요.'); return; }
    G = savedRun; G.cls = G.cls || profile.cls;
  } else {
    if (savedRun && !confirm('이전 모험이 있어요. 새로 시작하면 지워져요. 계속할까요?')) return;
    G = newRun(profile.cls);
  }
  profile.cls = G.cls; saveProfile();
  if (!cont) G.endless = !!($('endless').checked && (profile.maxDay || 0) >= 10);
  if (G.endless) { G.wave = G.wave || 1; waveT = 26; }
  G.up = Object.assign({ dmg: 0, rate: 0, spd: 0, hp: 0, cd: 0, mag: 0 }, G.up || {});
  G.relics = G.relics || {}; G.skillLv = G.skillLv || 0; G.xs = G.xs || {}; xCd = {}; renderXSkills();
  px = G.px !== undefined ? G.px : 0; pz = G.pz !== undefined ? G.pz : 5;
  $('login').classList.add('hidden');
  $('topR').classList.remove('hidden'); $('hud').classList.remove('hidden'); $('pad').classList.remove('hidden'); $('bPadAtk').classList.remove('hidden'); $('actions').classList.remove('hidden');
  running = true;
  buildWorld();
  if (!cont) spaceFx('intro', () => { storyQueue = (STORY[0]).slice(); openDialog(); });
  else toast('다시 왔군요! 🌿');
}
function buildWorld() {
  ensureCore();
  // 기존 씬 오브젝트 정리 후 새로 구성
  for (const k in bmesh) { world.remove(bmesh[k]); }
  for (const k in bmesh) delete bmesh[k];
  for (const k in G.b) addBuildingMesh(k, G.b[k]);
  if (!mayor) makeMayor();
  makeVillagers();
  makePlayer();
  updateCycle(0);
  $('bGather').classList.add('hide-btn');
}

// 누른 키를 화면에 보여주고 짧게 진동
function flashKey(k, label) {
  vib('key');
  let hud = document.getElementById('keyHud');
  if (!hud) {
    const st = document.createElement('style');
    st.textContent = '.kpress{transform:scale(.9)!important;filter:brightness(1.25)}' +
      '#keyHud{position:fixed;left:14px;bottom:14px;z-index:40;pointer-events:none;background:rgba(255,250,238,.95);border:2px solid #ecd3a2;border-radius:12px;padding:6px 10px;font-weight:900;font-size:13px;color:#4a3424;box-shadow:0 3px 8px rgba(60,40,20,.2);opacity:0;transition:opacity .25s}' +
      '#keyHud kbd{display:inline-block;min-width:26px;text-align:center;background:#fff;border:2px solid #ecd3a2;border-bottom-width:4px;border-radius:7px;padding:1px 6px;margin-right:6px;font-family:inherit}' +
      '.rb[data-key]::after{content:attr(data-key);position:absolute;top:4px;right:6px;font-size:10px;font-weight:900;color:#4a3424;opacity:.75}';
    document.head.appendChild(st);
    hud = document.createElement('div'); hud.id = 'keyHud'; document.body.appendChild(hud);
  }
  hud.innerHTML = '<kbd>' + k + '</kbd>' + label; hud.style.opacity = 1;
  clearTimeout(flashKey.t); flashKey.t = setTimeout(() => { hud.style.opacity = 0; }, 900);
}
function camTurn(dir) {
  camYawT = (camYawT === null ? camYaw : camYawT) + dir * Math.PI / 4; lastDrag = gameT;
  flashKey(dir < 0 ? 'Q' : 'E', '시선 회전');
}

/* ================= 메인 루프 ================= */
let frameErrors = 0, hudAcc = 0, frameNo = 0;
// ---- 보석 패배 연출: 달이 떨어져 마을을 부숴요 ----
let doomAnim = null, doomLast = 0;
const DOOM_T = 3.2;
// 게임 오버 연출: 불타는 거대한 달이 떨어지고, 충돌 뒤 마을 전체가 불바다가 돼요
let doomFlameTex = null, doomFireTex = null, moonTexCache = null;
function moonTex() {
  if (moonTexCache) return moonTexCache;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#b9b2a2'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) {
    const r = 2 + Math.random() * 18, cx = Math.random() * 256, cy = Math.random() * 256;
    x.fillStyle = 'rgba(90,84,74,' + (.25 + Math.random() * .35).toFixed(2) + ')'; x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fill();
    x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.arc(cx + r * .25, cy - r * .25, r * .6, 0, 6.283); x.fill();
  }
  moonTexCache = new THREE.CanvasTexture(c); return moonTexCache;
}
function spawnDoomFlame(d, x, y, z, big) {
  if (d.fx.length > 260) return;
  if (!doomFlameTex) doomFlameTex = makeRadialTex('rgba(255,250,210,1)', 'rgba(255,80,10,0)');
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: doomFlameTex, color: Math.random() < .5 ? 0xffb040 : 0xff6a1a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  const s0 = (big ? 4.2 : 2.4) * (.6 + Math.random() * .8);
  sp.position.set(x, y, z); sp.scale.setScalar(s0); scene.add(sp);
  const life = (big ? .8 : 1.1) + Math.random() * (big ? 1.2 : 1.6);
  d.fx.push({ s: sp, life, max: life, s0, vx: rnd(-1, 1) * (big ? 3 : 1.2), vy: rnd(2, 5) * (big ? 1.2 : 1), vz: rnd(-1, 1) * (big ? 3 : 1.2) });
}
function stepDoomFx(d, dt) {
  for (let i = d.fx.length - 1; i >= 0; i--) {
    const f = d.fx[i]; f.life -= dt; const p = Math.max(0, f.life / f.max);
    f.s.position.x += f.vx * dt; f.s.position.y += f.vy * dt; f.s.position.z += f.vz * dt;
    f.s.material.opacity = Math.min(1, p * 1.6) * (.8 + .2 * Math.sin(f.life * 30));   // 깜빡이는 불꽃
    f.s.scale.setScalar(f.s0 * (.5 + p * .7));
    if (f.life <= 0) { scene.remove(f.s); f.s.material.dispose(); d.fx.splice(i, 1); }
  }
}
function startDoom(done) {
  if (doomAnim || !scene) { done(); return; }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 24), new THREE.MeshLambertMaterial({ map: moonTex(), color: 0xffffff, emissive: 0xff5a1a, emissiveIntensity: .25 }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(5.9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
  moon.add(halo);
  moon.position.set(0, 70, -60); scene.add(moon);
  doomAnim = { t: 0, moon, halo, done, impacted: false, shock: null, debris: [], bld: [], fx: [], fire: null, acc: 0 };
}
function doomUpdate(dt) {
  const d = doomAnim; if (!d) return;
  d.t += dt;
  const k = Math.min(1, d.t / DOOM_T), e = k * k * k;   // 점점 빨라지며 떨어짐
  const sc = 1 + 2.4 * e;                                // 가까워질수록 달이 거대해져요
  d.moon.scale.setScalar(sc);
  d.moon.position.set(0, 70 + (14 - 70) * e, -60 + 60 * e);
  d.moon.rotation.y += dt * .8; d.moon.rotation.x += dt * .3;
  d.halo.scale.setScalar(1.06 + .05 * Math.sin(d.t * 14));
  d.halo.material.opacity = .25 + .2 * e;
  if (!d.impacted) {
    d.acc += dt * (30 + 160 * k);                        // 떨어지며 꼬리 불꽃을 뿌려요
    while (d.acc > 1) { d.acc -= 1; const a = Math.random() * 6.283, rr = 5 * sc * .95; spawnDoomFlame(d, d.moon.position.x + Math.cos(a) * rr, d.moon.position.y + rnd(-1, 1) * rr, d.moon.position.z + Math.sin(a) * rr, true); }
  }
  if (!d.impacted && k >= 1) {
    d.impacted = true;
    const sh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }));
    sh.position.set(0, 2, 0); scene.add(sh); d.shock = sh;
    const fire = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), new THREE.MeshBasicMaterial({ map: doomFireTex || (doomFireTex = makeRadialTex('rgba(255,180,70,1)', 'rgba(255,40,0,0)')), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    fire.rotation.x = -Math.PI / 2; fire.position.y = .09; scene.add(fire); d.fire = fire;
    for (let i = 0; i < 34; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.5 + Math.random() * .6, 0), new THREE.MeshLambertMaterial({ color: 0xd8d2c4, emissive: 0xff6a1a, emissiveIntensity: .6 }));
      r.position.set(0, 14, 0); scene.add(r);
      const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 12;
      d.debris.push({ m: r, vx: Math.cos(a) * sp, vy: 8 + Math.random() * 12, vz: Math.sin(a) * sp });
    }
    for (const kk in bmesh) { const [bx, bz] = kk.split(',').map(Number); d.bld.push({ m: bmesh[kk], t0: d.t + Math.hypot(bx, bz) * .05, rx: bz * .1 }); }
    shake = 0;
  }
  let jx = 0, jy = 0;
  if (d.impacted) {
    const after = d.t - DOOM_T, amp = Math.max(0, 1 - after) * .5;
    jx = (Math.random() - .5) * amp; jy = (Math.random() - .5) * amp;
    d.shock.scale.setScalar(1 + Math.max(0, after) * 14); d.shock.material.opacity = Math.max(0, .9 - after * .8);
    d.fire.material.opacity = Math.min(.9, after * .9);      // 땅에 번지는 불바다
    d.moon.material.emissiveIntensity = .3 + .2 * Math.sin(d.t * 6);
    d.acc += dt * 110;                                       // 사방으로 불이 번져요
    while (d.acc > 1) { d.acc -= 1; const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 34; spawnDoomFlame(d, Math.cos(a) * rr, .3, Math.sin(a) * rr, false); }
    for (const r of d.debris) {
      r.vy -= 22 * dt; r.m.position.x += r.vx * dt; r.m.position.z += r.vz * dt; r.m.position.y += r.vy * dt;
      if (r.m.position.y < 0) { r.m.position.y = 0; r.vy = -r.vy * .3; r.vx *= .6; r.vz *= .6; }
      r.m.rotation.x += dt * 5;
      if (r.m.position.y > .5 && Math.random() < .25) spawnDoomFlame(d, r.m.position.x, r.m.position.y + .3, r.m.position.z, false);
    }
    for (const b of d.bld) {
      const q = Math.min(1, Math.max(0, (d.t - b.t0) / .9));
      b.m.position.y = -q * 3; b.m.rotation.x = q * .7 * (b.rx ? 1 : -1); b.m.scale.setScalar(1 - q * .35);
    }
  }
  stepDoomFx(d, dt);
  camera.position.set(22 + jx, 12 + jy, 26);
  if (d.impacted) camera.lookAt(0, 2.5 + jy, 0); else camera.lookAt(d.moon.position);   // 떨어지는 달을 따라 봐요
  renderer.render(scene, camera);
  if (d.t > DOOM_T + 3.4) {
    scene.remove(d.moon); if (d.shock) scene.remove(d.shock); if (d.fire) { scene.remove(d.fire); d.fire.material.dispose(); }
    for (const r of d.debris) scene.remove(r.m);
    for (const f of d.fx) { scene.remove(f.s); f.s.material.dispose(); }
    doomAnim = null; d.done();
  }
}
function frame(now) {
  fpsUpdate(now);
  coreAnim(now / 1000);
  requestAnimationFrame(frame);
  if (DUEL.open) return;   // 아파트 대결 중에는 대결 화면만 그려요
  try { tick(now); } catch (e) { frameErrors++; if (frameErrors < 5) showErr('FRAME: ' + (e.stack || e.message)); }
  if (doomAnim) { const dd = doomLast ? Math.max(.008, Math.min(.05, (now - doomLast) / 1000)) : .016; doomLast = now; try { doomUpdate(dd); } catch (e) { showErr('DOOM: ' + (e.stack || e.message)); doomAnim = null; } }
  else doomLast = 0;
}
const aptH = lv => 3.5 + 3.5 * lv;
function aptLvSum() { let t = 0; for (const k in G.b) if (G.b[k].t === 'APT') t += G.b[k].lv || 1; return t; }
// 아파트 층수가 올라갈수록 마을(짓는 땅·지킬 땅·적 출현 반경)이 넓어져요
function mapExpand() {
  let ml = 0; for (const k in G.b) if (G.b[k].t === 'APT') ml = Math.max(ml, G.b[k].lv || 1);
  const prog = (G.day || 1) - 1 + Math.floor(((G.lvl || 1) - 1) / 3);   // 스테이지·레벨이 오를수록 부지가 넓어져요
  const e = Math.min(4, Math.max(Math.max(0, ml - 1), prog)), nb = 11 + 3 * e, nl = 22 + 5 * e;
  if (nl === LIM) return;
  const grew = nl > LIM;
  BUILD_R = nb; LIM = nl; SPAWN_R = LIM + 4; FN = 2 * LIM + 1; flowD = new Float32Array(FN * FN);
  computeFlow();
  if (grew && G) toast('🏘 마을이 넓어졌어요! 지킬 땅이 늘었어요.');
}
// 전기 스킬 이펙트 외형 설정 (값만 바꿔서 조정)
const FX_CFG = {
  spark: { color: 0xbff7ff, size: 2.6, sniperSize: 2.2, life: .35, grow: .5 }, // 스파크 버스트
  ring:  { color: 0xbff7ff, opacity: .95, grow: 6, life: .45 },                 // 충격파 링
};
const FX = {};
function fxTex(n) { if (!FX[n]) { const t = new THREE.TextureLoader().load('assets/fx/' + n + '.svg'); t.encoding = THREE.sRGBEncoding; FX[n] = t; } return FX[n]; }
function fxBurst(x, y, z, sc) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex('spark'), color: FX_CFG.spark.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sp.position.set(x, y, z); scene.add(sp);
  tweenTo(0, 1, FX_CFG.spark.life, v => { sp.scale.setScalar(sc * (FX_CFG.spark.grow + v)); sp.material.opacity = 1 - v; }, 'out', 0, () => { scene.remove(sp); sp.material.dispose(); });
}
// F3: FPS · 드로우콜 · 좀비 수 표시 (기본 꺼짐, 성능 확인용)
let fpsOn = false, fpsEl = null, fpsT = 0, fpsF = 0;
function toggleFps() {
  fpsOn = !fpsOn;
  if (!fpsEl) { fpsEl = document.createElement('div'); fpsEl.id = 'fpsHud'; fpsEl.style.cssText = 'position:fixed;top:6px;right:6px;z-index:50;background:rgba(0,0,0,.55);color:#fff;font:700 12px/1.3 monospace;padding:4px 8px;border-radius:8px;pointer-events:none'; document.body.appendChild(fpsEl); }
  fpsEl.style.display = fpsOn ? 'block' : 'none';
  toast(fpsOn ? '📊 FPS 표시 켬 (F3)' : 'FPS 표시 끔 (F3)');
}
function fpsUpdate(now) {
  if (!fpsOn || !renderer) return;
  fpsF++;
  if (now - fpsT >= 500) { const fps = fpsF * 1000 / (now - fpsT); fpsEl.textContent = 'FPS ' + fps.toFixed(0) + ' · 드로우 ' + renderer.info.render.calls + ' · 좀비 ' + mons.length; fpsT = now; fpsF = 0; }
}
function nearPerch() {
  let best = null, bd = 2.6;
  for (const k in G.b) { if (G.b[k].t !== 'APT') continue; const [x, z] = k.split(',').map(Number); const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = k; } }
  return best;
}
let hitMoved = false;
function syncHitGrip() {   // 손잡이는 공격 버튼 오른쪽 위에 붙어 다녀요 (옮기기 전까지)
  return;
}
let mvDrag = null;
function wireMovableBtn(el) {   // 버튼을 길게(끌어서) 옮길 수 있게 해요. 옮긴 위치는 기기에 저장돼요
  if (!isLand()) try { const sv = JSON.parse(localStorage.getItem('farm-btnpos-' + el.id) || 'null'); if (sv) btnPlace(el, clamp(sv.l, 0, innerWidth - 70), clamp(sv.t, 0, innerHeight - 70)); } catch (e) {}
  el.addEventListener('click', e => { if (el._supp) { el._supp = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  el.addEventListener('pointerdown', e => { if (e.button > 0) return; const r = el.getBoundingClientRect(); mvDrag = { el, id: el.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false, t0: performance.now() }; });
}
const LAND_Q = '(orientation: landscape) and (max-height: 560px)';
const isLand = () => window.matchMedia(LAND_Q).matches;
const MOVABLE_IDS = ['bHit', 'bPadAtk', 'bSkill', 'bJump', 'bRun', 'bSnipe'];
try { localStorage.removeItem('farm-act-pos'); } catch (e) { }   // 예전 묶음 위치 기록만 지워요 (버튼별 위치는 설정에서 조작)
function storeBaseStyles() {   // 처음 HTML에 적힌 기본 자리를 기억해요 (세로·가로 전환 때 되돌리려고)
  MOVABLE_IDS.concat(['actions']).forEach(id => {
    const el = document.getElementById(id); if (el && el.dataset.base === undefined) el.dataset.base = el.getAttribute('style') || '';
  });
}
function layoutByOrientation() {   // 가로면 기본 배치(CSS)만 쓰고, 세로면 옮겨 둔 위치를 써요
  storeBaseStyles();
  const land = isLand();
  MOVABLE_IDS.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.setAttribute('style', el.dataset.base || '');
    if (land) return;
    try { const sv = JSON.parse(localStorage.getItem('farm-btnpos-' + id) || 'null'); if (sv) btnPlace(el, clamp(sv.l, 0, innerWidth - 70), clamp(sv.t, 0, innerHeight - 70)); } catch (e) { }
  });
  const box = document.getElementById('actions');
  if (box) box.setAttribute('style', box.dataset.base || '');   // 오른쪽 묶음은 기본 자리(오른쪽 아래)에 고정
}
window.addEventListener('resize', layoutByOrientation);
window.addEventListener('orientationchange', () => setTimeout(layoutByOrientation, 200));
function btnPlace(el, l, t) { el.style.position = 'fixed'; el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.zIndex = 6; }
function setupHitGrip() {   // 버튼 위치 불러오기 + 끌어서 옮기기
  const g = document.getElementById('hitGrip'); if (g) g.remove();
  storeBaseStyles();
  ['bHit', 'bPadAtk', 'bSkill', 'bJump', 'bRun'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    if (!isLand()) try { const sv = JSON.parse(localStorage.getItem('farm-btnpos-' + id) || 'null'); if (sv) btnPlace(el, clamp(sv.l, 0, innerWidth - 70), clamp(sv.t, 0, innerHeight - 70)); } catch (e) {}
    el.addEventListener('click', e => { if (el._supp) { el._supp = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    el.addEventListener('pointerdown', e => { if (e.button > 0) return; const r = el.getBoundingClientRect(); mvDrag = { el, id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, moved: false, t0: performance.now() }; });
  });
  window.addEventListener('pointermove', e => {
    const d = mvDrag; if (!d || e.pointerId !== d.pid || d.moved) return;
    const L = Math.hypot(e.clientX - d.sx, e.clientY - d.sy); if (L < 12) return;
    const attack = d.id === 'bHit' || d.id === 'bPadAtk';
    if (attack && !document.body.classList.contains('btn-edit') && (aimOverride || performance.now() - d.t0 < 500)) return;   // 공격 버튼: 바로 끌면 조준, 오래 누르고 끌면 옮기기
    d.moved = true; chargeOn = false; aimOverride = null;
  });
  window.addEventListener('pointermove', e => {
    const d = mvDrag; if (!d || e.pointerId !== d.pid || !d.moved) return;
    btnPlace(d.el, clamp(e.clientX - d.ox, 0, innerWidth - 70), clamp(e.clientY - d.oy, 0, innerHeight - 70));
  });
  const end = e => {
    const d = mvDrag; if (!d || e.pointerId !== d.pid) return;
    if (d.moved) { d.el._supp = true; try { localStorage.setItem('farm-btnpos-' + d.id, JSON.stringify({ l: parseInt(d.el.style.left, 10) || 0, t: parseInt(d.el.style.top, 10) || 0 })); } catch (x) {} }
    mvDrag = null;
  };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
}
function setupActGrip() {
  const box = $('actions'), grip = $('actGrip'); if (!box || !grip) return;   // 오른쪽 공격 묶음은 옮기지 않아요
  return;
  storeBaseStyles();
  let gid = null, ox = 0, oy = 0;
  grip.addEventListener('pointerdown', e => { gid = e.pointerId; const r = box.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; grip.setPointerCapture && grip.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
  grip.addEventListener('pointermove', e => { if (e.pointerId !== gid) return; const l = clamp(e.clientX - ox, 0, innerWidth - box.offsetWidth), t = clamp(e.clientY - oy, 0, innerHeight - box.offsetHeight); box.style.left = l + 'px'; box.style.top = t + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto'; });
  const end = e => { if (e.pointerId !== gid) return; gid = null; try { localStorage.setItem('farm-act-pos', JSON.stringify({ l: parseInt(box.style.left, 10) || 0, t: parseInt(box.style.top, 10) || 0 })); } catch (x) {} };
  grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
}
function toggleSniper() {
  if (mode !== 'FIELD' || modalOpen || buildMode) return;
  if (sniper) {
    sniper = false; perchKey = null;
    // 지상 복귀: 아파트 옆의 빈 칸으로 내려놓기
    for (const [ax, az] of [[-1.6, 0], [0, 1.6], [0, -1.6], [1.6, 0]]) {
      const b = G.b[Math.round(px + ax) + ',' + Math.round(pz + az)];
      if (!(b && BLOCKING[b.t])) { px += ax; pz += az; break; }
    }
    py = 0; toast('⬇ 지상으로 내려왔어요.'); return;
  }
  const k = nearPerch(); if (!k) { toast('아파트 옆에서 ⬆ 위로 올라가기를 누르세요.'); return; }
  const [x, z] = k.split(',').map(Number);
  perchKey = k; sniper = true; px = x; pz = z; py = aptH(G.b[k].lv || 1) + .32; vx = 0; vz = 0; camYawT = null;
  puff(x, z, 8, 0xffffff); toast('🎯 지붕 위! 화면을 드래그해 조준하고 공격/A를 누르세요.');
}
// 수동 조준: 화면 가운데 조준점에 가장 가까운 좀비 (줌 상태에서만)
function scopeTarget() {
  let best = null, bd = .22;
  const v = new THREE.Vector3();
  for (const m of mons) {
    if (m.dead) continue;
    v.set(m.obj.position.x, .8, m.obj.position.z).project(camera);
    if (v.z > 1) continue;
    const d = Math.hypot(v.x, v.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
function sniperAim() {
  if (scopeOn()) { const st = scopeTarget(); if (st) return st; }
  // 옥상에서는 조준이 쉽도록: 넓은 시야각(약 37도), 긴 사거리, 그래도 없으면 가까운 적을 자동으로 골라요
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw); let best = null, bc = .8, near = null, nd = 22;
  for (const m of mons) {
    if (m.dead) continue;
    const dx = m.obj.position.x - px, dz = m.obj.position.z - pz, d = Math.hypot(dx, dz);
    if (d < 1 || d > 40) continue;
    const c = (dx * fx + dz * fz) / d;
    if (c > bc) { bc = c; best = m; }
    if (d < nd) { nd = d; near = m; }
  }
  return best || near;
}
function updateSniperAim(dt) {
  snipeCd = Math.max(0, snipeCd - dt);
  if (!sniper) { if (aimRing) aimRing.visible = false; return; }
  const t = sniperAim();
  if (!aimRing) { aimRing = new THREE.Mesh(new THREE.RingGeometry(.45, .6, 28), new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: .85, depthWrite: false })); aimRing.rotation.x = -Math.PI / 2; scene.add(aimRing); }
  aimRing.visible = !!t;
  if (t) aimRing.position.set(t.obj.position.x, .08, t.obj.position.z);
}
function fireSniper() {
  if (!sniper || snipeCd > 0 || mode !== 'FIELD' || modalOpen) return;
  snipeCd = .7;
  const t = sniperAim(), fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const end = t ? new THREE.Vector3(t.obj.position.x, 1.1, t.obj.position.z) : new THREE.Vector3(px + fx * 22, 1.2, pz + fz * 22);
  bolt([new THREE.Vector3(px, py + 1.7, pz), end], 0x9ff3ff);
  hitFx(.2);
  if (t) {
    const dmg = t.boss ? (6 + G.skillLv * 2 + (G.day || 1) * 1.5) * skillDmgMul() * bossDmgMul(t) : 9999;   // 일반 적은 한 발에 쓰러져요
    hitEnemy(t, dmg, { kb: .4, slow: 1.4 });
    glowAt(end.x, 1, end.z, 1.8, 0x9ff3ff, .3); fxBurst(end.x, 1, end.z, FX_CFG.spark.sniperSize); puff(end.x, end.z, 5, 0xbff7ff);
  }
}
function tick(now) {
  const rawDt = Math.min(.05, (now - last) / 1000); last = now;
  let dt = rawDt;
  if (hitstop > 0) { hitstop -= rawDt; dt = rawDt * .08; }
  if (running && !freeze && !modalOpen) gameT += dt;
  // 입력 → 목표 속도 (부드럽게 가감속)
  // 줌·저격 중에는 방향키로 시선을 돌립니다(드래그와 같은 방향). 이때 방향키는 이동에 쓰지 않아요.
  const lookMode = scopeOn() || sniper;
  if (lookMode) {
    camYaw -= ((keys.arrowright ? 1 : 0) - (keys.arrowleft ? 1 : 0)) * dt * 1.6;
    camPitch = clamp(camPitch + ((keys.arrowup ? 1 : 0) - (keys.arrowdown ? 1 : 0)) * dt * 1.2, -.9, 1.5);
    lastDrag = gameT;
  }
  let ix = joy.x + (!lookMode && keys.arrowright ? 1 : 0) - (!lookMode && keys.arrowleft ? 1 : 0);
  let iz = joy.z + (!lookMode && keys.arrowdown ? 1 : 0) - (!lookMode && keys.arrowup ? 1 : 0);
  const il = Math.hypot(ix, iz); const inMag = Math.min(1, il);
  const canMove = running && mode === 'FIELD' && !modalOpen && !freeze && !(G && G.down);
  let tvx = 0, tvz = 0;
  if (canMove && inMag > .05) {
    const nx = ix / (il || 1), nz = iz / (il || 1);
    const fX = -Math.sin(camYaw), fZ = -Math.cos(camYaw), rX = Math.cos(camYaw), rZ = -Math.sin(camYaw);
    let mx = rX * nx + fX * (-nz), mz = rZ * nx + fZ * (-nz);
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const spd = (runKey || keys.shift || runLock ? 6.2 : 3.6) * (1 + .12 * (G ? relicCount('feather') : 0) + .12 * (G ? G.up.spd : 0)) * inMag;
    tvx = mx * spd; tvz = mz * spd;
  }
  vx += (tvx - vx) * (1 - Math.exp(-dt * 12)); vz += (tvz - vz) * (1 - Math.exp(-dt * 12));
  walking = Math.hypot(vx, vz) > .4;
  if (running) {
    const nx = clamp(px + vx * dt, -LIM, LIM), nz = clamp(pz + vz * dt, -LIM, LIM);
    if (!blockedAt(nx, pz)) px = nx; else vx = 0;
    if (!blockedAt(px, nz)) pz = nz; else vz = 0;
    if (walking) { const tgt = Math.atan2(vx, vz); let df = tgt - rotY; while (df < -Math.PI) df += Math.PI * 2; while (df > Math.PI) df -= Math.PI * 2; rotY += df * Math.min(1, dt * 11); }
    if (walking && (runKey || keys.shift || runLock) && Math.random() < dt * 8) puff(px, pz, 1, 0xf6ecd2);
  }
  if (!sniper) {
    const gh = groundAt(px, pz);
    if (jv !== 0 || py > gh + .01) { py += jv * dt; jv -= 24 * dt; if (py <= gh) { py = gh; jv = 0; } }   // 점프·낙하
    else { const d = gh - py; py += Math.sign(d) * Math.min(Math.abs(d), (d > 0 ? 7 : 14) * dt); }   // 계단은 부드럽게 올라가요
  }
  if (sniper) { const pc = perchKey && G.b[perchKey] ? perchKey.split(',').map(Number) : null; if (!pc) { sniper = false; perchKey = null; py = 0; toast('건물이 사라져서 지상으로 내려왔어요.'); } else { px = clamp(px, pc[0] - 1.3, pc[0] + 1.3); pz = clamp(pz, pc[1] - 1.3, pc[1] + 1.3); } }
  updateSniperAim(dt);
  if (player) {
    player.position.set(px, py, pz);
    player.rotation.y = rotY;
    const sp = Math.hypot(vx, vz);
    const ph = gameT * (6 + sp * 1.2);
    if (playerModel) {
      playerModel.position.y = walking ? Math.abs(Math.sin(ph)) * .07 : Math.sin(gameT * 2) * .02;
      const lean = clamp(-(rotY - Math.atan2(vx, vz)) * .0, -.2, .2);
      playerModel.rotation.z = walking ? Math.sin(ph) * .05 : 0;
      playerModel.scale.set(1 + (walking ? .03 * Math.sin(ph * 2) : 0), 1 - (walking ? .03 * Math.sin(ph * 2) : 0), 1);
      playerModel.rotation.x = clamp(-sp * .012, -.12, 0);
    }
    if (ring) ring.material.opacity = .5 + Math.sin(gameT * 3) * .15;
    if (blobPlayer) blobPlayer.scale.setScalar(1 + (walking ? .05 : 0));
  }
  if (mayor) mayor.position.y = Math.sin(gameT * 2.2) * .03;
  if (G && running && !modalOpen && !freeze) {
    updPet(dt); updSnow(dt);
    comboCd -= dt; if (comboCd <= 0) comboStrike();
  }
  villagers.forEach(v => { v.g.rotation.y = Math.sin(gameT * .8 + v.ph) * .4; });
  updRain(rawDt);
  if (G && running && !modalOpen && !freeze) {
    if (G.up.regen && G.hp > 0 && G.hp < G.maxHp) G.hp = Math.min(G.maxHp, G.hp + G.up.regen * .8 * dt);
    if (G.up.aura) {
      auraT -= dt;
      if (auraT <= 0) {
        auraT = 1.4; const R = 2.2 + .35 * G.up.aura;
        glowAt(px, .3, pz, R * 2, 0xbfe6ff, .3);
        mons.slice().forEach(m => { if (!m.dead && Math.hypot(m.obj.position.x - px, m.obj.position.z - pz) < R) hitEnemy(m, .8 * G.up.aura, { kb: .4 }); });
      }
    }
  }
  // 환경
  clouds.forEach(c => { c.position.x += dt * c.userData.v; if (c.position.x > 85) c.position.x = -85; });
  for (const kind in nodes) for (const n of nodes[kind]) {
    if (kind === 'tree' && n.g.userData.cn) n.g.userData.cn.rotation.z = Math.sin(gameT * 1.3 + n.g.position.x) * .025;
    if (!n.alive) { n.rt -= dt; if (n.rt <= 0) { n.alive = true; tweenTo(0, 1, .6, v => n.g.scale.setScalar(Math.max(.001, v)), 'back'); } }
  }
  if (running) {
    const nf = updateCycle(dt);
    flowT -= dt; if (flowT <= 0) { computeFlow(); flowT = .4; }
    netUpdate(dt);
    mons.slice().forEach(m => updMon(m, dt));
    // 중앙 보석(수정) 방어: 보석 근처 좀비가 보석 HP를 깎음
    if (G.coreHp == null) G.coreHp = 200;
    for (const m of mons) { if (m.dead) continue; if (Math.hypot(m.obj.position.x, m.obj.position.z) < 2.2) { G.coreHp = Math.max(0, G.coreHp - m.d.dmg * dt * .6); coreHit = .25; coreHitFx(); } }
    if (coreHit > 0) coreHit -= dt;
    if (nightF(G.cycT) < .5 && G.coreHp < 200 && !mons.some(m => !m.dead && Math.hypot(m.obj.position.x, m.obj.position.z) < 2.2)) G.coreHp = Math.min(200, G.coreHp + 2 * dt);
    updProjs(dt); stepParts(dt);
    atkCd -= dt;
    if (atkCd <= 0 && !modalOpen && mode === 'FIELD' && !buildMode) { if (attackNow(false)) atkCd = .7 / rateMul() / CLS[G.cls].rate; else atkCd = .15; }
    updateChargeRing(); syncHitGrip(); updRocks(dt); throwRocks(dt);
    if (meteorZone && performance.now() < meteorZone.until) {
      for (const m of mons) {
        if (m.dead || !m.fly || !m.obj) continue;
        if (Math.hypot(m.obj.position.x - meteorZone.x, m.obj.position.z - meteorZone.z) <= meteorZone.R) hitEnemy(m, 9999, { kb: 0 });
      }
    }
    if (attackHeld && atkCd <= 0 && !modalOpen && mode === 'FIELD' && !buildMode && !sniper) { attackNow(true); atkCd = .2 / rateMul() / CLS[G.cls].rate; }
    if (skillCd > 0) skillCd -= dt;
    for (const k in xCd) if (xCd[k] > 0) xCd[k] -= dt;
    invul = Math.max(0, invul - dt);
    if (player) player.visible = invul <= 0 || Math.floor(invul * 14) % 2 === 0;
    // 건물 동작
    for (const k in G.b) {
      const b = G.b[k], [bx, bz] = k.split(',').map(Number);
      if (b.t === 'TOWER') {
        b.cd = (b.cd || 0) - dt;
        if (b.cd <= 0) { const best = nearestMon(6.5 + 1.5 * ((b.lv || 1) - 1), bx, bz); if (best) { hitEnemy(best, 1.1 * (1 + .5 * ((b.lv || 1) - 1)), { kb: .15 }); b.cd = 1.2; } else b.cd = .2; }
        const m = bmesh[k]; if (m && m.userData.flag) m.userData.flag.rotation.z = Math.sin(gameT * 4) * .25;
      } else if (b.t === 'TRAP') {
        b.cd = (b.cd || 0) - dt;
        const spk = bmesh[k] && bmesh[k].userData.spikes;
        if (b.cd <= 0) {
          const hit = mons.find(mm => !mm.dead && !mm.fly && Math.hypot(mm.obj.position.x - bx, mm.obj.position.z - bz) < .7);
          if (hit) {
            b.cd = 3.5; hitEnemy(hit, 2.4 * (1 + .25 * ((b.lv || 1) - 1)), { kb: .2 }); hit.slow = 2.5; puff(bx, bz, 6, 0xd9c08a);
            if (spk) tweenTo(.35, 1, .1, v => spk.scale.y = v, 'out', 0, () => tweenTo(1, .35, .35, v => spk.scale.y = v, 'in'));
          } else b.cd = .15;
        }
      } else if (b.t === 'WEAVE') {
        b.tw = (b.tw || 0) + dt;
        if (b.tw >= 14 / (1 + .3 * ((b.lv || 1) - 1))) { b.tw = 0; G.res.fiber = (G.res.fiber || 0) + (b.lv || 1); puff(bx, bz, 4, 0xfff0c0); toast('🌿 직조 집에서 섬유를 짰어요'); persistRun(); }
      } else if (b.t === 'MINE') {
        b.tm = (b.tm || 0) + dt;
        if (b.tm >= 11 / (1 + .4 * ((b.lv || 1) - 1))) { b.tm = 0; G.res.gems += (b.lv || 1) + relicCount('charm'); puff(bx, bz, 5, 0xa6e6ff); toast('💎 광산에서 보석을 캤어요!'); persistRun(); }
        const m = bmesh[k]; if (m && m.userData.crys) m.userData.crys.rotation.y += dt * .8;
      } else if (b.t === 'HOUSE') {
        b.dep = (b.dep || 0) + dt;
        if (Math.hypot(bx - px, bz - pz) < 2.4 && G.res.gems > 0 && (b.g || 0) < 1 + 2 * (b.lv || 1) && b.dep > .6) { b.dep = 0; G.res.gems -= 1; b.g = (b.g || 0) + 1; updateGems(k); puff(bx, bz, 3, 0xa6e6ff); sfx('gem'); persistRun(); }
        const m = bmesh[k]; if (m && m.userData.gems) m.userData.gems.position.y = (m.userData.gemY || 2.35) + Math.sin(gameT * 2 + bx) * .05;
      }
    }
    // 보석 줍기 (자석 범위 포함)
    const magR = 1.3 + .4 * G.up.mag;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.t += dt; d.m.rotation.y += dt * 2; d.m.position.y = .5 + Math.sin(d.t * 3) * .1;
      if (Math.hypot(d.m.position.x - px, d.m.position.z - pz) < magR) {
        G.res.gems += 1; scene.remove(d.m); drops.splice(i, 1); puff(px, pz, 4, 0xa6e6ff); sfx('gem'); toast('💎 보석을 되찾았어요!'); persistRun();
      }
    }
    // 버튼
    const nearMayor = Math.hypot(px - MAYOR.x, pz - MAYOR.z) < 2.8;
    const nn = nearestNode(2.6);
    const nv = nearVillager(3), nb = nearBuilding(3);
    $('bTalk').classList.toggle('hide-btn', !((nearMayor || nv) && mode === 'FIELD' && !buildMode));
    { const sOk = false; /* 올라가기 버튼 제거: 계단으로 걸어서 올라가요 */ const bsn = $('bSnipe'); if (bsn) { bsn.classList.toggle('hide-btn', !(sOk && mode === 'FIELD' && !buildMode)); const lbl = sniper ? '⬇ 내려가기' : '⬆ 위로 올라가기'; const st = $('snipeTxt'); if (st && st.textContent !== lbl) st.textContent = lbl; } }
    setTxt('bTalk', nearMayor || !nv ? '💬 대화' : '🛒 거래');
    $('bUp').classList.toggle('hide-btn', !(nb && (nb.b.lv || 1) < 3 && mode === 'FIELD' && !buildMode));
    if (nb) setTxt('bUp', '⬆ ' + ((nb.b.lv || 1) + 1) + '단계');
    $('bCodex').classList.toggle('hide-btn', !(mode === 'FIELD' && !buildMode));
    $('bGather').classList.toggle('hide-btn', !(nn && !buildMode));
    if (nn) setTxt('bGather', nn.kind === 'tree' ? '🪓 벌목' : nn.kind === 'rock' ? '⛏ 돌 캐기' : '🌿 채집');
    { const rc = $('recChip'); if (rc) {
      const far = (!nn && !nearestMon(c0Range())) ? (aimNode(6) || nearestNode(6)) : null;
      const rec = mode === 'FIELD' && !buildMode ? recommendNext() : null;
      const show = !!far && mode === 'FIELD' && !buildMode;
      rc.style.display = (rec || show) ? '' : 'none';
      if (rec) rc.textContent = '💡 추천: ' + rec;
      else if (show) rc.textContent = '💡 추천: ' + (far.kind === 'tree' ? '🪵 나무' : far.kind === 'rock' ? '🪨 돌' : '🌿 덤불') + ' — 공격(A)으로 멀리서 쓰러뜨리면 아이템을 얻어요';
    } }
    // 건설 미리보기
    if (buildMode) {
      if (fpMode) { const p = pickGround(innerWidth / 2, innerHeight / 2); if (p) setBuildTarget(p.x, p.z); }
      if (!buildTarget) setBuildTarget(px + Math.sin(rotY) * 3, pz + Math.cos(rotY) * 3);
      const ok = canBuildAt(buildTarget.x, buildTarget.z);
      ghost.visible = true; ghost.position.set(buildTarget.x, .05, buildTarget.z);
      ghost.material.color.setHex(ok ? 0x7bd389 : 0xef7a6a);
      ghost.scale.setScalar(1 + Math.sin(gameT * 6) * .06);
      if (ghostB) {
        const can = ok && canPay(BUILD[selType] || {});
        ghostB.visible = true; ghostB.position.set(buildTarget.x, Math.sin(gameT * 3) * .03, buildTarget.z);
        ghostB.traverse(o => { if (o.isMesh && o.material && o.material.transparent && o.material.emissive) { o.material.emissive.setHex(can ? 0x3cff7a : 0xff4d3c); o.material.emissiveIntensity = .3 + .1 * Math.sin(gameT * 6); } });
      }
    } else { ghost.visible = false; if (ghostB) ghostB.visible = false; }
    // 집이 있으면 20초마다 최대 체력의 1%를 회복해요 (쓰러진 상태에서는 회복하지 않아요)
    if (G && running && !G.down && G.hp > 0 && G.hp < G.maxHp && Object.values(G.b).some(b => b.t === 'HOUSE')) {
      G.regT = (G.regT || 0) + dt;
      if (G.regT >= 20) { G.regT = 0; G.hp = Math.min(G.maxHp, G.hp + Math.max(1, Math.round(G.maxHp * .01))); }
    } else if (G) G.regT = 0;
    // 게임 오버: 보석이 모두 사라지면
    const stored = Object.values(G.b).reduce((s, b) => s + (b.g || 0), 0);
    const carried = mons.reduce((s, m) => s + (m.carry || 0), 0);
    const total = G.res.gems + stored + carried + drops.length;
    if ((total === 0 || (G.coreHp != null && G.coreHp <= 0)) && !modalOpen) {
      running = false; modalOpen = true;
      const showOver = () => {
        $('overStat').innerHTML = (G.endless ? `<div>♾ ${G.wave || 1}웨이브까지 버텼어요</div>` : `<div>${G.day}일차까지 버텼어요</div>`) + `<div>처치 ${G.kills || 0}마리</div><div>Lv ${G.lvl}</div><div>보스 ${G.bossKills || 0}마리</div>`;
        $('overModal').classList.add('show'); localStorage.removeItem(RUN_KEY);
      };
      if (G.coreHp != null && G.coreHp <= 0) startDoom(showOver); else showOver();
    }
    // 레벨업 · 유물 모달 처리
    if (!modalOpen && G.pendingLvl > 0) showLevelUp();
    hudAcc += rawDt; if (hudAcc >= .1) { hudAcc = 0; updateHud(); }
    if (Math.floor(gameT * 2) !== Math.floor((gameT - dt) * 2)) persistRun();
  }
  stepTweens(dt);
  updateCam(dt, walking);
  if (shake > 0) { camera.position.x += rnd(-1, 1) * shake * .5; camera.position.y += rnd(-1, 1) * shake * .3; shake = Math.max(0, shake - rawDt * 2.2); }
  frameNo++; renderer.shadowMap.needsUpdate = (frameNo % (IS_COARSE ? 4 : 2) === 0);
  renderer.render(scene, camera);
}

/* ================= 시작 ================= */
(async function boot() {
  loadProfile(); loadSettings();
  initScene();
  buildNodes();
  addForest(); buildSnowDecor();
  await Promise.all([loadSprites(), loadModels()]);
  addVillageDecor();
  makeMayor();
  $('load').classList.add('hidden');
  setupInput();
  if (netPending) enterWaiting();           // 초대 링크로 들어오면 대기 화면에서 방장이 들여보내기를 기다려요
  const hasRun = !!loadRun();
  $('bContinue').disabled = !hasRun;
  document.querySelectorAll('#classPick .cbtn').forEach(x => x.classList.toggle('on', x.dataset.c === profile.cls));
  last = performance.now();
  requestAnimationFrame(frame);
  if (!creatureProto) toast('기본 인형으로 표시해요.');
})().catch(e => showErr('BOOT: ' + (e.stack || e.message)));

/* ================= 설정 · 업데이트 확인 ================= */
const APP_VERSION = '2026.11.23.10';
const UPDATE_URL = 'https://aa7230-max.github.io/farm-village/version.json';
let updBusy = false;   // 확인 중에 다시 눌러도 요청이 겹치지 않게 해요
function checkUpdate() {
  const msg = document.getElementById('updMsg'); if (!msg || updBusy) return;
  updBusy = true; msg.textContent = '업데이트를 확인하는 중...';
  fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => {
      if (j.version === APP_VERSION) { msg.textContent = '✅ 최신 버전이에요 (' + APP_VERSION + ')'; return; }
      msg.innerHTML = '🆕 새 버전 ' + j.version + ' 이 있어요. ' + (j.note || '') + '<br><button class="btn leaf" id="bApplyUpd" style="margin-top:8px">⬇ 지금 업데이트</button>';
      document.getElementById('bApplyUpd').onclick = () => applyUpdate(j.version);
    })
    .catch(() => { msg.textContent = '⚠ 업데이트 정보를 가져오지 못했어요. 인터넷 연결을 확인해 주세요.'; })
    .finally(() => { updBusy = false; });
}
// 게임은 서버(Pages)에서 불러와요. 새 버전 번호로 다시 열면 최신 파일을 받아요 (APK 재설치 불필요)
function applyUpdate(ver) {
  const msg = document.getElementById('updMsg'); if (msg) msg.textContent = '⬇ 새 버전을 받는 중...';
  setTimeout(() => location.replace(location.pathname + '?v=' + encodeURIComponent(ver)), 250);
}
/* ================= 상점 · 추천 ================= */
const SHOP = [
  { name: '🪵 나무 10개', cost: 4, buy: () => { G.res.wood += 10; } },
  { name: '🪨 돌 10개', cost: 4, buy: () => { G.res.stone += 10; } },
  { name: '🌿 섬유 10개', cost: 4, buy: () => { G.res.fiber = (G.res.fiber || 0) + 10; } },
  { name: '💠 보석나무 회복 +40', cost: 8, buy: () => { G.coreHp = Math.min(200, (G.coreHp == null ? 200 : G.coreHp) + 40); } },
  { name: '❤ 내 체력 회복 +40', cost: 6, buy: () => { G.hp = Math.min(G.maxHp, G.hp + 40); } }
];
function renderShop() {
  const box = document.getElementById('shopList'); if (!box || !G) return;
  box.innerHTML = '';
  const gems = G.res.gems || 0;
  document.getElementById('shopGems').textContent = '💎 ' + gems;
  SHOP.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (gems >= it.cost ? ' leaf' : '');
    b.style.cssText = 'width:100%;margin:4px 0';
    b.textContent = it.name + '  ·  💎' + it.cost;
    b.disabled = gems < it.cost;
    b.onclick = () => buyItem(i);
    box.appendChild(b);
  });
}
function buyItem(i) {
  const it = SHOP[i];
  if (!G || (G.res.gems || 0) < it.cost) { toast('보석이 부족해요.'); return; }
  G.res.gems -= it.cost; it.buy(); sfx('gem'); vib('place');
  toast('🛒 ' + it.name + ' 구입!'); persistRun(); renderShop();
}
function recommendNext() {   // 지금 상황에서 가장 도움 되는 한 가지를 추천해요
  if (!G) return null;
  const gems = G.res.gems || 0;
  if (G.coreHp != null && G.coreHp < 90 && gems >= 4) return '💠 보석나무가 약해요 — 🛒 상점에서 회복(💎4)을 사세요';
  if (G.hp < G.maxHp * .4 && gems >= 3) return '❤ 체력이 낮아요 — 🛒 상점에서 체력 회복(💎3)을 사세요';
  if (G.res.wood < 5 || G.res.stone < 5) return '🪵 재료가 모자라요 — 나무·돌을 모아 건설 재료를 채우세요';
  if (!Object.values(G.b).some(b => b.t === 'LAMP') && nightF(G.cycT) > .4) return '💡 밤이 와요 — 전등을 놓으면 적을 더 잘 볼 수 있어요';
  return null;
}
function setupShop() {
  const modal = document.getElementById('shopModal'); if (!modal) return;
  document.getElementById('bShop').onclick = () => { renderShop(); modal.classList.add('show'); };
  document.getElementById('bShopClose').onclick = () => modal.classList.remove('show');
}
function setupSettings() {
  const $$ = id => document.getElementById(id);
  const modal = $$('setModal'); if (!modal) return;
  const sync = () => {
    $$('bgmVol').value = settings.bgm; $$('sfxVol').value = settings.sfxVol;
    $$('bgmVal').textContent = settings.bgm + '%'; $$('sfxVal').textContent = settings.sfxVol + '%';
    $$('camDist').value = settings.camDist || 19; $$('camVal').textContent = (settings.camDist || 19) + ' (가까움 12 ~ 멀리 30)';
    $$('bSetSound').textContent = settings.sfx ? '🔊 효과음 켬' : '🔇 효과음 끔';
    $$('bSetVib').textContent = settings.vib ? '📳 진동 켬' : '📴 진동 끔';
    $$('verTxt').textContent = APP_VERSION;
  };
  $$('bSettings').onclick = () => { sync(); modal.classList.add('show'); audio(); };
  $$('bSetClose').onclick = () => modal.classList.remove('show');
  $$('bGuide').onclick = () => $$('guideModal').classList.add('show');
  $$('bGuideClose').onclick = () => $$('guideModal').classList.remove('show');
  $$('bgmVol').oninput = e => { settings.bgm = +e.target.value; saveSettings(); sync(); applyMusicVol(); };
  $$('camDist').oninput = e => { settings.camDist = +e.target.value; saveSettings(); sync(); };
  $$('sfxVol').oninput = e => { settings.sfxVol = +e.target.value; saveSettings(); sync(); };
  $$('sfxVol').onchange = () => sfx('place');
  $$('bSetSound').onclick = () => { settings.sfx = !settings.sfx; saveSettings(); sync(); if (settings.sfx) sfx('place'); };
  $$('bSetVib').onclick = () => { settings.vib = !settings.vib; saveSettings(); sync(); if (settings.vib) vib('place'); };
  $$('bUpdate').onclick = checkUpdate;
  // 소리는 사용자가 처음 누를 때부터 나와요 (브라우저 규칙)
  const unlock = () => { audio(); if (AC && AC.state === 'running') document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);
  // 몬스터가 살아 있으면 전투 곡, 아니면 잔잔한 곡
  setInterval(() => { setTrack(mons.some(m => !m.dead) ? 'battle' : 'field'); }, 500);
  // 앱을 열 때 조용히 새 버전을 확인해서, 있으면 설정 버튼에 🆕 표시를 달아요
  silentUpdateCheck();
}
function silentUpdateCheck() {
  fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      if (!j || j.version === APP_VERSION) return;
      const b = document.getElementById('bSettings'); if (b) b.textContent = '⚙ 설정 🆕';
      toast('🆕 새 업데이트가 있어요. 설정 → 업데이트 확인에서 받을 수 있어요.');
    })
    .catch(() => { });
}
setupSettings();
setupShop();

/* ================= 아파트 대결 (3D): 모험 필드에 아파트 두 채, 옥상에서 번개를 포물선으로 던져요 ================= */
const DUEL_DIFF = { '쉬움': { err: .2, perr: .18, think: 2.4 }, '보통': { err: .11, perr: .1, think: 1.7 }, '어려움': { err: .05, perr: .05, think: 1.1 } };
const DUEL_WIN_HITS = 5, DUEL_MAX_LV = 5, DUEL_CYCLE = 1.5, DUEL_GRAV = 18, DUEL_DT = .02;
const DUEL = { open: false, lv: 1, rule: null, wind: 0, moving: false, mt: 0, diff: '보통', wrap: null, cv2: null, g2: null, W: 0, H: 0, grp: null, hidden: [], loginEl: null, me: null, ai: null, top: 0, pillar: null, orb: null, trails: [], shot: null, turn: 'me', hits: { me: 0, ai: 0 }, phase: 'aim', hold: false, holdT: 0, pow: 0, ang: .9, aiT: 0, over: false, win: null, msg: '', msgT: 0, last: 0, raf: 0 };
function duelSep() { return 7 + .8 * (DUEL.lv - 1); }   // 레벨이 오를수록 두 아파트 사이가 멀어져요
function duelHead(S) { return new THREE.Vector3(S.root.position.x, S.root.position.y + DUEL.top + 1.25, 0); }
function duelProj(v) { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * DUEL.W, y: (1 - p.y) / 2 * DUEL.H }; }
function duelWindA() { return DUEL.rule === 'wind' ? DUEL.wind * 2.2 : 0; }   // 바람은 옆으로 미는 힘이에요
function duelRuleName() { return DUEL.rule === 'wind' ? '바람 ' + (DUEL.wind > 0 ? '→' : '←') : DUEL.rule === 'moving' ? '상대 아파트가 위아래로 움직여요' : DUEL.rule === 'obstacle' ? '가운데 기둥이 있어요' : ''; }
function duelMsg(t) { DUEL.msg = t; DUEL.msgT = 1.8; }

// 아파트 한 채: 기존 마을 집 모델을 키워서 써요
function duelApartment() {
  const src = VILLAGE.house_b || VILLAGE.house_a, g = new THREE.Group();
  if (src) g.add(src.clone());
  else { const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.2), new THREE.MeshLambertMaterial({ color: 0xf2e6d0 })); m.position.y = 1.3; g.add(m); }
  g.scale.set(.9, 2, .9);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
// 기존 캐릭터(직업 옷 포함)를 옥상에 세워요
function duelChar(cls, tint) {
  const m = new THREE.Group();
  const body = (creatureProto && THREE.SkeletonUtils) ? THREE.SkeletonUtils.clone(creatureProto) : fallbackChar();
  m.add(body); m.add(gear(cls));
  if (cls === 'archer' && antlersProto) { const an = antlersProto.clone(); an.position.set(0, 1.3, 0); m.add(an); }
  if (tint) tintObj(m, tint);
  m.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return m;
}
// 모험 필드는 그대로 두고, 대결에 필요 없는 것만 숨겨요 (하늘·땅·조명은 유지)
function duelEnterScene() {
  DUEL.hidden = [];
  for (const o of scene.children) {
    if (o.isLight || o.isCamera) continue;
    const gp = o.geometry && o.geometry.parameters;
    if (gp && (gp.radius === 150 || gp.width === 260)) continue;
    if (o.visible) { DUEL.hidden.push(o); o.visible = false; }
  }
}
function duelBuild() {
  const grp = new THREE.Group(); scene.add(grp); DUEL.grp = grp;
  const probe = duelApartment(); probe.updateMatrixWorld(true);
  DUEL.top = new THREE.Box3().setFromObject(probe).max.y;   // 아파트 옥상 높이
  const mk = (cls, tint) => {
    const r = new THREE.Group(); r.add(duelApartment());
    const c = duelChar(cls, tint); c.position.y = DUEL.top; r.add(c); grp.add(r);
    return { root: r, char: c, hitT: 0 };
  };
  DUEL.me = mk(profile.cls || 'mage', null);
  DUEL.ai = mk(['mage', 'archer', 'warrior'][Math.floor(Math.random() * 3)], 0xff9ac0);
  DUEL.pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 1.2), new THREE.MeshLambertMaterial({ color: 0x5a4a6a }));
  DUEL.pillar.position.set(0, 3.5, 0); DUEL.pillar.visible = false; grp.add(DUEL.pillar);
}
function duelFitCam() {   // 두 아파트가 화면에 다 들어오도록 카메라 거리를 맞춰요
  const sep = duelSep(), fov = camera.fov * Math.PI / 180, aspect = innerWidth / innerHeight;
  const half = sep / 2 + 3.2, d = Math.max(10, half / (Math.tan(fov / 2) * aspect));
  camera.aspect = aspect; camera.position.set(0, 5.2, d); camera.lookAt(0, 3.4, 0); camera.updateProjectionMatrix();
}
function duelLayout() {
  const sep = duelSep();
  DUEL.me.root.position.set(-sep / 2, 0, 0); DUEL.ai.root.position.set(sep / 2, 0, 0);
  DUEL.pillar.visible = DUEL.rule === 'obstacle';
  duelFitCam();
}

// 포물선 궤적을 미리 계산해요 (미리보기와 실제 발사가 같은 식을 써요)
function duelTrace(S, T, s, ang, pow) {
  const o = duelHead(S); o.x += s * .5; o.y += .2;
  const sp = 6 + pow / 100 * 12, vx = Math.cos(ang) * sp * s, vy = Math.sin(ang) * sp, wa = duelWindA();
  const tTop = T.root.position.y + DUEL.top, fx0 = T.root.position.x - 1.4, fx1 = T.root.position.x + 1.4;
  const pts = [o.clone()], res = { hit: false, perfect: false, blocked: false, pts };
  for (let i = 1; i < 600; i++) {
    const t = i * DUEL_DT, nx = o.x + vx * t + .5 * wa * t * t, ny = o.y + vy * t - .5 * DUEL_GRAV * t * t;
    const pv = new THREE.Vector3(nx, ny, 0); pts.push(pv);
    if (DUEL.rule === 'obstacle' && Math.abs(nx) <= .6 && ny >= 0 && ny <= 7) { res.blocked = true; break; }
    if (fx0 <= nx && nx <= fx1 && ny <= tTop + .25) {   // 상대 옥상 위로 떨어졌어요
      if (ny >= tTop - .6) { res.hit = true; res.perfect = Math.hypot(nx - T.root.position.x, ny - (tTop + 1.25)) < 1.0; }
      break;
    }
    if (ny < 0) break;
  }
  return res;
}
function duelFire(shooter, ang, pow) {
  const S = shooter === 'me' ? DUEL.me : DUEL.ai, T = shooter === 'me' ? DUEL.ai : DUEL.me, s = shooter === 'me' ? 1 : -1;
  const r = duelTrace(S, T, s, ang, pow), col = shooter === 'me' ? 0x9fe6ff : 0xff8fb8;
  DUEL.shot = { shooter, t: 0, pts: r.pts, hit: r.hit, perfect: r.perfect, blocked: r.blocked, col };
  DUEL.phase = 'shot'; DUEL.hold = false;
  if (DUEL.orb) DUEL.grp.remove(DUEL.orb);
  DUEL.orb = new THREE.Mesh(new THREE.SphereGeometry(.24, 12, 10), new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  DUEL.orb.position.copy(r.pts[0]); DUEL.grp.add(DUEL.orb);
  sfx('skill');
}
function duelTrail(p, col) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.position.copy(p); DUEL.grp.add(m); DUEL.trails.push({ m, life: .4 });
}
function duelAiShoot() {   // AI: 상대 옥상에 떨어지도록 던질 힘을 계산해요
  const cfg = DUEL_DIFF[DUEL.diff], S = DUEL.ai, T = DUEL.me;
  const o = duelHead(S); o.x -= .5; o.y += .2;
  const tTop = T.root.position.y + DUEL.top, dx = Math.abs(T.root.position.x - o.x), dy = tTop + .3 - o.y;
  const th = .85 + (Math.random() * 2 - 1) * cfg.err, c = Math.cos(th), den = dx * Math.tan(th) - dy;
  let v = den > 0 ? Math.sqrt(DUEL_GRAV * dx * dx / (2 * c * c * den)) : 14;
  v *= 1 + (Math.random() * 2 - 1) * cfg.perr;
  duelFire('ai', th, clamp((v - 6) / 12 * 100, 0, 100));
}
function duelAfterShot() {
  const S = DUEL.shot, victim = S.shooter === 'me' ? DUEL.ai : DUEL.me, last = S.pts[S.pts.length - 1];
  duelTrail(last, S.col);
  if (S.blocked) duelMsg('🏢 기둥에 막혔어요!');
  else if (S.hit) { DUEL.hits[S.shooter]++; victim.hitT = .5; duelMsg(S.perfect ? '💥 완벽! 정확히 꽂혔어요' : (S.shooter === 'me' ? '⚡ 명중!' : '😈 상대가 명중시켰어요')); vib('hit'); }
  else duelMsg(S.shooter === 'me' ? '빗나갔어요…' : '상대가 빗나갔어요!');
  if (DUEL.hits[S.shooter] >= DUEL_WIN_HITS) { DUEL.over = true; DUEL.win = S.shooter; DUEL.phase = 'done'; duelFinish(); return; }
  DUEL.turn = S.shooter === 'me' ? 'ai' : 'me';
  if (DUEL.turn === 'ai') { DUEL.phase = 'ai'; DUEL.aiT = DUEL_DIFF[DUEL.diff].think; } else DUEL.phase = 'aim';
}
function duelFinish() {
  profile.duelPlay = (profile.duelPlay || 0) + 1; if (DUEL.win === 'me') profile.duelWin = (profile.duelWin || 0) + 1; saveProfile();
  const box = DUEL.wrap.querySelector('#duelEnd'); box.style.display = 'block';
  box.innerHTML = (DUEL.win === 'me' ? (DUEL.lv >= DUEL_MAX_LV ? '👑 전 레벨 클리어!' : '🏆 Lv.' + DUEL.lv + ' 승리!') : '😈 아쉽게 졌어요') + '<div style="font-size:13px;font-weight:700;margin:6px 0 10px">전적 ' + (profile.duelWin || 0) + '승 / ' + profile.duelPlay + '판</div>';
  const again = document.createElement('button'); again.className = 'btn'; again.textContent = '다시 도전'; again.onclick = duelReset;
  const out = document.createElement('button'); out.className = 'btn'; out.textContent = '나가기'; out.style.marginLeft = '6px'; out.onclick = closeDuel;
  if (DUEL.win === 'me' && DUEL.lv < DUEL_MAX_LV) {
    const next = document.createElement('button'); next.className = 'btn primary'; next.textContent = '다음 레벨 (Lv.' + (DUEL.lv + 1) + ')'; next.onclick = duelNext;
    box.append(next, out, again);
  } else box.append(again, out);
}
function duelReset() {
  DUEL.hits = { me: 0, ai: 0 }; DUEL.turn = 'me'; DUEL.phase = 'aim'; DUEL.hold = false; DUEL.pow = 0; DUEL.over = false; DUEL.win = null; DUEL.shot = null;
  if (DUEL.orb) { DUEL.grp.remove(DUEL.orb); DUEL.orb = null; }
  DUEL.me.hitT = 0; DUEL.ai.hitT = 0;
  if (DUEL.wrap) { const box = DUEL.wrap.querySelector('#duelEnd'); if (box) { box.style.display = 'none'; box.innerHTML = ''; } }
  duelMsg('화면을 누른 채 방향을 정하고, 힘이 맞을 때 손을 떼세요. 포물선으로 던져요!');
}
function duelPickRule() {   // 4레벨부터 룰이 하나씩 랜덤으로 붙어요: 바람 / 움직이는 아파트 / 가운데 기둥
  DUEL.rule = null; DUEL.wind = 0; DUEL.moving = false; DUEL.mt = 0;
  if (DUEL.lv < 4) return;
  DUEL.rule = ['wind', 'moving', 'obstacle'][Math.floor(Math.random() * 3)];
  if (DUEL.rule === 'wind') DUEL.wind = (Math.random() < .5 ? -1 : 1) * (.5 + Math.random() * .5);
  if (DUEL.rule === 'moving') DUEL.moving = true;
}
function duelNext() {
  DUEL.lv = Math.min(DUEL_MAX_LV, DUEL.lv + 1);
  duelPickRule(); duelLayout(); duelTopBar(); duelReset();
  duelMsg('Lv.' + DUEL.lv + ' 시작!' + (DUEL.rule ? ' 새 룰: ' + duelRuleName() : ' 거리가 더 멀어졌어요'));
}
function duelUpdate(dt) {
  if (DUEL.msgT > 0) DUEL.msgT -= dt;
  DUEL.mt += dt;
  if (DUEL.moving) DUEL.ai.root.position.y = 1.5 * (.5 - .5 * Math.cos(DUEL.mt * 1.4));
  for (const S of [DUEL.me, DUEL.ai]) { if (S.hitT > 0) { S.hitT -= dt; S.char.rotation.z = Math.sin(S.hitT * 30) * .18 * (S.hitT / .5); } else S.char.rotation.z = 0; }
  for (let i = DUEL.trails.length - 1; i >= 0; i--) {
    const tr = DUEL.trails[i]; tr.life -= dt; tr.m.material.opacity = Math.max(0, tr.life * 2.5);
    if (tr.life <= 0) { DUEL.grp.remove(tr.m); tr.m.geometry.dispose(); tr.m.material.dispose(); DUEL.trails.splice(i, 1); }
  }
  if (DUEL.hold) { DUEL.holdT += dt; const t = (DUEL.holdT % DUEL_CYCLE) / DUEL_CYCLE; DUEL.pow = (t < .5 ? t * 2 : 2 - t * 2) * 100; }
  if (DUEL.phase === 'shot') {
    const S = DUEL.shot; S.t += dt;
    const idx = Math.min(S.pts.length - 1, Math.floor(S.t / DUEL_DT));
    DUEL.orb.position.copy(S.pts[idx]);
    if (idx % 3 === 0) duelTrail(S.pts[idx], S.col);
    if (S.t >= S.pts.length * DUEL_DT + .35) duelAfterShot();
  } else if (DUEL.phase === 'ai') { DUEL.aiT -= dt; if (DUEL.aiT <= 0) duelAiShoot(); }
}
function duelHud() {   // 글자·게이지·포물선 미리보기는 위에 겹쳐 그려요
  const c = DUEL.g2, W = DUEL.W, H = DUEL.H;
  c.clearRect(0, 0, W, H); c.textAlign = 'center';
  for (const [S, name, col, hp] of [[DUEL.me, '나', '#ffe08a', DUEL_WIN_HITS - DUEL.hits.ai], [DUEL.ai, 'AI', '#f5a3c7', DUEL_WIN_HITS - DUEL.hits.me]]) {
    const p = duelProj(new THREE.Vector3(S.root.position.x, S.root.position.y + DUEL.top + 2.6, 0));
    c.font = '900 16px system-ui,sans-serif'; c.fillStyle = col; c.fillText(name, p.x, p.y - 22);
    c.font = '16px system-ui,sans-serif'; c.fillStyle = '#ff6b8a'; c.fillText('❤'.repeat(Math.max(0, hp)) + '♡'.repeat(Math.max(0, DUEL_WIN_HITS - hp)), p.x, p.y - 4);
  }
  c.font = '800 14px system-ui,sans-serif'; c.fillStyle = '#fff';
  c.fillText('⚔ Lv.' + DUEL.lv + ' · ' + DUEL_WIN_HITS + '번 맞히면 승리 · 난이도 ' + DUEL.diff, W / 2, 26);
  if (DUEL.rule) { c.fillStyle = '#ffd166'; c.font = '800 13px system-ui,sans-serif'; c.fillText('룰: ' + duelRuleName(), W / 2, 46); }
  if (DUEL.hold && DUEL.turn === 'me') {   // 손을 떼면 이렇게 날아가요
    const r = duelTrace(DUEL.me, DUEL.ai, 1, DUEL.ang, DUEL.pow);
    c.setLineDash([6, 8]); c.strokeStyle = 'rgba(159,243,255,.9)'; c.lineWidth = 3; c.beginPath();
    r.pts.forEach((v, i) => { const q = duelProj(v); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); c.stroke(); c.setLineDash([]);
    const e = duelProj(r.pts[r.pts.length - 1]); c.fillStyle = 'rgba(159,243,255,.8)'; c.beginPath(); c.arc(e.x, e.y, 7, 0, Math.PI * 2); c.fill();
  }
  const bx = W * .2, bw = W * .6, by = H - 46;   // 힘 게이지
  c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(bx - 4, by - 4, bw + 8, 26);
  c.fillStyle = DUEL.turn === 'me' ? '#ffd166' : '#667788'; c.fillRect(bx, by, bw * (DUEL.hold ? DUEL.pow : 0) / 100, 18);
  c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(bx, by, bw, 18);
  c.fillStyle = '#fff'; c.font = '800 14px system-ui,sans-serif';
  c.fillText(DUEL.turn === 'ai' ? 'AI가 던지는 중…' : (DUEL.hold ? '힘 ' + Math.round(DUEL.pow) + '% · 포물선을 보고 손을 떼요' : '화면을 누른 채 방향을 정하고, 힘이 맞을 때 손을 떼요'), W / 2, by - 8);
  if (DUEL.msgT > 0) {
    c.globalAlpha = Math.min(1, DUEL.msgT); c.font = '900 22px system-ui,sans-serif';
    c.strokeStyle = '#000'; c.lineWidth = 4; c.strokeText(DUEL.msg, W / 2, H * .14); c.fillStyle = '#fff'; c.fillText(DUEL.msg, W / 2, H * .14);
    c.globalAlpha = 1;
  }
}
function duelResize() {
  if (!DUEL.cv2) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  DUEL.W = innerWidth; DUEL.H = innerHeight;
  DUEL.cv2.width = Math.round(DUEL.W * dpr); DUEL.cv2.height = Math.round(DUEL.H * dpr);
  DUEL.cv2.style.width = DUEL.W + 'px'; DUEL.cv2.style.height = DUEL.H + 'px';
  DUEL.g2.setTransform(dpr, 0, 0, dpr, 0, 0);
  duelFitCam();
}
function duelTopBar() {
  const top = DUEL.wrap.querySelector('#duelTop'); top.innerHTML = '';
  const left = document.createElement('div'); left.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;pointer-events:auto';
  for (const d of Object.keys(DUEL_DIFF)) {
    const b = document.createElement('button'); b.className = 'chip'; b.style.pointerEvents = 'auto';
    b.textContent = (d === DUEL.diff ? '● ' : '') + d; b.onclick = () => { DUEL.diff = d; duelTopBar(); duelReset(); };
    left.appendChild(b);
  }
  const exit = document.createElement('button'); exit.className = 'chip'; exit.style.pointerEvents = 'auto'; exit.textContent = '✕ 나가기'; exit.onclick = closeDuel;
  top.append(left, exit);
}
function duelLoop(now) {
  if (!DUEL.open) return;
  const dt = Math.min(.05, Math.max(0, (now - DUEL.last) / 1000)); DUEL.last = now;
  if (!DUEL.over) duelUpdate(dt);
  renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera);
  duelHud(); DUEL.raf = requestAnimationFrame(duelLoop);
}
function openDuel() {
  if (DUEL.open) return;
  if (!scene || !renderer) { toast('화면을 준비하는 중이에요. 잠시 후 다시 눌러 주세요'); return; }
  DUEL.open = true; DUEL.lv = 1; DUEL.trails = [];
  DUEL.loginEl = document.getElementById('login'); if (DUEL.loginEl) DUEL.loginEl.style.display = 'none';
  const wrap = document.createElement('div'); wrap.id = 'duelWrap';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:70;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden;background:transparent';
  wrap.innerHTML = '<canvas id="duelCv" style="position:absolute;left:0;top:0"></canvas>' +
    '<div id="duelTop" style="position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:6px;padding:8px 10px;pointer-events:none"></div>' +
    '<div id="duelEnd" style="display:none;position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);background:var(--paper);border:3px solid var(--line);border-radius:20px;padding:16px 20px;text-align:center;font-weight:900;font-size:18px;color:#4a3320;min-width:240px"></div>';
  document.body.appendChild(wrap);
  DUEL.wrap = wrap; DUEL.cv2 = wrap.querySelector('#duelCv'); DUEL.g2 = DUEL.cv2.getContext('2d');
  duelEnterScene(); duelBuild();
  const cv = DUEL.cv2;
  const aimFrom = e => {   // 누른 위치로 던질 방향을 정해요 (위쪽으로 포물선)
    const h = duelProj(duelHead(DUEL.me)), r = cv.getBoundingClientRect();
    DUEL.ang = clamp(Math.atan2(h.y - (e.clientY - r.top), (e.clientX - r.left) - h.x), -.2, 1.45);
  };
  cv.addEventListener('pointerdown', e => {
    if (DUEL.over || DUEL.phase !== 'aim' || DUEL.turn !== 'me') return;
    DUEL.hold = true; DUEL.holdT = 0; DUEL.pow = 0; aimFrom(e);
    try { cv.setPointerCapture(e.pointerId); } catch (x) { }
  });
  cv.addEventListener('pointermove', e => { if (DUEL.hold) aimFrom(e); });
  const release = () => { if (DUEL.hold) duelFire('me', DUEL.ang, DUEL.pow); };
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
  window.addEventListener('resize', duelResize);
  DUEL.lv = 1; duelResize(); duelPickRule(); duelLayout(); duelTopBar(); duelReset();
  DUEL.last = performance.now(); DUEL.raf = requestAnimationFrame(duelLoop);
}
function closeDuel() {
  if (!DUEL.open) return;
  DUEL.open = false; cancelAnimationFrame(DUEL.raf); window.removeEventListener('resize', duelResize);
  DUEL.hidden.forEach(o => { o.visible = true; }); DUEL.hidden = [];
  if (DUEL.grp) { scene.remove(DUEL.grp); DUEL.grp = null; }
  DUEL.trails = []; DUEL.orb = null;
  if (DUEL.loginEl) DUEL.loginEl.style.display = '';
  if (DUEL.wrap) DUEL.wrap.remove(); DUEL.wrap = null; DUEL.hold = false;
}
const _bDuel = document.getElementById('bDuel'); if (_bDuel) _bDuel.onclick = openDuel;
