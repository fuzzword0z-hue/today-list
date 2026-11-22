'use strict';

/* ═════════════════ 오늘 한 것 (운동 · 공부 · 직접 더한 것) ═════════════════
 * 운동 · 공부 탭을 없애고 오늘 화면의 한 줄로 바꿨다 (7-20). 시간 · 양 · 기준은 묻지 않는다:
 * 단어 10개도, 스쿼트 10번도 누르면 '했어요'. 기준을 채워야 적던 칸은 "성에 안 차면" 비어 버렸고,
 * 짬짬이 한 공부는 담을 자리가 없었다. 못 한 날은 어디에도 세지 않고, 한 날만 센다 (연속 기록 · 0/7 없음).
 * state.didItems = [{ id, label, off }]   기본 운동(ex) · 공부(study) + 직접 더한 것. 지운 항목은 off로 남겨 지난 기록의 이름을 지킨다
 * state.did      = { 'YYYY-MM-DD': [id, ...] }   그 날 한 것
 * 예전 운동 · 공부 탭 기록(state.workouts · studies)은 처음 열 때 '한 날'로 옮긴다 (core.js normalize). 기록 자체는 백업에 그대로. */

const DID_MAX = 6; // 기본 항목(DID_DEFAULT)은 core.js에
const didItems = () => state.didItems.filter((x) => !x.off);
const didLabel = (id) => (state.didItems.find((x) => x.id === id) || {}).label || '';
const didOf = (k) => (Array.isArray(state.did[k]) ? state.did[k] : []);
/* from–to 사이에 그 항목을 한 날 수 */
function didDays(id, from, to) {
  let n = 0;
  for (const k in state.did) if (k >= from && k <= to && didOf(k).includes(id)) n++;
  return n;
}
let didEdit = false; // 항목 고치기 상태

function renderDid() {
  const k = ui.date;
  const el = $('did');
  el.hidden = k > today;
  if (k > today) return;
  if (didEdit) {
    const rows = [...didItems(), { id: '', label: '' }].slice(0, DID_MAX);
    el.innerHTML = `<div class="did-head"><span class="did-title">오늘 한 것 · 항목</span><span class="spacer"></span>
        <button type="button" class="dy-cp-btn" data-did-edit="cancel">취소</button><button type="button" class="dy-cp-btn strong" data-did-edit="save">저장</button></div>
      ${rows.map((x, i) => `<input class="dy-cp-in" data-did-in="${x.id}" data-i="${i}" type="text" maxlength="10" enterkeyhint="done" aria-label="항목 ${i + 1}"
        placeholder="${x.id ? '' : '새 항목 (예: 산책)'}" value="${esc(x.label)}">`).join('')}
      <p class="did-hint">이름을 지우면 그 항목이 빠져요. 지난 기록은 남아요.</p>`;
    return;
  }
  const sel = didOf(k);
  const ws = weekStart(k);
  const week = didItems().map((x) => [x.label, didDays(x.id, ws, addDays(ws, 6))]).filter(([, n]) => n);
  el.innerHTML = `<div class="did-head"><span class="did-title">${k === today ? '오늘' : `${ml(k)}에`} 한 것</span>
      <span class="did-week">${week.length ? `${k >= weekStart(today) ? '이번 주' : '그 주'} ${week.map(([l, n]) => `${esc(l)} ${n}일`).join(' · ')}` : ''}</span>
      <button type="button" class="did-edit" data-did-edit="open" aria-label="항목 고치기">고치기</button></div>
    <div class="chips did-chips" role="group" aria-label="${k === today ? '오늘' : ml(k)} 한 것">${didItems().map((x) => `<button type="button" data-did="${x.id}" aria-pressed="${sel.includes(x.id)}">${esc(x.label)}</button>`).join('')}</div>
    ${week.length ? '' : '<p class="did-hint">5분도, 단어 10개도 누르면 \'했어요\'예요.</p>'}`;
}

$('did').addEventListener('click', (e) => {
  const k = ui.date;
  const b = e.target.closest('[data-did]');
  if (b) {
    const id = b.dataset.did;
    const sel = didOf(k);
    const on = !sel.includes(id);
    const nx = on ? [...sel, id] : sel.filter((x) => x !== id);
    if (nx.length) state.did[k] = nx; else delete state.did[k];
    save();
    if (on && navigator.vibrate) navigator.vibrate(8);
    renderDid();
    return;
  }
  const ed = e.target.closest('[data-did-edit]');
  if (!ed) return;
  const a = ed.dataset.didEdit;
  if (a === 'save') {
    const ins = [...$('did').querySelectorAll('[data-did-in]')];
    for (const inp of ins) {
      const id = inp.dataset.didIn;
      const t = inp.value.trim();
      const it = state.didItems.find((x) => x.id === id);
      if (it) { if (t) { it.label = t; delete it.off; } else it.off = 1; } // 지운 항목은 이름을 남겨 둔다
      else if (t) state.didItems.push({ id: `c${Date.now().toString(36)}${inp.dataset.i}`, label: t });
    }
    save();
    toast('오늘 한 것 항목을 고쳤어요');
  }
  didEdit = a === 'open';
  renderDid();
  if (didEdit) { const f = $('did').querySelector('[data-did-in]'); if (f) f.focus(); }
});
$('did').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-did-in]')) { e.preventDefault(); $('did').querySelector('[data-did-edit="save"]').click(); }
});
