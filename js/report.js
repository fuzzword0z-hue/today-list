'use strict';

/* ═════════════════ 월간·연간 리포트 ═════════════════
 * 기기 안의 기록만으로 계산하는 규칙 기반 피드백. 외부 전송 없음.
 * 새 달 1–7일에 앱을 열면 지난달 리포트가 '도착'한다 (1월에는 작년 연간 리포트도). */

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

function prevId(id) {
  if (isYear(id)) return String(+id - 1);
  const d = parse(`${id}-01`);
  return keyOf(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7);
}

function hasData({ start, end }) {
  for (const k in state.days) if (k >= start && k <= end) return true;
  return state.events.some((ev) => ev.done && Object.keys(ev.done).some((k) => k >= start && k <= end));
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
function analyze(id) {
  const { start, end } = reportRange(id);
  const yearly = isYear(id);
  // 끝난 날만 평가한다: 진행 중인 기간이면 어제까지
  const last = end < today ? end : addDays(today, -1);
  const mid = yearly ? `${id}-07-01` : `${id}-16`;
  const box = () => ({ done: 0, total: 0, days: 0 });
  const m = {
    id, yearly, start, end, last,
    days: 0, active: 0, total: 0, done: 0, moved: 0, open: 0, perfect: 0,
    streakBest: 0, gap: { len: 0, from: null, to: null },
    wd: Array.from({ length: 7 }, box), // 0 = 월요일
    halves: [box(), box()], heavy: box(), light: box(), weekend: box(), weekday: box(),
    months: yearly ? Array.from({ length: 12 }, box) : null,
    hours: { morning: 0, afternoon: 0, evening: 0, night: 0, n: 0 },
    deferred: {},
  };
  const add = (b, done, total) => { b.done += done; b.total += total; b.days++; };

  let run = 0, gapRun = 0, gapFrom = null;
  for (let k = start; k <= last; k = addDays(k, 1)) {
    m.days++;
    const items = state.days[k] || [];
    const total = items.length;
    const done = items.filter((t) => t.d).length;
    if (total) {
      const w = (parse(k).getDay() + 6) % 7;
      m.active++;
      m.total += total;
      m.done += done;
      if (done === total) m.perfect++;
      add(m.wd[w], done, total);
      add(m.halves[k < mid ? 0 : 1], done, total);
      add(w >= 5 ? m.weekend : m.weekday, done, total);
      if (total >= 7) add(m.heavy, done, total);
      else if (total <= 4) add(m.light, done, total);
      if (m.months) add(m.months[parse(k).getMonth()], done, total);
      for (const t of items) {
        if (t.m) { m.moved++; m.deferred[t.t] = (m.deferred[t.t] || 0) + 1; }
        else if (!t.d) m.open++;
        if (t.d && t.at) {
          const h = new Date(t.at).getHours();
          m.hours.n++;
          m.hours[h >= 5 && h < 12 ? 'morning' : h < 18 && h >= 12 ? 'afternoon' : h >= 18 && h < 22 ? 'evening' : 'night']++;
        }
      }
      gapRun = 0; gapFrom = null;
    } else {
      gapRun++;
      gapFrom = gapFrom || k;
      if (gapRun > m.gap.len) m.gap = { len: gapRun, from: gapFrom, to: k };
    }
    run = done ? run + 1 : 0;
    m.streakBest = Math.max(m.streakBest, run);
  }
  m.rate = m.total ? m.done / m.total : null;

  // 케어: 반복(투약)은 예정 대비 기록, 반복 없는 케어(진료)는 다녀온 횟수
  // (이 날만 바꾼 회차는 원래 반복 일정의 투약으로 센다)
  m.care = state.events.filter((ev) => checkable(ev) && ev.rep).map((ev) => {
    const c = { ev, sched: 0, given: 0, missed: [] };
    for (const d of seriesDays(ev, start, last)) {
      c.sched++;
      if (isDone(d.ev, d.k)) c.given++; else c.missed.push(d.k);
    }
    return c;
  }).filter((c) => c.sched > 0);
  m.careSched = m.care.reduce((a, c) => a + c.sched, 0);
  m.careGiven = m.care.reduce((a, c) => a + c.given, 0);
  m.visits = state.events
    .filter((ev) => checkable(ev) && !ev.rep && !ev.of && ev.date >= start && ev.date <= last)
    .map((ev) => ({ ev, done: isDone(ev, ev.date) }));

  // 일정 수 (투약 같은 반복 케어는 빼고)
  m.evCount = { work: 0, life: 0, care: 0 };
  for (const ev of state.events) {
    if (isDose(ev)) continue;
    for (let k = ev.date > start ? ev.date : start; k <= end && (!ev.until || k <= ev.until); k = addDays(k, 1)) {
      if (occursOn(ev, k)) m.evCount[ev.cat]++;
      if (!ev.rep) break;
    }
  }
  return m;
}

function score(m) {
  const parts = [];
  if (m.total) {
    parts.push({ label: '할 일 완료율', v: m.rate, w: 0.4 });
    parts.push({ label: '꾸준함 (기록한 날)', v: m.active / m.days, w: 0.25 });
    parts.push({ label: '미루지 않기', v: Math.max(0, 1 - (m.moved / m.total) * 2), w: 0.15 });
  }
  if (m.careSched) parts.push({ label: '케어 기록', v: m.careGiven / m.careSched, w: 0.2 });
  if (!parts.length) return null;
  const sw = parts.reduce((a, p) => a + p.w, 0);
  const total = Math.round((parts.reduce((a, p) => a + p.v * p.w, 0) / sw) * 100);
  const grade = total >= 90 ? '아주 좋음' : total >= 80 ? '좋음' : total >= 65 ? '괜찮음' : total >= 50 ? '보통' : '재정비 필요';
  return { total, grade, parts };
}

const rateOf = (b) => (b.total ? b.done / b.total : null);
const WDN = ['월', '화', '수', '목', '금', '토', '일'];

/* ───────── 피드백 문장 만들기 ───────── */
function feedback(m, p) {
  const Y = m.yearly;
  const W = Y
    ? { this: '올해', prev: '작년', next: '내년', h1: '상반기', h2: '하반기', late: '하반기로' }
    : { this: '이번 달', prev: '지난달', next: '다음 달', h1: '1–15일', h2: '16일 이후', late: '월말로' };
  const r = m.rate;
  const pr = p && p.rate;
  const good = [], improve = [], fix = [], goals = [];

  // 요일별 (데이터가 2일 이상 있는 요일만)
  const wds = m.wd
    .map((b, i) => ({ i, rate: rateOf(b), b }))
    .filter((x) => x.b.days >= (Y ? 8 : 2) && x.b.total >= 3);
  const best = wds.length >= 3 ? wds.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;
  const worst = wds.length >= 3 ? wds.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
  const avgDone = m.active ? m.done / m.active : 0;
  const care = m.care;
  const topDeferred = Object.entries(m.deferred).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  const ml = (k) => `${parse(k).getMonth() + 1}/${parse(k).getDate()}`;

  /* 잘하고 있는 점 */
  if (r !== null && m.total >= 10) {
    if (r >= 0.8) good.push(`할 일 ${m.total}개 중 ${m.done}개(${pct(r)}%)를 끝냈어요. 계획한 일을 거의 다 해내고 있어요.`);
    else if (r >= 0.65) good.push(`할 일 완료율 ${pct(r)}% — 계획의 3분의 2 이상을 꾸준히 해냈어요.`);
  }
  if (r !== null && pr !== null && pr !== undefined && r - pr >= 0.05) good.push(`${W.prev}보다 완료율이 ${pct(r - pr)}%p 올랐어요 (${pct(pr)}% → ${pct(r)}%).`);
  if (m.days >= 7 && m.active / m.days >= 0.8) good.push(`${m.days}일 중 ${m.active}일 동안 기록했어요. 매일 들여다보는 습관이 자리 잡았어요.`);
  if (m.streakBest >= 7) good.push(`${m.streakBest}일 연속으로 할 일을 끝낸 기간이 있었어요.`);
  if (m.perfect >= (Y ? 30 : 5)) good.push(`적은 일을 전부 끝낸 날이 ${m.perfect}일이에요.`);
  for (const c of care) {
    if (c.sched >= 3 && c.given / c.sched >= 0.95) good.push(`${c.ev.title} ${c.sched}번 중 ${c.given}번을 기록했어요. 빠짐없이 챙기고 있어요.`);
  }
  const visited = m.visits.filter((v) => v.done);
  if (visited.length) good.push(`${[...new Set(visited.map((v) => v.ev.title))].join(', ')} ${visited.length}번을 잘 다녀왔어요.`);
  if (m.total >= 10 && m.moved / m.total <= 0.1) good.push(`미룬 일이 ${m.moved}개(${pct(m.moved / m.total)}%)뿐이에요. 정한 날에 해내는 힘이 좋아요.`);
  if (best && best.rate >= 0.9) good.push(`${WDN[best.i]}요일 완료율이 ${pct(best.rate)}%로 가장 높아요. ${WDN[best.i]}요일의 리듬이 아주 좋아요.`);
  if (m.hours.n >= 10 && m.hours.morning / m.hours.n >= 0.4) good.push(`끝낸 일의 ${pct(m.hours.morning / m.hours.n)}%를 오전에 체크했어요. 아침 시간을 잘 쓰고 있어요.`);
  if (Y && m.months) {
    const ms = m.months.map((b, i) => ({ i, rate: rateOf(b), b })).filter((x) => x.b.days >= 7);
    if (ms.length >= 2) {
      const bm = ms.reduce((a, b) => (b.rate > a.rate ? b : a));
      good.push(`가장 잘한 달은 ${bm.i + 1}월이에요 (완료율 ${pct(bm.rate)}%).`);
    }
  }
  if (!good.length) good.push('기록을 남긴 것 자체가 좋은 출발이에요. 기록이 쌓일수록 더 정확하게 분석해 드릴게요.');

  /* 개선하면 좋을 점 (부드러운 제안) */
  if (worst && r !== null && worst.rate <= r - 0.15) {
    const n = Math.max(2, Math.round(worst.b.done / worst.b.days) + 1);
    improve.push(`${WDN[worst.i]}요일 완료율이 ${pct(worst.rate)}%로 가장 낮아요. ${WDN[worst.i]}요일엔 할 일을 ${n}개 이하로 적어 보세요.`);
  }
  const hr = rateOf(m.heavy), lr = rateOf(m.light);
  const k = Math.max(3, Math.round(avgDone) + 1);
  if (m.heavy.days >= 2 && lr !== null && hr <= lr - 0.15) {
    improve.push(`할 일이 7개 이상인 날은 완료율이 ${pct(hr)}%로, 4개 이하인 날(${pct(lr)}%)보다 낮아요. 하루 ${k}개 안팎이 잘 맞는 것 같아요.`);
    goals.push(`하루 할 일 ${k}개 안팎으로 적기`);
  }
  const h1 = rateOf(m.halves[0]), h2 = rateOf(m.halves[1]);
  if (h1 !== null && h2 !== null && m.halves[1].days >= (Y ? 30 : 4) && h2 <= h1 - 0.15) {
    improve.push(`${W.late} 갈수록 완료율이 떨어졌어요 (${W.h1} ${pct(h1)}% → ${W.h2} ${pct(h2)}%). 중간에 한 번 목록을 가볍게 정리해 보세요.`);
  }
  const we = rateOf(m.weekend), wk = rateOf(m.weekday);
  if (we !== null && wk !== null && m.weekend.days >= 2 && we <= wk - 0.2) {
    improve.push(`주말 완료율(${pct(we)}%)이 평일(${pct(wk)}%)보다 낮아요. 주말엔 꼭 할 일 1–2개만 적어 보는 건 어때요?`);
  }
  if (m.hours.n >= 10 && m.hours.night / m.hours.n >= 0.4) {
    improve.push(`완료 체크의 ${pct(m.hours.night / m.hours.n)}%가 밤 10시 이후에 몰려 있어요. 중요한 일은 오전에 두면 하루가 더 여유로워요.`);
  }
  if (m.days >= 7 && m.active / m.days < 0.6) {
    improve.push(`기록이 없는 날이 ${m.days - m.active}일이에요. 아침에 1분만 열어서 오늘 할 일을 적어 보세요.`);
    goals.push(`기록한 날 ${Math.min(m.days, Math.round(m.days * 0.8))}일 이상`);
  }
  if (!improve.length) improve.push('지금 리듬을 그대로 유지하면서, 하루 중 가장 중요한 일 하나를 맨 위에 적어 보세요.');

  /* 고쳤으면 하는 점 (분명한 습관 문제) */
  for (const [text, n] of topDeferred.slice(0, 2)) {
    fix.push(`'${text}' — ${n}번 미뤘어요. 더 작게 쪼개거나, 정말 필요한 일인지 다시 생각해 보세요.`);
  }
  if (m.total >= 10 && m.moved / m.total >= 0.25) {
    fix.push(`할 일의 ${pct(m.moved / m.total)}%를 미뤘어요. 미루기가 습관이 되기 전에, 처음부터 할 수 있는 만큼만 적어 보세요.`);
    goals.push('같은 일을 두 번 넘게 미루지 않기');
  }
  for (const c of care) {
    if (!c.missed.length) continue;
    const list = c.missed.slice(0, 4).map(ml).join(', ') + (c.missed.length > 4 ? ` 외 ${c.missed.length - 4}일` : '');
    fix.push(`${c.ev.title} 기록이 빠진 날이 ${c.missed.length}일 있어요 (${list}). 먹인 직후 바로 체크하면 놓치지 않아요.`);
    goals.push(`${c.ev.title} 체크 100%`);
  }
  if (m.open >= 5) fix.push(`끝내지도, 미루지도 않고 남은 일이 ${m.open}개예요. 하루를 마칠 때 남은 일은 '내일로' 넘기거나 지워서 정리해 주세요.`);
  if (m.gap.len >= 4) fix.push(`${ml(m.gap.from)}–${ml(m.gap.to)} ${m.gap.len}일 동안 기록이 없었어요. 바쁜 날엔 한 줄이라도 남겨 보세요.`);
  if (r !== null && m.total >= 10 && r < 0.5) fix.push(`완료율이 ${pct(r)}%로 절반에 못 미쳐요. 할 일 수를 줄이는 것부터 시작해 보세요.`);
  if (!fix.length) fix.push('특별히 고칠 점이 보이지 않아요. 지금처럼만 해 주세요.');

  /* 목표 */
  if (r !== null && r < 0.85) goals.unshift(`완료율 ${Math.min(90, Math.ceil((pct(r) + 10) / 5) * 5)}% 넘기기`);
  if (goals.length < 3 && m.streakBest) goals.push(`연속 완료 ${m.streakBest + 3}일 도전`);

  return { good: good.slice(0, 5), improve: improve.slice(0, 4), fix: fix.slice(0, 4), goals: [...new Set(goals)].slice(0, 3), W };
}

/* 긍정적인 평가 (응원) */
function cheer(m, s, W, prev) {
  const out = [];
  const t = s ? s.total : 0;
  out.push(t >= 85 ? `정말 훌륭한 ${m.yearly ? '한 해' : '한 달'}였어요.`
    : t >= 70 ? `안정적으로 잘 해낸 ${m.yearly ? '한 해' : '한 달'}였어요.`
    : t >= 50 ? `쉽지 않은 날도 있었지만, 끝까지 기록을 이어 온 ${m.yearly ? '한 해' : '한 달'}였어요.`
    : `많이 바쁘고 지친 ${m.yearly ? '한 해' : '한 달'}였을지도 몰라요.`);
  if (m.careSched) {
    const visits = m.visits.filter((v) => v.done).length;
    out.push(`아이를 돌보는 일은 몸도 마음도 많이 쓰이는 일인데, ${W.this} 투약 ${m.careGiven}번${visits ? `과 병원 진료 ${visits}번` : ''}을 챙기면서${m.done ? ` 할 일 ${m.done}개까지 해냈어요` : ' 하루하루를 버텨 냈어요'}. 그것만으로도 충분히 잘하고 있어요.`);
  } else if (m.done) {
    out.push(`${W.this} 할 일 ${m.done}개를 끝냈어요. 작은 체크 하나하나가 쌓여서 만든 결과예요.`);
  }
  if (prev && prev.rate !== null && m.rate !== null && m.rate > prev.rate + 0.03) out.push(`무엇보다 ${W.prev}보다 나아졌다는 게 가장 큰 성과예요.`);
  out.push(t >= 70 ? `이 흐름 그대로 ${W.next}도 함께 가요.` : `완벽하지 않아도 괜찮아요. ${W.next}엔 하루 한 가지만 확실히 끝내는 것부터 다시 시작해요.`);
  return out.join(' ');
}

/* ───────── 화면 ───────── */
let lastReportText = '';

function renderReport(id) {
  if (!/^\d{4}(-\d{2})?$/.test(id)) { go('stats'); return; }
  $('report-title').textContent = reportName(id);
  const m = analyze(id);
  const el = $('report');
  const fmtRange = `${md(m.start)} – ${md(m.end)}${m.end >= today ? ' · 진행 중 (어제까지 반영)' : ''}`;

  if (m.last < m.start || (!m.total && !m.careSched)) {
    el.innerHTML = `<p class="r-period">${fmtRange}</p><div class="r-empty">아직 분석할 기록이 부족해요.<br>할 일과 케어 기록이 쌓이면 리포트가 채워져요.</div>`;
    lastReportText = '';
    return;
  }

  const prevM = analyze(prevId(id));
  const prev = prevM.total ? prevM : null;
  const s = score(m);
  const f = feedback(m, prev);
  const cheerText = cheer(m, s, f.W, prev);

  const delta = (a, b, unit = '') => {
    if (a === null || b === null || b === undefined) return '';
    const d = Math.round(a - b);
    return d ? `<small class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}${unit}</small>` : '<small>–</small>';
  };
  const tiles = [];
  if (m.total) {
    tiles.push(['완료한 일', `${m.done}<small>/${m.total}개</small>`, delta(m.done, prev && prev.done)]);
    tiles.push(['완료율', `${pct(m.rate)}<small>%</small>`, delta(pct(m.rate), prev && pct(prev.rate), '%p')]);
    tiles.push(['기록한 날', `${m.active}<small>/${m.days}일</small>`, '']);
    tiles.push(['다 끝낸 날', `${m.perfect}<small>일</small>`, '']);
    tiles.push(['최장 연속', `${m.streakBest}<small>일</small>`, '']);
    tiles.push(['미룬 일', `${m.moved}<small>개</small>`, '']);
  }
  for (const c of m.care) tiles.push([c.ev.title, `${c.given}<small>/${c.sched}회</small>`, '']);
  if (m.visits.length) tiles.push(['진료', `${m.visits.filter((v) => v.done).length}<small>회</small>`, '']);
  const ev = m.evCount;
  if (ev.work + ev.life + ev.care) tiles.push(['일정', `${ev.work + ev.life + ev.care}<small>개</small>`, `<small>공적 ${ev.work} · 사적 ${ev.life}${ev.care ? ` · 케어 ${ev.care}` : ''}</small>`]);

  let monthsChart = '';
  if (m.yearly) {
    monthsChart = `<section class="r-sec"><h2>월별 완료율</h2><div class="r-months">${m.months.map((b, i) => {
      const rr = rateOf(b);
      return `<div class="r-mcol"><span class="r-mval">${rr === null ? '' : pct(rr)}</span><span class="r-mbar"><i style="height:${rr === null ? 0 : Math.max(2, pct(rr))}%"></i></span><span class="r-mlab">${i + 1}</span></div>`;
    }).join('')}</div></section>`;
  }

  // 지난달 리포트를 이번 달 초에 볼 때: 이번 달 남은 주요 일정
  let ahead = '';
  const nextStart = addDays(m.end, 1);
  const nextEnd = m.yearly ? `${+id + 1}-12-31` : monthEnd(nextStart);
  if (m.end < today && today <= nextEnd) {
    const list = state.events
      .filter((x) => !x.rep && !x.of && x.date >= today && x.date <= nextEnd)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
    if (list.length) {
      ahead = `<section class="r-sec"><h2>${m.yearly ? '올해' : '이번 달'} 주요 일정</h2><ul class="up-list">${list.map((x) => `
        <li class="up cat-${x.cat}"><span class="dday">${dday(x.date)}</span>
        <span class="up-body"><span class="up-title">${esc(x.title)}</span><span class="up-sub">${mdw(x.date)} · ${CATS[x.cat].label}</span></span></li>`).join('')}</ul>
        <p class="r-tip">시험·면접 같은 일정은 준비할 일을 날짜별로 나눠 미리 적어 두세요.</p></section>`;
    }
  }

  const li = (arr) => arr.map((t) => `<li>${esc(t)}</li>`).join('');
  el.innerHTML = `
    <p class="r-period">${fmtRange}</p>
    <section class="r-hero">
      <h2>종합 평가</h2>
      <div class="r-score"><b>${s.total}</b><span>점</span><span class="r-grade">${s.grade}</span></div>
      <ul class="r-parts">${s.parts.map((pp) => `
        <li><span class="r-plabel">${pp.label}</span><span class="r-meter"><i style="width:${pct(pp.v)}%"></i></span><span class="r-pval">${pct(pp.v)}%</span></li>`).join('')}
      </ul>
    </section>
    <section class="r-sec"><h2>숫자로 보는 ${m.yearly ? `${id}년` : `${+id.slice(5)}월`}</h2>
      <div class="r-tiles">${tiles.map(([l, v, d]) => `<div class="r-tile"><span class="r-tl">${esc(l)}</span><span class="r-tv">${v}</span>${d}</div>`).join('')}</div>
      ${prev ? `<p class="r-tip">▲▼ 는 ${f.W.prev}와 비교한 값이에요.</p>` : ''}
    </section>
    ${monthsChart}
    <section class="r-sec good"><h2>잘하고 있는 점</h2><ul>${li(f.good)}</ul></section>
    <section class="r-sec cheer"><h2>긍정적인 평가</h2><p>${esc(cheerText)}</p></section>
    <section class="r-sec improve"><h2>개선하면 좋을 점</h2><ul>${li(f.improve)}</ul></section>
    <section class="r-sec fix"><h2>고쳤으면 하는 점</h2><ul>${li(f.fix)}</ul></section>
    ${f.goals.length ? `<section class="r-sec goals"><h2>${f.W.next} 목표 제안</h2><ul>${li(f.goals)}</ul></section>` : ''}
    ${ahead}
    <p class="r-note">이 리포트는 이 휴대폰 안의 기록만으로 계산했어요. 어디에도 전송되지 않아요.</p>`;

  lastReportText = [
    `[${reportName(id)}] ${fmtRange}`,
    `종합 평가: ${s.total}점 (${s.grade})`,
    ...s.parts.map((pp) => `- ${pp.label}: ${pct(pp.v)}%`),
    '',
    '숫자로 보기',
    ...tiles.map(([l, v]) => `- ${l}: ${v.replace(/<[^>]+>/g, '')}`),
    '',
    '잘하고 있는 점', ...f.good.map((t) => `- ${t}`),
    '',
    '긍정적인 평가', cheerText,
    '',
    '개선하면 좋을 점', ...f.improve.map((t) => `- ${t}`),
    '',
    '고쳤으면 하는 점', ...f.fix.map((t) => `- ${t}`),
    ...(f.goals.length ? ['', `${f.W.next} 목표 제안`, ...f.goals.map((t) => `- ${t}`)] : []),
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
