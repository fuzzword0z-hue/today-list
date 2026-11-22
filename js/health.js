'use strict';

/* ═════════════════ 내 건강 기록: 체중 · 진료 검사 수치 ═════════════════
 * 매일 누르던 '안 지킨 것' 체크(과자 · 주의 음식 · 야채 먼저 · 늦게 잠)와 주 목표는 없앴다 (7-20):
 * 실패를 세는 칸은 거의 쓰지 않게 됐고, 힘든 시기엔 도움보다 짐이 됐다. 그때의 기록(state.health · hgoal · hstart)은
 * 지우지 않고 백업에 그대로 둔다. 고양이를 지켜본 밤은 고양이 컨디션의 '밤에 지켜봄'으로 옮겼다 (care.js).
 * 남긴 것은 길게 봐야 의미가 있는 두 가지 — 통계 탭 '내 건강 기록'에서 적고 추세를 본다:
 * state.weights = { 'YYYY-MM-DD': kg }   내 체중 (체중계가 있는 본가에서, 한 달에 한 번쯤)
 * state.labs    = { 'YYYY-MM-DD': { a1c, tc, ldl, hdl, tg, memo, next } }   진료 때 받은 검사 수치 (4개월마다)
 *   next = 다음 진료일 (안 적으면 진료일 + 4개월로 본다)
 * 오늘 화면에는 진료 7일 전부터 '진료 수치 적기' 알림만 띄운다.
 * 수치를 좋다·나쁘다로 판단하지 않고, 기록과 지난번 대비 변화만 보여 준다. */

const LABS = [
  { f: 'a1c', label: '당화혈색소', unit: '%', step: '0.1' },
  { f: 'tc', label: '총콜레스테롤', unit: 'mg/dL', step: '1' },
  { f: 'ldl', label: 'LDL', unit: 'mg/dL', step: '1' },
  { f: 'hdl', label: 'HDL', unit: 'mg/dL', step: '1' },
  { f: 'tg', label: '중성지방', unit: 'mg/dL', step: '1' },
];
const VISIT_MONTHS = 4;
const VISIT_SOON = 7; // 진료 며칠 전부터 오늘 화면에 알릴지
const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';

/* ───────── 체중·진료 ───────── */
const weightBefore = (k) => Object.keys(state.weights).filter((d) => d < k).sort().pop() || null;
const labKeys = () => Object.keys(state.labs).sort();
const labBefore = (k) => labKeys().filter((d) => d < k).pop() || null;
function nextLabVisit() {
  const last = labKeys().pop();
  if (!last) return null;
  return state.labs[last].next || addMonths(last, VISIT_MONTHS);
}
const fmtLab = (L, v) => `${v}${L.unit === '%' ? '%' : ''}`;
/* 지난 진료 대비 변화 (판단 없이 방향만) */
function labDelta(v, prev) {
  if (prev === undefined || prev === null || prev === '' || v === undefined || v === '') return '';
  const d = Math.round((v - prev) * 10) / 10;
  return d ? `${d > 0 ? '▲' : '▼'}${Math.abs(d)}` : '–';
}

/* 최근 진료 수치 표 (지난 진료 대비 변화). link = 날짜를 눌러 고치기 */
function labTable(ks, link = true) {
  return `<div class="h-labs" style="--n:${ks.length}">
    <span class="h-lh"></span>${ks.map((d) => (link ? `<button type="button" class="h-lh h-ld" data-lab="${d}">${ml(d)}</button>` : `<span class="h-lh">${ml(d)}</span>`)).join('')}
    ${LABS.map((L) => `<span class="h-ll">${L.label}</span>${ks.map((d) => {
      const v = state.labs[d][L.f];
      const p = labBefore(d);
      const dl = v !== undefined && v !== '' ? labDelta(v, p ? state.labs[p][L.f] : undefined) : '';
      return `<span class="h-lv">${v !== undefined && v !== '' ? `${fmtLab(L, v)}${dl && dl !== '–' ? `<small>${dl}</small>` : ''}` : '–'}</span>`;
    }).join('')}`).join('')}
  </div>`;
}

/* ───────── 오늘 화면: 진료가 가까울 때만 알림 ───────── */
function renderHealthAlert() {
  const el = $('health');
  const next = nextLabVisit();
  const n = next ? diffDays(next, today) : null;
  const show = ui.date === today && next !== null && n <= VISIT_SOON && !state.labs[today];
  el.hidden = !show;
  if (!show) return;
  el.innerHTML = `<span class="cond-ic h-ic">${HEART_SVG}</span>
    <span class="h-alert-text">${n > 0 ? `진료 D-${n} · ${mdw(next)}` : n === 0 ? '오늘 진료' : `진료일(${ml(next)})이 지났어요`}<small>수치를 받으면 적어 두세요</small></span>
    <button type="button" class="h-alert-btn" id="h-lab-add">수치 적기</button>`;
}
$('health').addEventListener('click', (e) => {
  if (e.target.closest('#h-lab-add')) openLabSheet(null);
});

/* ───────── 통계 탭: 내 건강 기록 (체중 추세 · 진료 수치) ───────── */
function renderHealthStats() {
  const ws = Object.keys(state.weights).sort().map((k) => ({ k, w: state.weights[k] }));
  const keys = labKeys();
  const next = nextLabVisit();
  const last = ws[ws.length - 1];
  $('hstats').innerHTML = `<h2 class="sub-head">내 건강 기록</h2>
    <div class="hs-card">
      <div class="hs-head"><b>체중</b><span>잴 수 있는 날에만</span></div>
      ${ws.length >= 2 ? weightChart(ws.slice(-12)) : last ? `<p class="hs-one">${last.w}kg <small>${md(last.k)}</small></p>` : '<p class="h-empty">아직 기록이 없어요. 본가에서 잴 때 적어 두면 추세가 보여요.</p>'}
      <div class="hs-w-row">
        <input type="date" id="hs-wd" max="${today}" value="${today}" aria-label="잰 날">
        <input class="cond-w" id="hs-w" type="number" inputmode="decimal" step="0.1" min="20" max="200" placeholder="0.0" aria-label="체중"><span class="cond-unit">kg</span>
        <button type="button" class="hs-save" id="hs-w-save">기록</button>
      </div>
      ${ws.length ? `<p class="hs-list">${ws.slice(-4).reverse().map((x) => `<button type="button" data-wdel="${x.k}" aria-label="${md(x.k)} ${x.w}kg 지우기">${ml(x.k)} ${x.w}kg ✕</button>`).join('')}</p>` : ''}
    </div>
    <div class="hs-card">
      <div class="hs-head"><b>진료 검사 수치</b><span>${VISIT_MONTHS}개월마다</span></div>
      ${next ? `<p class="h-next">다음 진료 <b>${mdw(next)}</b> · ${dday(next)}</p>` : ''}
      ${keys.length ? labTable(keys.slice(-3)) : '<p class="h-empty">진료 받은 날 수치를 적어 두면 변화가 한눈에 보여요.</p>'}
      <button type="button" class="h-add" id="hs-lab-add">진료 수치 적기</button>
    </div>`;
}
$('hstats').addEventListener('click', (e) => {
  if (e.target.closest('#hs-lab-add')) { openLabSheet(null); return; }
  const ld = e.target.closest('[data-lab]');
  if (ld) { openLabSheet(ld.dataset.lab); return; }
  if (e.target.closest('#hs-w-save')) {
    const d = $('hs-wd').value || today;
    const v = parseFloat($('hs-w').value);
    if (d > today) { toast('오늘이나 지난 날짜만 적을 수 있어요'); return; }
    if (!(v >= 20 && v <= 200)) { toast('체중은 20–200kg 사이로 적어 주세요'); return; }
    undoable(`${ml(d)} 체중 ${Math.round(v * 10) / 10}kg을 적었어요`, () => { state.weights[d] = Math.round(v * 10) / 10; });
    return;
  }
  const wd = e.target.closest('[data-wdel]');
  if (wd) undoable(`${ml(wd.dataset.wdel)} 체중 기록을 지웠어요`, () => { delete state.weights[wd.dataset.wdel]; });
});

/* ───────── 진료 수치 시트 ───────── */
let labCtx = null; // 고치는 중인 진료일 (새로 적으면 null)

$('lab-fields').innerHTML = `
  <label class="field"><span>진료일</span><input type="date" id="lab-date" required></label>
  ${LABS.map((L) => `<label class="field"><span>${L.label}</span><input type="number" id="lab-${L.f}" inputmode="decimal" step="${L.step}" min="0" placeholder="–"><em>${L.unit}</em></label>`).join('')}
  <label class="field"><span>다음 진료</span><input type="date" id="lab-next"></label>`;

function openLabSheet(d) {
  labCtx = d;
  const r = (d && state.labs[d]) || {};
  const date = d || today;
  $('lab-title').textContent = d ? `${md(d)} 진료 수치` : '진료 수치 적기';
  $('lab-date').value = date;
  $('lab-date').max = today;
  for (const L of LABS) $(`lab-${L.f}`).value = r[L.f] !== undefined ? r[L.f] : '';
  $('lab-memo').value = r.memo || '';
  $('lab-next').value = r.next || addMonths(date, VISIT_MONTHS);
  $('lab-del').hidden = !d;
  const p = labBefore(date);
  $('lab-prev').textContent = p ? `지난 진료 ${ml(p)}: ${LABS.filter((L) => state.labs[p][L.f] !== undefined).map((L) => `${L.label} ${fmtLab(L, state.labs[p][L.f])}`).join(' · ') || '수치 없음'}` : '';
  $('lab-prev').hidden = !p;
  $('lab-sheet').hidden = false;
}
function closeLabSheet() {
  $('lab-sheet').hidden = true;
  labCtx = null;
  document.activeElement.blur();
}

$('lab-sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeLabSheet(); });
$('lab-sheet').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLabSheet(); });
// 진료일을 바꾸면 다음 진료도 그에 맞춰 (직접 고친 게 아니면)
let labNextAuto = '';
$('lab-date').addEventListener('focus', () => { labNextAuto = addMonths($('lab-date').value || today, VISIT_MONTHS); });
$('lab-date').addEventListener('change', () => {
  const v = $('lab-date').value;
  if (v && (!$('lab-next').value || $('lab-next').value === labNextAuto)) $('lab-next').value = addMonths(v, VISIT_MONTHS);
  labNextAuto = v ? addMonths(v, VISIT_MONTHS) : '';
});

$('lab-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const d = $('lab-date').value;
  if (!d || d > today) { toast('오늘이나 지난 날짜만 적을 수 있어요'); return; }
  const rec = {};
  for (const L of LABS) {
    const v = parseFloat($(`lab-${L.f}`).value);
    if (Number.isFinite(v) && v >= 0) rec[L.f] = Math.round(v * 10) / 10;
  }
  const memo = $('lab-memo').value.trim();
  if (memo) rec.memo = memo;
  const next = $('lab-next').value;
  if (next && next > d && next !== addMonths(d, VISIT_MONTHS)) rec.next = next;
  if (!LABS.some((L) => rec[L.f] !== undefined) && !memo) { toast('수치나 메모를 하나 이상 적어 주세요'); return; }
  const old = labCtx;
  closeLabSheet();
  undoable(`${ml(d)} 진료 수치를 ${old ? '고쳤어요' : '적었어요'}`, () => {
    if (old && old !== d) delete state.labs[old];
    state.labs[d] = rec;
  });
});

$('lab-del').addEventListener('click', () => {
  const d = labCtx;
  if (!d) return;
  closeLabSheet();
  undoable(`${ml(d)} 진료 수치를 지웠어요`, () => { delete state.labs[d]; });
});

/* ═════════ 리포트: 체중 · 진료 수치 ═════════ */
function analyzeHealth(start, end) {
  return {
    weights: Object.keys(state.weights).filter((d) => d >= start && d <= end).sort(),
    labs: labKeys().filter((d) => d >= start && d <= end),
  };
}

/* 진료 수치가 지난번보다 내려간 것만 사실대로 (판단은 진료에서) */
function healthGood(hl) {
  const out = [];
  for (const d of hl.labs) {
    const p = labBefore(d);
    if (!p) continue;
    const down = LABS.filter((L) => ['a1c', 'ldl'].includes(L.f) && state.labs[d][L.f] !== undefined && state.labs[p][L.f] !== undefined && state.labs[d][L.f] < state.labs[p][L.f]);
    if (down.length) out.push(`${ml(d)} 진료에서 지난번보다 내려갔어요: ${down.map((L) => `${L.label} ${fmtLab(L, state.labs[p][L.f])} → ${fmtLab(L, state.labs[d][L.f])}`).join(', ')}.`);
  }
  return out;
}

/* 리포트의 '건강' 칸: [html, 텍스트 줄] */
function healthSection(hl, yearly) {
  if (!hl.weights.length && !hl.labs.length) return ['', []];
  const tiles = [];
  if (hl.weights.length) {
    const lastW = hl.weights[hl.weights.length - 1];
    const base = weightBefore(hl.weights[0]) || (hl.weights.length > 1 ? hl.weights[0] : null);
    const d = base && base !== lastW ? Math.round((state.weights[lastW] - state.weights[base]) * 10) / 10 : null;
    tiles.push(['체중', `${state.weights[lastW]}<small>kg</small>`, d !== null ? `<small>${ml(base)}보다 ${d > 0 ? '+' : ''}${d}kg</small>` : `<small>${ml(lastW)}</small>`]);
  }
  const lines = [
    ...tiles.map(([l, v, d]) => `- ${l}: ${v.replace(/<[^>]+>/g, '')}${d ? ` (${d.replace(/<[^>]+>/g, '')})` : ''}`),
    ...hl.labs.map((d) => `- ${ml(d)} 진료: ${LABS.filter((L) => state.labs[d][L.f] !== undefined).map((L) => `${L.label} ${fmtLab(L, state.labs[d][L.f])}`).join(', ')}`),
  ];
  const html = `<section class="r-sec r-health"><h2>건강</h2>
    ${tiles.length ? `<div class="r-tiles">${tiles.map(([l, v, d]) => `<div class="r-tile"><span class="r-tl">${esc(l)}</span><span class="r-tv">${v}</span>${d}</div>`).join('')}</div>` : ''}
    ${hl.labs.length ? `<h3 class="r-sub">${yearly ? '올해' : '이번 달'} 진료 수치</h3>${labTable(hl.labs.length > 1 ? hl.labs.slice(-4) : [labBefore(hl.labs[0]), hl.labs[0]].filter(Boolean), false)}` : ''}
    <p class="r-tip">진료 수치는 지난 진료와 비교한 변화예요.</p></section>`;
  return [html, lines];
}
