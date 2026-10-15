'use strict';

/* ═════════════════ 공부 ═════════════════
 * 운동 탭처럼 페이지 하나를 매일 다시 쓴다. '오늘 공부 완료'로 남긴 기록은 리포트에만 쓴다.
 * state.study   = { date, touched, review, rows: [{ s, e, t }] }   지금 적어 둔 내용
 *   date = 이 내용을 기록할 날 (위 '기록 날짜'), touched = 마지막으로 만진 날 (오늘이 아니면 '지난 날 내용 남아 있음')
 *   rows = [시작, 끝, 내용] 줄 (평일·주말 같음, 4줄부터 다 쓰면 한 줄씩 늘어남), review = 아침 복습
 * state.studies = { 'YYYY-MM-DD': { mode, review, rows, min, at } }   그날 기록 (min = 공부한 분)
 *   예전 평일 기록은 rows 대신 a(7:00–8:30) · b(9:30–11:00) 글자로 남아 있다 → 그대로 읽는다.
 * 평일 계획(7:00–8:30 · 9:30–11:00)은 칸으로 고정하지 않고, 눌러서 빈 줄에 시간을 채우는 버튼으로만 둔다
 * (일정이 틀어진 날도 실제로 공부한 시간을 그대로 적게). 계획을 지켰는지는 적은 시간이 계획과 절반 이상 겹치는지로 본다.
 * 평일·주말은 요일로 정하고, 쉬는 평일은 공부 탭 위에서 '주말'로 바꾼다 (운동 탭의 8:30–9:30 루틴도 따라 숨김). */

const STUDY_BLOCKS = [
  { id: 'a', time: '7:00–8:30', s: '07:00', e: '08:30', min: 90 },
  { id: 'b', time: '9:30–11:00', s: '09:30', e: '11:00', min: 90 },
];
const ROWS_MIN = 4; // 처음 보이는 줄 수
const ROWS_MAX = 8; // 다 쓰면 한 줄씩 늘어나는 끝
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
const stRows = (s, n) => Array.from({ length: n || Math.min(ROWS_MAX, Math.max(ROWS_MIN, (s.rows || []).length)) },
  (_, i) => ({ s: '', e: '', t: '', ...((s.rows || [])[i] || {}) }));
const toMin = (hm) => { const [h, m] = (hm || '').split(':').map(Number); return h * 60 + m; };
const fmtMin = (n) => (n < 60 ? `${n}분` : `${Math.floor(n / 60)}시간${n % 60 ? ` ${n % 60}분` : ''}`);
const rowMin = (r) => (r.s && r.e && toMin(r.e) > toMin(r.s) ? toMin(r.e) - toMin(r.s) : 0);
const hm = (t) => t.replace(/^0(?=\d)/, ''); // 07:00 → 7:00

/* 평일 계획 칸과 겹친 시간 (분). 절반 이상 겹치면 그 칸을 지킨 것으로 본다 */
const blockMin = (rows, b) => rows.reduce((a, r) => (rowMin(r)
  ? a + Math.max(0, Math.min(toMin(r.e), toMin(b.e)) - Math.max(toMin(r.s), toMin(b.s))) : a), 0);
const blockDone = (rec, b) => !!rec && (!!rec[b.id] || blockMin(rec.rows || [], b) >= b.min / 2);

/* 기록 한 날을 글로 (리포트용). 예전 평일 기록(a·b)도 읽는다 */
const studyParts = (rec) => [
  ...STUDY_BLOCKS.filter((b) => rec[b.id]).map((b) => `${b.time.split('–')[0]} ${rec[b.id]}`),
  ...(rec.rows || []).map((r) => `${r.s && r.e ? `${hm(r.s)}–${hm(r.e)} ` : r.s ? `${hm(r.s)}– ` : ''}${r.t}`.trim()),
];

/* 지금 적어 둔 내용 → 기록 (내용이나 시간이 있는 줄만) */
function studySnapshot(s, mode) {
  const rows = stRows(s).filter((r) => r.t.trim() || rowMin(r)).map((r) => ({ s: r.s, e: r.e, t: r.t.trim() }));
  return { mode, review: s.review ? 1 : 0, rows, min: rows.reduce((a, r) => a + rowMin(r), 0) };
}
const studyHasContent = (rec) => !!(rec.review || rec.min || rec.a || rec.b || (rec.rows && rec.rows.length));
/* 같은 내용인지 (예전 형식 기록은 줄로 바꿔서 비교) */
const studyKey = (r) => JSON.stringify(studySnapshot(recordToStudy(r), r.mode));
const sameStudy = (a, b) => !!a && !!b && studyKey(a) === studyKey(b);
/* 칸에 뭐라도 적혀 있는지 (시간만 고른 줄 포함) */
const studyAny = (s) => !!(s.review || stRows(s).some((r) => r.t || r.s || r.e));

/* 기록 날짜와 '지난 날 내용이 남아 있음' (운동 탭과 같은 방식) */
const stTouched = () => stOf().touched || stOf().date;
const stStale = () => studyAny(stOf()) && !!stTouched() && stTouched() !== today;
function stRecDate() {
  const s = stOf();
  if (stStale()) return s.date || stTouched();
  return s.touched === today && s.date ? s.date : today;
}
const stSnap = () => studySnapshot(stOf(), dayMode(stRecDate()));

/* 남겨 둔 기록 → 칸 (지난 날 기록을 불러와 고칠 때). 예전 평일 기록의 a·b는 계획 시간 줄로 */
function recordToStudy(rec) {
  const old = STUDY_BLOCKS.filter((b) => rec[b.id]).map((b) => ({ s: b.s, e: b.e, t: rec[b.id] }));
  return { review: rec.review || 0, rows: [...old, ...(rec.rows || []).map((r) => ({ ...r }))] };
}

/* 보여 줄 줄: 적어 둔 마지막 줄 다음에 빈 줄 하나 (4줄부터 8줄까지) */
function stShown(s) {
  const rows = stRows(s);
  const last = rows.reduce((a, r, i) => (r.s || r.e || r.t ? i : a), -1);
  return stRows(s, Math.min(ROWS_MAX, Math.max(ROWS_MIN, last + 2)));
}
const rowHtml = (r, i, ro) => `<div class="st-row" data-i="${i}">
  <input type="time" class="st-time" data-f="s" value="${r.s}" aria-label="${i + 1}번째 시작 시간"${ro}>
  <span class="st-tilde">~</span>
  <input type="time" class="st-time" data-f="e" value="${r.e}" aria-label="${i + 1}번째 끝 시간"${ro}>
  <input type="text" class="st-row-text" data-f="t" maxlength="200" value="${esc(r.t)}" placeholder="${i ? '공부한 내용' : '공부한 내용 (예: 기출 코딩 10문제, 틀린 것 2)'}" aria-label="${i + 1}번째 공부한 내용"${ro}>
</div>`;
const planHtml = (rows) => `<div class="st-plan"><span>계획</span>${STUDY_BLOCKS.map((b) => `<button class="st-chip" data-plan="${b.id}" aria-pressed="${blockMin(rows, b) >= b.min / 2}">${b.time}</button>`).join('')}</div>`;

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

  const rows = stShown(s);
  const ro = stale ? ' readonly' : '';
  $('st-body').innerHTML = `
    <button class="rt-item st-review${s.review ? ' on' : ''}" id="st-review" aria-pressed="${!!s.review}">
      <span class="check">${CHECK_SVG}</span>
      <span class="rt-text"><span class="rt-label">아침 복습 15분</span><span class="rt-sub">어제 헷갈린 것 5–10개, 답을 보기 전에 먼저 떠올려 보기</span></span>
    </button>
    <section class="wo-card">
      <div class="wo-head"><span class="wo-name">${mode === 'weekday' ? '평일 공부' : '주말 공부'}</span><span class="wo-target">시간 고르고 내용 적기</span>
        <span class="wo-amt" id="st-total">${fmtMin(rows.reduce((a, r) => a + rowMin(r), 0))}</span></div>
      ${mode === 'weekday' ? planHtml(rows) : ''}
      <div id="st-rows">${rows.map((r, i) => rowHtml(r, i, ro)).join('')}</div>
    </section>`;

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
  if (stStale()) return;
  if (e.target.closest('#st-review')) {
    editStudy({ review: stOf().review ? 0 : 1 });
    renderStudy();
    return;
  }
  // 계획 버튼: 계획대로 했으면 눌러서 빈 줄에 그 시간을 채운다
  const chip = e.target.closest('[data-plan]');
  if (!chip) return;
  const b = STUDY_BLOCKS.find((x) => x.id === chip.dataset.plan);
  const rows = stRows(stOf(), document.querySelectorAll('#st-rows .st-row').length);
  if (chip.getAttribute('aria-pressed') === 'true') { toast(`${b.time} 시간은 이미 적었어요`); return; }
  const i = rows.findIndex((r) => !r.s && !r.e);
  if (i < 0) { toast('빈 줄이 없어요'); return; }
  rows[i] = { ...rows[i], s: b.s, e: b.e };
  editStudy({ rows });
  renderStudy();
  const t = document.querySelector(`#st-rows .st-row[data-i="${i}"] .st-row-text`);
  if (t && !t.value) t.focus();
});

// 글자를 칠 때마다 저장 (다시 그리지 않아 입력이 끊기지 않게: 합계·계획 표시·새 줄만 고친다)
$('st-body').addEventListener('input', (e) => {
  const f = e.target.dataset.f;
  const row = e.target.closest('.st-row');
  if (!f || !row || stStale()) return;
  const box = $('st-rows');
  const n = box.children.length;
  const rows = stRows(stOf(), n);
  const i = +row.dataset.i;
  rows[i][f] = e.target.value;
  editStudy({ rows });
  $('st-total').textContent = fmtMin(rows.reduce((a, r) => a + rowMin(r), 0));
  for (const c of document.querySelectorAll('#st-body [data-plan]')) {
    const b = STUDY_BLOCKS.find((x) => x.id === c.dataset.plan);
    c.setAttribute('aria-pressed', String(blockMin(rows, b) >= b.min / 2));
  }
  // 마지막 줄을 쓰기 시작하면 빈 줄을 하나 더
  if (i === n - 1 && n < ROWS_MAX && (rows[i].s || rows[i].e || rows[i].t)) box.insertAdjacentHTML('beforeend', rowHtml({ s: '', e: '', t: '' }, n, ''));
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
