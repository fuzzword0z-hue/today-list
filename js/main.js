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
  window.addEventListener('load', () => {
    // 새 버전으로 바뀌면 한 번 새로 고침 (서비스 워커가 직접 다시 열지 못하는 브라우저 대비).
    // 처음 설치할 때는 이전 버전이 없으므로 새로 고치지 않는다.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) setTimeout(() => location.reload(), 1500);
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // 홈 화면 앱은 며칠씩 열린 채로 남아 있으므로, 다시 볼 때마다 새 버전이 있는지 확인
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}
// 브라우저가 저장 공간을 임의로 정리하지 않도록 요청
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

render();
