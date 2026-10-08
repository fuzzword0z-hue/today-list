'use strict';

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
    const start = addDays(ui.anchor, -a.getDay()); // 일요일 시작 (캘린더와 같게)
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

  // 월·년 보기에서는 그 기간의 리포트로 들어갈 수 있다
  const link = $('report-link');
  link.hidden = ui.mode === 'week';
  if (ui.mode !== 'week') {
    const id = ui.mode === 'month' ? start.slice(0, 7) : start.slice(0, 4);
    const ongoing = end >= today;
    link.dataset.id = id;
    link.innerHTML = `<span>${reportName(id)}${ongoing ? ' <small>진행 중</small>' : ''}</span><span>보기 ›</span>`;
  }
}

$('report-link').addEventListener('click', (e) => openReport(e.currentTarget.dataset.id));

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
  const lead = parse(start).getDay();
  let html = WD.map((w) => `<div class="cal-wd">${w}</div>`).join('');
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
    goDate(ui.sel);
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
