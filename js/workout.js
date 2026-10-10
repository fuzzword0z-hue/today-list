'use strict';

/* ═════════════════ 운동 ═════════════════
 * state.workout  = { date, c: { back: [n, n, n], shoulder: [n, n, n], plank: n, side: n } }
 *   지금 체크해 둔 상태 (date = 마지막으로 체크한 날). '체크 전부 해제'로만 비운다.
 * state.workouts = { 'YYYY-MM-DD': { back, shoulder, plank, side, full, at } }
 *   '오늘 운동 완료'로 남긴 그날 기록. 등·어깨·사이드 플랭크는 총 횟수, 플랭크는 총 초.
 *   캘린더·목록에는 쓰지 않고 월간·연간 리포트에만 쓴다. */

const EXERCISES = [
  { id: 'back', name: '등 운동', sets: 3, reps: 12 },
  { id: 'shoulder', name: '어깨 교정', sets: 3, reps: 12 },
  { id: 'plank', name: '플랭크', steps: 6, step: 30, sec: true },     // 한 칸 = 30초
  { id: 'side', name: '사이드 플랭크', steps: 6, step: 10 },          // 한 칸 = 10회
];

const fmtSec = (s) => (s < 60 ? `${s}초` : `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ''}`);
const exAmount = (ex, v) => (ex.sec ? fmtSec(v) : `${v}회`);
const exMax = (ex) => (ex.sets ? ex.sets * ex.reps : ex.steps * ex.step);
const exCells = (ex) => (ex.sets ? ex.sets * ex.reps : ex.steps);
const woChecks = () => (state.workout && state.workout.c) || {};

/* 체크한 양: 등·어깨는 횟수, 플랭크는 초, 사이드 플랭크는 횟수 */
function exCount(ex, c) {
  const v = c[ex.id];
  if (ex.sets) return (Array.isArray(v) ? v : []).reduce((a, n) => a + (n || 0), 0);
  return (v || 0) * ex.step;
}
function cellsOn(ex, c) { return ex.sets ? exCount(ex, c) : c[ex.id] || 0; }

function renderWorkout() {
  const c = woChecks();
  const rec = state.workouts[today];
  const on = EXERCISES.reduce((a, ex) => a + cellsOn(ex, c), 0);
  const all = EXERCISES.reduce((a, ex) => a + exCells(ex), 0);
  $('wo-date').textContent = `${mdw(today)}`;
  $('wo-total').textContent = `${on} / ${all}칸`;

  // 지난 날 체크가 남아 있을 때, 오늘 이미 완료했을 때
  const stale = on && state.workout.date && state.workout.date !== today;
  $('wo-status').innerHTML = [
    rec ? `<div class="wo-banner done"><b>오늘 운동을 기록했어요</b><span>${EXERCISES.map((ex) => `${ex.name} ${exAmount(ex, rec[ex.id] || 0)}`).join(' · ')}</span></div>` : '',
    stale ? `<div class="wo-banner"><span>${md(state.workout.date)}에 체크한 내용이 남아 있어요. 새로 시작하려면 아래 <b>체크 전부 해제</b>를 눌러 주세요.</span></div>` : '',
  ].join('');

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

/* 칸을 누르면 그 칸까지 채운다. 마지막으로 채운 칸을 다시 누르면 한 칸 뺀다 */
$('wo-list').addEventListener('click', (e) => {
  const b = e.target.closest('.wo-cell');
  if (!b) return;
  const box = b.parentElement;
  const ex = EXERCISES.find((x) => x.id === box.dataset.ex);
  const i = +b.dataset.i;
  const c = { ...woChecks() };
  if (ex.sets) {
    const sets = Array.from({ length: ex.sets }, (_, s) => (Array.isArray(c[ex.id]) && c[ex.id][s]) || 0);
    const s = +box.dataset.set;
    sets[s] = sets[s] === i ? i - 1 : i;
    c[ex.id] = sets;
  } else {
    const cur = c[ex.id] || 0;
    c[ex.id] = cur === i ? i - 1 : i;
  }
  state.workout = { date: today, c };
  save();
  if (navigator.vibrate) navigator.vibrate(5);
  renderWorkout();
});

$('wo-reset').addEventListener('click', () => {
  if (!EXERCISES.some((ex) => cellsOn(ex, woChecks()))) { toast('지울 체크가 없어요'); return; }
  undoable('체크를 모두 해제했어요', () => { state.workout = { date: today, c: {} }; });
});

$('wo-done').addEventListener('click', () => {
  const c = woChecks();
  if (!EXERCISES.some((ex) => cellsOn(ex, c))) { toast('체크한 운동이 없어요'); return; }
  const had = !!state.workouts[today];
  const rec = { at: Date.now() };
  for (const ex of EXERCISES) rec[ex.id] = exCount(ex, c);
  rec.full = EXERCISES.every((ex) => rec[ex.id] >= exMax(ex)) ? 1 : 0;
  undoable(had ? '오늘 운동 기록을 고쳤어요' : '오늘 운동을 기록했어요 · 리포트에 반영돼요', () => { state.workouts[today] = rec; });
});
