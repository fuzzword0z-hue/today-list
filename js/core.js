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
 *   cond: { 'YYYY-MM-DD': { ap, en, vo, st, w, n } }   고양이 컨디션 (js/care.js)
 *   workout, workouts                 운동 체크 상태와 '오늘 운동 완료' 기록 (js/workout.js)
 *   study, studies                    공부 탭에 적어 둔 내용과 '오늘 공부 완료' 기록 (js/study.js)
 *   daymode: { 'YYYY-MM-DD': 'weekday' | 'weekend' }   요일과 다르게 고른 날 (쉬는 평일 등)
 *   health, hgoal, hstart, weights, labs  내 건강: 안 지킨 날 체크, 주 목표, 체중, 진료 검사 수치 (js/health.js)
 * 케어 일정에는 ck('dose' 투약·처치 | 'vet' 병원)와 skip { 'YYYY-MM-DD': ms } (못 먹임·안 감)이 더 붙는다.
 * }
 */
const STORE = 'today-list:v1';
const WD = ['일', '월', '화', '수', '목', '금', '토'];

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
  // 예전 평일 칸(a = 7:00–8:30, b = 9:30–11:00)에 적어 둔 내용은 시간 줄로 옮긴다
  if ('a' in s.study || 'b' in s.study) {
    const old = [['a', '07:00', '08:30'], ['b', '09:30', '11:00']]
      .filter(([f]) => typeof s.study[f] === 'string' && s.study[f].trim())
      .map(([f, from, to]) => ({ s: from, e: to, t: s.study[f].trim() }));
    const rows = Array.isArray(s.study.rows) ? s.study.rows.filter((r) => r && (r.s || r.e || r.t)) : [];
    s.study.rows = [...old, ...rows];
    delete s.study.a;
    delete s.study.b;
  }
  s.daymode = obj(s.daymode) ? s.daymode : {};
  s.health = obj(s.health) ? s.health : {};
  s.hgoal = obj(s.hgoal) ? s.hgoal : {};
  s.weights = obj(s.weights) ? s.weights : {};
  s.labs = obj(s.labs) ? s.labs : {};
  if (s.dismissed === undefined) s.dismissed = null;
  return s;
}

function save() {
  for (const k in state.days) if (!state.days[k].length) delete state.days[k];
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch (e) {
    toast('저장하지 못했어요. 저장 공간을 확인해 주세요.');
  }
}

/* 되돌릴 수 있는 변경: 직전 상태를 통째로 기억해 두었다가 '실행 취소' 시 복원 */
function undoable(msg, fn) {
  const snap = JSON.stringify(state);
  fn();
  save();
  render();
  toast(msg, () => {
    state = JSON.parse(snap);
    save();
    render();
  });
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

/* 오늘 기준 상대 표현: 오늘 / 내일 / 모레 / 어제 / N일 후 */
function relDay(k) {
  const n = diffDays(k, today);
  return n === 0 ? '오늘' : n === 1 ? '내일' : n === 2 ? '모레' : n === -1 ? '어제' : n > 0 ? `${n}일 후` : `${-n}일 전`;
}
const dday = (k) => { const n = diffDays(k, today); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`; };

let today = keyOf(new Date());

/* ───────── 화면 상태 ───────── */
const ui = {
  date: today,          // 오늘 화면에서 보고 있는 날
  mode: 'week',         // 통계: week | month | year
  anchor: today,        // 통계 기간을 정하는 기준 날짜
  sel: null,            // 통계에서 선택한 날짜
  editing: null,        // 수정 중인 할 일 id
  calMonth: monthStart(today), // 캘린더에서 보고 있는 달
  calSel: today,        // 캘린더에서 선택한 날
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => Math.round(x * 100);

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ───────── 화면 전환 ─────────
 * 탭(오늘·캘린더·통계)은 기록을 남기지 않고 바꾸고(replace),
 * 리포트처럼 '들어가는' 화면만 기록을 남겨(push) 안드로이드 뒤로 가기로 돌아올 수 있게 한다. */
const VIEWS = ['today', 'cal', 'workout', 'study', 'stats', 'report'];

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

function render() {
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
  else if (r.view === 'workout') renderWorkout();
  else if (r.view === 'study') renderStudy();
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
      resolve(v);
    };
    wrap.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (b) done(options[+b.dataset.i].value);
      else if (e.target.closest('[data-close]')) done(null);
    };
  });
}

/* ───────── 운동·공부 탭 위 '기록 날짜' 줄 ─────────
 * 지난 날 기록을 새로 쓰거나 고칠 때 날짜를 고른다 (미래 날짜는 고를 수 없음) */
function recDateRow(k) {
  const past = k !== today;
  return `<div class="rec-date${past ? ' past' : ''}">
    <label class="rd-btn"><span class="rd-label">기록 날짜</span><b>${mdw(k)}${past ? '' : ' · 오늘'}</b>
      <svg class="rd-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      <input type="date" class="rd-input" value="${k}" max="${today}" aria-label="기록 날짜 고르기"></label>
    ${past ? '<button class="pill rd-today" data-rd-today>오늘로</button>' : ''}
  </div>`;
}

function bindRecDate(el, onPick) {
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-rd-today]')) { onPick(today); return; }
    // 데스크톱 크롬은 날짜 칸을 눌러도 달력이 안 열려서 직접 연다
    if (e.target.classList.contains('rd-input') && e.target.showPicker) {
      try { e.target.showPicker(); } catch (err) { /* 이미 열려 있음 */ }
    }
  });
  el.addEventListener('change', (e) => {
    if (!e.target.classList.contains('rd-input')) return;
    const v = e.target.value;
    if (v && v <= today) onPick(v);
    else { toast('오늘이나 지난 날짜만 고를 수 있어요'); render(); }
  });
}

