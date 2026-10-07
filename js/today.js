'use strict';

/* ═════════════════ 오늘 화면 ═════════════════ */

const CARRY_DAYS = 7;
const dayItems = (k) => state.days[k] || (state.days[k] = []);
const findTask = (id) => (state.days[ui.date] || []).find((t) => t.id === id);

function renderToday() {
  const k = ui.date;
  const d = parse(k);
  const diff = diffDays(k, today);
  const items = state.days[k] || [];

  $('date-main').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`;
  let rel = relDay(k);
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

  renderReportBanners();
  renderCarry();

  // 그날 일정 (케어 일정은 여기서 바로 체크)
  const evs = eventsOn(k);
  $('today-events').innerHTML = evs.length
    ? `<li class="section-head">일정 ${evs.length}</li>${evs.map((ev) => eventRow(ev, k)).join('')}<li class="section-head">할 일</li>`
    : '';

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
  if (route().view !== 'today') go('today');
  else renderToday();
  $('today-scroll').scrollTop = 0;
}

bindEventList($('today-events'));
$('prev-day').addEventListener('click', () => goDate(addDays(ui.date, -1)));
$('next-day').addEventListener('click', () => goDate(addDays(ui.date, 1)));
$('go-today').addEventListener('click', () => goDate(today));
