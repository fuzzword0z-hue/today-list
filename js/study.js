'use strict';

/* ═════════════════ 공부 ═════════════════
 * 운동 탭처럼 페이지 하나를 매일 다시 쓴다. '오늘 공부 완료'로 남긴 기록은 리포트에만 쓴다.
 * state.study   = { date, review, a, b, rows: [{ s, e, t }] }   지금 적어 둔 내용 (date = 마지막으로 적은 날)
 *   a = 평일 7:00–8:30, b = 평일 9:30–11:00, rows = 주말 [시작, 끝, 내용] × 4, review = 아침 복습
 * state.studies = { 'YYYY-MM-DD': { mode, review, a, b, rows, min, at } }   그날 기록 (min = 공부한 분)
 * 평일·주말은 요일로 정하고, 쉬는 평일은 공부 탭 위에서 '주말'로 바꾼다 (운동 탭의 8:30–9:30 루틴도 따라 숨김). */

const STUDY_BLOCKS = [
  { id: 'a', time: '7:00–8:30', min: 90, ph: '예: 기출 코딩 문제 10개 (틀린 것: 포인터 2개)' },
  { id: 'b', time: '9:30–11:00', min: 90, ph: '예: 데이터베이스 이론 훑기 + 단답형 30문제 (24/30)' },
];
const WEEKEND_ROWS = 4;
const EXAM_DAYS = 120; // 공부 탭 위에 D-day로 보여 줄 공적 일정 범위

/* 평일·주말: 기본은 요일(토·일 = 주말). 다르게 고른 날만 state.daymode에 남긴다 */
const defaultMode = (k) => ([0, 6].includes(parse(k).getDay()) ? 'weekend' : 'weekday');
const dayMode = (k) => state.daymode[k] || defaultMode(k);
function setDayMode(k, mode) {
  if (mode === defaultMode(k)) delete state.daymode[k];
  else state.daymode[k] = mode;
  save();
}

const stOf = () => state.study || {};
const stRows = (s) => Array.from({ length: WEEKEND_ROWS }, (_, i) => ({ s: '', e: '', t: '', ...((s.rows || [])[i] || {}) }));
const toMin = (hm) => { const [h, m] = (hm || '').split(':').map(Number); return h * 60 + m; };
const fmtMin = (n) => (n < 60 ? `${n}분` : `${Math.floor(n / 60)}시간${n % 60 ? ` ${n % 60}분` : ''}`);
const rowMin = (r) => (r.s && r.e && toMin(r.e) > toMin(r.s) ? toMin(r.e) - toMin(r.s) : 0);

/* 지금 적어 둔 내용 → 기록 (그날 모드의 칸만) */
function studySnapshot(s, mode) {
  const rec = { mode, review: s.review ? 1 : 0 };
  if (mode === 'weekday') {
    let min = 0;
    for (const b of STUDY_BLOCKS) {
      rec[b.id] = (s[b.id] || '').trim();
      if (rec[b.id]) min += b.min;
    }
    rec.min = min;
  } else {
    rec.rows = stRows(s).filter((r) => r.t.trim() || rowMin(r)).map((r) => ({ s: r.s, e: r.e, t: r.t.trim() }));
    rec.min = rec.rows.reduce((a, r) => a + rowMin(r), 0);
  }
  return rec;
}
const studyHasContent = (rec) => !!(rec.review || rec.min || rec.a || rec.b || (rec.rows && rec.rows.length));
const sameStudy = (a, b) => !!a && !!b && JSON.stringify({ ...a, at: 0 }) === JSON.stringify({ ...b, at: 0 });

function renderStudy() {
  const s = stOf();
  const k = s.date || today;
  const mode = dayMode(today);
  const rec = state.studies[today];
  $('st-date').textContent = mdw(today);
  for (const b of $('st-mode').children) b.setAttribute('aria-checked', String(b.dataset.mode === mode));

  // 다가오는 시험 (캘린더의 공적 일정)
  const limit = addDays(today, EXAM_DAYS);
  const exams = state.events
    .filter((ev) => ev.cat === 'work' && !ev.rep && ev.date >= today && ev.date <= limit)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  $('st-exams').innerHTML = exams.map((ev) => `<span class="st-exam"><b>${dday(ev.date)}</b> ${esc(ev.title)}</span>`).join('');
  $('st-exams').hidden = !exams.length;

  const stale = s.date && s.date !== today && studyHasContent(studySnapshot(s, dayMode(s.date)));
  $('st-status').innerHTML = [
    rec ? `<div class="wo-banner done"><b>오늘 공부를 기록했어요</b><span>${rec.min ? fmtMin(rec.min) : '시간 없음'}${rec.review ? ' · 아침 복습 ✓' : ''}</span></div>` : '',
    stale ? `<div class="wo-banner"><span>${md(k)}에 적은 내용이 남아 있어요. 새로 시작하려면 아래 <b>전체 지우기</b>를 눌러 주세요.</span></div>` : '',
  ].join('');

  const rows = stRows(s);
  $('st-body').innerHTML = `
    <button class="rt-item st-review${s.review ? ' on' : ''}" id="st-review" aria-pressed="${!!s.review}">
      <span class="check">${CHECK_SVG}</span>
      <span class="rt-text"><span class="rt-label">아침 복습 15분</span><span class="rt-sub">어제 헷갈린 것 5–10개, 답을 보기 전에 먼저 떠올려 보기</span></span>
    </button>
    ${mode === 'weekday' ? STUDY_BLOCKS.map((b) => `
      <section class="wo-card st-block">
        <div class="wo-head"><span class="wo-name">${b.time}</span><span class="wo-target">${fmtMin(b.min)}</span></div>
        <textarea class="st-text" data-f="${b.id}" rows="2" maxlength="300" placeholder="${b.ph}">${esc(s[b.id] || '')}</textarea>
      </section>`).join('') : `
      <section class="wo-card">
        <div class="wo-head"><span class="wo-name">주말 공부</span><span class="wo-target">시간 고르고 내용 적기</span>
          <span class="wo-amt" id="st-total">${fmtMin(rows.reduce((a, r) => a + rowMin(r), 0))}</span></div>
        ${rows.map((r, i) => `<div class="st-row" data-i="${i}">
          <input type="time" class="st-time" data-f="s" value="${r.s}" aria-label="${i + 1}번째 시작 시간">
          <span class="st-tilde">~</span>
          <input type="time" class="st-time" data-f="e" value="${r.e}" aria-label="${i + 1}번째 끝 시간">
          <input type="text" class="st-row-text" data-f="t" maxlength="200" value="${esc(r.t)}" placeholder="공부한 내용" aria-label="${i + 1}번째 공부한 내용">
        </div>`).join('')}
      </section>`}`;

  $('st-done').textContent = rec ? '완료 기록 고치기' : '오늘 공부 완료';
}

function editStudy(patch) {
  const s = { ...stOf(), ...patch };
  s.date = today;
  state.study = s;
  save();
}

$('st-mode').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  setDayMode(today, b.dataset.mode);
  renderStudy();
});

$('st-body').addEventListener('click', (e) => {
  if (!e.target.closest('#st-review')) return;
  editStudy({ review: stOf().review ? 0 : 1 });
  renderStudy();
});

// 글자를 칠 때마다 저장 (다시 그리지 않아 입력이 끊기지 않게)
$('st-body').addEventListener('input', (e) => {
  const f = e.target.dataset.f;
  if (!f) return;
  if (e.target.classList.contains('st-text')) { editStudy({ [f]: e.target.value }); return; }
  const row = e.target.closest('.st-row');
  if (!row) return;
  const rows = stRows(stOf());
  rows[+row.dataset.i][f] = e.target.value;
  editStudy({ rows });
  const t = $('st-total');
  if (t) t.textContent = fmtMin(rows.reduce((a, r) => a + rowMin(r), 0));
});

/* 기록은 적은 날짜로 남긴다 */
function recordStudy(silent) {
  const s = stOf();
  const k = s.date || today;
  const rec = { ...studySnapshot(s, dayMode(k)), at: Date.now() };
  const had = !!state.studies[k];
  const msg = k !== today ? `${md(k)} 공부로 기록했어요` : had ? '오늘 공부 기록을 고쳤어요' : '오늘 공부를 기록했어요 · 리포트에 반영돼요';
  if (silent) { state.studies[k] = rec; return msg; }
  undoable(msg, () => { state.studies[k] = rec; });
  return msg;
}

$('st-done').addEventListener('click', () => {
  const s = stOf();
  if (!studyHasContent(studySnapshot(s, dayMode(s.date || today)))) { toast('적은 내용이 없어요'); return; }
  recordStudy(false);
});

$('st-reset').addEventListener('click', async () => {
  const s = stOf();
  const k = s.date || today;
  const snap = studySnapshot(s, dayMode(k));
  const any = studyHasContent(snap) || ['a', 'b'].some((f) => (s[f] || '').trim()) || stRows(s).some((r) => r.t || r.s || r.e);
  if (!any) { toast('지울 내용이 없어요'); return; }
  let how = 'clear';
  if (studyHasContent(snap) && !sameStudy(snap, state.studies[k])) {
    how = await choose(`${k === today ? '오늘' : md(k)} 적은 내용을 아직 기록하지 않았어요.`, [
      { label: '기록하고 지우기', value: 'save' },
      { label: '기록하지 않고 지우기', value: 'clear', danger: true },
    ]);
    if (!how) return;
  }
  undoable(how === 'save' ? '기록하고 모두 지웠어요' : '모두 지웠어요', () => {
    if (how === 'save') recordStudy(true);
    state.study = { date: today };
  });
});
