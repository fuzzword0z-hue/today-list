'use strict';

/* ───────── 자정이 지나면 '오늘'을 갱신 ───────── */
function refreshToday() {
  const now = keyOf(new Date());
  if (now === today) return;
  if (ui.date === today) ui.date = now;
  if (ui.calSel === today) { ui.calSel = now; ui.calMonth = monthStart(now); }
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
  const typing = document.activeElement && document.activeElement.matches('#new-task, .edit-input') && h < fullHeight - 120;
  $('app').classList.toggle('typing', !!typing);
}
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
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// 브라우저가 저장 공간을 임의로 정리하지 않도록 요청
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

render();
