'use strict';

/* ═════════════════ 캘린더 ═════════════════ */

const UPCOMING_DAYS = 60;

function renderCal() {
  const start = ui.calMonth;
  const end = monthEnd(start);
  const s = parse(start);
  const thisYear = parse(today).getFullYear();
  $('cal-title').textContent = `${s.getFullYear() !== thisYear ? `${s.getFullYear()}년 ` : ''}${s.getMonth() + 1}월`;
  $('cal-today').hidden = start === monthStart(today) && ui.calSel === today;

  renderCare(start, end);
  renderMonthGrid(start, end);
  renderDayPanel();
  renderUpcoming();
}

/* ───────── 케어 요약: 다음 투약 · 다음 진료 · 이번 달 기록 ───────── */
function renderCare(start, end) {
  const care = state.events.filter((ev) => ev.cat === 'care');
  const el = $('care');
  if (!care.length) {
    el.innerHTML = `<div class="care-empty">
      <p>투약·병원 진료 같은 케어 일정을 등록하면 여기서 한눈에 볼 수 있어요.</p>
      <div class="care-actions">
        <button data-preset="dose">${PILL_SVG}투약 일정 추가</button>
        <button data-preset="visit">${CROSS_SVG}진료 일정 추가</button>
      </div>
    </div>`;
    return;
  }

  const rows = [];
  // 반복 케어(투약): 오늘이면 바로 체크, 아니면 다음 날짜 + 이번 달 기록
  for (const ev of care.filter((x) => x.rep && (!x.until || x.until >= today))) {
    const next = nextOccurrence(ev, today);
    let sched = 0, given = 0;
    for (let k = start; k <= end && k <= today; k = addDays(k, 1)) {
      if (!occursOn(ev, k)) continue;
      sched++;
      if (isDone(ev, k)) given++;
    }
    const todayDose = next === today;
    const status = todayDose
      ? (isDone(ev, today) ? '<b class="ok">오늘 완료</b>' : '<b>오늘이에요</b>')
      : next ? `다음 ${relDay(next)} · ${mdw(next)}` : '일정 끝남';
    rows.push(`<li class="care-row" data-eid="${ev.id}" data-k="${next || today}">
      <span class="care-ic">${PILL_SVG}</span>
      <span class="care-body"><span class="care-title">${esc(ev.title)} <small>${repLabel(ev.rep)}</small></span>
        <span class="care-sub">${status}${sched ? ` · 이번 달 ${given}/${sched}회 기록` : ''}</span></span>
      ${todayDose ? `<button class="ev-check${isDone(ev, today) ? ' on' : ''}" aria-pressed="${isDone(ev, today)}" aria-label="오늘 ${esc(ev.title)} 완료">${CHECK_SVG}</button>` : ''}
    </li>`);
  }
  // 반복 없는 케어(병원 진료 등): 가장 가까운 다음 일정
  const visits = care
    .filter((x) => !x.rep && x.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  if (visits.length) {
    const v = visits[0];
    rows.push(`<li class="care-row" data-eid="${v.id}" data-k="${v.date}">
      <span class="care-ic">${CROSS_SVG}</span>
      <span class="care-body"><span class="care-title">${esc(v.title)}</span>
        <span class="care-sub">${mdw(v.date)}${v.time ? ` ${v.time}` : ''}</span></span>
      <span class="dday">${dday(v.date)}</span>
    </li>`);
  }
  el.innerHTML = rows.length ? `<ul class="care-list">${rows.join('')}</ul>` : '';
}

$('care').addEventListener('click', (e) => {
  const preset = e.target.closest('[data-preset]');
  if (preset) {
    openSheet({
      k: today,
      preset: preset.dataset.preset === 'dose'
        ? { title: '항암제', cat: 'care', rep: { t: 'd', n: 2 } }
        : { title: '병원 진료', cat: 'care' },
    });
    return;
  }
  const li = e.target.closest('.care-row');
  if (!li) return;
  if (e.target.closest('.ev-check')) toggleEventDone(li.dataset.eid, today);
  else openSheet({ id: li.dataset.eid, k: li.dataset.k });
});

/* ───────── 달력 ───────── */
function renderMonthGrid(start, end) {
  const lead = (parse(start).getDay() + 6) % 7; // 월요일 시작 (통계와 같게)
  let html = ['월', '화', '수', '목', '금', '토', '일']
    .map((w, i) => `<div class="mg-wd${i === 5 ? ' sat' : i === 6 ? ' sun' : ''}">${w}</div>`).join('');
  html += '<div class="mg-cell blank"></div>'.repeat(lead);

  let doseSeen = false;
  for (let k = start; k <= end; k = addDays(k, 1)) {
    const evs = eventsOn(k);
    // 반복 케어(투약)는 칸을 차지하지 않게 날짜 옆 작은 알약 표시로만 보여 준다
    const doses = evs.filter((ev) => checkable(ev) && ev.rep);
    const shown = evs.filter((ev) => !(checkable(ev) && ev.rep));
    let dose = '';
    if (doses.length) {
      doseSeen = true;
      const all = doses.every((ev) => isDone(ev, k));
      const st = all ? 'given' : k < today ? 'missed' : 'planned';
      dose = `<i class="dose ${st}"></i>`;
    }
    const s = (state.days[k] || []);
    const tasks = s.length ? `<span class="mg-tasks">${s.filter((t) => t.d).length}/${s.length}</span>` : '';
    const wd = parse(k).getDay();
    const cls = ['mg-cell'];
    if (k === today) cls.push('today');
    if (k === ui.calSel) cls.push('sel');
    if (wd === 0) cls.push('sun');
    if (wd === 6) cls.push('sat');
    html += `<button class="${cls.join(' ')}" data-k="${k}" aria-label="${mdw(k)} 일정 ${evs.length}개">
      <span class="mg-top"><span class="mg-num">${parse(k).getDate()}</span>${dose}</span>
      ${shown.slice(0, 2).map((ev) => `<span class="mg-ev cat-${ev.cat}">${esc(ev.title)}</span>`).join('')}
      ${shown.length > 2 ? `<span class="mg-more">+${shown.length - 2}</span>` : ''}
      ${tasks}
    </button>`;
  }
  $('month').innerHTML = `<div class="mg">${html}</div>`;

  $('cal-legend').innerHTML = [
    ...Object.entries(CATS).map(([c, v]) => `<span><i class="sw cat-${c}"></i>${v.label}</span>`),
    doseSeen ? '<span><i class="dose given"></i>투약 완료</span><span><i class="dose planned"></i>예정</span><span><i class="dose missed"></i>기록 없음</span>' : '',
    '<span class="mg-tasks-key">3/5 할 일</span>',
  ].join('');
}

$('month').addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  ui.calSel = b.dataset.k;
  renderCal();
});

/* ───────── 선택한 날 ───────── */
function renderDayPanel() {
  const k = ui.calSel;
  if (!k || monthStart(k) !== ui.calMonth) { $('day-panel').innerHTML = ''; return; }
  const evs = eventsOn(k);
  const items = state.days[k] || [];
  const done = items.filter((t) => t.d).length;
  $('day-panel').innerHTML = `
    <div class="dp-head">
      <span class="dp-date">${mdw(k)}</span><span class="dp-rel">${relDay(k)}</span>
      <span class="spacer"></span>
      <button class="dp-add" id="dp-add">+ 일정</button>
    </div>
    ${evs.length ? `<ul class="ev-list">${evs.map((ev) => eventRow(ev, k)).join('')}</ul>` : '<p class="dp-empty">일정이 없어요</p>'}
    <button class="dp-tasks" id="dp-tasks">
      <span>할 일 ${items.length ? `${done}/${items.length} 완료` : '없음'}</span><span>할 일 보기 ›</span>
    </button>`;
}

$('day-panel').addEventListener('click', (e) => {
  if (e.target.closest('#dp-add')) openSheet({ k: ui.calSel });
  else if (e.target.closest('#dp-tasks')) goDate(ui.calSel);
});
bindEventList($('day-panel'));

/* ───────── 다가오는 일정 (반복 없는 일정, D-day) ───────── */
function renderUpcoming() {
  const limit = addDays(today, UPCOMING_DAYS);
  const list = state.events
    .filter((ev) => !ev.rep && ev.date >= today && ev.date <= limit)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 6);
  $('upcoming').innerHTML = list.length
    ? `<h2 class="sub-head">다가오는 일정</h2><ul class="up-list">${list.map((ev) => `
      <li class="up cat-${ev.cat}" data-k="${ev.date}">
        <span class="dday">${dday(ev.date)}</span>
        <span class="up-body"><span class="up-title">${esc(ev.title)}</span>
          <span class="up-sub">${mdw(ev.date)}${ev.time ? ` ${ev.time}` : ''} · ${CATS[ev.cat].label}</span></span>
      </li>`).join('')}</ul>`
    : '';
}

$('upcoming').addEventListener('click', (e) => {
  const li = e.target.closest('[data-k]');
  if (!li) return;
  ui.calSel = li.dataset.k;
  ui.calMonth = monthStart(li.dataset.k);
  renderCal();
  $('month').scrollIntoView({ block: 'start', behavior: 'smooth' });
});

/* ───────── 달 이동 ───────── */
function shiftMonth(n) {
  const d = parse(ui.calMonth);
  ui.calMonth = keyOf(new Date(d.getFullYear(), d.getMonth() + n, 1));
  ui.calSel = ui.calMonth === monthStart(today) ? today : ui.calMonth;
  renderCal();
}
$('cal-prev').addEventListener('click', () => shiftMonth(-1));
$('cal-next').addEventListener('click', () => shiftMonth(1));
$('cal-today').addEventListener('click', () => {
  ui.calMonth = monthStart(today);
  ui.calSel = today;
  renderCal();
});
$('cal-add').addEventListener('click', () => openSheet({ k: ui.calSel || today }));
