'use strict';

/* ═════════════════ 내 건강 ═════════════════
 * 오늘 화면의 카드. 매일 할 일은 '안 지킨 것만 누르기' — 아무것도 안 누른 날은 다 지킨 날이다.
 * 연속 달성(스트릭) 대신 '이번 주 예외 횟수 / 목표'로 보여 준다 (하루 실패해도 한 주는 성공할 수 있게).
 *
 * state.health  = { 'YYYY-MM-DD': { snack, snackWhy, snackNote, food, foods: [...], veg, late, lateWhy: [...] } }
 *   snack = 과자 먹은 날, snackWhy = 이유 하나, snackNote = 이유가 '기타'일 때 직접 적은 글 (예: 회사에 새 과자가 와서 다 같이 맛봄), food = 주의 음식(빵·라면·김밥·튀김) 먹은 날, veg = 야채 먼저 안 먹은 날,
 *   late = 그날 밤 11:30 넘어서 잔 날 (다음 날 아침 '어젯밤'으로, 밤 10시 넘어서는 '오늘 밤'으로 체크하고, 잔 날 밤의 날짜로 남긴다)
 *   lateWhy = 늦게 잔 이유 (여러 개: 일 · 집안일 · 고양이 케어 · 핸드폰 · 잠이 안 옴)
 *   lateCat = 고양이 케어로 늦게 잔 까닭 (여러 개: nausea 오심이 심해 토할까 봐 지켜봄 · vomit 구토 후 멈췄는지 확인)
 *   '고양이 케어'로 늦게 잔 밤은 습관이 아니라 아픈 고양이를 지켜본 밤이라 '늦게 잠' 주 목표에서 빼고 따로 센다.
 * state.hgoal   = { snack, veg, late, food }   주 목표 (주 n회 이하), 주의 음식은 n일에 한 번
 * state.hstart  = 처음 카드를 본 날 (리포트는 이 날부터 센다 — 체크가 없는 날도 '지킨 날'이라서)
 * state.weights = { 'YYYY-MM-DD': kg }   내 체중 (체중계가 있는 본가에서, 한 달에 한 번쯤)
 * state.labs    = { 'YYYY-MM-DD': { a1c, tc, ldl, hdl, tg, memo, next } }   진료 때 받은 검사 수치 (4개월마다)
 *   next = 다음 진료일 (안 적으면 진료일 + 4개월로 본다)
 * 수치를 좋다·나쁘다로 판단하지 않고, 기록과 지난번 대비 변화만 보여 준다. */

const H_ITEMS = [
  { id: 'snack', label: '과자 먹음', short: '과자', main: '과자', sub: '먹음', why: 'snackWhy', ask: '이유',
    opts: [['stress', '스트레스'], ['tired', '피곤'], ['bored', '지루함'], ['hungry', '배고픔'], ['etc', '기타']], note: 'snackNote' },
  { id: 'food', label: '주의 음식 먹음', short: '주의 음식', main: '주의 음식', sub: '먹음', why: 'foods', ask: '무엇', multi: true,
    opts: [['bread', '빵'], ['ramen', '라면'], ['gimbap', '김밥'], ['fried', '튀김']] },
  { id: 'veg', label: '야채 먼저 안 먹음', short: '야채', main: '야채 먼저', sub: '안 먹음' },
  { id: 'late', label: '어젯밤 11:30 넘어 잠', short: '늦게 잠', main: '늦게 잠', sub: '어젯밤', why: 'lateWhy', ask: '이유', night: true, multi: true,
    opts: [['work', '일'], ['chores', '집안일'], ['cat', '고양이 케어'], ['phone', '핸드폰'], ['awake', '잠이 안 옴']] },
];
const H_WEEKLY = ['snack', 'veg', 'late']; // 주 n회 이하가 목표인 항목
const CAT_WATCH = [['nausea', '오심 지켜봄'], ['vomit', '구토 후 확인']];
const lateWhyOf = (h) => (!h ? [] : Array.isArray(h.lateWhy) ? h.lateWhy : h.lateWhy ? [h.lateWhy] : []);
/* 고양이를 지켜보느라 늦게 잔 밤 (오심·구토) */
const catNight = (d) => hOn('late', d) && lateWhyOf(state.health[d]).includes('cat');
const H_GOAL = { snack: 2, veg: 2, late: 2, food: 14 };
const LABS = [
  { f: 'a1c', label: '당화혈색소', unit: '%', step: '0.1' },
  { f: 'tc', label: '총콜레스테롤', unit: 'mg/dL', step: '1' },
  { f: 'ldl', label: 'LDL', unit: 'mg/dL', step: '1' },
  { f: 'hdl', label: 'HDL', unit: 'mg/dL', step: '1' },
  { f: 'tg', label: '중성지방', unit: 'mg/dL', step: '1' },
];
const VISIT_MONTHS = 4;
const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';

const hItem = (id) => H_ITEMS.find((it) => it.id === id);
const hGoal = () => ({ ...H_GOAL, ...state.hgoal });
const hOn = (id, d) => !!(state.health[d] && state.health[d][id]);
/* 보고 있는 날 k에서 그 항목이 기록되는 날. '늦게 잠'은 잔 날 밤의 날짜로 남긴다:
 *   오늘 화면 — 낮에는 어젯밤, 밤 10시 ~ 새벽 4시(하루가 바뀌기 전)에는 오늘 밤 (자기 전에 미리 체크)
 *   지난 날 화면 — 그날 밤 (밤 10시가 넘어 '어젯밤'을 놓쳤으면 어제 화면에서 체크) */
const lateTonight = () => { const h = new Date().getHours(); return h >= 22 || h < DAY_START_HOUR; };
const hDay = (it, k) => (!it.night ? k : k < today || (k === today && lateTonight()) ? k : addDays(k, -1));
const nightWord = (k) => (k < today ? '그날 밤' : k === today && lateTonight() ? '오늘 밤' : '어젯밤');
const weekStart = (k) => addDays(k, -parse(k).getDay()); // 일요일
const addMonths = (k, n) => {
  const d = parse(k);
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return keyOf(r);
};
const optLabelOf = (it, v) => (it.opts.find(([x]) => x === v) || [])[1] || '';

function setHealth(d, patch) {
  const h = { ...(state.health[d] || {}), ...patch };
  for (const f of Object.keys(h)) if (h[f] === null || h[f] === undefined) delete h[f];
  if (Object.keys(h).length) state.health[d] = h;
  else delete state.health[d];
  save();
}

/* k가 들어 있는 주(일–토)의 예외 횟수 */
/* k가 들어 있는 주(일–토)의 예외 횟수. 고양이를 지켜본 밤은 late가 아니라 cat으로 따로 센다 */
function hWeekCount(k) {
  const ws = weekStart(k);
  const c = { snack: 0, veg: 0, late: 0, cat: 0 };
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    for (const id of H_WEEKLY) if (hOn(id, d)) c[id === 'late' && catNight(d) ? 'cat' : id]++;
  }
  return c;
}

/* upto까지(포함) 마지막으로 주의 음식을 먹은 날 */
function lastFood(upto, before) {
  let best = null;
  for (const d in state.health) {
    if (state.health[d].food && d <= upto && (!before || d < before) && (!best || d > best)) best = d;
  }
  return best;
}

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

/* ───────── 오늘 화면 카드 ───────── */
let healthOpenFor = null;

function renderHealth() {
  const k = ui.date;
  const el = $('health');
  el.hidden = k > today;
  if (k > today) return;
  if (!state.hstart && k === today) { state.hstart = today; save(); }
  const open = healthOpenFor === k;
  const goal = hGoal();
  const cnt = hWeekCount(k);
  const thisWeek = weekStart(k) === weekStart(today);

  // 머리: 이번 주 예외 횟수 / 목표 (진료가 가까우면 먼저 알려 줌)
  const stats = H_WEEKLY.map((id) => `<span class="${cnt[id] > goal[id] ? 'over' : ''}">${hItem(id).short} <b>${cnt[id]}</b>/${goal[id]}</span>`).join(' · ');
  let sum = `${thisWeek ? '' : '그 주 '}${stats}`;
  let alert = false;
  const next = nextLabVisit();
  if (next && k === today && !state.labs[today]) {
    const n = diffDays(next, today);
    if (n <= 0) { sum = n === 0 ? '오늘 진료 · 수치 적기' : '진료 수치 적기'; alert = true; } else if (n <= 7) sum = `진료 D-${n} · ${sum}`;
  }

  // 버튼 아래 작은 글씨: 고른 이유 / 주의 음식은 마지막으로 먹은 지 며칠
  const lf = lastFood(k);
  const gap = lf ? diffDays(k, lf) : null;
  const sub = (it) => {
    const h = state.health[hDay(it, k)] || {};
    if (h[it.id] && it.why) {
      const v = it.multi ? (h[it.why] || []).map((x) => optLabelOf(it, x)).join('·') : optLabelOf(it, h[it.why]);
      if (v) return v;
    }
    if (it.id === 'food' && !h.food && lf) return `<span class="${gap < goal.food ? 'wait' : ''}">D+${gap}</span>`;
    return it.night ? nightWord(k) : it.sub;
  };

  // 이유 고르기: 아직 고르지 않은 것만 (펼치면 전부)
  const whyRows = H_ITEMS.filter((it) => it.opts && hOn(it.id, hDay(it, k))).filter((it) => {
    const v = state.health[hDay(it, k)][it.why];
    // 여러 개 고르는 것(주의 음식 · 늦게 잔 이유)은 누른 동안 계속, '기타'는 적은 글이 보이게 계속 보여 준다
    return open || it.multi || !v || (it.note && v === 'etc');
  }).map((it) => {
    const h = state.health[hDay(it, k)];
    const cur = it.multi ? h[it.why] || [] : [h[it.why]];
    let row = `<div class="cond-row h-why"><span class="cond-label">${it.main}</span>
      <div class="chips" data-why="${it.id}">${it.opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${cur.includes(v)}">${l}</button>`).join('')}</div></div>`;
    // '기타'를 고르면 직접 적는 칸
    if (it.note && h[it.why] === 'etc') {
      row += `<div class="cond-row h-why"><span class="cond-label"></span>
        <textarea class="h-note-in" data-note="${it.id}" rows="1" maxlength="80" enterkeyhint="done" aria-label="${it.main} 기타 이유"
          placeholder="예: 새 과자를 다 같이 맛봄 (1개)">${esc(h[it.note] || '')}</textarea></div>`;
    }
    // 고양이 케어로 늦게 잔 밤: 오심을 지켜봤는지, 구토 후 확인했는지
    if (it.id === 'late' && cur.includes('cat')) {
      const d = hDay(it, k);
      const cw = h.lateCat || [];
      row += `<div class="cond-row h-why"><span class="cond-label">고양이</span>
        <div class="chips" data-why="lateCat">${CAT_WATCH.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${cw.includes(v)}">${l}</button>`).join('')}</div></div>`;
      // 구토를 확인한 밤인데 고양이 컨디션에 구토 기록이 없으면 알려 준다
      const c = condOf(d);
      if (cw.includes('vomit') && !(c && c.vo && c.vo !== '0')) {
        row += `<p class="h-nudge">${ml(d)} 고양이 컨디션에 구토 기록이 없어요 <button type="button" data-vo="${d}">구토 1회로 기록</button></p>`;
      }
    }
    return row;
  }).join('');

  el.innerHTML = `
    <button class="cond-head" aria-expanded="${open}">
      <span class="cond-ic h-ic">${HEART_SVG}</span>
      <span class="cond-title">내 건강</span>
      <span class="cond-sum h-sum${alert ? ' h-alert' : ''}">${alert ? esc(sum) : sum}</span>
      <svg class="cond-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="h-row" role="group" aria-label="안 지킨 것만 누르기">${H_ITEMS.map((it) => {
      const pressed = hOn(it.id, hDay(it, k));
      const label = it.night ? `${nightWord(k)} 11:30 넘어 잠` : it.label;
      return `<button class="h-tg" data-h="${it.id}" aria-pressed="${pressed}" aria-label="${label}"><b>${it.main}</b><small>${sub(it)}</small></button>`;
    }).join('')}</div>
    ${whyRows ? `<div class="h-whys">${whyRows}</div>` : ''}
    ${cnt.cat ? `<p class="h-catweek">${thisWeek ? '이번 주' : '그 주'} 고양이를 지켜본 밤 ${cnt.cat}번 · 늦게 잠 목표에서 뺐어요</p>` : ''}
    ${open ? healthBody(k, lf, gap) : ''}`;
  for (const t of el.querySelectorAll('.h-note-in')) growText(t); // 적은 글이 다 보이게
}

function healthBody(k, lf, gap) {
  const goal = hGoal();
  const w = state.weights[k];
  const pw = weightBefore(k);
  const keys = labKeys();
  const next = nextLabVisit();
  const last = keys[keys.length - 1];
  const stepper = (f, unit) => `<span class="h-step" data-goal="${f}">
    <button type="button" data-d="-1" aria-label="줄이기">−</button><b>${goal[f]}</b><button type="button" data-d="1" aria-label="늘리기">+</button></span>${unit}`;
  return `<div class="cond-body h-body">
    ${lf && gap < goal.food ? `<p class="h-note">주의 음식은 ${ml(addDays(lf, goal.food))}부터 괜찮아요 (${goal.food}일에 한 번)</p>` : ''}
    <div class="cond-row"><span class="cond-label">체중</span>
      <input class="cond-w" id="h-w" aria-label="내 체중" type="number" inputmode="decimal" step="0.1" min="20" max="200" placeholder="0.0" value="${w || ''}"><span class="cond-unit">kg</span>
      ${pw ? `<span class="cond-prev">지난 ${state.weights[pw]}kg (${ml(pw)})</span>` : '<span class="cond-prev">잴 수 있는 날에만</span>'}
    </div>

    <h3 class="h-sub">진료 검사 수치 <span>${VISIT_MONTHS}개월마다</span></h3>
    ${next ? `<p class="h-next">다음 진료 <b>${mdw(next)}</b> · ${dday(next)}</p>` : ''}
    ${last ? labTable(keys.slice(-3)) : '<p class="h-empty">아직 기록이 없어요. 진료 받은 날 수치를 적어 두면 변화가 한눈에 보여요.</p>'}
    <button type="button" class="h-add" id="h-lab-add">${state.labs[k] ? `${ml(k)} 수치 고치기` : '진료 수치 적기'}</button>

    <h3 class="h-sub">주 목표 <span>넘으면 숫자 색이 바뀌어요</span></h3>
    <div class="h-goals">
      <div>과자 주 ${stepper('snack', '회 이하')}</div>
      <div>야채 먼저 안 먹은 날 주 ${stepper('veg', '회 이하')}</div>
      <div>늦게 잔 날 주 ${stepper('late', '회 이하')}</div>
      <div>주의 음식 ${stepper('food', '일에 한 번')}</div>
    </div>
    <p class="cond-help">아무것도 안 누른 날은 다 지킨 날이에요. 늦게 잔 날은 다음 날 아침에 '어젯밤'으로 (밤 10시 넘어서는 '오늘 밤'으로) 누르고, 놓쳤으면 지난 날 화면에서 '그날 밤'으로 누르면 돼요. 이유는 여러 개 고를 수 있어요. 월간·연간 리포트에 쓰여요.</p>
  </div>`;
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

$('health').addEventListener('click', (e) => {
  const k = ui.date;
  if (e.target.closest('.cond-head')) {
    healthOpenFor = healthOpenFor === k ? null : k;
    renderHealth();
    return;
  }
  const tg = e.target.closest('[data-h]');
  if (tg) {
    const it = hItem(tg.dataset.h);
    const d = hDay(it, k);
    if (hOn(it.id, d)) setHealth(d, { [it.id]: null, ...(it.why ? { [it.why]: null } : {}), ...(it.note ? { [it.note]: null } : {}), ...(it.id === 'late' ? { lateCat: null } : {}) });
    else {
      setHealth(d, { [it.id]: 1 });
      if (navigator.vibrate) navigator.vibrate(8);
    }
    renderHealth();
    return;
  }
  const vo = e.target.closest('[data-vo]');
  if (vo) {
    const d = vo.dataset.vo;
    undoable(`${ml(d)} 고양이 구토 1회로 기록했어요`, () => {
      state.cond[d] = { ...(state.cond[d] || {}), vo: '1' };
    });
    return;
  }
  const cw = e.target.closest('[data-why="lateCat"] [data-v]');
  if (cw) {
    const d = hDay(hItem('late'), k);
    const cur = (state.health[d] || {}).lateCat || [];
    const v = cw.dataset.v;
    const nx = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    setHealth(d, { lateCat: nx.length ? nx : null });
    renderHealth();
    return;
  }
  const why = e.target.closest('[data-why] [data-v]');
  if (why) {
    const it = hItem(why.parentElement.dataset.why);
    const d = hDay(it, k);
    const h = state.health[d] || {};
    const v = why.dataset.v;
    let toNote = false;
    if (it.multi) {
      const cur = h[it.why] || [];
      const nx = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      // 고양이 케어를 빼면 그 밑의 오심·구토도 지운다
      setHealth(d, { [it.why]: nx.length ? nx : null, ...(it.id === 'late' && !nx.includes('cat') ? { lateCat: null } : {}) });
    } else {
      const nv = h[it.why] === v ? null : v;
      // '기타'가 아닌 이유로 바꾸면 적어 둔 글도 지운다
      setHealth(d, { [it.why]: nv, ...(it.note && nv !== 'etc' ? { [it.note]: null } : {}) });
      toNote = !!it.note && nv === 'etc';
    }
    renderHealth();
    if (toNote) $('health').querySelector(`[data-note="${it.id}"]`).focus(); // '기타'를 고르면 바로 적을 수 있게
    return;
  }
  const st = e.target.closest('.h-step [data-d]');
  if (st) {
    const f = st.parentElement.dataset.goal;
    const g = hGoal();
    const lim = f === 'food' ? [1, 60] : [0, 7];
    const v = Math.min(lim[1], Math.max(lim[0], g[f] + +st.dataset.d));
    state.hgoal = { ...state.hgoal, [f]: v };
    save();
    renderHealth();
    return;
  }
  if (e.target.closest('#h-lab-add')) { openLabSheet(state.labs[k] ? k : null); return; }
  const ld = e.target.closest('[data-lab]');
  if (ld) openLabSheet(ld.dataset.lab);
});

/* '기타' 이유 적기: 다시 그리지 않고 저장만 (입력 중인 칸이 흔들리지 않게). 한 줄로 적고, 길면 칸이 늘어난다 */
$('health').addEventListener('input', (e) => {
  const inp = e.target.closest('[data-note]');
  if (!inp) return;
  const it = hItem(inp.dataset.note);
  const h = state.health[hDay(it, ui.date)];
  if (!h) return;
  growText(inp);
  const t = inp.value.replace(/\s*\n\s*/g, ' ').trim();
  if (t) h[it.note] = t;
  else delete h[it.note];
  saveSoon();
});
$('health').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.closest('[data-note]')) { e.preventDefault(); e.target.blur(); }
});

$('health').addEventListener('change', (e) => {
  if (e.target.id !== 'h-w') return;
  const v = parseFloat(e.target.value);
  if (v >= 20 && v <= 200) state.weights[ui.date] = Math.round(v * 10) / 10;
  else delete state.weights[ui.date];
  save();
  if (e.target.value && !(v >= 20 && v <= 200)) toast('체중은 20–200kg 사이로 적어 주세요');
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
  const date = d || (ui.date <= today ? ui.date : today);
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

/* ═════════ 리포트 ═════════ */
const H_NAME = { snack: '과자', veg: "'야채 먼저'", late: "'11:30 전에 자기'" };
const H_GOAL_TEXT = { snack: (n) => `주 ${n}회 이하`, veg: (n) => `안 지킨 날 주 ${n}회 이하`, late: (n) => `늦게 잔 날 주 ${n}회 이하` };
const SNACK_TIP = {
  stress: '스트레스 받을 때 과자 대신 할 일 하나를 정해 두세요 (산책 5분, 따뜻한 차 한 잔).',
  tired: '피곤할 때 단 게 당겨요. 늦게 잔 다음 날과 겹치는지 보고, 잠부터 챙겨 보세요.',
  bored: '심심할 때 손이 가요. 과자는 눈에 안 보이는 곳에 두고, 쉬는 시간엔 물 한 잔부터 마셔 보세요.',
  hungry: '끼니 사이가 길어서 배가 고파요. 견과류나 삶은 달걀처럼 든든한 간식을 미리 챙겨 두세요.',
  etc: "적어 둔 상황 중에 자주 겹치는 게 있으면 (예: 회사에서 다 같이 나눠 먹을 때) 그때의 기준을 미리 정해 두세요 ('한 개만', '맛만 보기').",
};
const LATE_TIP = {
  work: '일이 늦게 끝나는 날이 많아요. 그런 날은 씻고 바로 누울 수 있게 잘 준비를 미리 해 두세요.',
  chores: '집안일이 밤으로 밀리는 날이 많아요. 저녁 먹고 15분만 먼저 해 두고, 내일로 넘겨도 되는 일은 넘겨 보세요.',
  phone: '11시가 되면 핸드폰을 침대에서 먼 곳에 충전해 두세요.',
  awake: '잠이 안 오는 날이 많아요. 커피는 오후 2시 전까지만, 자기 전 30분은 화면을 멀리해 보세요.',
};

/* start–last(어제까지) 사이 건강 습관. 체크하지 않은 날 = 지킨 날이라 처음 카드를 본 날부터 센다 */
function analyzeHealth(start, last, end) {
  const goal = hGoal();
  const hl = {
    on: false, span: 0, snack: 0, veg: 0, late: 0, food: 0,
    cat: { nights: 0, nausea: 0, vomit: 0, dates: [] }, // 고양이를 지켜본 밤 (late에는 넣지 않음)
    why: { snack: {}, late: {}, foods: {} }, weeks: [], ok: { snack: 0, veg: 0, late: 0, food: 0 },
    lateSnack: 0, foodGaps: [], foodEarly: [],
    snackNotes: [], // 과자 이유를 '기타'로 고르고 적은 글 [{ d, t }]
    weights: Object.keys(state.weights).filter((d) => d >= start && d <= end).sort(),
    labs: labKeys().filter((d) => d >= start && d <= end),
    sq: { days: 0, sum: 0 }, // 식후 스쿼트 (운동 탭 기록) — 혈당 관리로 함께 본다
  };
  for (const d in state.workouts) {
    const r = state.workouts[d];
    if (d >= start && d <= last && r.sq) { hl.sq.days++; hl.sq.sum += r.sq; }
  }
  const from = state.hstart && state.hstart > start ? state.hstart : start;
  if (!state.hstart || !Object.keys(state.health).length || from > last) return hl;
  hl.on = true;
  hl.span = diffDays(last, from) + 1;
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (let d = from; d <= last; d = addDays(d, 1)) {
    const h = state.health[d];
    if (!h) continue;
    if (h.snack) {
      hl.snack++;
      bump(hl.why.snack, h.snackWhy || 'none');
      if (h.snackWhy === 'etc' && h.snackNote) hl.snackNotes.push({ d, t: h.snackNote });
    }
    if (h.veg) hl.veg++;
    if (h.late && catNight(d)) {
      // 아픈 고양이를 지켜본 밤: 습관이 아니므로 늦게 잔 날·주 목표·'늦게 잔 다음 날 과자'에 넣지 않는다
      hl.cat.nights++;
      hl.cat.dates.push(d);
      for (const w of h.lateCat || []) if (hl.cat[w] !== undefined) hl.cat[w]++;
    } else if (h.late) {
      hl.late++;
      const why = lateWhyOf(h);
      if (why.length) for (const w of why) bump(hl.why.late, w); else bump(hl.why.late, 'none');
      if (addDays(d, 1) <= last && hOn('snack', addDays(d, 1))) hl.lateSnack++;
    }
    if (h.food) {
      hl.food++;
      for (const f of h.foods || []) bump(hl.why.foods, f);
      const p = lastFood(d, d);
      if (p) {
        const g = diffDays(d, p);
        hl.foodGaps.push(g);
        if (g < goal.food) hl.foodEarly.push(d);
      }
    }
  }
  // 주(일–토) 단위 목표: 토요일이 이 기간에 있고 어제까지 다 지난 주만 (카드를 쓰기 시작한 뒤의 주)
  for (let ws = weekStart(start); addDays(ws, 6) <= last; ws = addDays(ws, 7)) {
    if (addDays(ws, 6) < start || ws < state.hstart) continue;
    const c = hWeekCount(ws);
    let foodOk = true;
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const p = hOn('food', d) && lastFood(d, d);
      if (p && diffDays(d, p) < goal.food) foodOk = false;
    }
    hl.weeks.push({ ws, ...c, foodOk });
    for (const id of H_WEEKLY) if (c[id] <= goal[id]) hl.ok[id]++;
    if (foodOk) hl.ok.food++;
  }
  return hl;
}

/* 받침에 맞춰 이/가 ('핸드폰'이, '스트레스'가) */
function iGa(w) {
  const c = w.charCodeAt(w.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? '이' : '가';
  return /[lmnr0136780]$/i.test(w) ? '이' : '가';
}
/* 고양이 지켜본 밤 요약: '오심 2 · 구토 1' */
const catWatchText = (c) => [c.nausea ? `오심 ${c.nausea}` : '', c.vomit ? `구토 ${c.vomit}` : ''].filter(Boolean).join(' · ') || '오심·구토';
const hTop = (o) => Object.entries(o).filter(([k]) => k !== 'none').sort((a, b) => b[1] - a[1])[0] || null;
const hDist = (it, o) => Object.entries(o).sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${k === 'none' ? '안 고름' : optLabelOf(it, k)} ${n}`).join(' · ');

function healthFeedback(hl) {
  const out = { good: [], improve: [], fix: [], goals: [] };
  const g = hGoal();
  if (hl.on) {
    const n = hl.weeks.length;
    if (n >= 2) {
      const kept = H_WEEKLY.filter((id) => hl.ok[id] / n >= 0.75);
      if (kept.length) out.good.push(`주 목표를 잘 지켰어요: ${kept.map((id) => `${H_NAME[id]} ${hl.ok[id]}/${n}주`).join(' · ')}.`);
      for (const id of H_WEEKLY) {
        const ok = hl.ok[id];
        const name = `${H_NAME[id]} 목표(${H_GOAL_TEXT[id](g[id])})`;
        if (ok / n < 0.5) {
          out.fix.push(`${name}를 넘긴 주가 ${n}주 중 ${n - ok}주예요.`);
          out.goals.push(`${id === 'snack' ? '과자' : id === 'veg' ? '야채 먼저 안 먹은 날' : '늦게 잔 날'} 주 ${g[id]}회 이하`);
        }
      }
    }
    if (hl.foodEarly.length) {
      out.fix.push(`주의 음식을 ${g.food}일이 지나기 전에 다시 먹은 날이 ${hl.foodEarly.length}번 있어요 (${hl.foodEarly.slice(0, 4).map(ml).join(', ')}).`);
      out.goals.push(`주의 음식 ${g.food}일에 한 번`);
    } else if (hl.food) out.good.push(`주의 음식은 ${hl.food}번 먹었고, 모두 ${g.food}일 간격을 지켰어요.`);
    else if (hl.span >= 14) out.good.push(`주의 음식을 ${hl.span}일 동안 한 번도 안 먹었어요.`);

    const ts = hTop(hl.why.snack);
    const tw = (t, it) => `'${optLabelOf(hItem(it), t)}'${iGa(optLabelOf(hItem(it), t))}`;
    if (ts && ts[1] >= 2) out.improve.push(`과자를 먹은 이유는 ${tw(ts[0], 'snack')} 가장 많았어요 (${ts[1]}번). ${SNACK_TIP[ts[0]]}`);
    else if ((hl.why.snack.none || 0) >= 3) out.improve.push('과자를 먹은 날 이유도 하나 골라 두면, 왜 먹고 싶은지가 보이기 시작해요.');
    const tl = hTop(hl.why.late);
    if (tl && tl[1] >= 2) out.improve.push(`늦게 잔 이유는 ${tw(tl[0], 'late')} 가장 많았어요 (${tl[1]}번). ${LATE_TIP[tl[0]]}`);
    if (hl.lateSnack >= 2) out.improve.push(`늦게 잔 다음 날 과자를 먹은 날이 ${hl.lateSnack}일이에요. 잠이 부족하면 단 게 당겨요 — 11:30 전에 눕는 것부터 챙겨 보세요.`);
  }
  // 진료 수치: 내려간 것만 사실대로 알려 준다 (판단은 진료에서)
  for (const d of hl.labs) {
    const p = labBefore(d);
    if (!p) continue;
    const down = LABS.filter((L) => ['a1c', 'ldl'].includes(L.f) && state.labs[d][L.f] !== undefined && state.labs[p][L.f] !== undefined && state.labs[d][L.f] < state.labs[p][L.f]);
    if (down.length) out.good.push(`${ml(d)} 진료에서 지난번보다 내려갔어요: ${down.map((L) => `${L.label} ${fmtLab(L, state.labs[p][L.f])} → ${fmtLab(L, state.labs[d][L.f])}`).join(', ')}.`);
  }
  return out;
}

/* 리포트의 '건강' 칸: [html, 텍스트 줄] */
function healthSection(hl, yearly) {
  if (!hl.on && !hl.weights.length && !hl.labs.length && !hl.sq.days) return ['', []];
  const g = hGoal();
  const n = hl.weeks.length;
  const tiles = [];
  if (hl.on) {
    const wk = (id) => (n ? `<small>목표 지킨 주 ${hl.ok[id]}/${n}</small>` : '');
    tiles.push(['과자 먹은 날', `${hl.snack}<small>/${hl.span}일</small>`, wk('snack')]);
    tiles.push(['야채 순서 놓친 날', `${hl.veg}<small>/${hl.span}일</small>`, wk('veg')]);
    tiles.push(['늦게 잔 날', `${hl.late}<small>/${hl.span}일</small>`, wk('late')]);
    if (hl.cat.nights) tiles.push(['고양이 지켜본 밤', `${hl.cat.nights}<small>일</small>`, `<small>${catWatchText(hl.cat)}</small>`]);
    tiles.push(['주의 음식', `${hl.food}<small>번</small>`, hl.foodEarly.length ? `<small>${g.food}일 안에 다시 ${hl.foodEarly.length}번</small>`
      : hl.foodGaps.length ? `<small>가장 짧은 간격 ${Math.min(...hl.foodGaps)}일</small>` : '']);
  }
  if (hl.sq.days) tiles.push(['식후 스쿼트', `${hl.sq.days}<small>일</small>`, `<small>평균 ${Math.round(hl.sq.sum / hl.sq.days)}회</small>`]);
  if (hl.weights.length) {
    const lastW = hl.weights[hl.weights.length - 1];
    const base = weightBefore(hl.weights[0]) || (hl.weights.length > 1 ? hl.weights[0] : null);
    const d = base && base !== lastW ? Math.round((state.weights[lastW] - state.weights[base]) * 10) / 10 : null;
    tiles.push(['체중', `${state.weights[lastW]}<small>kg</small>`, d !== null ? `<small>${ml(base)}보다 ${d > 0 ? '+' : ''}${d}kg</small>` : `<small>${ml(lastW)}</small>`]);
  }
  const dists = [];
  if (hl.on) {
    if (hl.snack) dists.push(['과자 이유', hDist(hItem('snack'), hl.why.snack)]);
    if (hl.snackNotes.length) {
      const sn = hl.snackNotes;
      dists.push(['과자 기타', `${sn.slice(-8).map(({ d, t }) => `${ml(d)} ${t}`).join(' · ')}${sn.length > 8 ? ` (앞의 ${sn.length - 8}개 더)` : ''}`]);
    }
    if (hl.late) dists.push(['늦게 잔 이유', hDist(hItem('late'), hl.why.late)]);
    if (hl.cat.nights) dists.push(['고양이 지켜본 밤', `${catWatchText(hl.cat)} — ${hl.cat.dates.map(ml).join(', ')} (늦게 잠 목표에서 뺐어요)`]);
    if (Object.keys(hl.why.foods).length) dists.push(['주의 음식', hDist(hItem('food'), hl.why.foods)]);
  }
  const lines = [
    ...tiles.map(([l, v, d]) => `- ${l}: ${v.replace(/<[^>]+>/g, '')}${d ? ` (${d.replace(/<[^>]+>/g, '')})` : ''}`),
    ...dists.map(([l, v]) => `- ${l}: ${v}`),
    ...hl.labs.map((d) => `- ${ml(d)} 진료: ${LABS.filter((L) => state.labs[d][L.f] !== undefined).map((L) => `${L.label} ${fmtLab(L, state.labs[d][L.f])}`).join(', ')}`),
  ];
  const html = `<section class="r-sec r-health"><h2>건강</h2>
    ${tiles.length ? `<div class="r-tiles">${tiles.map(([l, v, d]) => `<div class="r-tile"><span class="r-tl">${esc(l)}</span><span class="r-tv">${v}</span>${d}</div>`).join('')}</div>` : ''}
    ${dists.length ? `<ul class="r-dist">${dists.map(([l, v]) => `<li><b>${l}</b> ${esc(v)}</li>`).join('')}</ul>` : ''}
    ${hl.labs.length ? `<h3 class="r-sub">${yearly ? '올해' : '이번 달'} 진료 수치</h3>${labTable(hl.labs.length > 1 ? hl.labs.slice(-4) : [labBefore(hl.labs[0]), hl.labs[0]].filter(Boolean), false)}` : ''}
    <p class="r-tip">${hl.on ? `'안 지킨 날'만 체크한 기록이에요. 주 목표는 일–토 기준, 다 지난 주만 셌어요. ` : ''}진료 수치는 지난 진료와 비교한 변화예요.</p></section>`;
  return [html, lines];
}
