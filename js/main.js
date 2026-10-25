'use strict';

/* ───────── 새벽 4시가 지나면 '오늘'을 갱신 (DAY_START_HOUR) ───────── */
function refreshToday() {
  const now = todayKey();
  if (now === today) return;
  if (ui.date === today) ui.date = now;
  if (ui.calSel === today) { ui.calSel = now; ui.calMonth = monthStart(now); }
  if (ui.diaryDate === today) ui.diaryDate = now;
  today = now;
  render();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshToday(); });
setInterval(refreshToday, 60 * 1000);

/* ───────── 키보드가 올라올 때 화면 맞추기 (iOS 홈 화면 앱) ─────────
 * 키보드가 실제로 화면을 가리는 동안에만 하단 탭을 숨긴다.
 * (안드로이드는 뒤로 가기로 키보드를 내려도 입력창 포커스가 남아 있어서, 포커스만으로 판단하면 탭이 사라진 채로 남는다) */
let fullHeight = 0;
function fitViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  fullHeight = Math.max(fullHeight, h);
  if (vv) {
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
    document.documentElement.style.setProperty('--vvt', `${vv.offsetTop}px`);
  }
  const el = document.activeElement;
  const typing = !!el && el.matches(TYPING_FIELDS) && h < fullHeight - 120;
  // 할 일 입력창이 아닌 칸(공부 줄, 메모, 시트 등)이면 아래 버튼·큰 제목도 숨긴다
  const field = typing && !el.matches('#new-task, .edit-input');
  $('app').classList.toggle('typing', typing);
  $('app').classList.toggle('typing-field', field);
  // 키보드가 올라온 뒤 입력 중인 칸이 가려지지 않게 (칸마다 한 번)
  if (field && scrolledFor !== el) {
    scrolledFor = el;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  }
  if (!typing) scrolledFor = null;
}
const TYPING_FIELDS = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]), textarea';
let scrolledFor = null;
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitViewport);
  window.visualViewport.addEventListener('scroll', fitViewport);
}
window.addEventListener('resize', fitViewport);
window.addEventListener('orientationchange', () => { fullHeight = 0; setTimeout(fitViewport, 300); });
document.addEventListener('focusin', () => setTimeout(fitViewport, 300));
document.addEventListener('focusout', () => setTimeout(fitViewport, 50));
fitViewport();

/* ───────── 오프라인 / 설치 ───────── */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    // 새 버전이 준비되면 바로 새로 고치지 않고, 앱이 화면에서 내려갔을 때(다른 앱으로 가거나 화면을 끔) 새로 고친다.
    // 입력 중인 시트·칸이 있으면 그다음 기회로 미룬다. 처음 설치할 때는 이전 버전이 없으므로 새로 고치지 않는다.
    const hadController = !!navigator.serviceWorker.controller;
    let updateReady = false;
    const busy = () => ['sheet', 'lab-sheet', 'sh-sheet', 'choice'].some((id) => !$(id).hidden)
      || (document.activeElement && document.activeElement.matches('input, textarea, select'));
    const reloadIfIdle = () => { if (updateReady && document.hidden && !busy()) location.reload(); };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      updateReady = true;
      reloadIfIdle();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // 홈 화면 앱은 며칠씩 열린 채로 남아 있으므로, 다시 볼 때마다 새 버전이 있는지 확인
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) reloadIfIdle();
        else reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}
// 브라우저가 저장 공간을 임의로 정리하지 않도록 요청
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

render();
