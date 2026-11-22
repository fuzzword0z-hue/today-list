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

function renderStats() {
  for (const b of $('seg').children) b.setAttribute('aria-selected', String(b.dataset.mode === ui.mode));

  const { start, end } = range();
  $('period-label').textContent = periodLabel(start, end);
  $('next-period').disabled = addDays(end, 1) > today;
  if (ui.sel && (ui.sel < start || ui.sel > end)) ui.sel = null;

  // 해낸 것만 센다: 끝낸 할 일 · 오늘 한 것(운동 · 공부 …)을 한 날 (연속 기록 · 완료율은 보여 주지 않는다 — 7-20)
  const s = summarize(start, end);
  const to = end < today ? end : today;
  $('cards').innerHTML = [
    ['끝낸 일', s.done, '개'],
    ...didItems().map((x) => [`${esc(x.label)}한 날`, didDays(x.id, start, to), '일']).filter(([, n]) => n).slice(0, 2), // 한 날이 있는 것만
  ].map(([l, v, u]) => `<div class="card"><div class="card-label">${l}</div><div class="card-value">${v}<small>${u}</small></div></div>`).join('');

  renderHabits(start, end);
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
  renderHealthStats();
  renderBackup();
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
  $('legend').innerHTML = '<span><i style="background:var(--accent)"></i>끝낸 일</span><span><i></i>남은 일</span>';
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
  // 끝낸 일 · 그 날 한 것 (명상은 아침 · 밤)
  const did = didOf(ui.sel).map((id) => {
    const l = didLabel(id);
    if (!l || id !== state.medId) return l;
    const m = medOf(ui.sel).map((x) => (x === 'am' ? '아침' : '밤'));
    return m.length ? `${l}(${m.join('·')})` : l;
  }).filter(Boolean);
  const what = [s ? `끝낸 일 <b>${s.done}개</b>${s.done < s.total ? ` · 남은 일 ${s.total - s.done}개` : ''}` : '', did.length ? `한 것 ${esc(did.join(' · '))}` : '']
    .filter(Boolean).join(' · ') || '기록 없음';
  el.innerHTML = `<span class="d-text"><b>${md(ui.sel)} (${WD[d.getDay()]})</b> · ${what}</span><button id="open-day">이 날 보기 ›</button>`;
  $('open-day').addEventListener('click', () => {
    goDate(ui.sel);
  });
}

/* ───────── 습관 트래커 (오늘 한 것: 운동 · 공부 · 명상 · 직접 더한 것, 7-22) ─────────
 * 한 날만 채운다. 빈 칸은 흐리게만 두고 '못 한 날'로 세지 않는다 (연속 기록 · 비율 없음).
 * 주 · 월: 습관마다 한 줄, 날마다 한 칸 (명상은 위 반 = 일어나서 · 아래 반 = 자기 전). 칸을 누르면 그 날을 아래에 보여 준다.
 * 년: 습관마다 한 줄, 달마다 한 칸에 한 날 수 (그 달에 자주 할수록 진하게). 칸을 누르면 그 달로.
 * 아래 줄에는 해낸 쪽만 짚는다: 한 날 수, 명상 아침 · 밤, 자주 한 요일 (월 · 주) · 가장 많이 한 달 (년). */
const habitList = (start, end) => state.didItems.filter((x) => !x.off || didDays(x.id, start, end));
function habitCell(x, k) {
  if (!didOf(k).includes(x.id)) return '';
  if (x.id !== state.medId) return 'on';
  const m = medOf(k);
  return m.length === 1 ? m[0] : 'on'; // 명상: 한 때만 했으면 반만
}

function habitNotes(items, start, to) {
  const out = [];
  for (const x of items) {
    const ks = Object.keys(state.did).filter((k) => k >= start && k <= to && didOf(k).includes(x.id));
    if (!ks.length) continue;
    const parts = [`${x.label} ${ks.length}일`];
    if (x.id === state.medId) {
      const c = medCounts(start, to);
      if (c.am + c.pm) parts.push([c.am ? `아침 ${c.am}번` : '', c.pm ? `밤 ${c.pm}번` : ''].filter(Boolean).join(' · '));
    }
    if (ui.mode === 'year') {
      const byM = Array(12).fill(0);
      for (const k of ks) byM[parse(k).getMonth()]++;
      const best = byM.indexOf(Math.max(...byM));
      if (ks.length >= 3) parts.push(`가장 많이 한 달 ${best + 1}월 (${byM[best]}일)`);
    } else if (ks.length >= 4) {
      const byW = Array(7).fill(0);
      for (const k of ks) byW[parse(k).getDay()]++;
      const max = Math.max(...byW);
      if (max >= 2) parts.push(`주로 ${byW.map((n, i) => (n === max ? WD[i] : '')).filter(Boolean).join('·')}요일`);
    }
    out.push(parts.join(' · '));
  }
  return out.length ? out : ['오늘 화면의 \'오늘 한 것\'을 누르면 여기에 쌓여요.'];
}

function renderHabits(start, end) {
  const el = $('habits');
  const items = habitList(start, end);
  if (!items.length) { el.innerHTML = ''; return; }
  const to = end < today ? end : today;
  const row = (x, cells, n, sum) => `<div class="hb-row"><span class="hb-lab">${esc(x.label)}</span>
    <div class="hb-grid" style="--n:${n}">${cells}</div><span class="hb-sum">${sum || ''}</span></div>`;
  let grid = '';
  if (ui.mode === 'year') {
    const y = parse(start).getFullYear();
    const head = Array.from({ length: 12 }, (_, m) => `<span>${m + 1}</span>`).join('');
    grid = `<div class="hb-row hb-head"><span class="hb-lab"></span><div class="hb-grid" style="--n:12">${head}</div><span class="hb-sum">일</span></div>
      ${items.map((x) => row(x, Array.from({ length: 12 }, (_, m) => {
        const a = `${y}-${pad(m + 1)}-01`;
        const b = monthEnd(a);
        const n = a > today ? 0 : didDays(x.id, a, b < today ? b : today);
        const r = n / new Date(y, m + 1, 0).getDate();
        const lv = !n ? '' : r >= 0.75 ? ' lv4' : r >= 0.5 ? ' lv3' : r >= 0.25 ? ' lv2' : ' lv1';
        return `<button class="hb-mcell${lv}${a > today ? ' future' : ''}" data-m="${a}" aria-label="${m + 1}월 ${esc(x.label)} ${n}일">${n || ''}</button>`;
      }).join(''), 12, didDays(x.id, start, to))).join('')}`;
  } else {
    const days = [];
    for (let k = start; k <= end; k = addDays(k, 1)) days.push(k);
    const n = days.length;
    const head = days.map((k) => {
      const d = parse(k).getDate();
      return `<span>${ui.mode === 'week' ? WD[parse(k).getDay()] : [1, 10, 20].includes(d) || d === n ? d : ''}</span>`;
    }).join('');
    grid = `<div class="hb-row hb-head"><span class="hb-lab"></span><div class="hb-grid" style="--n:${n}">${head}</div><span class="hb-sum">일</span></div>
      ${items.map((x) => row(x, days.map((k) => {
        const c = habitCell(x, k);
        return `<button class="hb-cell${c ? ` ${c}` : ''}${k > today ? ' future' : ''}${k === today ? ' today' : ''}${k === ui.sel ? ' sel' : ''}" data-k="${k}" aria-label="${md(k)} ${esc(x.label)}${c ? ' 했어요' : ''}"></button>`;
      }).join(''), n, didDays(x.id, start, to))).join('')}`;
  }
  const med = ui.mode !== 'year' && items.some((x) => x.id === state.medId);
  el.innerHTML = `<h2 class="sub-head">습관 <small>한 날만 채워요</small></h2>
    <div class="habits-grid ${ui.mode}">${grid}</div>
    ${med ? '<p class="hb-legend"><i class="hb-cell am"></i>일어나서 <i class="hb-cell pm"></i>자기 전 <i class="hb-cell on"></i>둘 다 · 명상 칸</p>' : ''}
    <ul class="hb-notes">${habitNotes(items, start, to).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

$('habits').addEventListener('click', (e) => {
  const m = e.target.closest('[data-m]');
  if (m) { ui.mode = 'month'; ui.anchor = m.dataset.m; ui.sel = null; renderStats(); return; }
  const b = e.target.closest('[data-k]');
  if (!b) return;
  ui.sel = ui.sel === b.dataset.k ? null : b.dataset.k;
  renderStats();
});

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
