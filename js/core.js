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
  s.cond = s.cond && typeof s.cond === 'object' && !Array.isArray(s.cond) ? s.cond : {};
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
const VIEWS = ['today', 'cal', 'stats', 'report'];

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
