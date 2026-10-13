'use strict';

/* ═════════════════ 운동 ═════════════════
 * state.workout  = { date, c: { back: [n, n, n], shoulder: [n, n, n], plank: n, side: n,
 *                               rt: { ex20, chores, shower }, rounds: n } }
 *   지금 체크해 둔 상태 (date = 마지막으로 체크한 날). '체크 전부 해제'로만 비운다.
 * state.workouts = { 'YYYY-MM-DD': { back, shoulder, plank, side, full, ex20, chores, shower, rounds, routine, at } }
 *   '오늘 운동 완료'로 남긴 그날 기록. 등·어깨·사이드 플랭크는 총 횟수, 플랭크는 총 초.
 *   routine = 8:30–9:30 루틴 세 가지를 모두 체크한 날. 캘린더·목록에는 쓰지 않고 리포트에만 쓴다. */

const EXERCISES = [
  { id: 'back', name: '등 운동', sets: 3, reps: 12 },
  { id: 'shoulder', name: '어깨 교정', sets: 3, reps: 12 },
  { id: 'plank', name: '플랭크', steps: 6, step: 30, sec: true },     // 한 칸 = 30초
  { id: 'side', name: '사이드 플랭크', steps: 6, step: 10 },          // 한 칸 = 10회
];

/* 평일 8:30–9:30 루틴 (쉬는 날에는 숨김) */
const ROUTINE = [
  { id: 'ex20', label: '20분 운동', sub: '아래 루틴 · 체크하면 운동한 날로 기록돼요' },
  { id: 'chores', label: '집안일' },
  { id: 'shower', label: '샤워', sub: '마지막 순서로 — 씻고 나와서 바로 9:30 공부' },
];
const ROUNDS = 3;
/* 평일 20분 맨몸 운동 (영상 없이). 본운동은 40초 운동 / 20초 휴식으로 5가지를 3바퀴 */
const WORKOUT20 = [
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
];

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
const hasChecks = (c) => EXERCISES.some((ex) => cellsOn(ex, c)) || ROUTINE.some((r) => rtOf(c)[r.id]) || !!c.rounds;

/* 지금 체크 상태 → 기록 */
function woSnapshot(c) {
  const rec = {};
  for (const ex of EXERCISES) rec[ex.id] = exCount(ex, c);
  rec.full = EXERCISES.every((ex) => rec[ex.id] >= exMax(ex)) ? 1 : 0;
  for (const r of ROUTINE) rec[r.id] = rtOf(c)[r.id] ? 1 : 0;
  rec.rounds = c.rounds || 0;
  rec.routine = ROUTINE.every((r) => rec[r.id]) ? 1 : 0;
  return rec;
}
const sameRecord = (a, b) => !!a && !!b && Object.keys(a).every((k) => k === 'at' || a[k] === b[k]);

function renderWorkout() {
  const c = woChecks();
  const rec = state.workouts[today];
  const on = EXERCISES.reduce((a, ex) => a + cellsOn(ex, c), 0);
  const all = EXERCISES.reduce((a, ex) => a + exCells(ex), 0);
  const weekday = dayMode(today) === 'weekday';
  $('wo-date').textContent = `${mdw(today)}${weekday ? '' : ' · 쉬는 날'}`;
  $('wo-total').textContent = `스트레칭 ${on} / ${all}칸`;

  // 지난 날 체크가 남아 있을 때, 오늘 이미 완료했을 때
  const stale = hasChecks(c) && state.workout.date && state.workout.date !== today;
  const recText = (r) => [
    r.ex20 ? '20분 운동 ✓' : '',
    r.routine ? '8:30 루틴 ✓' : '',
    ...EXERCISES.filter((ex) => r[ex.id]).map((ex) => `${ex.name} ${exAmount(ex, r[ex.id])}`),
  ].filter(Boolean).join(' · ');
  $('wo-status').innerHTML = [
    rec ? `<div class="wo-banner done"><b>오늘 운동을 기록했어요</b><span>${recText(rec)}</span></div>` : '',
    stale ? `<div class="wo-banner"><span>${md(state.workout.date)}에 체크한 내용이 남아 있어요. 새로 시작하려면 아래 <b>체크 전부 해제</b>를 눌러 주세요.</span></div>` : '',
  ].join('');

  // 평일 8:30–9:30 루틴 + 20분 운동
  const rt = rtOf(c);
  $('wo-routine').innerHTML = weekday ? `
    <section class="wo-card rt-card">
      <div class="wo-head"><span class="wo-name">8:30–9:30 루틴</span><span class="wo-target">평일</span>
        <span class="wo-amt">${ROUTINE.filter((r) => rt[r.id]).length} / ${ROUTINE.length}</span></div>
      <ul class="rt-list">${ROUTINE.map((r) => `
        <li><button class="rt-item${rt[r.id] ? ' on' : ''}" data-rt="${r.id}" aria-pressed="${!!rt[r.id]}">
          <span class="check">${CHECK_SVG}</span>
          <span class="rt-text"><span class="rt-label">${r.label}</span>${r.sub ? `<span class="rt-sub">${r.sub}</span>` : ''}</span>
        </button></li>`).join('')}
      </ul>
    </section>
    <section class="wo-card w20">
      <button class="w20-head" aria-expanded="${w20Open}">
        <span class="wo-name">20분 운동</span><span class="wo-target">영상 없이 · 맨몸</span>
        <span class="wo-amt">${c.rounds ? `${c.rounds}바퀴` : ''}${c.rounds >= ROUNDS ? ' ✓' : ''}</span>
        <svg class="cond-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      ${w20Open ? `<div class="w20-body">${WORKOUT20.map((p) => `
        <p class="w20-part">${p.part}</p>
        <${p.ol ? 'ol' : 'ul'} class="w20-items">${p.items.map((t) => `<li>${t}</li>`).join('')}</${p.ol ? 'ol' : 'ul'}>`).join('')}
        <p class="w20-tip">두 바퀴째 끝날 무렵 짧은 말은 나오지만 문장으로 말하기 힘들면 강도가 맞아요. 쉬워지면 45초 / 15초로.</p>
      </div>` : ''}
      <div class="wo-row"><span class="wo-set">본운동</span>
        <div class="wo-cells wide" style="--n:${ROUNDS}" data-ex="rounds">${cellsHtml(ROUNDS, c.rounds || 0, (i) => `${i}바퀴`, (i) => `본운동 ${i}바퀴`)}</div>
      </div>
    </section>
    <h2 class="sub-head wo-sub">스트레칭</h2>` : '';

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

  $('wo-done').textContent = rec ? '완료 기록 고치기' : '오늘 운동 완료';
}

function cellsHtml(n, filled, label, aria) {
  let h = '';
  for (let i = 1; i <= n; i++) {
    h += `<button class="wo-cell${i <= filled ? ' on' : ''}" data-i="${i}" aria-pressed="${i <= filled}" aria-label="${aria(i)}">${label(i)}</button>`;
  }
  return h;
}

function setWorkout(c) {
  state.workout = { date: today, c };
  save();
  if (navigator.vibrate) navigator.vibrate(5);
  renderWorkout();
}

/* 칸을 누르면 그 칸까지 채운다. 마지막으로 채운 칸을 다시 누르면 한 칸 뺀다 */
function onCell(e) {
  const b = e.target.closest('.wo-cell');
  if (!b) return;
  const box = b.parentElement;
  const i = +b.dataset.i;
  const c = { ...woChecks() };
  if (box.dataset.ex === 'rounds') {
    c.rounds = (c.rounds || 0) === i ? i - 1 : i;
    // 3바퀴를 다 채우면 '20분 운동'도 체크
    if (c.rounds >= ROUNDS) c.rt = { ...rtOf(c), ex20: 1 };
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
$('wo-routine').addEventListener('click', (e) => {
  if (e.target.closest('.w20-head')) { w20Open = !w20Open; renderWorkout(); return; }
  const item = e.target.closest('[data-rt]');
  if (item) {
    const c = { ...woChecks() };
    const rt = { ...rtOf(c) };
    if (rt[item.dataset.rt]) delete rt[item.dataset.rt]; else rt[item.dataset.rt] = 1;
    c.rt = rt;
    setWorkout(c);
    return;
  }
  onCell(e);
});

/* 기록은 체크한 날짜로 남긴다 (어제 체크를 오늘 완료해도 어제 기록) */
function recordWorkout(silent) {
  const c = woChecks();
  const k = state.workout.date || today;
  const rec = { ...woSnapshot(c), at: Date.now() };
  const had = !!state.workouts[k];
  const msg = k !== today ? `${md(k)} 운동으로 기록했어요` : had ? '오늘 운동 기록을 고쳤어요' : '오늘 운동을 기록했어요 · 리포트에 반영돼요';
  if (silent) { state.workouts[k] = rec; return msg; }
  undoable(msg, () => { state.workouts[k] = rec; });
  return msg;
}

$('wo-done').addEventListener('click', () => {
  if (!hasChecks(woChecks())) { toast('체크한 운동이 없어요'); return; }
  recordWorkout(false);
});

/* 지우기 전에: 아직 기록하지 않은(또는 기록과 다른) 체크가 있으면 물어본다 */
$('wo-reset').addEventListener('click', async () => {
  const c = woChecks();
  if (!hasChecks(c)) { toast('지울 체크가 없어요'); return; }
  const k = state.workout.date || today;
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
    state.workout = { date: today, c: {} };
  });
});
