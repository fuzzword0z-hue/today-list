'use strict';

/* ───────── 저장소 ─────────
 * 모든 데이터는 이 기기의 localStorage 한 곳에만 저장된다. 서버·계정·동기화 없음.
 * {
 *   v: 2,
 *   days: { 'YYYY-MM-DD': [ { id, t, d, at?, m?, f? } ] },   할 일
 *     t 내용 · d 완료(0/1) · at 완료 시각(ms) · m 미룬 날짜 · f 가져온 원래 날짜
 *   events: [ { id, title, cat, date, time?, rep?, until?, ex?, memo?, done? } ],   일정
 *     cat 'work'(공적) | 'life'(사적) | 'care'(케어)
 *     rep { t: 'd'|'w'|'m', n } 반복 — d: n일마다, w: n주마다, m: n달마다
 *     until 반복 끝나는 날 · ex 반복 중 뺀 날짜들 · done { 'YYYY-MM-DD': ms } 케어 완료 기록
 *   dismissed: 'YYYY-MM-DD' | null,   '못 끝낸 일' 배너를 닫은 날
 *   seen: [ 'YYYY-MM' | 'YYYY' ],     열어 본 리포트
 *   lastExport: ms | undefined,       마지막으로 백업 파일을 내보낸 시각
 *   cond: { 'YYYY-MM-DD': { ap, en, vo, vl, st, w, n, th, night } }   고양이 컨디션 (js/care.js)
 *   did: { 'YYYY-MM-DD': [id] }, didItems: [{ id, label, off }]   오늘 한 것 (운동 · 공부 · 명상 · 직접 더한 것, js/did.js)
 *   medi: { 'YYYY-MM-DD': ['am' | 'pm'] }, medId   명상 1분 (일어나서 · 자기 전, js/med.js)
 *   workout, workouts, study, studies   없앤 운동 · 공부 탭의 기록 (did로 옮겼고, 백업에 그대로 남긴다)
 *   daymode: { 'YYYY-MM-DD': 'weekday' | 'weekend' }   출근일 · 쉬는 날을 기본(매주 쉬는 요일)과 다르게 고른 날
 *   offDays: [요일]   매주 쉬는 요일 (0 = 일요일, 처음엔 [1] 월요일)
 *   weights, labs                     내 체중 · 진료 검사 수치 (js/health.js)
 *   health, hgoal, hstart             없앤 '안 지킨 것' 체크와 주 목표 (백업에 그대로 남긴다)
 *   diary: { 'YYYY-MM-DD': { t, at } }   감사일기 (js/diary.js)
 *   mind, compass, compassHide, feelCustom, fillCustom  일기 탭의 나머지: 오늘 해낸 것 · 마음 이름 · 질문 · 나를 채우는 시간 ·
 *                                     흔들린 순간, 나침반 문장 (js/diary.js)
 *   sns, money                        없앤 '나를 지키는 환경' 칸 (백업에 그대로 남긴다)
 *   budget: { items, cats, inst, months }   급여일에 적는 가계부 · 비상금에서 꺼낸 돈 · 모아 둔 돈 (통계 탭 → 가계부, js/budget.js)
 * 케어 일정에는 ck('dose' 투약·처치 | 'vet' 병원)와 skip { 'YYYY-MM-DD': ms } (못 함·안 감)이 더 붙는다.
 * }
 */
const STORE = 'today-list:v1';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
/* 오늘 한 것: 기본 항목 (오늘 화면에서 고치고 더할 수 있다) */
const DID_DEFAULT = [{ id: 'ex', label: '운동' }, { id: 'study', label: '공부' }];
/* 가계부 기본 항목 (예전 구글 시트 그대로, 통계 → 가계부 → 항목 고치기에서 바꾼다). amt = 매달 같은 돈, card = 카드값 */
const BUDGET_ITEMS = [
  { id: 'pay', g: 'in', label: '급여' },
  { id: 'bonus', g: 'in', label: '상여금+기타 수당' },
  { id: 'rent', g: 'out', label: '월세+관리비+보험+디딤씨앗(기부)', amt: 420000 },
  { id: 'phone', g: 'out', label: '핸드폰+인터넷+가스비', amt: 121000 },
  { id: 'family', g: 'out', label: '가족여행비(모임비)', amt: 50000 },
  { id: 'credit', g: 'out', label: '카드값(신용카드)', card: 1 },
  { id: 'check', g: 'out', label: '카드값(체크카드)', card: 1 },
  { id: 'irp', g: 'save', label: 'IRP(미래에셋)' },
  { id: 'isa', g: 'save', label: 'ISA(미래에셋)' },
  { id: 'pension', g: 'save', label: '연금저축펀드(삼성)' },
  { id: 'sub', g: 'save', label: '청약', amt: 20000 },
  { id: 'emerg', g: 'save', label: '비상금(찡찡이 병원비)' }, // 찡찡이 병원비 = 비상금 (7-24)
];
/* 다음 급여일까지 쓸 돈 (계획) */
const BUDGET_CATS = [
  { id: 'food', label: '식비', amt: 150000 },
  { id: 'catfood', label: '고양이 간식·캔', amt: 100000 },
  { id: 'people', label: '가족·친구', amt: 300000 },
  { id: 'catvet', label: '고양이 병원비(예상)' },
];
/* 일기 탭 맨 위 나침반: 내가 지향하는 문장 (일기 탭에서 고칠 수 있다) */
const COMPASS_DEFAULT = [
  '내가 선택한 것에 내가 책임지는 어른이 되자',
  '미성숙한 사람도 노력하면 성숙해질 수 있다',
  '나를 사랑할 수록 타인도 사랑할 수 있는 법',
];

let state = load();

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE)); } catch (e) { /* 손상된 데이터는 무시 */ }
  return normalize(s && s.days && typeof s.days === 'object' ? s : { days: {} });
}

/* 예전 형식(v1)이나 백업 파일에서 읽은 데이터에 빠진 항목을 채운다 */
function normalize(s) {
  s.v = 2;
  s.events = Array.isArray(s.events) ? s.events : [];
  s.seen = Array.isArray(s.seen) ? s.seen : [];
  const obj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  s.cond = obj(s.cond) ? s.cond : {};
  s.workouts = obj(s.workouts) ? s.workouts : {};
  s.workout = obj(s.workout) && obj(s.workout.c) ? s.workout : { date: null, c: {} };
  s.studies = obj(s.studies) ? s.studies : {};
  s.study = obj(s.study) ? s.study : { date: null };
  // 예전 평일 칸(a = 1차 저녁 7:00–8:30, b = 2차 9:30–11:00)에 적어 둔 내용은 시간 줄로 옮긴다
  if ('a' in s.study || 'b' in s.study) {
    const old = [['a', '19:00', '20:30'], ['b', '21:30', '23:00']]
      .filter(([f]) => typeof s.study[f] === 'string' && s.study[f].trim())
      .map(([f, from, to]) => ({ s: from, e: to, t: s.study[f].trim() }));
    const rows = Array.isArray(s.study.rows) ? s.study.rows.filter((r) => r && (r.s || r.e || r.t)) : [];
    s.study.rows = [...old, ...rows];
    delete s.study.a;
    delete s.study.b;
  }
  // 운동 · 공부 탭을 없애며(7-20) 그 기록을 '오늘 한 것'의 한 날로 옮긴다 (한 번만 — 그 뒤 지운 체크가 되살아나지 않게)
  s.did = obj(s.did) ? s.did : {};
  s.didItems = Array.isArray(s.didItems) && s.didItems.every((x) => obj(x) && typeof x.id === 'string' && typeof x.label === 'string')
    ? s.didItems : DID_DEFAULT.map((x) => ({ ...x }));
  if (!s.didFrom) {
    const mark = (k, id) => { s.did[k] = [...new Set([...(Array.isArray(s.did[k]) ? s.did[k] : []), id])]; };
    for (const k in s.workouts) {
      const r = s.workouts[k];
      if (r && (r.ex20 || r.bike || r.sq || r.full || (Array.isArray(r.rows) && r.rows.length) || ['back', 'shoulder', 'plank', 'side'].some((f) => r[f]))) mark(k, 'ex');
    }
    for (const k in s.studies) {
      const r = s.studies[k];
      if (r && (r.review || r.min || r.a || r.b || (Array.isArray(r.rows) && r.rows.length))) mark(k, 'study');
    }
    s.didFrom = 1;
  }
  // 명상 1분(7-21): '오늘 한 것'에 명상 항목을 한 번 더한다. 이미 '명상'을 직접 더해 뒀으면 그 항목을 쓴다
  s.medi = obj(s.medi) ? s.medi : {};
  if (!s.medId) {
    const own = s.didItems.find((x) => x.label.trim() === '명상');
    if (own) { s.medId = own.id; delete own.off; } else { s.didItems.push({ id: 'med', label: '명상' }); s.medId = 'med'; }
  }
  s.daymode = obj(s.daymode) ? s.daymode : {};
  if (!Array.isArray(s.offDays) || !s.offDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) s.offDays = [1];
  s.health = obj(s.health) ? s.health : {};
  for (const d in s.health) {
    const h = s.health[d];
    if (!h) continue;
    // 늦게 잔 이유는 여러 개 고르게 바뀜: 예전 한 개짜리 → 목록
    if (typeof h.lateWhy === 'string') h.lateWhy = [h.lateWhy];
    if (h.snackNote !== undefined && typeof h.snackNote !== 'string') delete h.snackNote;
  }
  s.hgoal = obj(s.hgoal) ? s.hgoal : {};
  // 고양이를 지켜본 밤(늦게 잠 · 고양이 케어)은 고양이 컨디션의 '밤에 지켜봄'으로 옮긴다 (한 번만)
  if (!s.nightFrom) {
    for (const d in s.health) {
      const h = s.health[d];
      if (!h || !h.late || !(Array.isArray(h.lateWhy) ? h.lateWhy : [h.lateWhy]).includes('cat')) continue;
      const why = Array.isArray(h.lateCat) && h.lateCat.length ? h.lateCat : ['watch'];
      const c = obj(s.cond[d]) ? s.cond[d] : {};
      s.cond[d] = { ...c, night: [...new Set([...(Array.isArray(c.night) ? c.night : []), ...why])] };
    }
    s.nightFrom = 1;
  }
  s.weights = obj(s.weights) ? s.weights : {};
  s.labs = obj(s.labs) ? s.labs : {};
  s.diary = obj(s.diary) ? s.diary : {};
  s.mind = obj(s.mind) ? s.mind : {};
  // 예전 '혼자만의 시간'(alone) → '나를 채우는 시간'(fill): 혼자 산책 → 햇볕·산책, 전시·카페 · 혼자 여행 → 나들이 (혼밥은 그대로)
  const ALONE_TO_FILL = { walk: 'sun', culture: 'outing', trip: 'outing' };
  for (const d in s.mind) {
    const m = s.mind[d];
    if (!m || typeof m !== 'object' || !Array.isArray(m.alone)) continue;
    m.fill = [...new Set([...(Array.isArray(m.fill) ? m.fill : []), ...m.alone.map((a) => ALONE_TO_FILL[a] || a)])];
    delete m.alone;
  }
  s.compass = Array.isArray(s.compass) ? s.compass.filter((t) => typeof t === 'string' && t.trim()).slice(0, 5) : COMPASS_DEFAULT.slice();
  s.compassHide = !!s.compassHide;
  s.feelCustom = Array.isArray(s.feelCustom) ? s.feelCustom.filter((t) => typeof t === 'string' && t.trim()).slice(0, 12) : [];
  s.fillCustom = Array.isArray(s.fillCustom) ? s.fillCustom.filter((t) => typeof t === 'string' && t.trim()).slice(0, 8) : [];
  // 가계부: 항목 · 계획 · 할부 · 달마다 적은 금액 (모양이 어긋난 것은 버린다)
  const b = obj(s.budget) ? s.budget : {};
  const goodItem = (x) => obj(x) && typeof x.id === 'string' && typeof x.label === 'string';
  s.budget = {
    items: Array.isArray(b.items) && b.items.every((x) => goodItem(x) && ['in', 'out', 'save'].includes(x.g)) ? b.items : BUDGET_ITEMS.map((x) => ({ ...x })),
    cats: Array.isArray(b.cats) && b.cats.every(goodItem) ? b.cats : BUDGET_CATS.map((x) => ({ ...x })),
    inst: Array.isArray(b.inst) ? b.inst.filter((x) => goodItem(x) && x.total > 0 && x.n >= 1 && /^\d{4}-\d{2}$/.test(x.start)) : [],
    months: obj(b.months) ? b.months : {},
  };
  // 찡찡이 병원비 저축 = 비상금 (7-24): 따로 있던 '찡찡이 병원비(저축)' 항목을 비상금으로 합친다 (그 항목이 남아 있을 때 한 번)
  const vet = s.budget.items.find((x) => x.id === 'vetsave');
  const emerg = s.budget.items.find((x) => x.id === 'emerg');
  if (vet && emerg) {
    for (const ym in s.budget.months) {
      const m = s.budget.months[ym];
      if (!obj(m)) continue;
      if (obj(m.v) && typeof m.v.vetsave === 'number') { m.v.emerg = (typeof m.v.emerg === 'number' ? m.v.emerg : 0) + m.v.vetsave; delete m.v.vetsave; }
      if (obj(m.bal) && m.bal.vetsave !== undefined) { if (m.fund === undefined) m.fund = m.bal.vetsave; delete m.bal.vetsave; }
    }
    s.budget.items = s.budget.items.filter((x) => x !== vet);
    if (emerg.label === '비상금') emerg.label = '비상금(찡찡이 병원비)';
    delete emerg.off;
  }
  for (const ym in s.budget.months) {
    const m = s.budget.months[ym];
    if (!/^\d{4}-\d{2}$/.test(ym) || !obj(m)) { delete s.budget.months[ym]; continue; }
    m.v = obj(m.v) ? m.v : {};
    m.plan = obj(m.plan) ? m.plan : {};
    m.bal = obj(m.bal) ? m.bal : {};
    for (const o of [m.v, m.plan, m.bal]) for (const id in o) if (typeof o[id] !== 'number' || !(o[id] >= 0)) delete o[id];
    for (const f of ['fund', 'draw']) if (m[f] !== undefined && (typeof m[f] !== 'number' || !(m[f] >= 0))) delete m[f];
    if (m.memo !== undefined && typeof m.memo !== 'string') delete m.memo;
  }
  if (s.dismissed === undefined) s.dismissed = null;
  return s;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = null;
  for (const k in state.days) if (!state.days[k].length) delete state.days[k];
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch (e) {
    toast('저장하지 못했어요. 저장 공간을 확인해 주세요.');
  }
}

/* 글자를 칠 때는 잠깐 멈췄을 때 한 번만 저장한다 (기록이 쌓이면 저장이 느려지므로).
 * 칸을 벗어나거나 앱을 내리면 바로 저장. */
let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}
const flushSave = () => { if (saveTimer) save(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
window.addEventListener('pagehide', flushSave);
document.addEventListener('focusout', flushSave);

/* 다른 창(홈 화면 앱과 브라우저 탭 등)에서 바꾼 기록을 받아 와서 다시 그린다 (나중에 저장한 쪽이 덮어쓰지 않게) */
window.addEventListener('storage', (e) => {
  if (e.key !== STORE || !e.newValue) return;
  try {
    clearTimeout(saveTimer);
    saveTimer = null;
    state = normalize(JSON.parse(e.newValue));
    render();
  } catch (err) { /* 읽을 수 없으면 무시 */ }
});

/* 되돌릴 수 있는 변경.
 * 실행 취소는 '이 변경으로 바뀐 곳'만 되돌린다. 토스트가 떠 있는 사이 다른 할 일을 체크하거나
 * 새로 적은 것은 그대로 둔다 (상태를 통째로 되돌리면 그 사이 한 일까지 사라지므로).
 * whole = true면 상태를 통째로 되돌린다 (백업 불러오기처럼 전체를 바꾼 경우). */
function undoable(msg, fn, whole = false) {
  const before = JSON.stringify(state);
  fn();
  save();
  render();
  const after = JSON.stringify(state);
  toast(msg, () => {
    if (whole) state = JSON.parse(before);
    else if (!revertChanges(JSON.parse(before), JSON.parse(after))) toast('그 사이 바뀌어서 되돌리지 못했어요');
    save();
    render();
  });
}

/* 순서와 상관없이 같은 값인지 */
function stableStr(x) {
  if (Array.isArray(x)) return `[${x.map(stableStr).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${stableStr(x[k])}`).join(',')}}`;
  return JSON.stringify(x === undefined ? null : x);
}
const sameVal = (a, b) => stableStr(a) === stableStr(b);
const isPlain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isIdList = (x) => Array.isArray(x) && x.every((v) => isPlain(v) && typeof v.id === 'string');

/* before → after 사이에 바뀐 곳: 객체는 키마다(3단계까지), id가 있는 목록(할 일·일정)은 id마다 */
function diffState(a, b, path = [], out = []) {
  if (sameVal(a, b)) return out;
  const listA = isIdList(a) || (a === undefined && isIdList(b));
  const listB = isIdList(b) || (b === undefined && isIdList(a));
  if (path.length < 3 && listA && listB) {
    const A = a || [], B = b || [];
    for (const id of new Set([...A.map((v) => v.id), ...B.map((v) => v.id)])) {
      const x = A.find((v) => v.id === id), y = B.find((v) => v.id === id);
      if (!sameVal(x, y)) out.push({ path, id, before: x, after: y, at: A.indexOf(x) });
    }
  } else if (path.length < 3 && (isPlain(a) || a === undefined) && (isPlain(b) || b === undefined)) {
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) diffState((a || {})[k], (b || {})[k], [...path, k], out);
  } else out.push({ path, before: a, after: b });
  return out;
}

/* 바뀐 곳이 지금도 '바뀐 그대로'일 때만 원래대로 (그 사이 또 바뀐 곳은 건드리지 않음) */
function revertChanges(before, after) {
  let n = 0;
  for (const c of diffState(before, after).reverse()) {
    let box = state;
    for (const k of c.path.slice(0, -1)) {
      if (!isPlain(box[k])) box[k] = {};
      box = box[k];
    }
    const last = c.path[c.path.length - 1];
    if (c.id !== undefined) {
      if (!Array.isArray(box[last])) box[last] = [];
      const list = box[last];
      const i = list.findIndex((v) => v.id === c.id);
      if (!sameVal(i < 0 ? undefined : list[i], c.after)) continue;
      if (c.before === undefined) list.splice(i, 1);
      else if (i < 0) list.splice(Math.min(c.at, list.length), 0, c.before);
      else list[i] = c.before;
    } else {
      if (!sameVal(box[last], c.after)) continue;
      if (c.before === undefined) delete box[last];
      else box[last] = c.before;
    }
    n++;
  }
  return n > 0;
}

/* ───────── 날짜 ───────── */
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return keyOf(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
const md = (k) => { const d = parse(k); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const mdw = (k) => `${md(k)} (${WD[parse(k).getDay()]})`;
const monthStart = (k) => { const d = parse(k); return keyOf(new Date(d.getFullYear(), d.getMonth(), 1)); };
const monthEnd = (k) => { const d = parse(k); return keyOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const weekStart = (k) => addDays(k, -parse(k).getDay()); // 일요일
const addMonths = (k, n) => {
  const d = parse(k);
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return keyOf(r);
};
const hm = (t) => t.replace(/^0(?=\d)/, ''); // 07:00 → 7:00

/* 출근일(weekday) · 쉬는 날(weekend): 기본은 매주 쉬는 요일. 다르게 고른 날만 state.daymode에 남긴다 (캘린더 '쉬는 날 고르기') */
const offDays = () => (Array.isArray(state.offDays) ? state.offDays : [1]); // 0 = 일요일
const defaultMode = (k) => (offDays().includes(parse(k).getDay()) ? 'weekend' : 'weekday');
const dayMode = (k) => state.daymode[k] || defaultMode(k);
function setDayMode(k, mode) {
  if (mode === defaultMode(k)) delete state.daymode[k];
  else state.daymode[k] = mode;
  save();
}

/* 오늘 기준 상대 표현: 오늘 / 내일 / 모레 / 어제 / N일 후 */
function relDay(k) {
  const n = diffDays(k, today);
  return n === 0 ? '오늘' : n === 1 ? '내일' : n === 2 ? '모레' : n === -1 ? '어제' : n > 0 ? `${n}일 후` : `${-n}일 전`;
}
const dday = (k) => { const n = diffDays(k, today); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`; };

/* 하루는 새벽 4시에 바뀐다: 자정을 넘겨 공부하거나 체크해도 그날 기록으로 남게 */
const DAY_START_HOUR = 4;
const todayKey = () => keyOf(new Date(Date.now() - DAY_START_HOUR * 36e5));
let today = todayKey();

/* ───────── 화면 상태 ───────── */
const ui = {
  date: today,          // 오늘 화면에서 보고 있는 날
  mode: 'week',         // 통계: week | month | year
  anchor: today,        // 통계 기간을 정하는 기준 날짜
  sel: null,            // 통계에서 선택한 날짜
  editing: null,        // 수정 중인 할 일 id
  calMonth: monthStart(today), // 캘린더에서 보고 있는 달
  calSel: today,        // 캘린더에서 선택한 날
  diaryDate: today,     // 감사일기에서 보고 있는 날
  statsTab: 'rec',      // 통계 위 두 칸: rec(기록) | money(가계부)
  budgetMonth: null,    // 가계부에서 보고 있는 달 'YYYY-MM' (급여일이 있는 달)
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ───────── 화면 전환 ─────────
 * 탭(오늘·캘린더·통계)은 기록을 남기지 않고 바꾸고(replace),
 * 리포트처럼 '들어가는' 화면만 기록을 남겨(push) 안드로이드 뒤로 가기로 돌아올 수 있게 한다. */
const VIEWS = ['today', 'cal', 'diary', 'stats', 'report'];

function route() {
  const h = location.hash.slice(1);
  if (h.startsWith('report/')) return { view: 'report', id: h.slice(7) };
  return { view: VIEWS.includes(h) ? h : 'today' };
}

function go(view, { push = false, id = '' } = {}) {
  const hash = view === 'today' ? '' : view === 'report' ? `#report/${id}` : `#${view}`;
  const url = location.pathname + location.search + hash;
  if (push) history.pushState({ pushed: true }, '', url);
  else history.replaceState(history.state, '', url);
  render();
  const sc = document.querySelector(`#view-${view} .scroll`);
  if (sc) sc.scrollTop = 0;
}

/* 화면을 그리다 오류가 나도 기록을 꺼낼 수 있게: 안전 화면 (기록 내보내기 · 다시 열기) */
function render() {
  try {
    renderView();
    $('crash').hidden = true;
  } catch (err) {
    $('crash-msg').textContent = String((err && err.message) || err).slice(0, 200);
    $('crash').hidden = false;
    console.error(err);
  }
}

function renderView() {
  const r = route();
  const app = $('app');
  if (app.dataset.view !== r.view) hideToast();
  app.dataset.view = r.view;
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== r.view;
  for (const b of $('tabs').children) {
    // 리포트는 통계 탭, 진료 전 요약은 캘린더 탭에 속한다
    const on = b.dataset.tab === r.view || (r.view === 'report' && b.dataset.tab === (r.id === 'care' ? 'cal' : 'stats'));
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  }
  $('stats-badge').hidden = dueReports().length === 0;
  if (r.view === 'today') renderToday();
  else if (r.view === 'cal') renderCal();
  else if (r.view === 'diary') renderDiary();
  else if (r.view === 'stats') renderStats();
  else renderReport(r.id);
}

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  if (b.dataset.tab === 'today' && route().view === 'today') { goDate(today); return; }
  go(b.dataset.tab);
});
window.addEventListener('popstate', render);

/* ───────── 토스트 ───────── */
let toastTimer;
function toast(msg, undo) {
  const el = $('toast');
  el.querySelector('.toast-msg').textContent = msg;
  const b = el.querySelector('.toast-undo');
  b.hidden = !undo;
  b.onclick = undo ? () => { hideToast(); undo(); } : null;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, undo ? 4500 : 2200);
}
function hideToast() { $('toast').classList.remove('show'); }

/* ───────── 선택지 시트 ───────── */
function choose(title, options) {
  return new Promise((resolve) => {
    const wrap = $('choice');
    $('choice-title').textContent = title;
    $('choice-opts').innerHTML = options
      .map((o, i) => `<button type="button" data-i="${i}" class="${o.danger ? 'danger' : ''}">${esc(o.label)}</button>`)
      .join('');
    wrap.hidden = false;
    const done = (v) => {
      wrap.hidden = true;
      wrap.onclick = null;
      wrap.onkeydown = null;
      resolve(v);
    };
    // Esc로 닫기, 키보드로 바로 고를 수 있게 첫 버튼에 포커스
    wrap.onkeydown = (e) => { if (e.key === 'Escape') done(null); };
    setTimeout(() => { const b = $('choice-opts').querySelector('button'); if (b && !wrap.hidden) b.focus({ preventScroll: true }); }, 30);
    wrap.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (b) done(options[+b.dataset.i].value);
      else if (e.target.closest('[data-close]')) done(null);
    };
  });
}

/* 쓰는 만큼 늘어나는 글 칸 */
function growText(el) {
  el.style.height = 'auto';
  // 비어 있으면 한 줄 (긴 안내 글씨 때문에 커지지 않게)
  if (el.value && el.scrollHeight) el.style.height = `${el.scrollHeight + 2}px`;
  else el.style.height = '';
}

/* 키보드로도 누를 수 있게: role="button"인 목록 줄에서 Enter·Space = 누르기 */
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[role="button"]')) {
    e.preventDefault();
    e.target.click();
  }
});

