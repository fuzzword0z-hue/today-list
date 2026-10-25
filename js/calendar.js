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
  renderOffBar();
  renderMonthGrid(start, end);
  renderDayPanel();
  renderUpcoming();
}

/* ───────── 케어 요약: 다음 투약 · 다음 진료 · 보고 있는 달의 기록 ───────── */
// 보고 있는 달이 이번 달이면 '이번 달', 아니면 'N월'
const monthLabel = (k) => (monthStart(k) === monthStart(today) ? '이번 달' : `${parse(k).getMonth() + 1}월`);
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
  // 반복 투약: 오늘이면 바로 체크, 아니면 다음 날짜 + 보고 있는 달의 기록
  for (const ev of care.filter((x) => isDose(x) && x.rep && ((!x.until || x.until >= today) || overridesOf(x).some((o) => o.date >= today)))) {
    // 이 날만 바꾼 회차도 같은 투약으로 센다. 오늘 회차는 체크하기 전에는 세지 않는다
    const next = nextOfSeries(ev, today);
    const past = seriesDays(ev, start, end < today ? end : today)
      .filter((d) => d.k < today || isDone(d.ev, d.k) || isSkipped(d.ev, d.k));
    const sched = past.length;
    const given = past.filter((d) => isDone(d.ev, d.k)).length;
    const todayDose = next && next.k === today;
    const doneToday = todayDose && isDone(next.ev, today);
    const skippedToday = todayDose && isSkipped(next.ev, today);
    const status = todayDose
      ? (doneToday ? '<b class="ok">오늘 완료</b>' : skippedToday ? '<b>오늘 못 함</b>' : '<b>오늘이에요</b>')
      : next ? `다음 ${relDay(next.k)} · ${mdw(next.k)}` : '일정 끝남';
    rows.push(`<li class="care-row" data-eid="${next ? next.ev.id : ev.id}" data-k="${next ? next.k : today}" tabindex="0" role="button">
      <span class="care-ic">${PILL_SVG}</span>
      <span class="care-body"><span class="care-title">${esc(ev.title)} <small>${repLabel(ev.rep)}</small></span>
        <span class="care-sub">${status}${sched ? ` · ${monthLabel(start)} ${given}/${sched}회 했음` : ''}</span></span>
      ${todayDose ? `<button class="ev-check" aria-pressed="${doneToday}" aria-label="오늘 ${esc(ev.title)} 완료">${CHECK_SVG}</button>` : ''}
    </li>`);
  }

  // 병원: 다음 진료 D-day, 없으면 지난 진료로부터 지난 기간 + 일정 추가
  const next = nextVisit(today);
  const last = lastVisit(today);
  if (next) {
    rows.push(`<li class="care-row" data-eid="${next.ev.id}" data-k="${next.k}" tabindex="0" role="button">
      <span class="care-ic">${CROSS_SVG}</span>
      <span class="care-body"><span class="care-title">${esc(next.ev.title)}</span>
        <span class="care-sub">${mdw(next.k)}${next.ev.time ? ` ${next.ev.time}` : ''}${next.ev.memo ? ` · ${esc(next.ev.memo)}` : ''}</span></span>
      <span class="dday">${dday(next.k)}</span>
    </li>`);
  } else {
    const ago = last ? diffDays(today, last.k) : null;
    rows.push(`<li class="care-row vet-none">
      <span class="care-ic">${CROSS_SVG}</span>
      <span class="care-body"><span class="care-title">병원 진료</span>
        <span class="care-sub">다음 일정이 아직 없어요${last ? ` · 지난 진료 ${md(last.k)} (${agoText(ago)})` : ''}</span></span>
      <button class="care-btn" data-act="add-visit">+ 일정</button>
    </li>`);
  }
  if (last || Object.keys(state.cond).length) {
    rows.push(`<li class="care-link"><button data-act="summary">${PAW_SVG}<span>진료 전 요약 보기</span><span class="care-link-go">›</span></button></li>`);
  }
  el.innerHTML = `<ul class="care-list">${rows.join('')}</ul>`;
}

$('care').addEventListener('click', (e) => {
  const preset = e.target.closest('[data-preset]');
  if (preset) {
    openSheet({
      k: today,
      preset: preset.dataset.preset === 'dose'
        ? { title: '항암제', cat: 'care', ck: 'dose', rep: { t: 'd', n: 2 } }
        : { title: '병원 진료', cat: 'care', ck: 'vet' },
    });
    return;
  }
  const act = e.target.closest('[data-act]');
  if (act) {
    if (act.dataset.act === 'summary') openCareSummary();
    else openSheet({ k: ui.calSel && ui.calSel >= today ? ui.calSel : today, preset: { title: '병원 진료', cat: 'care', ck: 'vet' } });
    return;
  }
  const li = e.target.closest('.care-row[data-eid]');
  if (!li) return;
  if (e.target.closest('.ev-check')) toggleEventDone(li.dataset.eid, today);
  else openSheet({ id: li.dataset.eid, k: li.dataset.k });
});

/* ───────── 쉬는 날 고르기 (근무표 · 연차) ─────────
 * 기본은 '매주 쉬는 요일'(월요일). 스케줄 휴무·연차·공휴일 다음 날 휴관은 이 모드에서 날짜를 눌러 바꾼다.
 * 쉬는 날은 달력에 '휴'로 표시되고, 운동·공부 탭과 리포트의 출근일 공부·루틴이 이 기준을 따른다. */
let offEdit = false;

function renderOffBar() {
  const el = $('off-bar');
  $('month').classList.toggle('off-editing', offEdit);
  if (!offEdit) {
    el.innerHTML = `<button class="off-open" id="off-open"><i class="off-mark">휴</i><span>쉬는 날 고르기</span><small>근무표 · 연차</small><span class="off-go">›</span></button>`;
    return;
  }
  const days = offDays();
  el.innerHTML = `<div class="off-edit">
    <p class="off-help"><b>날짜를 누르면 쉬는 날 ↔ 출근일</b>이 바뀌어요. 스케줄 휴무, 연차, 공휴일 다음 날 휴관을 골라 주세요.</p>
    <div class="off-week"><span>매주 쉬는 요일</span>
      <div class="chips" data-off-week>${WD.map((w, i) => `<button type="button" data-wd="${i}" aria-pressed="${days.includes(i)}">${w}</button>`).join('')}</div>
    </div>
    <button class="off-done" id="off-done">완료</button>
  </div>`;
}

$('off-bar').addEventListener('click', (e) => {
  if (e.target.closest('#off-open')) { offEdit = true; renderCal(); return; }
  if (e.target.closest('#off-done')) { offEdit = false; renderCal(); return; }
  const b = e.target.closest('[data-off-week] [data-wd]');
  if (!b) return;
  const d = +b.dataset.wd;
  const days = offDays();
  state.offDays = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
  save();
  renderCal();
});

/* ───────── 달력 ───────── */
function renderMonthGrid(start, end) {
  const lead = parse(start).getDay(); // 일요일 시작 (통계와 같게)
  let html = WD
    .map((w, i) => `<div class="mg-wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</div>`).join('');
  html += '<div class="mg-cell blank"></div>'.repeat(lead);

  let doseSeen = false, skipSeen = false, symSeen = false, offSeen = false;
  for (let k = start; k <= end; k = addDays(k, 1)) {
    const evs = eventsOn(k);
    // 반복 케어(투약)는 칸을 차지하지 않게 날짜 옆 작은 알약 표시로만 보여 준다
    const doses = evs.filter(isDose);
    const shown = evs.filter((ev) => !isDose(ev));
    let dose = '';
    if (doses.length) {
      doseSeen = true;
      const st = doses.every((ev) => isDone(ev, k)) ? 'given'
        : doses.some((ev) => !isDone(ev, k) && !isSkipped(ev, k)) ? (k < today ? 'missed' : 'planned')
        : 'skipped';
      if (st === 'skipped') skipSeen = true;
      dose = `<i class="dose ${st}"></i>`;
    }
    // 고양이 컨디션에 이상(식욕 저하·구토·설사 등)이 기록된 날
    const sym = hasSymptom(condOf(k));
    if (sym) symSeen = true;
    const s = (state.days[k] || []);
    const tasks = s.length ? `<span class="mg-tasks">${s.filter((t) => t.d).length}/${s.length}</span>` : '';
    const wd = parse(k).getDay();
    const off = dayMode(k) === 'weekend';
    if (off) offSeen = true;
    const cls = ['mg-cell'];
    if (off) cls.push('off');
    if (k === today) cls.push('today');
    if (k === ui.calSel) cls.push('sel');
    if (wd === 0) cls.push('sun');
    if (wd === 6) cls.push('sat');
    html += `<button class="${cls.join(' ')}" data-k="${k}" aria-label="${mdw(k)}${off ? ' 쉬는 날' : ''} 일정 ${evs.length}개"${offEdit ? ` aria-pressed="${off}"` : ''}>
      <span class="mg-top"><span class="mg-num">${parse(k).getDate()}</span>${dose}${sym ? '<i class="sym"></i>' : ''}${off ? '<i class="off-mark">휴</i>' : ''}</span>
      ${shown.slice(0, 2).map((ev) => `<span class="mg-ev cat-${ev.cat}">${esc(ev.title)}</span>`).join('')}
      ${shown.length > 2 ? `<span class="mg-more">+${shown.length - 2}</span>` : ''}
      ${tasks}
    </button>`;
  }
  $('month').innerHTML = `<div class="mg">${html}</div>`;

  $('cal-legend').innerHTML = [
    ...Object.entries(CATS).map(([c, v]) => `<span><i class="sw cat-${c}"></i>${v.label}</span>`),
    doseSeen ? '<span><i class="dose given"></i>투약 완료</span><span><i class="dose planned"></i>예정</span><span><i class="dose missed"></i>기록 없음</span>' : '',
    skipSeen ? '<span><i class="dose skipped"></i>못 함</span>' : '',
    symSeen ? '<span><i class="sym"></i>컨디션 이상</span>' : '',
    offSeen ? '<span><i class="off-mark">휴</i>쉬는 날</span>' : '',
    '<span class="mg-tasks-key">3/5 할 일</span>',
  ].join('');
}

$('month').addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  if (offEdit) {
    // 쉬는 날 고르기: 누를 때마다 쉬는 날 ↔ 출근일
    const k = b.dataset.k;
    setDayMode(k, dayMode(k) === 'weekend' ? 'weekday' : 'weekend');
    if (navigator.vibrate) navigator.vibrate(5);
    renderCal();
    return;
  }
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
    ${condOf(k) ? `<button class="dp-cond" id="dp-cond"><span class="dp-cond-ic">${PAW_SVG}</span><span class="${hasSymptom(condOf(k)) ? 'bad' : ''}">${esc(condSummary(condOf(k)))}</span><span>›</span></button>` : ''}
    <button class="dp-tasks" id="dp-tasks">
      <span>할 일 ${items.length ? `${done}/${items.length} 완료` : '없음'}</span><span>할 일 보기 ›</span>
    </button>`;
}

$('day-panel').addEventListener('click', (e) => {
  if (e.target.closest('#dp-add')) openSheet({ k: ui.calSel });
  else if (e.target.closest('#dp-tasks')) goDate(ui.calSel);
  else if (e.target.closest('#dp-cond')) { condOpenFor = ui.calSel; goDate(ui.calSel); }
});
bindEventList($('day-panel'));

/* ───────── 다가오는 일정 (반복 없는 일정, D-day) ───────── */
function renderUpcoming() {
  const limit = addDays(today, UPCOMING_DAYS);
  const list = state.events
    .filter((ev) => !ev.rep && !ev.of && !isDose(ev) && ev.date >= today && ev.date <= limit)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 6);
  $('upcoming').innerHTML = list.length
    ? `<h2 class="sub-head">다가오는 일정</h2><ul class="up-list">${list.map((ev) => `
      <li class="up cat-${ev.cat}" data-k="${ev.date}" tabindex="0" role="button">
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
