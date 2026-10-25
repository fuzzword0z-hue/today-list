'use strict';

/* ═════════════════ 운동 ═════════════════
 * state.workout  = { date, touched, c: { back: [n, n, n], shoulder: [n, n, n], plank: n, side: n,
 *                                        rt: { ex20, chores, shower }, rounds: n, period: n, bike: n,
 *                                        sq: n, rows: [{ s, e, t }] } }
 *   sq = 식후 스쿼트 칸 수 (한 칸 10회), rows = 쉬는 날 운동 / 출근일 '그 밖의 운동' [시작 ~ 끝 + 내용]
 *   지금 체크해 둔 상태. date = 이 체크를 기록할 날 (위 '기록 날짜'), touched = 마지막으로 만진 날.
 *   touched가 오늘이 아니면 '지난 날 체크가 남아 있음' → 기록·지우기·이어서 중에 고르기 전까지 칸을 잠근다.
 *   rounds / period / bike = 20분 운동 버전별 진행 칸 수
 * state.w20v = 'v1' | 'period' | 'bike'   고른 20분 운동 버전 (체크를 지워도 유지)
 * state.sqGoal = 하루 스쿼트 목표 (10–100회, 10회씩. 기본 50 = 5칸)
 * state.workouts = { 'YYYY-MM-DD': { back, shoulder, plank, side, full, ex20, w20v, chores, shower,
 *                                    rounds, period, bike, routine, sq, rows, xmin, at } }
 *   sq = 스쿼트 횟수, rows = 적은 운동 줄, xmin = 그 줄들의 시간(분)
 *   '오늘 운동 완료'로 남긴 그날 기록. 등·어깨·사이드 플랭크는 총 횟수, 플랭크는 총 초, bike는 분.
 *   routine = 8:30–9:30 루틴 세 가지를 모두 체크한 날. 캘린더·목록에는 쓰지 않고 리포트에만 쓴다. */

const EXERCISES = [
  { id: 'back', name: '등 운동', sets: 3, reps: 12 },
  { id: 'shoulder', name: '어깨 교정', sets: 3, reps: 12 },
  { id: 'plank', name: '플랭크', steps: 6, step: 30, sec: true },     // 한 칸 = 30초
  { id: 'side', name: '사이드 플랭크', steps: 6, step: 10 },          // 한 칸 = 10회
];

/* 출근일 8:30–9:30 루틴 (쉬는 날에는 숨김) */
const ROUTINE = [
  { id: 'ex20', label: '20분 운동', sub: '아래 루틴 · 체크하면 운동한 날로 기록돼요' },
  { id: 'chores', label: '집안일' },
  { id: 'shower', label: '샤워', sub: '마지막 순서로 — 씻고 나와서 바로 9:30 공부' },
];
/* 출근일 20분 운동: 세 가지 버전 중 골라서. 진행 칸을 다 채우면 '20분 운동'이 자동 체크된다 */
const W20 = {
  v1: {
    label: '기본', target: '맨몸 · 심박수 올리기', key: 'rounds', row: '본운동', cells: 3, cell: (i) => `${i}바퀴`,
    parts: [
      { part: '워밍업 3분', items: ['제자리 걷기 + 팔 돌리기 1분', '맨몸 스쿼트 천천히 1분', '팔벌려 뛰기 1분'] },
      {
        part: '본운동 15분 · 40초 운동 / 20초 휴식 × 3바퀴',
        items: [
          '스쿼트 점프 — 조용히 하려면 빠른 스쿼트',
          '푸시업 — 힘들면 무릎 대고',
          '마운틴 클라이머',
          '리버스 런지 — 케틀벨 스윙으로 바꿔도 좋아요',
          '버피 — 조용히 하려면 점프 없는 버피',
        ],
        ol: true,
      },
      { part: '쿨다운 2분', items: ['허벅지 앞뒤 · 종아리 · 가슴 스트레칭'] },
    ],
    tip: '두 바퀴째 끝날 무렵 짧은 말은 나오지만 문장으로 말하기 힘들면 강도가 맞아요. 쉬워지면 45초 / 15초로.',
  },
  period: {
    label: '생리 기간', target: '가볍게 · 점프 없이', key: 'period', row: '진행', cells: 3, cell: (i) => (i < 3 ? `${i}바퀴` : '마무리'),
    parts: [
      { part: '워밍업 3분', items: ['제자리 걷기 + 어깨 돌리기 1분', '골반 크게 돌리기 1분', '팔을 위로 뻗으며 옆구리 늘리기 1분'] },
      {
        part: '본운동 12분 · 동작마다 1분, 천천히 × 2바퀴',
        items: [
          '고양이-소 자세 — 숨 쉬며 등을 둥글게·길게',
          '글루트 브릿지 — 천천히 올리고 2초 멈추기',
          '스텝 터치 — 옆으로 한 발씩, 팔은 가볍게',
          '버드독 — 좌우 번갈아, 배는 살짝만 힘주기',
          '얕은 와이드 스쿼트 — 점프 없이',
          '제자리 걷기 — 숨 고르기',
        ],
        ol: true,
      },
      { part: '마무리 5분 · 동작마다 1분', items: ['아기 자세', '누워서 무릎 감싸 안기', '나비 자세 (골반 열기)', '누워서 무릎 모아 좌우로 비틀기', '배로 깊게 숨 쉬기'] },
    ],
    tip: '점프와 강한 복근 운동은 빼고, 숨이 살짝 찰 정도로만 해요. 통증이 심하거나 어지러우면 바로 멈추고 쉬어요. 힘든 날엔 마무리 5분만 해도 괜찮아요.',
  },
  bike: {
    label: '실내자전거', target: '20분 · 인터벌', key: 'bike', row: '시간', cells: 4, cell: (i) => `${i * 5}분`, unit: 5,
    parts: [
      { part: '워밍업 3분', items: ['가볍게 페달 — 대화할 수 있을 정도'] },
      { part: '본운동 14분', items: ['[보통 2분 + 빠르게 1분] × 4번', '이어서 보통 속도 2분'] },
      { part: '쿨다운 3분', items: ['천천히 페달 2분', '내려와서 허벅지 앞뒤 · 종아리 스트레칭 1분'] },
    ],
    tip: '빠르게 구간은 짧은 말만 나올 정도, 보통 구간은 숨이 조금 찰 정도예요. 다리가 가벼우면 저항을 한 단계 올려요. 20분을 못 채운 날도 탄 만큼 칸을 채워요.',
  },
};
const w20v = () => (W20[state.w20v] ? state.w20v : 'v1');

/* 식후 스쿼트: 한 칸 10회, 목표만큼 칸 (처음 50회 = 5칸, 익숙해지면 10회씩 늘려 100회까지) */
const SQ_STEP = 10;
const sqGoal = () => Math.min(100, Math.max(SQ_STEP, Math.round((state.sqGoal || 50) / SQ_STEP) * SQ_STEP));
const sqCells = () => sqGoal() / SQ_STEP;
/* 쉬는 날 운동 / 그 밖의 운동 줄: 적은 마지막 줄 다음에 빈 줄 하나 (2줄부터 8줄까지) */
const XROWS_MIN = 2;
const XROWS_MAX = 8;
const xRowsOf = (c, n) => Array.from({ length: n || Math.min(XROWS_MAX, Math.max(XROWS_MIN, (c.rows || []).length)) },
  (_, i) => ({ s: '', e: '', t: '', ...((c.rows || [])[i] || {}) }));
function xRowsShown(c) {
  const rows = xRowsOf(c);
  const last = rows.reduce((a, r, i) => (r.s || r.e || r.t ? i : a), -1);
  return xRowsOf(c, Math.min(XROWS_MAX, Math.max(XROWS_MIN, last + 2)));
}
const xRowsDone = (rows) => (rows || []).filter((r) => (r.t || '').trim() || rowMin(r)).map((r) => ({ s: r.s || '', e: r.e || '', t: (r.t || '').trim() }));
let xOpen = null; // 출근일 '그 밖의 운동' 펼침 (null = 적은 게 있으면 펼침)

const fmtSec = (s) => (s < 60 ? `${s}초` : `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ''}`);
const exAmount = (ex, v) => (ex.sec ? fmtSec(v) : `${v}회`);
const exMax = (ex) => (ex.sets ? ex.sets * ex.reps : ex.steps * ex.step);
const exCells = (ex) => (ex.sets ? ex.sets * ex.reps : ex.steps);
const woChecks = () => (state.workout && state.workout.c) || {};
const rtOf = (c) => c.rt || {};
let w20Open = false;

/* 체크한 양: 등·어깨는 횟수, 플랭크는 초, 사이드 플랭크는 횟수 */
function exCount(ex, c) {
  const v = c[ex.id];
  if (ex.sets) return (Array.isArray(v) ? v : []).reduce((a, n) => a + (n || 0), 0);
  return (v || 0) * ex.step;
}
function cellsOn(ex, c) { return ex.sets ? exCount(ex, c) : c[ex.id] || 0; }
const hasChecks = (c) => EXERCISES.some((ex) => cellsOn(ex, c)) || ROUTINE.some((r) => rtOf(c)[r.id]) || Object.values(W20).some((w) => c[w.key])
  || (c.sq || 0) > 0 || (c.rows || []).some((r) => r.s || r.e || (r.t || '').trim());

/* 지금 체크 상태 → 기록 */
function woSnapshot(c) {
  const rec = {};
  for (const ex of EXERCISES) rec[ex.id] = exCount(ex, c);
  rec.full = EXERCISES.every((ex) => rec[ex.id] >= exMax(ex)) ? 1 : 0;
  for (const r of ROUTINE) rec[r.id] = rtOf(c)[r.id] ? 1 : 0;
  // 20분 운동 버전: 진행 칸을 채운 버전 (지금 열어 둔 버전에 진행이 없으면 진행이 있는 쪽)
  const done20 = Object.keys(W20).filter((id) => c[W20[id].key]);
  rec.w20v = rec.ex20 ? (done20.length && !done20.includes(w20v()) ? done20[0] : w20v()) : '';
  rec.rounds = c.rounds || 0;
  rec.period = c.period || 0;
  rec.bike = (c.bike || 0) * W20.bike.unit;
  rec.routine = ROUTINE.every((r) => rec[r.id]) ? 1 : 0;
  rec.sq = Math.min(c.sq || 0, sqCells()) * SQ_STEP;
  rec.rows = xRowsDone(c.rows);
  rec.xmin = rec.rows.reduce((a, r) => a + rowMin(r), 0);
  return rec;
}
const emptyVal = (v) => !v || (Array.isArray(v) && !v.length);
const sameRecord = (a, b) => !!a && !!b && Object.keys(a).every((k) => k === 'at'
  || (emptyVal(a[k]) && emptyVal(b[k])) || JSON.stringify(a[k]) === JSON.stringify(b[k]));

/* 기록 날짜와 '지난 날 체크가 남아 있음' */
const woTouched = () => state.workout.touched || state.workout.date;
const woStale = () => hasChecks(woChecks()) && !!woTouched() && woTouched() !== today;
function woRecDate() {
  if (woStale()) return state.workout.date || woTouched();
  return state.workout.touched === today && state.workout.date ? state.workout.date : today;
}

/* 남겨 둔 기록 → 체크 칸 (지난 날 기록을 불러와 고칠 때) */
function recordToChecks(rec) {
  const c = { rt: {} };
  for (const ex of EXERCISES) {
    let n = rec[ex.id] || 0;
    if (ex.sets) c[ex.id] = Array.from({ length: ex.sets }, () => { const v = Math.min(ex.reps, n); n -= v; return v; });
    else c[ex.id] = Math.round(n / ex.step);
  }
  for (const r of ROUTINE) if (rec[r.id]) c.rt[r.id] = 1;
  c.rounds = rec.rounds || 0;
  c.period = rec.period || 0;
  c.bike = Math.round((rec.bike || 0) / W20.bike.unit);
  c.sq = Math.round((rec.sq || 0) / SQ_STEP);
  c.rows = (rec.rows || []).map((r) => ({ ...r }));
  return c;
}

function renderWorkout() {
  const c = woChecks();
  const k = woRecDate();
  const rec = state.workouts[k];
  const on = EXERCISES.reduce((a, ex) => a + cellsOn(ex, c), 0);
  const all = EXERCISES.reduce((a, ex) => a + exCells(ex), 0);
  const weekday = dayMode(k) === 'weekday';
  const stale = woStale();
  // 머리에는 기록 날짜 (지난 날을 고쳐 쓰는 중이면 그 날)
  $('wo-date').textContent = `${mdw(k)}${k === today ? '' : ' 기록'}`;
  for (const b of $('wo-mode').children) b.setAttribute('aria-checked', String(b.dataset.mode === dayMode(k)));
  $('wo-total').textContent = `스트레칭 ${on} / ${all}칸`;
  $('view-workout').classList.toggle('locked', stale);
  $('wo-recdate').innerHTML = stale ? '' : recDateRow(k);
  const recText = (r) => [
    r.ex20 ? `20분 운동${r.w20v && r.w20v !== 'v1' ? `(${W20[r.w20v].label})` : ''} ✓` : '',
    r.routine ? '8:30 루틴 ✓' : '',
    r.rows && r.rows.length ? `적은 운동 ${r.rows.length}개${r.xmin ? ` ${fmtMin(r.xmin)}` : ''}` : '',
    r.sq ? `스쿼트 ${r.sq}회` : '',
    ...EXERCISES.filter((ex) => r[ex.id]).map((ex) => `${ex.name} ${exAmount(ex, r[ex.id])}`),
  ].filter(Boolean).join(' · ');
  // 지난 날 체크가 남아 있으면: 그 날로 기록 / 지우기 / 오늘 것으로 이어서 중에 고르기
  $('wo-status').innerHTML = stale ? `<div class="wo-banner stale">
      <b>${md(k)}에 체크한 내용이 남아 있어요</b>
      <span>${sameRecord(woSnapshot(c), rec) ? '이미 그 날 기록과 같아요.' : '아직 그 날 기록으로 남기지 않았어요.'} 어떻게 할까요?</span>
      <div class="stale-acts">
        <button class="wo-btn primary" data-stale="save">${ml(k)}로 기록하고 새로 시작</button>
        <button class="wo-btn" data-stale="clear">기록하지 않고 지우기</button>
        <button class="wo-btn" data-stale="continue">오늘 것으로 이어서</button>
      </div>
    </div>`
    : rec ? `<div class="wo-banner done"><b>${k === today ? '오늘' : md(k)} 운동을 기록했어요</b><span>${recText(rec)}</span></div>` : '';

  // 출근일: 8:30–9:30 루틴 + 20분 운동 + 식후 스쿼트 + 그 밖의 운동 / 쉬는 날: 쉬는 날 운동 + 식후 스쿼트
  const rt = rtOf(c);
  const ro = stale ? ' readonly' : '';
  $('wo-routine').innerHTML = !weekday ? `${xRowsCard(c, false, ro)}${sqCard(c, false)}<h2 class="sub-head wo-sub">스트레칭</h2>` : `
    <section class="wo-card rt-card">
      <div class="wo-head"><span class="wo-name">8:30–9:30 루틴</span><span class="wo-target">출근일</span>
        <span class="wo-amt">${ROUTINE.filter((r) => rt[r.id]).length} / ${ROUTINE.length}</span></div>
      <ul class="rt-list">${ROUTINE.map((r) => `
        <li><button class="rt-item${rt[r.id] ? ' on' : ''}" data-rt="${r.id}" aria-pressed="${!!rt[r.id]}">
          <span class="check">${CHECK_SVG}</span>
          <span class="rt-text"><span class="rt-label">${r.label}</span>${r.sub ? `<span class="rt-sub">${r.sub}</span>` : ''}</span>
        </button></li>`).join('')}
      </ul>
    </section>
    ${w20Card(c)}
    ${sqCard(c, true)}
    ${xRowsCard(c, true, ro)}
    <h2 class="sub-head wo-sub">스트레칭</h2>`;
  growAll($('wo-routine'));

  $('wo-list').innerHTML = EXERCISES.map((ex) => {
    const amt = exCount(ex, c);
    const full = amt >= exMax(ex);
    const target = ex.sets ? `${ex.reps}회 × ${ex.sets}세트` : ex.sec ? '한 칸 30초' : '한 칸 10회';
    let rows;
    if (ex.sets) {
      const v = Array.isArray(c[ex.id]) ? c[ex.id] : [];
      rows = Array.from({ length: ex.sets }, (_, s) => `<div class="wo-row">
        <span class="wo-set">${s + 1}세트</span>
        <div class="wo-cells" style="--n:${ex.reps}" data-ex="${ex.id}" data-set="${s}">${cellsHtml(ex.reps, v[s] || 0, (i) => i, (i) => `${ex.name} ${s + 1}세트 ${i}회`)}</div>
      </div>`).join('');
    } else {
      const label = (i) => (ex.sec ? fmtSec(i * ex.step).replace(' ', '') : `${i * ex.step}`);
      rows = `<div class="wo-row"><div class="wo-cells wide" style="--n:${ex.steps}" data-ex="${ex.id}">${cellsHtml(ex.steps, c[ex.id] || 0, label, (i) => `${ex.name} ${exAmount(ex, i * ex.step)}`)}</div></div>`;
    }
    return `<section class="wo-card${full ? ' full' : ''}">
      <div class="wo-head"><span class="wo-name">${ex.name}</span><span class="wo-target">${target}</span>
        <span class="wo-amt">${amt ? exAmount(ex, amt) : ''}${full ? ' ✓' : ''}</span></div>
      ${rows}
    </section>`;
  }).join('');

  $('wo-done').textContent = k === today ? (rec ? '완료 기록 고치기' : '오늘 운동 완료') : `${ml(k)} ${rec ? '기록 고치기' : '운동 완료'}`;
}

/* 20분 운동: 버전 고르기 + 그 버전의 목록(접기) + 진행 칸 */
function w20Card(c) {
  const v = w20v();
  const W = W20[v];
  const n = c[W.key] || 0;
  return `<section class="wo-card w20">
    <div class="mini-seg w20-ver" role="radiogroup" aria-label="20분 운동 버전">${Object.entries(W20).map(([id, w]) => `
      <button role="radio" data-w20="${id}" aria-checked="${id === v}">${w.label}${c[w.key] ? ' •' : ''}</button>`).join('')}
    </div>
    <button class="w20-head" aria-expanded="${w20Open}">
      <span class="wo-name">20분 운동</span><span class="wo-target">${W.target}</span>
      <span class="wo-amt">${n ? W.cell(n) : ''}${n >= W.cells ? ' ✓' : ''}</span>
      <svg class="cond-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    ${w20Open ? `<div class="w20-body">${W.parts.map((p) => `
      <p class="w20-part">${p.part}</p>
      <${p.ol ? 'ol' : 'ul'} class="w20-items">${p.items.map((t) => `<li>${t}</li>`).join('')}</${p.ol ? 'ol' : 'ul'}>`).join('')}
      <p class="w20-tip">${W.tip}</p>
    </div>` : ''}
    <div class="wo-row"><span class="wo-set">${W.row}</span>
      <div class="wo-cells wide" style="--n:${W.cells}" data-ex="w20" data-key="${W.key}">${cellsHtml(W.cells, n, W.cell, (i) => `${W.label} ${W.cell(i)}`)}</div>
    </div>
  </section>`;
}

/* 식후 스쿼트: 한 칸 10회, 목표는 −/+로 10회씩 */
function sqCard(c, weekday) {
  const n = sqCells();
  const filled = Math.min(c.sq || 0, n);
  const full = filled >= n;
  return `<section class="wo-card sq-card${full ? ' full' : ''}">
    <div class="wo-head"><span class="wo-name">식후 스쿼트</span><span class="wo-target">${weekday ? '점심 먹고' : '식사 후'} · 한 칸 10회</span>
      <span class="wo-amt">${filled ? `${filled * SQ_STEP}회` : ''}${full ? ' ✓' : ''}</span></div>
    <div class="wo-row"><div class="wo-cells wide" style="--n:${n}" data-ex="sq">${cellsHtml(n, filled, (i) => i * SQ_STEP, (i) => `스쿼트 ${i * SQ_STEP}회`)}</div></div>
    <div class="sq-goal">하루 목표
      <span class="h-step" data-sqgoal><button type="button" data-d="-1" aria-label="목표 10회 줄이기">−</button><b>${sqGoal()}</b><button type="button" data-d="1" aria-label="목표 10회 늘리기">+</button></span>회
    </div>
  </section>`;
}

/* 쉬는 날 운동 / 그 밖의 운동 (출근일, 접힘): [시작 ~ 끝 + 내용] 줄 */
function xRowsCard(c, weekday, ro) {
  const rows = xRowsShown(c);
  const min = rows.reduce((a, r) => a + rowMin(r), 0);
  const has = rows.some((r) => r.s || r.e || r.t);
  const open = !weekday || (xOpen === null ? has : xOpen);
  const ph = (i) => (i ? '운동 내용' : weekday ? '운동 내용 (예: 퇴근 후 걷기)' : '운동 내용 (예: 점심 먹고 걷기)');
  const head = `<span class="wo-name">${weekday ? '그 밖의 운동' : '쉬는 날 운동'}</span>
    <span class="wo-target">${weekday ? '퇴근 후 걷기 등' : '시간 고르고 내용 적기'}</span>
    <span class="wo-amt" id="x-total">${min ? fmtMin(min) : ''}</span>`;
  return `<section class="wo-card x-card">
    ${weekday ? `<button class="x-head" aria-expanded="${open}">${head}<svg class="cond-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>`
    : `<div class="wo-head">${head}</div>`}
    ${open ? `<div class="x-rows" id="x-rows">${rows.map((r, i) => timeRowHtml(r, i, ro, ph(i))).join('')}</div>` : ''}
  </section>`;
}

function cellsHtml(n, filled, label, aria) {
  let h = '';
  for (let i = 1; i <= n; i++) {
    h += `<button class="wo-cell${i <= filled ? ' on' : ''}" data-i="${i}" aria-pressed="${i <= filled}" aria-label="${aria(i)}">${label(i)}</button>`;
  }
  return h;
}

function setWorkout(c) {
  if (woStale()) return;
  state.workout = { date: woRecDate(), touched: today, c };
  save();
  if (navigator.vibrate) navigator.vibrate(5);
  renderWorkout();
}

/* 칸을 누르면 그 칸까지 채운다. 마지막으로 채운 칸을 다시 누르면 한 칸 뺀다 */
function onCell(e) {
  const b = e.target.closest('.wo-cell');
  if (!b || woStale()) return;
  const box = b.parentElement;
  const i = +b.dataset.i;
  const c = { ...woChecks() };
  if (box.dataset.ex === 'sq') {
    const cur = Math.min(c.sq || 0, sqCells());
    c.sq = cur === i ? i - 1 : i;
    setWorkout(c);
    return;
  }
  if (box.dataset.ex === 'w20') {
    const key = box.dataset.key;
    const W = Object.values(W20).find((w) => w.key === key);
    c[key] = (c[key] || 0) === i ? i - 1 : i;
    // 진행 칸을 다 채우면 '20분 운동'도 체크
    if (c[key] >= W.cells) c.rt = { ...rtOf(c), ex20: 1 };
    setWorkout(c);
    return;
  }
  const ex = EXERCISES.find((x) => x.id === box.dataset.ex);
  if (ex.sets) {
    const sets = Array.from({ length: ex.sets }, (_, s) => (Array.isArray(c[ex.id]) && c[ex.id][s]) || 0);
    const s = +box.dataset.set;
    sets[s] = sets[s] === i ? i - 1 : i;
    c[ex.id] = sets;
  } else {
    const cur = c[ex.id] || 0;
    c[ex.id] = cur === i ? i - 1 : i;
  }
  setWorkout(c);
}
$('wo-list').addEventListener('click', onCell);
/* 출근일 · 쉬는 날 (기록 날짜 기준): 연차·휴무인 날 바로 바꾸기 */
$('wo-mode').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  setDayMode(woRecDate(), b.dataset.mode);
  renderWorkout();
});
$('wo-routine').addEventListener('click', (e) => {
  if (e.target.closest('.w20-head')) { w20Open = !w20Open; renderWorkout(); return; }
  if (e.target.closest('.x-head')) { xOpen = e.target.closest('.x-head').getAttribute('aria-expanded') !== 'true'; renderWorkout(); return; }
  const g = e.target.closest('[data-sqgoal] [data-d]');
  if (g) {
    state.sqGoal = Math.min(100, Math.max(SQ_STEP, sqGoal() + +g.dataset.d * SQ_STEP));
    save();
    renderWorkout();
    return;
  }
  const ver = e.target.closest('[data-w20]');
  if (ver) { state.w20v = ver.dataset.w20; save(); renderWorkout(); return; }
  const item = e.target.closest('[data-rt]');
  if (item && !woStale()) {
    const c = { ...woChecks() };
    const rt = { ...rtOf(c) };
    if (rt[item.dataset.rt]) delete rt[item.dataset.rt]; else rt[item.dataset.rt] = 1;
    c.rt = rt;
    setWorkout(c);
    return;
  }
  onCell(e);
});

/* 쉬는 날 운동·그 밖의 운동 줄: 글자를 칠 때마다 저장 (다시 그리지 않아 입력이 끊기지 않게) */
$('wo-routine').addEventListener('input', (e) => {
  const f = e.target.dataset.f;
  const row = e.target.closest('.st-row');
  const box = $('x-rows');
  if (!f || !row || !box || woStale()) return;
  const n = box.children.length;
  const c = { ...woChecks() };
  const rows = xRowsOf(c, n);
  const i = +row.dataset.i;
  rows[i][f] = e.target.value;
  c.rows = rows;
  state.workout = { date: woRecDate(), touched: today, c };
  saveSoon();
  row.classList.toggle('bad', rowBad(rows[i]));
  const m = rows.reduce((a, r) => a + rowMin(r), 0);
  $('x-total').textContent = m ? fmtMin(m) : '';
  // 마지막 줄을 쓰기 시작하면 빈 줄을 하나 더
  if (i === n - 1 && n < XROWS_MAX && (rows[i].s || rows[i].e || rows[i].t)) box.insertAdjacentHTML('beforeend', timeRowHtml({}, n, '', '운동 내용'));
});

/* 기록은 체크한 날짜로 남긴다 (어제 체크를 오늘 완료해도 어제 기록) */
function recordWorkout(silent) {
  const c = woChecks();
  const k = woRecDate();
  const rec = { ...woSnapshot(c), at: Date.now() };
  const had = !!state.workouts[k];
  const msg = k !== today ? `${md(k)} 운동으로 기록했어요` : had ? '오늘 운동 기록을 고쳤어요' : '오늘 운동을 기록했어요 · 리포트에 반영돼요';
  if (silent) { state.workouts[k] = rec; return msg; }
  undoable(msg, () => { state.workouts[k] = rec; });
  return msg;
}

$('wo-done').addEventListener('click', async () => {
  const c = woChecks();
  if (!hasChecks(c)) { toast('체크한 운동이 없어요'); return; }
  const k = woRecDate();
  // 지난 날 기록을 다른 내용으로 덮어쓸 때는 한 번 더 묻는다
  if (k !== today && state.workouts[k] && !sameRecord(woSnapshot(c), state.workouts[k])) {
    const ok = await choose(`${md(k)} 운동 기록이 이미 있어요. 지금 체크한 내용으로 바꿀까요?`, [{ label: '지금 내용으로 바꾸기', value: 'yes' }]);
    if (ok !== 'yes') return;
  }
  recordWorkout(false);
});

/* 지난 날 체크가 남아 있을 때 고르는 세 가지 */
$('wo-status').addEventListener('click', (e) => {
  const b = e.target.closest('[data-stale]');
  if (!b) return;
  const k = woRecDate();
  const fresh = { date: today, touched: today, c: {} };
  if (b.dataset.stale === 'save') {
    undoable(`${md(k)} 운동으로 기록하고 새로 시작해요`, () => { recordWorkout(true); state.workout = fresh; });
  } else if (b.dataset.stale === 'clear') {
    undoable('남아 있던 체크를 지웠어요', () => { state.workout = fresh; });
  } else {
    state.workout = { ...state.workout, date: today, touched: today };
    save();
    renderWorkout();
  }
});

/* 기록 날짜 바꾸기: 지금 칸이 그 날 기록과 같으면(=고친 게 없으면) 새 날짜의 기록을 불러오고,
 * 아직 기록하지 않은 체크가 있으면 그 체크를 새 날짜로 옮긴다 */
bindRecDate($('wo-recdate'), (nk) => {
  const c = woChecks();
  const cur = woRecDate();
  const clean = !hasChecks(c) || sameRecord(woSnapshot(c), state.workouts[cur]);
  let next = c;
  if (clean) {
    const r = state.workouts[nk];
    next = r ? recordToChecks(r) : {};
    if (r && W20[r.w20v]) state.w20v = r.w20v;
  }
  state.workout = { date: nk, touched: today, c: next };
  save();
  renderWorkout();
  if (!clean) toast(`체크한 내용을 ${nk === today ? '오늘' : md(nk)} 기록으로 옮겼어요`);
  else if (nk !== today) toast(state.workouts[nk] ? `${md(nk)} 기록을 불러왔어요` : `${md(nk)} 기록을 새로 써요`);
});

/* 지우기 전에: 아직 기록하지 않은(또는 기록과 다른) 체크가 있으면 물어본다 */
$('wo-reset').addEventListener('click', async () => {
  const c = woChecks();
  if (!hasChecks(c)) { toast('지울 체크가 없어요'); return; }
  const k = woRecDate();
  let how = 'clear';
  if (!sameRecord(woSnapshot(c), state.workouts[k])) {
    how = await choose(`${k === today ? '오늘' : md(k)} 체크한 내용을 아직 기록하지 않았어요.`, [
      { label: '기록하고 지우기', value: 'save' },
      { label: '기록하지 않고 지우기', value: 'clear', danger: true },
    ]);
    if (!how) return;
  }
  undoable(how === 'save' ? '기록하고 체크를 모두 해제했어요' : '체크를 모두 해제했어요', () => {
    if (how === 'save') recordWorkout(true);
    state.workout = { date: today, touched: today, c: {} };
  });
});
