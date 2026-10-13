'use strict';

/* ═════════════════ 공부 ═════════════════
 * 운동 탭처럼 페이지 하나를 매일 다시 쓴다. '오늘 공부 완료'로 남긴 기록은 리포트에만 쓴다.
 * state.study   = { date, touched, review, a, b, rows: [{ s, e, t }] }   지금 적어 둔 내용
 *   date = 이 내용을 기록할 날 (위 '기록 날짜'), touched = 마지막으로 만진 날 (오늘이 아니면 '지난 날 내용 남아 있음')
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
/* 칸에 뭐라도 적혀 있는지 (시간만 고른 주말 줄 포함) */
const studyAny = (s) => !!(s.review || ['a', 'b'].some((f) => (s[f] || '').trim()) || stRows(s).some((r) => r.t || r.s || r.e));

/* 기록 날짜와 '지난 날 내용이 남아 있음' (운동 탭과 같은 방식) */
const stTouched = () => stOf().touched || stOf().date;
const stStale = () => studyAny(stOf()) && !!stTouched() && stTouched() !== today;
function stRecDate() {
  const s = stOf();
  if (stStale()) return s.date || stTouched();
  return s.touched === today && s.date ? s.date : today;
}
const stSnap = () => studySnapshot(stOf(), dayMode(stRecDate()));

/* 남겨 둔 기록 → 칸 (지난 날 기록을 불러와 고칠 때) */
function recordToStudy(rec) {
  return { review: rec.review || 0, a: rec.a || '', b: rec.b || '', rows: (rec.rows || []).map((r) => ({ ...r })) };
}

function renderStudy() {
  const s = stOf();
  const k = stRecDate();
  const mode = dayMode(k);
  const rec = state.studies[k];
  const stale = stStale();
  $('st-date').textContent = mdw(today);
  for (const b of $('st-mode').children) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  $('view-study').classList.toggle('locked', stale);
  $('st-recdate').innerHTML = stale ? '' : recDateRow(k);

  // 다가오는 시험 (캘린더의 공적 일정)
  const limit = addDays(today, EXAM_DAYS);
  const exams = state.events
    .filter((ev) => ev.cat === 'work' && !ev.rep && ev.date >= today && ev.date <= limit)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  $('st-exams').innerHTML = exams.map((ev) => `<span class="st-exam"><b>${dday(ev.date)}</b> ${esc(ev.title)}</span>`).join('');
  $('st-exams').hidden = !exams.length;

  // 지난 날 내용이 남아 있으면: 그 날로 기록 / 지우기 / 오늘 것으로 이어서 중에 고르기
  $('st-status').innerHTML = stale ? `<div class="wo-banner stale">
      <b>${md(k)}에 적은 내용이 남아 있어요</b>
      <span>${sameStudy(stSnap(), rec) ? '이미 그 날 기록과 같아요.' : '아직 그 날 기록으로 남기지 않았어요.'} 어떻게 할까요?</span>
      <div class="stale-acts">
        <button class="wo-btn primary" data-stale="save">${ml(k)}로 기록하고 새로 시작</button>
        <button class="wo-btn" data-stale="clear">기록하지 않고 지우기</button>
        <button class="wo-btn" data-stale="continue">오늘 것으로 이어서</button>
      </div>
    </div>`
    : rec ? `<div class="wo-banner done"><b>${k === today ? '오늘' : md(k)} 공부를 기록했어요</b><span>${rec.min ? fmtMin(rec.min) : '시간 없음'}${rec.review ? ' · 아침 복습 ✓' : ''}</span></div>` : '';

  const rows = stRows(s);
  const ro = stale ? ' readonly' : '';
  $('st-body').innerHTML = `
    <button class="rt-item st-review${s.review ? ' on' : ''}" id="st-review" aria-pressed="${!!s.review}">
      <span class="check">${CHECK_SVG}</span>
      <span class="rt-text"><span class="rt-label">아침 복습 15분</span><span class="rt-sub">어제 헷갈린 것 5–10개, 답을 보기 전에 먼저 떠올려 보기</span></span>
    </button>
    ${mode === 'weekday' ? STUDY_BLOCKS.map((b) => `
      <section class="wo-card st-block">
        <div class="wo-head"><span class="wo-name">${b.time}</span><span class="wo-target">${fmtMin(b.min)}</span></div>
        <textarea class="st-text" data-f="${b.id}" rows="2" maxlength="300" placeholder="${b.ph}"${ro}>${esc(s[b.id] || '')}</textarea>
      </section>`).join('') : `
      <section class="wo-card">
        <div class="wo-head"><span class="wo-name">주말 공부</span><span class="wo-target">시간 고르고 내용 적기</span>
          <span class="wo-amt" id="st-total">${fmtMin(rows.reduce((a, r) => a + rowMin(r), 0))}</span></div>
        ${rows.map((r, i) => `<div class="st-row" data-i="${i}">
          <input type="time" class="st-time" data-f="s" value="${r.s}" aria-label="${i + 1}번째 시작 시간"${ro}>
          <span class="st-tilde">~</span>
          <input type="time" class="st-time" data-f="e" value="${r.e}" aria-label="${i + 1}번째 끝 시간"${ro}>
          <input type="text" class="st-row-text" data-f="t" maxlength="200" value="${esc(r.t)}" placeholder="공부한 내용" aria-label="${i + 1}번째 공부한 내용"${ro}>
        </div>`).join('')}
      </section>`}`;

  $('st-done').textContent = k === today ? (rec ? '완료 기록 고치기' : '오늘 공부 완료') : `${ml(k)} ${rec ? '기록 고치기' : '공부 완료'}`;
}

function editStudy(patch) {
  if (stStale()) return;
  const s = { ...stOf(), ...patch };
  s.date = stRecDate();
  s.touched = today;
  state.study = s;
  save();
}

$('st-mode').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  setDayMode(stRecDate(), b.dataset.mode);
  renderStudy();
});

$('st-body').addEventListener('click', (e) => {
  if (!e.target.closest('#st-review') || stStale()) return;
  editStudy({ review: stOf().review ? 0 : 1 });
  renderStudy();
});

// 글자를 칠 때마다 저장 (다시 그리지 않아 입력이 끊기지 않게)
$('st-body').addEventListener('input', (e) => {
  const f = e.target.dataset.f;
  if (!f || stStale()) return;
  if (e.target.classList.contains('st-text')) { editStudy({ [f]: e.target.value }); return; }
  const row = e.target.closest('.st-row');
  if (!row) return;
  const rows = stRows(stOf());
  rows[+row.dataset.i][f] = e.target.value;
  editStudy({ rows });
  const t = $('st-total');
  if (t) t.textContent = fmtMin(rows.reduce((a, r) => a + rowMin(r), 0));
});

/* 기록은 기록 날짜로 남긴다 */
function recordStudy(silent) {
  const k = stRecDate();
  const rec = { ...stSnap(), at: Date.now() };
  const had = !!state.studies[k];
  const msg = k !== today ? `${md(k)} 공부로 기록했어요` : had ? '오늘 공부 기록을 고쳤어요' : '오늘 공부를 기록했어요 · 리포트에 반영돼요';
  if (silent) { state.studies[k] = rec; return msg; }
  undoable(msg, () => { state.studies[k] = rec; });
  return msg;
}

$('st-done').addEventListener('click', async () => {
  const snap = stSnap();
  if (!studyHasContent(snap)) { toast('적은 내용이 없어요'); return; }
  const k = stRecDate();
  // 지난 날 기록을 다른 내용으로 덮어쓸 때는 한 번 더 묻는다
  if (k !== today && state.studies[k] && !sameStudy(snap, state.studies[k])) {
    const ok = await choose(`${md(k)} 공부 기록이 이미 있어요. 지금 적은 내용으로 바꿀까요?`, [{ label: '지금 내용으로 바꾸기', value: 'yes' }]);
    if (ok !== 'yes') return;
  }
  recordStudy(false);
});

/* 지난 날 내용이 남아 있을 때 고르는 세 가지 */
$('st-status').addEventListener('click', (e) => {
  const b = e.target.closest('[data-stale]');
  if (!b) return;
  const k = stRecDate();
  const fresh = { date: today, touched: today };
  if (b.dataset.stale === 'save') {
    undoable(`${md(k)} 공부로 기록하고 새로 시작해요`, () => {
      if (studyHasContent(stSnap())) recordStudy(true);
      state.study = fresh;
    });
  } else if (b.dataset.stale === 'clear') {
    undoable('남아 있던 내용을 지웠어요', () => { state.study = fresh; });
  } else {
    state.study = { ...stOf(), date: today, touched: today };
    save();
    renderStudy();
  }
});

/* 기록 날짜 바꾸기: 지금 칸이 그 날 기록과 같으면(=고친 게 없으면) 새 날짜의 기록을 불러오고,
 * 아직 기록하지 않은 내용이 있으면 그 내용을 새 날짜로 옮긴다 */
bindRecDate($('st-recdate'), (nk) => {
  const s = stOf();
  const cur = stRecDate();
  const clean = !studyAny(s) || sameStudy(stSnap(), state.studies[cur]);
  let next = s;
  if (clean) {
    const r = state.studies[nk];
    next = r ? recordToStudy(r) : {};
    if (r && r.mode) setDayMode(nk, r.mode);
  }
  state.study = { ...next, date: nk, touched: today };
  save();
  renderStudy();
  if (!clean) toast(`적은 내용을 ${nk === today ? '오늘' : md(nk)} 기록으로 옮겼어요`);
  else if (nk !== today) toast(state.studies[nk] ? `${md(nk)} 기록을 불러왔어요` : `${md(nk)} 기록을 새로 써요`);
});

$('st-reset').addEventListener('click', async () => {
  const s = stOf();
  const k = stRecDate();
  const snap = stSnap();
  if (!studyAny(s)) { toast('지울 내용이 없어요'); return; }
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
    state.study = { date: today, touched: today };
  });
});
