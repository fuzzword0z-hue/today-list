'use strict';

/* ───────── 저장소 ─────────
 * 모든 데이터는 이 기기의 localStorage 한 곳에만 저장된다. 서버·계정·동기화 없음.
 * { v: 1, days: { 'YYYY-MM-DD': [ { id, t, d, at?, m?, f? } ] }, dismissed: 'YYYY-MM-DD' | null }
 *   t  할 일 내용          d  완료 여부(0/1)       at 완료 시각(ms)
 *   m  다른 날로 미룬 경우 그 날짜(원래 날에는 '미룸'으로 남는다)
 *   f  다른 날에서 가져온 경우 원래 날짜
 */
const STORE = 'today-list:v1';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const CARRY_DAYS = 7;

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.days) return s;
  } catch (e) { /* 손상된 데이터는 무시하고 새로 시작 */ }
  return { v: 1, days: {}, dismissed: null };
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
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let today = keyOf(new Date());

/* ───────── 화면 상태 ───────── */
const ui = {
  date: today,          // 오늘 화면에서 보고 있는 날
  mode: 'week',         // 통계: week | month | year
  anchor: today,        // 통계 기간을 정하는 기준 날짜
  sel: null,            // 통계에서 선택한 날짜
  editing: null,        // 수정 중인 할 일 id
};
let statsFromToday = false;

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dayItems = (k) => state.days[k] || (state.days[k] = []);
const findTask = (id) => (state.days[ui.date] || []).find((t) => t.id === id);

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function render() {
  if (location.hash === '#stats') renderStats();
  else renderToday();
}

/* ═════════════════ 오늘 화면 ═════════════════ */

function renderToday() {
  if ($('view-today').hidden) hideToast();
  $('view-today').hidden = false;
  $('view-stats').hidden = true;

  const k = ui.date;
  const d = parse(k);
  const diff = diffDays(k, today);
  const items = state.days[k] || [];

  $('date-main').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`;
  let rel = diff === 0 ? '오늘' : diff === -1 ? '어제' : diff === 1 ? '내일' : diff < 0 ? `${-diff}일 전` : `${diff}일 후`;
  if (d.getFullYear() !== parse(today).getFullYear()) rel = `${d.getFullYear()}년 · ${rel}`;
  $('date-sub').textContent = rel;
  $('date-sub').classList.toggle('is-today', diff === 0);
  $('go-today').hidden = diff === 0;

  // 진행률
  const total = items.length;
  const done = items.filter((t) => t.d).length;
  const moved = items.filter((t) => t.m).length;
  $('progress').hidden = total === 0;
  $('progress-fill').style.width = total ? `${(done / total) * 100}%` : '0';
  const label = $('progress-label');
  label.classList.toggle('all', total > 0 && done === total);
  label.textContent = total > 0 && done === total ? '모두 완료'
    : `${done} / ${total}${moved ? ` · 미룸 ${moved}` : ''}`;

  renderCarry();

  // 목록: 할 일 → 완료(완료한 순서) → 미룸
  const active = items.filter((t) => !t.d && !t.m);
  const doneList = items.filter((t) => t.d).sort((a, b) => (a.at || 0) - (b.at || 0));
  const movedList = items.filter((t) => t.m);

  let html = active.map(row).join('');
  if (doneList.length) html += `<li class="section-head">완료 ${doneList.length}</li>` + doneList.map(row).join('');
  if (movedList.length) html += `<li class="section-head">미룸 ${movedList.length}</li>` + movedList.map(row).join('');
  $('list').innerHTML = html;
  $('empty').hidden = total > 0;

  if (ui.editing) {
    const li = $('list').querySelector(`[data-id="${ui.editing}"]`);
    if (li) beginEdit(li); else ui.editing = null;
  }
}

function row(t) {
  const cls = ['task'];
  if (t.d) cls.push('done');
  if (t.m) cls.push('moved');
  let meta = '';
  if (t.m) meta = `→ ${md(t.m)}`;
  else if (t.f && !t.d) meta = `${md(t.f)}에서`;
  return `<li class="${cls.join(' ')}" data-id="${t.id}" tabindex="0" role="checkbox" aria-checked="${t.d ? 'true' : 'false'}">
    <div class="task-bg"><span class="bg-left">내일로</span><span class="bg-right">삭제</span></div>
    <div class="task-fg"><span class="check">${CHECK_SVG}</span><span class="text">${esc(t.t)}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</div>
  </li>`;
}

/* 지난 며칠 동안 끝내지 못한 일 */
function pendingPast() {
  const res = [];
  for (let i = CARRY_DAYS; i >= 1; i--) {
    const k = addDays(today, -i);
    for (const t of state.days[k] || []) if (!t.d && !t.m) res.push([k, t]);
  }
  return res;
}

function renderCarry() {
  const show = ui.date === today && state.dismissed !== today;
  const items = show ? pendingPast() : [];
  $('carry').hidden = items.length === 0;
  if (items.length) $('carry-text').textContent = `못 끝낸 일 ${items.length}개`;
}

$('carry-yes').addEventListener('click', () => {
  const items = pendingPast();
  undoable(`${items.length}개를 오늘로 가져왔어요`, () => {
    const list = dayItems(today);
    for (const [k, t] of items) {
      t.m = today;
      list.push({ id: uid(), t: t.t, d: 0, f: k });
    }
  });
});
$('carry-no').addEventListener('click', () => {
  state.dismissed = today;
  save();
  renderCarry();
});

/* ───────── 추가 ───────── */
const input = $('new-task');
input.addEventListener('input', () => { $('send').hidden = !input.value.trim(); });
$('composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) { input.blur(); return; }
  dayItems(ui.date).push({ id: uid(), t: text, d: 0 });
  save();
  input.value = '';
  $('send').hidden = true;
  renderToday();
  // 방금 추가한 항목이 보이도록
  const rows = $('list').querySelectorAll('.task:not(.done):not(.moved)');
  if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'nearest' });
});

/* ───────── 완료 / 수정 / 삭제 / 미루기 ───────── */
function toggle(id) {
  const t = findTask(id);
  if (!t) return;
  if (t.m) { toast(`${md(t.m)}로 미룬 할 일이에요`); return; }
  t.d = t.d ? 0 : 1;
  if (t.d) t.at = Date.now(); else delete t.at;
  save();
  if (t.d && navigator.vibrate) navigator.vibrate(8);
  renderToday();
  const li = $('list').querySelector(`[data-id="${id}"]`);
  if (li && t.d) li.classList.add('pop');
}

function remove(id) {
  undoable('삭제했어요', () => {
    state.days[ui.date] = (state.days[ui.date] || []).filter((t) => t.id !== id);
  });
}

function defer(id) {
  const t = findTask(id);
  if (!t || t.d || t.m) return;
  const next = addDays(ui.date, 1);
  undoable(`${md(next)}로 미뤘어요`, () => {
    t.m = next;
    dayItems(next).push({ id: uid(), t: t.t, d: 0, f: ui.date });
  });
}

function beginEdit(li, focusNow = true) {
  const t = findTask(li.dataset.id);
  if (!t || t.m) return;
  ui.editing = t.id;
  const span = li.querySelector('.text');
  const field = document.createElement('input');
  field.className = 'edit-input';
  field.value = t.t;
  field.maxLength = 200;
  field.enterKeyHint = 'done';
  span.replaceWith(field);
  li.classList.add('editing');
  if (focusNow) focusField(field);

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    ui.editing = null;
    const v = field.value.trim();
    if (commit && v && v !== t.t) { t.t = v; save(); }
    if (commit && !v) { remove(t.id); return; }
    renderToday();
  };
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') finish(false);
  });
  field.addEventListener('blur', () => finish(true));
}

// iOS는 사용자 동작(터치) 안에서 focus()해야 키보드를 띄워 준다
function focusField(field) {
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
}

/* 제스처: 탭 = 완료, 길게 누르기 = 수정, ← 밀기 = 삭제, → 밀기 = 내일로 */
const list = $('list');
let g = null;
const SWIPE = 90;

list.addEventListener('pointerdown', (e) => {
  const li = e.target.closest('.task');
  if (!li || ui.editing || e.button > 0) return;
  g = { li, id: li.dataset.id, x: e.clientX, y: e.clientY, dx: 0, mode: null, pid: e.pointerId };
  g.timer = setTimeout(() => {
    if (g && !g.mode) {
      g.mode = 'long';
      if (navigator.vibrate) navigator.vibrate(12);
      beginEdit(li, false); // 손을 뗄 때 focus
    }
  }, 480);
});

list.addEventListener('pointermove', (e) => {
  if (!g || e.pointerId !== g.pid) return;
  const dx = e.clientX - g.x;
  const dy = e.clientY - g.y;
  if (!g.mode) {
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      g.mode = 'swipe';
      clearTimeout(g.timer);
      g.li.setPointerCapture(e.pointerId);
      g.li.classList.add('swiping');
      g.canDefer = !g.li.classList.contains('done') && !g.li.classList.contains('moved');
    } else if (Math.abs(dy) > 10) {
      g.mode = 'scroll';
      clearTimeout(g.timer);
    }
  }
  if (g.mode === 'swipe') {
    g.dx = dx > 0 && !g.canDefer ? Math.min(dx, 24) * 0.4 : dx;
    g.li.classList.toggle('dir-left', g.dx < 0);
    g.li.classList.toggle('dir-right', g.dx > 0);
    g.li.querySelector('.task-fg').style.transform = `translateX(${g.dx}px)`;
  }
});

function endGesture(e, cancelled) {
  if (!g || e.pointerId !== g.pid) return;
  clearTimeout(g.timer);
  const { li, id, mode, dx } = g;
  g = null;
  if (mode === 'long') {
    const field = li.querySelector('.edit-input');
    if (cancelled || !field) { ui.editing = null; renderToday(); } else focusField(field);
    return;
  }
  if (cancelled) { resetRow(li); return; }
  if (mode === null) { toggle(id); return; }
  if (mode !== 'swipe') return;
  const fg = li.querySelector('.task-fg');
  if (dx <= -SWIPE || (dx >= SWIPE && li.classList.contains('dir-right') && !li.classList.contains('done') && !li.classList.contains('moved'))) {
    fg.style.transform = `translateX(${dx < 0 ? '-' : ''}100%)`;
    li.style.maxHeight = `${li.offsetHeight}px`;
    requestAnimationFrame(() => li.classList.add('removing'));
    setTimeout(() => (dx < 0 ? remove(id) : defer(id)), 200);
  } else {
    resetRow(li);
  }
}

function resetRow(li) {
  const fg = li.querySelector('.task-fg');
  li.classList.remove('swiping');
  fg.style.transform = '';
  setTimeout(() => li.classList.remove('dir-left', 'dir-right'), 200);
}

list.addEventListener('pointerup', (e) => endGesture(e, false));
list.addEventListener('pointercancel', (e) => endGesture(e, true));
list.addEventListener('contextmenu', (e) => { if (e.target.closest('.task')) e.preventDefault(); });
list.addEventListener('dblclick', (e) => {
  const li = e.target.closest('.task');
  if (li && !li.classList.contains('editing')) beginEdit(li);
});
// 키보드: Space/Enter 완료, E/F2 수정, Delete 삭제
list.addEventListener('keydown', (e) => {
  const li = e.target.closest('.task');
  if (!li || li.classList.contains('editing') || e.target !== li) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(li.dataset.id); }
  else if (e.key === 'e' || e.key === 'F2') { e.preventDefault(); beginEdit(li); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(li.dataset.id); }
});

/* ───────── 날짜 이동 ───────── */
function goDate(k) {
  ui.date = k;
  ui.editing = null;
  renderToday();
  $('today-scroll').scrollTop = 0;
}
$('prev-day').addEventListener('click', () => goDate(addDays(ui.date, -1)));
$('next-day').addEventListener('click', () => goDate(addDays(ui.date, 1)));
$('go-today').addEventListener('click', () => goDate(today));

/* ═════════════════ 통계 화면 ═════════════════ */

function dayStat(k) {
  const a = state.days[k];
  if (!a || !a.length) return null;
  let done = 0;
  for (const t of a) if (t.d) done++;
  return { done, total: a.length };
}

/* 완료율 단계: 0 기록 없음 · z 계획만 있고 0% · 1 ~33% · 2 ~66% · 3 ~99% · 4 100% */
function level(s) {
  if (!s) return '0';
  if (!s.done) return 'z';
  const r = s.done / s.total;
  return r < 1 / 3 ? '1' : r < 2 / 3 ? '2' : r < 1 ? '3' : '4';
}

function range() {
  const a = parse(ui.anchor);
  if (ui.mode === 'week') {
    const start = addDays(ui.anchor, -((a.getDay() + 6) % 7)); // 월요일 시작
    return { start, end: addDays(start, 6) };
  }
  if (ui.mode === 'month') {
    return {
      start: keyOf(new Date(a.getFullYear(), a.getMonth(), 1)),
      end: keyOf(new Date(a.getFullYear(), a.getMonth() + 1, 0)),
    };
  }
  return { start: `${a.getFullYear()}-01-01`, end: `${a.getFullYear()}-12-31` };
}

function periodLabel(start, end) {
  const s = parse(start);
  const e = parse(end);
  const thisYear = parse(today).getFullYear();
  if (ui.mode === 'year') return `${s.getFullYear()}년`;
  if (ui.mode === 'month') return `${s.getFullYear()}년 ${s.getMonth() + 1}월`;
  const y = s.getFullYear() !== thisYear ? `${s.getFullYear()}년 ` : '';
  const right = s.getMonth() === e.getMonth() ? `${e.getDate()}일` : `${e.getMonth() + 1}월 ${e.getDate()}일`;
  return `${y}${s.getMonth() + 1}월 ${s.getDate()}일 – ${right}`;
}

/* 기간 요약: 오늘 이후(아직 오지 않은 날)는 완료율에서 제외 */
function summarize(start, end) {
  let done = 0, total = 0, perfect = 0;
  for (let k = start; k <= end && k <= today; k = addDays(k, 1)) {
    const s = dayStat(k);
    if (!s) continue;
    done += s.done;
    total += s.total;
    if (s.done === s.total) perfect++;
  }
  return { done, total, perfect };
}

/* 연속 기록: 하루에 하나라도 완료한 날이 이어진 일수. 오늘은 아직 진행 중이라 0개여도 끊기지 않음 */
function streaks() {
  let cur = 0;
  let k = today;
  if (!(dayStat(k) || {}).done) k = addDays(k, -1);
  while ((dayStat(k) || {}).done) { cur++; k = addDays(k, -1); }

  let best = 0, run = 0, prev = null;
  const keys = Object.keys(state.days).filter((x) => x <= today && dayStat(x) && dayStat(x).done).sort();
  for (const x of keys) {
    run = prev && diffDays(x, prev) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { cur, best };
}

function renderStats() {
  if ($('view-stats').hidden) hideToast();
  $('view-today').hidden = true;
  $('view-stats').hidden = false;

  for (const b of $('seg').children) b.setAttribute('aria-selected', String(b.dataset.mode === ui.mode));

  const st = streaks();
  $('streak').innerHTML = `<b>${st.cur}</b>일 연속 완료<span class="best">최장 ${st.best}일</span>`;

  const { start, end } = range();
  $('period-label').textContent = periodLabel(start, end);
  $('next-period').disabled = addDays(end, 1) > today;
  if (ui.sel && (ui.sel < start || ui.sel > end)) ui.sel = null;

  const s = summarize(start, end);
  const rate = s.total ? Math.round((s.done / s.total) * 100) : null;
  $('cards').innerHTML = [
    ['완료', s.done, '개'],
    ['완료율', rate === null ? '–' : rate, rate === null ? '' : '%'],
    ['다 끝낸 날', s.perfect, '일'],
  ].map(([l, v, u]) => `<div class="card"><div class="card-label">${l}</div><div class="card-value">${v}<small>${u}</small></div></div>`).join('');

  if (ui.mode === 'week') renderWeek(start);
  else if (ui.mode === 'month') renderMonth(start, end);
  else renderYear(parse(start).getFullYear());

  renderDetail();
}

function renderWeek(start) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const k = addDays(start, i);
    days.push([k, dayStat(k) || { done: 0, total: 0 }]);
  }
  const max = Math.max(4, ...days.map(([, s]) => s.total));
  $('chart').innerHTML = `<div class="week">${days.map(([k, s]) => {
    const d = parse(k);
    const cls = ['wcol'];
    if (k === today) cls.push('today');
    if (k > today) cls.push('future');
    if (k === ui.sel) cls.push('sel');
    const rest = s.total - s.done;
    return `<button class="${cls.join(' ')}" data-k="${k}" aria-label="${md(k)} ${s.total}개 중 ${s.done}개 완료">
      <span class="wval">${s.total ? `${s.done}/${s.total}` : ''}</span>
      <span class="wbar">
        ${s.done ? `<span class="wdone" style="height:${(s.done / max) * 100}%"></span>` : ''}
        ${rest ? `<span class="wrest" style="height:${(rest / max) * 100}%"></span>` : ''}
      </span>
      <span class="wlab">${WD[d.getDay()]}<br>${d.getDate()}</span>
    </button>`;
  }).join('')}</div>`;
  $('legend').innerHTML = '<span><i style="background:var(--accent)"></i>완료</span><span><i></i>못 한 일</span>';
}

function cellClass(k, base) {
  const cls = [base, `lv${level(dayStat(k))}`];
  if (k > today) cls.push('future');
  if (k === today) cls.push('today');
  if (k === ui.sel) cls.push('sel');
  return cls.join(' ');
}

function renderMonth(start, end) {
  const lead = (parse(start).getDay() + 6) % 7;
  let html = ['월', '화', '수', '목', '금', '토', '일'].map((w) => `<div class="cal-wd">${w}</div>`).join('');
  html += '<div class="cell blank"></div>'.repeat(lead);
  for (let k = start; k <= end; k = addDays(k, 1)) {
    const s = dayStat(k);
    html += `<button class="${cellClass(k, 'cell')}" data-k="${k}" aria-label="${md(k)} ${s ? `${s.total}개 중 ${s.done}개 완료` : '기록 없음'}">${parse(k).getDate()}</button>`;
  }
  $('chart').innerHTML = `<div class="cal">${html}</div>`;
  renderLevelLegend();
}

function renderYear(y) {
  let html = '';
  for (let m = 0; m < 12; m++) {
    const last = new Date(y, m + 1, 0).getDate();
    let cells = '';
    let sum = 0;
    for (let d = 1; d <= 31; d++) {
      if (d > last) { cells += '<span class="ycell none"></span>'; continue; }
      const k = `${y}-${pad(m + 1)}-${pad(d)}`;
      const s = dayStat(k);
      if (s) sum += s.done;
      cells += `<button class="${cellClass(k, 'ycell')}" data-k="${k}" aria-label="${md(k)}"></button>`;
    }
    html += `<div class="yrow"><span class="ylab">${m + 1}월</span><div class="ygrid">${cells}</div><span class="ysum">${sum || ''}</span></div>`;
  }
  const head = [1, 10, 20, 31].map((d) => `<span style="grid-column:${d}">${d}</span>`).join('');
  html = `<div class="yrow yhead"><span class="ylab"></span><div class="ygrid">${head}</div><span class="ysum">완료</span></div>${html}`;
  $('chart').innerHTML = `<div class="year">${html}</div>`;
  renderLevelLegend();
}

function renderLevelLegend() {
  $('legend').innerHTML = `<span>완료율</span>
    <span><i class="lvz" title="0%"></i><i class="lv1"></i><i class="lv2"></i><i class="lv3"></i><i class="lv4"></i>100%</span>`;
}

function renderDetail() {
  const el = $('detail');
  if (!ui.sel) {
    el.innerHTML = '<span class="d-text">날짜를 누르면 그날 기록을 볼 수 있어요</span>';
    return;
  }
  const s = dayStat(ui.sel);
  const d = parse(ui.sel);
  const what = s ? `${s.total}개 중 <b>${s.done}개</b> 완료 · ${Math.round((s.done / s.total) * 100)}%` : '기록 없음';
  el.innerHTML = `<span class="d-text"><b>${md(ui.sel)} (${WD[d.getDay()]})</b> · ${what}</span><button id="open-day">이 날 보기 ›</button>`;
  $('open-day').addEventListener('click', () => {
    ui.date = ui.sel;
    leaveStats();
  });
}

$('chart').addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  ui.sel = ui.sel === b.dataset.k ? null : b.dataset.k;
  renderStats();
});

$('seg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  ui.mode = b.dataset.mode;
  ui.anchor = ui.sel || today;
  renderStats();
});

function shiftPeriod(n) {
  const a = parse(ui.anchor);
  if (ui.mode === 'week') ui.anchor = addDays(ui.anchor, 7 * n);
  else if (ui.mode === 'month') ui.anchor = keyOf(new Date(a.getFullYear(), a.getMonth() + n, 1));
  else ui.anchor = keyOf(new Date(a.getFullYear() + n, 0, 1));
  renderStats();
}
$('prev-period').addEventListener('click', () => shiftPeriod(-1));
$('next-period').addEventListener('click', () => shiftPeriod(1));

/* ───────── 화면 전환 (해시 사용: 안드로이드 뒤로가기 지원) ───────── */
$('to-stats').addEventListener('click', () => {
  statsFromToday = true;
  ui.anchor = ui.date;
  ui.sel = null;
  location.hash = 'stats';
});
function leaveStats() {
  if (statsFromToday) history.back();
  else history.replaceState(null, '', location.pathname + location.search);
  statsFromToday = false;
  renderToday();
  $('today-scroll').scrollTop = 0;
}
$('back').addEventListener('click', leaveStats);
window.addEventListener('hashchange', () => {
  if (location.hash !== '#stats') statsFromToday = false;
  render();
});

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

/* ───────── 자정이 지나면 '오늘'을 갱신 ───────── */
function refreshToday() {
  const now = keyOf(new Date());
  if (now === today) return;
  if (ui.date === today) ui.date = now;
  today = now;
  render();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshToday(); });
setInterval(refreshToday, 60 * 1000);

/* ───────── 키보드가 올라올 때 화면 맞추기 (iOS 홈 화면 앱) ───────── */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const fit = () => {
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
    document.documentElement.style.setProperty('--vvt', `${vv.offsetTop}px`);
  };
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  fit();
}

/* ───────── 오프라인 / 설치 ───────── */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// 브라우저가 저장 공간을 임의로 정리하지 않도록 요청
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

render();
