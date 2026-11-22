'use strict';

/* ═════════════════ 명상 1분 (일어나서 · 자기 전, 침대에서) ═════════════════
 * 습관은 이미 하는 일에 붙이고 아주 작게 시작할 때 자리 잡는다 (7-21) — 하루 두 번, 1분씩, 침대에서:
 *   일어나서(am) 누운 채로 · 자기 전(pm) 불을 끄고. 오늘 한 것의 '명상' 아래 두 버튼으로 시작한다.
 * 타이머: 원이 4초 동안 커졌다가 6초 동안 작아진다 (들이쉬기 4 · 내쉬기 6 — 내쉬는 숨을 길게 하면 몸이 가라앉는다).
 *   1분이 지나면 진동이 살짝 울리고 기록된다. 15초 넘게 했으면 중간에 그만둬도 '했어요' (짧게 해도 한 것).
 *   하는 동안 화면이 꺼지지 않게 하고 (Wake Lock), 밤에도 눈부시지 않게 늘 어두운 화면이다.
 * 알림은 보내지 않는다 (웹앱은 정해진 시각 알림이 불안정 — 휴대폰 알람을 쓴다). 대신 아침(4–12시) · 밤(20시–새벽 4시)에는
 *   오늘 화면의 그 버튼을 눈에 띄게 한다. 빠진 날 · 빠진 때는 세지 않는다.
 * state.medi  = { 'YYYY-MM-DD': ['am' | 'pm'] }   그 날 한 때 (하루는 새벽 4시에 바뀌므로 자정 넘어 자기 전도 그 날)
 * state.medId = '오늘 한 것'의 명상 항목 id (core.js normalize가 한 번 더한다). 명상을 하면 그 날 '명상'도 체크된다 */

const MED_SEC = 60;
const MED_MIN_SEC = 15; // 이보다 길게 했으면 중간에 그만둬도 기록
const MED_BREATH = [4000, 6000]; // 들이쉬기 · 내쉬기 (CSS med-breath와 같게)
const MED_SLOTS = {
  am: { label: '일어나서', icon: '☀', tip: '누운 채로, 눈을 떠도 괜찮아요. 숨이 들어오고 나가는 것만 느껴 봐요.' },
  pm: { label: '자기 전', icon: '☾', tip: "불을 끄고 누워서. 생각이 떠오르면 '생각' 하고 숨으로 돌아와요. 잠들어도 괜찮아요." },
};
const medOf = (k) => (Array.isArray(state.medi[k]) ? state.medi[k] : []);
const medItem = () => state.didItems.find((x) => x.id === state.medId && !x.off);
/* 지금 시간대: 아침 4–12시 → am, 밤 20시–새벽 4시 → pm */
function medNow() {
  const h = new Date().getHours();
  return h >= DAY_START_HOUR && h < 12 ? 'am' : h >= 20 || h < DAY_START_HOUR ? 'pm' : '';
}
/* from–to 사이 아침 · 밤 횟수 (리포트) */
function medCounts(from, to) {
  const c = { am: 0, pm: 0 };
  for (const k in state.medi) if (k >= from && k <= to) for (const s of medOf(k)) if (c[s] !== undefined) c[s]++;
  return c;
}

/* 오늘 한 것 카드 안의 한 줄: [☀ 일어나서] [☾ 자기 전] — 오늘은 누르면 타이머, 지난 날은 누르면 했어요/지우기 */
function medRow(k) {
  const it = medItem();
  if (!it) return '';
  const done = medOf(k);
  const now = k === today ? medNow() : '';
  return `<div class="med-row"><span class="med-label">${esc(it.label)} 1분</span>
    ${['am', 'pm'].map((s) => `<button type="button" class="med-btn${now === s && !done.includes(s) ? ' now' : ''}" data-med="${s}" aria-pressed="${done.includes(s)}">
      <span aria-hidden="true">${MED_SLOTS[s].icon}</span> ${MED_SLOTS[s].label}${done.includes(s) ? ' ✓' : k === today ? ' ▶' : ''}</button>`).join('')}</div>`;
}

/* 한 때 기록하기 · 지우기: 하면 그 날 '명상'도 체크, 두 때가 다 비면 명상 체크도 지운다 */
function markMed(k, slot, on = true) {
  const nx = on ? [...new Set([...medOf(k), slot])] : medOf(k).filter((x) => x !== slot);
  if (nx.length) state.medi[k] = nx; else delete state.medi[k];
  const it = medItem();
  if (it) {
    const sel = didOf(k).filter((x) => x !== it.id);
    const dd = nx.length ? [...sel, it.id] : sel;
    if (dd.length) state.did[k] = dd; else delete state.did[k];
  }
  save();
}

/* ───────── 타이머 ───────── */
let medCtx = null; // { k, slot, t0, dur, done, timer, lock }

async function medLock() {
  try { if (navigator.wakeLock && medCtx) medCtx.lock = await navigator.wakeLock.request('screen'); } catch (err) { /* 안 되면 그냥 진행 */ }
}

function openMed(slot) {
  const S = MED_SLOTS[slot];
  medCtx = { k: today, slot, t0: Date.now(), dur: MED_SEC, done: false, timer: null, lock: null };
  $('med-title').textContent = `${S.label} 1분`;
  $('med-tip').textContent = S.tip;
  $('med-done').hidden = true;
  const c = $('med-circle');
  c.classList.remove('run');
  void c.offsetWidth; // 애니메이션을 처음부터
  c.classList.add('run');
  $('med').hidden = false;
  medTick();
  medCtx.timer = setInterval(medTick, 250);
  medLock();
  $('med-close').focus();
}

function medTick() {
  const x = medCtx;
  if (!x) return;
  const ms = Date.now() - x.t0;
  const left = Math.max(0, Math.ceil(x.dur - ms / 1000));
  $('med-cue').textContent = ms % (MED_BREATH[0] + MED_BREATH[1]) < MED_BREATH[0] ? '들이쉬고' : '내쉬고';
  $('med-time').textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
  if (!x.done && ms >= x.dur * 1000) {
    x.done = true;
    markMed(x.k, x.slot);
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    $('med-done-text').textContent = `${Math.round(x.dur / 60)}분 했어요`;
    $('med-done').hidden = false;
  }
}

function closeMed() {
  const x = medCtx;
  if (!x) return;
  // 15초 넘게 했으면 중간에 그만둬도 했어요
  if (!x.done && Date.now() - x.t0 >= MED_MIN_SEC * 1000) { markMed(x.k, x.slot); toast('짧게 해도 한 거예요'); }
  clearInterval(x.timer);
  if (x.lock) x.lock.release().catch(() => {});
  medCtx = null;
  $('med').hidden = true;
  $('med-circle').classList.remove('run');
  render();
}

$('med-close').addEventListener('click', closeMed);
$('med-finish').addEventListener('click', closeMed);
$('med-more').addEventListener('click', () => {
  if (!medCtx) return;
  medCtx.dur += MED_SEC;
  $('med-done').hidden = true;
  medTick();
});
$('med').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMed(); });
// 화면을 껐다 켜면 잠금이 풀리므로 다시 (타이머는 시각으로 세서 그대로 이어진다)
document.addEventListener('visibilitychange', () => { if (!document.hidden && medCtx) { medTick(); medLock(); } });
