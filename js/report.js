'use strict';

/* ═════════════════ 월간·연간 리포트 ═════════════════
 * 기기 안의 기록만으로 계산하는 규칙 기반 피드백. 외부 전송 없음.
 * 새 달 1–7일에 앱을 열면 지난달 리포트가 '도착'한다 (1월에는 작년 연간 리포트도).
 * 해낸 것만 센다 (7-20): 점수 · 등급 · 완료율 · 연속 기록 · '고쳤으면 하는 점' · 목표 제안은 없앴다 — 기록이 평가가 되면
 * 성에 안 찰 때 기록을 놓게 되므로. 끝낸 일 · 오늘 한 것 · 투약 · 일기 · 해낸 것을 모으고, 제안은 '다음 달에 가볍게 해 볼 것' 두 개까지. */

const isYear = (id) => id.length === 4;

function reportName(id) {
  if (isYear(id)) return `${id}년 연간 리포트`;
  const y = +id.slice(0, 4);
  return `${y !== parse(today).getFullYear() ? `${y}년 ` : ''}${+id.slice(5)}월 리포트`;
}

function reportRange(id) {
  if (isYear(id)) return { start: `${id}-01-01`, end: `${id}-12-31` };
  const start = `${id}-01`;
  return { start, end: monthEnd(start) };
}

function hasData({ start, end }) {
  for (const k in state.days) if (k >= start && k <= end) return true;
  for (const k in state.cond) if (k >= start && k <= end) return true;
  for (const o of [state.did, state.weights, state.labs, state.diary, state.mind]) for (const k in o) if (k >= start && k <= end) return true;
  const inRange = (o) => o && Object.keys(o).some((k) => k >= start && k <= end);
  return state.events.some((ev) => inRange(ev.done) || inRange(ev.skip));
}

function dueReports() {
  const t = parse(today);
  if (t.getDate() > 7) return [];
  const ids = [keyOf(new Date(t.getFullYear(), t.getMonth() - 1, 1)).slice(0, 7)];
  if (t.getMonth() === 0) ids.push(String(t.getFullYear() - 1));
  return ids.filter((id) => !state.seen.includes(id) && hasData(reportRange(id)));
}

function renderReportBanners() {
  $('report-banners').innerHTML = ui.date === today
    ? dueReports().map((id) => `<button class="banner report-banner" data-id="${id}">
        <span class="banner-text"><b>${reportName(id)}</b>가 도착했어요</span><span class="banner-act">보기 ›</span>
      </button>`).join('')
    : '';
}
$('report-banners').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) openReport(b.dataset.id);
});

function openReport(id) {
  if (!state.seen.includes(id)) { state.seen.push(id); save(); }
  go('report', { push: true, id });
}
$('report-back').addEventListener('click', () => {
  if (history.state && history.state.pushed) history.back();
  else go('stats');
});

/* ───────── 분석 ───────── */
/* 앱을 처음 쓴 날: 가장 이른 기록. 첫 달(첫해)은 이 날부터 센다 — 쓰기 전 날들을 세지 않게 */
function firstUse() {
  let f = state.hstart || today;
  const see = (k) => { if (k < f) f = k; };
  for (const o of [state.days, state.cond, state.did, state.workouts, state.studies, state.health, state.weights, state.labs, state.diary, state.mind]) for (const k in o) see(k);
  for (const ev of state.events) for (const k in ev.done || {}) see(k);
  return f;
}

function analyze(id) {
  const { start, end } = reportRange(id);
  const yearly = isYear(id);
  // 끝난 날만 본다: 진행 중인 기간이면 어제까지
  const last = end < today ? end : addDays(today, -1);
  const fu = firstUse();
  const from = fu > start ? fu : start; // 첫 달(첫해)은 쓰기 시작한 날부터
  const m = {
    id, yearly, start, end, last, from,
    total: 0, done: 0, deferred: {}, doneOn: {},
    months: yearly ? Array(12).fill(0) : null, // 연간: 달마다 끝낸 일
  };

  // 할 일: 끝낸 것만 센다 (같은 일을 여러 번 미뤘으면 '가볍게 해 볼 것'에서 더 작게 쪼개 보자고만)
  for (let k = from; k <= last; k = addDays(k, 1)) {
    for (const t of state.days[k] || []) {
      m.total++;
      if (t.m) m.deferred[t.t] = (m.deferred[t.t] || 0) + 1;
      if (!t.d) continue;
      m.done++;
      (m.doneOn[k] = m.doneOn[k] || []).push(t.t);
      if (m.months) m.months[parse(k).getMonth()]++;
    }
  }

  // 케어: 반복(투약)은 예정 대비 기록, 반복 없는 케어(진료)는 다녀온 횟수
  // (이 날만 바꾼 회차는 원래 반복 일정의 투약으로 센다. '못 함'으로 남긴 날은 기록한 것으로 센다)
  m.care = state.events.filter((ev) => isDose(ev) && ev.rep).map((ev) => {
    const c = { ev, sched: 0, given: 0, skipped: [], missed: [] };
    for (const d of seriesDays(ev, start, last)) {
      c.sched++;
      if (isDone(d.ev, d.k)) c.given++;
      else if (isSkipped(d.ev, d.k)) c.skipped.push(d.k);
      else c.missed.push(d.k);
    }
    c.recorded = c.given + c.skipped.length;
    return c;
  }).filter((c) => c.sched > 0);
  m.careSched = m.care.reduce((a, c) => a + c.sched, 0);
  m.careGiven = m.care.reduce((a, c) => a + c.given, 0);
  m.visits = vetDays(start, last)
    .filter((d) => !isSkipped(d.ev, d.k))
    .map((d) => ({ ev: d.ev, k: d.k, done: isDone(d.ev, d.k) }));

  // 고양이 컨디션
  const cd = { days: 0, vomitDays: 0, vomit: 0, plus: false, vlist: [], w: [], th: 0, nights: 0, nightWhy: {} };
  for (let k = start; k <= last; k = addDays(k, 1)) {
    const c = condOf(k);
    if (!c) continue;
    cd.days++;
    if (vomited(c)) {
      const v = vomitCount(c);
      cd.vomitDays++;
      cd.vomit += v.n;
      cd.plus = cd.plus || v.plus;
      cd.vlist.push(...vomitList(c));
    }
    if (c.w) cd.w.push({ k, w: c.w });
    if (c.th) cd.th++;
    if (nightOf(c).length) {
      cd.nights++;
      for (const w of nightOf(c)) if (w !== 'watch') cd.nightWhy[w] = (cd.nightWhy[w] || 0) + 1;
    }
  }
  m.cond = cd;

  // 오늘 한 것: 항목마다 한 날 수 (지운 항목도 그 기간에 한 날이 있으면 보여 준다)
  m.did = state.didItems.map((x) => ({ ...x, days: didDays(x.id, from, last) })).filter((x) => x.days);
  m.hl = analyzeHealth(start, end);
  // 일기: 쓴 날 · 줄 수 (내용은 리포트에 넣지 않는다 — 피드백은 채팅에서)
  m.dy = { days: 0, lines: 0 };
  for (const k in state.diary) if (k >= start && k <= last) { m.dy.days++; m.dy.lines += diaryLines(state.diary[k].t); }
  m.mind = analyzeMind(start, last);
  return m;
}

/* ───────── 피드백 문장 ───────── */
function feedback(m) {
  const W = m.yearly
    ? { this: '올해', prev: '작년', next: '내년' }
    : { this: '이번 달', prev: '지난달', next: '다음 달' };
  const good = [], light = [];

  /* 잘하고 있는 점: 해낸 것만 */
  if (m.done) good.push(`할 일 ${m.done}개를 끝냈어요.${m.total >= 10 && m.done / m.total >= 0.8 ? ' 적은 일을 거의 다 해냈어요.' : ''}`);
  for (const c of m.care) {
    if (c.sched >= 3 && c.recorded / c.sched >= 0.95) good.push(`${c.ev.title} ${c.sched}번을 빠짐없이 챙기고 기록했어요.`);
    else if (c.given) good.push(`${c.ev.title}을 ${c.given}번 챙겼어요.`);
  }
  const visited = m.visits.filter((v) => v.done);
  if (visited.length) good.push(`${[...new Set(visited.map((v) => v.ev.title))].join(', ')} ${visited.length}번을 잘 다녀왔어요.`);
  const did = m.did.filter((x) => x.days);
  if (did.length) good.push(`${did.map((x) => `${x.label}한 날 ${x.days}일`).join(' · ')} — 짬짬이 한 것도 다 셌어요.`);
  if (m.dy.days) good.push(`일기를 ${m.dy.days}일 썼어요.`);
  if (m.mind.own) good.push(`내 기준으로 해낸 것을 ${m.mind.own}줄 적었어요.`);
  good.push(...healthGood(m.hl));
  if (m.cond.days >= (m.yearly ? 100 : 10)) good.push(`고양이 컨디션을 ${m.cond.days}일 기록했어요. 진료 때 큰 도움이 돼요.`);
  if (!good.length) good.push('기록을 남긴 것 자체가 좋은 출발이에요.');

  /* 다음 달에 가볍게 해 볼 것 (두 개까지) */
  for (const c of m.care) {
    if (!c.missed.length) continue;
    const list = c.missed.slice(0, 4).map(ml).join(', ') + (c.missed.length > 4 ? ` 외 ${c.missed.length - 4}일` : '');
    light.push(`${c.ev.title} 체크가 빠진 날이 있어요 (${list}). 챙긴 직후 바로 누르면 진료 때 기록이 정확해져요.`);
  }
  const deferred = Object.entries(m.deferred).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  for (const [t, n] of deferred.slice(0, 1)) light.push(`'${t}'를 ${n}번 미뤘어요. 더 작게 쪼개 보세요 (5분만, 하나만).`);
  if (!did.length && m.last >= addDays(m.from, 6)) light.push("짬짬이 한 게 있다면 오늘 화면의 '오늘 한 것'을 한 번만 눌러 보세요. 5분도 했어요예요.");
  if (!light.length) light.push('지금처럼, 해낸 것만 세어 가요.');
  return { good: good.slice(0, 6), light: light.slice(0, 2), W };
}

/* 긍정적인 평가 (응원) */
function cheer(m, W) {
  const out = [`${W.this}도 하루하루 해낸 게 쌓였어요.`];
  if (m.careSched) {
    const visits = m.visits.filter((v) => v.done).length;
    out.push(`아이를 돌보는 일은 몸도 마음도 많이 쓰이는 일인데, ${W.this} 투약 ${m.careGiven}번${visits ? `과 병원 진료 ${visits}번` : ''}을 챙기면서${m.done ? ` 할 일 ${m.done}개까지 해냈어요` : ' 하루하루를 버텨 냈어요'}. 그것만으로도 충분히 잘하고 있어요.`);
  } else if (m.done) {
    out.push(`${W.this} 할 일 ${m.done}개를 끝냈어요. 작은 체크 하나하나가 쌓여서 만든 결과예요.`);
  }
  const did = m.did.filter((x) => x.days);
  if (did.length) out.push(`${did.map((x) => `${x.label} ${x.days}일`).join('과 ')}도 했어요. 기준을 채우지 않아도, 한 건 한 거예요.`);
  if (m.dy.days >= 3) out.push(`일기를 ${m.dy.days}일 썼어요. 작은 감사를 알아보는 눈이 자라고 있어요.`);
  if (m.mind.own >= 10) out.push(`내 기준으로 해낸 것이 ${m.mind.own}줄이에요. 나를 믿을 근거가 쌓이고 있어요.`);
  if ((m.mind.act.pass || 0) >= 2) out.push(`흔들린 순간에 그냥 느끼고 지나간 게 ${m.mind.act.pass}번이에요. 욕구가 있어도 행동은 내가 정하고 있어요.`);
  if (m.mind.linkN >= 4) out.push(`기대고 주는 연결을 ${m.mind.linkN}번 했어요. 기댈 곳이 있다는 느낌이 혼자서도 더 과감하게 해 줘요.`);
  // 고양이가 아팠던 달: 다른 기록이 줄어든 걸 탓하지 않는다
  if (m.cond.vomitDays >= 2) out.push(`고양이가 ${m.cond.vomitDays}일 토해서 마음 졸인 날${m.cond.vomitDays >= 4 ? '이 많았어요' : '들이 있었어요'}. 그런 날 다른 기록이 줄어든 건 당연한 일이에요.`);
  if (m.cond.nights) out.push(`고양이를 밤에 지켜본 날이 ${m.cond.nights}번 있었어요. 어쩔 수 없는 밤이니 다음 날은 가볍게 보내도 괜찮아요.`);
  out.push(`완벽하지 않아도 괜찮아요. ${W.next}도 해낸 것만 세어 가요.`);
  return out.join(' ');
}

/* ───────── 화면 ───────── */
let lastReportText = '';

function renderReport(id) {
  if (id === 'care') { renderCareSummary(); return; }
  if (!/^\d{4}(-\d{2})?$/.test(id)) { go('stats'); return; }
  $('report-title').textContent = reportName(id);
  const m = analyze(id);
  const el = $('report');
  const fmtRange = `${md(m.start)} – ${md(m.end)}${m.from > m.start && m.from <= m.last ? ` · ${md(m.from)}부터 쓰기 시작` : ''}${m.end >= today ? ' · 진행 중 (어제까지 반영)' : ''}`;

  const [hlSec, hlLines] = healthSection(m.hl, m.yearly);
  const [mdSec, mdLines] = mindSection(m.mind, m.yearly);
  if (m.last < m.start || (!m.total && !m.careSched && !m.cond.days && !m.did.some((x) => x.days) && !hlSec && !m.dy.days && !mdSec)) {
    el.innerHTML = `<p class="r-period">${fmtRange}</p><div class="r-empty">아직 모인 기록이 없어요.<br>할 일 · 오늘 한 것 · 케어 기록이 쌓이면 여기에 정리돼요.</div>`;
    lastReportText = '';
    return;
  }
  const f = feedback(m);
  const cheerText = cheer(m, f.W);
  const tileHtml = (list) => `<div class="r-tiles">${list.map(([l, v, d]) => `<div class="r-tile"><span class="r-tl">${esc(l)}</span><span class="r-tv">${v}</span>${d}</div>`).join('')}</div>`;
  const tileLines = (list) => list.map(([l, v, d]) => `- ${l}: ${v.replace(/<[^>]+>/g, '')}${d ? ` (${d.replace(/<[^>]+>/g, '')})` : ''}`);

  // 해낸 것
  const done = [];
  if (m.total) done.push(['끝낸 일', `${m.done}<small>개</small>`, '']);
  for (const x of m.did) {
    if (!x.days) continue; // 한 날이 있는 것만
    const mc = x.id === state.medId ? medCounts(m.from, m.last) : null; // 명상은 아침 · 밤 횟수도
    done.push([`${x.label}한 날`, `${x.days}<small>일</small>`, mc && mc.am + mc.pm ? `<small>${[mc.am ? `아침 ${mc.am}` : '', mc.pm ? `밤 ${mc.pm}` : ''].filter(Boolean).join(' · ')}</small>` : '']);
  }
  for (const c of m.care) done.push([c.ev.title, `${c.given}<small>번</small>`, c.skipped.length ? `<small>못 함 ${c.skipped.length}번</small>` : '']);
  if (m.visits.length) done.push(['진료', `${m.visits.filter((v) => v.done).length}<small>번</small>`, '']);
  if (m.dy.days) done.push(['일기 쓴 날', `${m.dy.days}<small>일</small>`, m.dy.lines ? `<small>감사 ${m.dy.lines}줄</small>` : '']);
  if (m.mind.own) done.push(['해낸 것', `${m.mind.own}<small>줄</small>`, `<small>${m.mind.ownDays}일</small>`]);

  // 고양이
  const cat = [];
  if (m.cond.days) cat.push(['컨디션 기록', `${m.cond.days}<small>일</small>`, '']);
  if (m.cond.vomit) {
    const blood = m.cond.vlist.filter((x) => x.b).length;
    const types = vomitTypes(m.cond.vlist, 3);
    cat.push(['구토', `${m.cond.vomit}<small>회${m.cond.plus ? '+' : ''}</small>`, `<small>${m.cond.vomitDays}일${types ? ` · ${types}` : ''}${blood ? ` · 피 섞임 ${blood}` : ''}</small>`]);
  }
  if (m.cond.nights) cat.push(['밤에 지켜봄', `${m.cond.nights}<small>일</small>`, Object.keys(m.cond.nightWhy).length ? `<small>${NIGHT.filter(([w]) => m.cond.nightWhy[w]).map(([w, l]) => `${l} ${m.cond.nightWhy[w]}`).join(' · ')}</small>` : '']);
  if (m.cond.w.length >= 2) {
    const a = m.cond.w[0].w, b = m.cond.w[m.cond.w.length - 1].w;
    const d = Math.round((b - a) * 100) / 100;
    cat.push(['체중', `${b}<small>kg</small>`, `<small>${d > 0 ? '+' : ''}${d}kg (${a}→${b})</small>`]);
  }
  if (m.cond.th) cat.push(['양치', `${m.cond.th}<small>일</small>`, '']);

  // 연간: 달마다 끝낸 일
  const monthsChart = m.yearly && m.total ? `<h3 class="r-sub">달마다 끝낸 일</h3><div class="r-months">${m.months.map((n, i) => {
    const max = Math.max(...m.months, 1);
    return `<div class="r-mcol"><span class="r-mval">${n || ''}</span><span class="r-mbar"><i style="height:${n ? Math.max(2, Math.round((n / max) * 100)) : 0}%"></i></span><span class="r-mlab">${i + 1}</span></div>`;
  }).join('')}</div>` : '';

  // 해낸 것 모아 보기 (월간): 날마다 끝낸 일 · 한 것 · 적은 '해낸 것'
  const doneDays = [];
  if (!m.yearly) {
    for (let k = m.from; k <= m.last; k = addDays(k, 1)) {
      const parts = [];
      if (m.doneOn[k]) parts.push(m.doneOn[k].join(', '));
      const dids = didOf(k).map(didLabel).filter(Boolean);
      if (dids.length) parts.push(dids.join(' · '));
      const own = ownOf(mindOf(k));
      if (own.length) parts.push(own.map((t) => `"${t.trim()}"`).join(' '));
      if (parts.length) doneDays.push({ k, parts });
    }
  }
  const doneList = doneDays.length ? `<details class="r-week"><summary>해낸 것 모아 보기 · ${doneDays.length}일</summary>
    <ul>${doneDays.map(({ k, parts }) => `<li><b>${ml(k)} (${WD[parse(k).getDay()]})</b> ${esc(parts.join(' / '))}</li>`).join('')}</ul></details>` : '';

  // 지난달 리포트를 이번 달 초에 볼 때: 이번 달 남은 주요 일정
  let ahead = '';
  const nextEnd = m.yearly ? `${+id + 1}-12-31` : monthEnd(addDays(m.end, 1));
  if (m.end < today && today <= nextEnd) {
    const list = state.events
      .filter((x) => !x.rep && !x.of && x.date >= today && x.date <= nextEnd)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
    if (list.length) {
      ahead = `<section class="r-sec"><h2>${m.yearly ? '올해' : '이번 달'} 주요 일정</h2><ul class="up-list">${list.map((x) => `
        <li class="up cat-${x.cat}"><span class="dday">${dday(x.date)}</span>
        <span class="up-body"><span class="up-title">${esc(x.title)}</span><span class="up-sub">${mdw(x.date)} · ${CATS[x.cat].label}</span></span></li>`).join('')}</ul></section>`;
    }
  }

  const li = (arr) => arr.map((t) => `<li>${esc(t)}</li>`).join('');
  const title = m.yearly ? `${id}년에 해낸 것` : `${+id.slice(5)}월에 해낸 것`;
  el.innerHTML = `
    <p class="r-period">${fmtRange}</p>
    ${done.length || doneList ? `<section class="r-sec r-done"><h2>${title}</h2>${done.length ? tileHtml(done) : ''}${monthsChart}${doneList}</section>` : ''}
    ${cat.length ? `<section class="r-sec"><h2>고양이</h2>${tileHtml(cat)}</section>` : ''}
    ${hlSec}
    ${mdSec}
    <section class="r-sec good"><h2>잘하고 있는 점</h2><ul>${li(f.good)}</ul></section>
    <section class="r-sec cheer"><h2>긍정적인 평가</h2><p>${esc(cheerText)}</p></section>
    <section class="r-sec improve"><h2>${f.W.next}에 가볍게 해 볼 것</h2><ul>${li(f.light)}</ul></section>
    ${ahead}
    <p class="r-note">이 리포트는 이 휴대폰 안의 기록만으로 계산했어요. 어디에도 전송되지 않아요.</p>`;

  lastReportText = [
    `[${reportName(id)}] ${fmtRange}`,
    ...(done.length ? ['', title, ...tileLines(done)] : []),
    ...(cat.length ? ['', '고양이', ...tileLines(cat)] : []),
    ...(hlLines.length ? ['', '건강', ...hlLines] : []),
    ...(mdLines.length ? ['', '마음', ...mdLines] : []),
    '',
    '잘하고 있는 점', ...f.good.map((t) => `- ${t}`),
    '',
    '긍정적인 평가', cheerText,
    '',
    `${f.W.next}에 가볍게 해 볼 것`, ...f.light.map((t) => `- ${t}`),
  ].join('\n');
}

$('report-copy').addEventListener('click', async () => {
  if (!lastReportText) { toast('복사할 내용이 없어요'); return; }
  try {
    await navigator.clipboard.writeText(lastReportText);
    toast('리포트를 텍스트로 복사했어요');
  } catch (e) {
    toast('복사하지 못했어요');
  }
});
