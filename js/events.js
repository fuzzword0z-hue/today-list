'use strict';

/* ═════════════════ 일정 ═════════════════ */

const CATS = {
  work: { label: '공적', hint: '시험, 면접, 업무 마감처럼 공적인 일정' },
  life: { label: '사적', hint: '친구·가족 모임, 약속처럼 사적인 일정' },
  care: { label: '케어', hint: '투약·병원 진료 — 날마다 체크해서 기록해요' },
};
const REP_LABEL = { d1: '매일', d2: '이틀마다', d3: '3일마다', w1: '매주', w2: '2주마다', m1: '매달' };
const repKey = (r) => (r ? `${r.t}${r.n}` : '');
const repLabel = (r) => (r ? REP_LABEL[repKey(r)] || `${r.n}${r.t === 'd' ? '일' : r.t === 'w' ? '주' : '달'}마다` : '');

const PILL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-45 12 12)"><rect x="3.5" y="8" width="17" height="8" rx="4"/><path d="M7.5 8H12v8H7.5a4 4 0 0 1 0-8z" fill="currentColor"/></g></svg>';
const CROSS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';

/* 케어 일정은 날마다 '했음'을 체크해 기록한다 (투약, 병원 다녀옴) */
const checkable = (ev) => ev.cat === 'care';

function occursOn(ev, k) {
  if (k < ev.date) return false;
  if (ev.until && k > ev.until) return false;
  if (ev.ex && ev.ex.includes(k)) return false;
  const r = ev.rep;
  if (!r) return k === ev.date;
  if (r.t === 'd') return diffDays(k, ev.date) % r.n === 0;
  if (r.t === 'w') return diffDays(k, ev.date) % (7 * r.n) === 0;
  // 매달: 같은 날짜. 31일처럼 없는 날짜면 그 달의 마지막 날
  const a = parse(ev.date);
  const b = parse(k);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (months % r.n) return false;
  const last = new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate();
  return b.getDate() === Math.min(a.getDate(), last);
}

function eventsOn(k) {
  return state.events
    .filter((ev) => occursOn(ev, k))
    .sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title));
}

function nextOccurrence(ev, from) {
  for (let i = 0, k = from; i < 400; i++, k = addDays(k, 1)) {
    if (ev.until && k > ev.until) return null;
    if (occursOn(ev, k)) return k;
  }
  return null;
}

const isDone = (ev, k) => !!(ev.done && ev.done[k]);

function toggleEventDone(id, k) {
  const ev = state.events.find((x) => x.id === id);
  if (!ev) return;
  ev.done = ev.done || {};
  if (ev.done[k]) delete ev.done[k];
  else {
    ev.done[k] = Date.now();
    if (navigator.vibrate) navigator.vibrate(8);
  }
  save();
  render();
}

/* 오늘 화면·캘린더에서 같이 쓰는 일정 한 줄 */
function eventRow(ev, k) {
  const done = isDone(ev, k);
  const meta = [CATS[ev.cat].label, repLabel(ev.rep)].filter(Boolean).join(' · ');
  const late = checkable(ev) && !done && k < today;
  return `<li class="ev cat-${ev.cat}${done ? ' done' : ''}" data-eid="${ev.id}" data-k="${k}">
    <span class="ev-time">${ev.time || '종일'}</span>
    <span class="ev-body">
      <span class="ev-title">${esc(ev.title)}</span>
      <span class="ev-meta">${meta}${late ? ' · <em>기록 없음</em>' : ''}${ev.memo ? ` · ${esc(ev.memo)}` : ''}</span>
    </span>
    ${checkable(ev) ? `<button class="ev-check" aria-pressed="${done}" aria-label="${esc(ev.title)} ${done ? '완료 취소' : '완료'}">${CHECK_SVG}</button>` : ''}
  </li>`;
}

/* 일정 목록 공통 클릭 처리: 체크 버튼 → 완료 기록, 나머지 → 수정 시트 */
function bindEventList(el) {
  el.addEventListener('click', (e) => {
    const li = e.target.closest('.ev');
    if (!li) return;
    if (e.target.closest('.ev-check')) toggleEventDone(li.dataset.eid, li.dataset.k);
    else openSheet({ id: li.dataset.eid, k: li.dataset.k });
  });
}

/* ───────── 추가 / 수정 시트 ───────── */
let sheetCtx = null; // { id?, k }
let sheetCat = 'work';

function setCat(cat) {
  sheetCat = cat;
  for (const b of $('cat-pick').children) b.setAttribute('aria-checked', String(b.dataset.cat === cat));
  $('cat-hint').textContent = CATS[cat].hint;
}

/* preset: 새 일정 기본값 (예: 캘린더의 '투약 일정 추가') */
function openSheet({ id = null, k = ui.calSel || today, preset = null } = {}) {
  const ev = id ? state.events.find((x) => x.id === id) : null;
  sheetCtx = { id: ev ? ev.id : null, k };
  const src = ev || preset || {};
  $('sheet-title').textContent = ev ? '일정 수정' : '일정 추가';
  $('ev-title').value = src.title || '';
  setCat(src.cat || 'work');
  $('ev-date').value = k;
  $('ev-time').value = src.time || '';
  $('ev-rep').value = repKey(src.rep);
  $('ev-memo').value = src.memo || '';
  $('ev-del').hidden = !ev;
  $('sheet').hidden = false;
  if (!ev && !preset) setTimeout(() => $('ev-title').focus(), 50);
}

function closeSheet() {
  $('sheet').hidden = true;
  sheetCtx = null;
  document.activeElement.blur();
}

$('cat-pick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (b) setCat(b.dataset.cat);
});
$('ev-time-clear').addEventListener('click', () => { $('ev-time').value = ''; });
$('sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
$('sheet').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

function readForm() {
  const rep = $('ev-rep').value;
  const f = {
    title: $('ev-title').value.trim(),
    cat: sheetCat,
    date: $('ev-date').value,
    time: $('ev-time').value || undefined,
    memo: $('ev-memo').value.trim() || undefined,
    rep: rep ? { t: rep[0], n: +rep.slice(1) } : undefined,
  };
  for (const key of Object.keys(f)) if (f[key] === undefined) delete f[key];
  return f;
}

/* 반복 일정을 '이 날부터' 바꾸거나 지울 때: 원래 반복은 전날까지로 끝내고 기록을 나눈다 */
function splitAt(ev, k) {
  const later = {};
  for (const d in ev.done || {}) if (d >= k) { later[d] = ev.done[d]; delete ev.done[d]; }
  if (k <= ev.date) state.events = state.events.filter((x) => x !== ev);
  else ev.until = addDays(k, -1);
  return later;
}

$('ev-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = readForm();
  if (!f.title || !f.date) return;
  const ctx = sheetCtx;
  const ev = ctx.id ? state.events.find((x) => x.id === ctx.id) : null;

  if (!ev) {
    state.events.push({ id: uid(), ...f });
    save();
    closeSheet();
    afterSave(f.date);
    toast(`${md(f.date)}에 일정을 추가했어요`);
    return;
  }

  let scope = 'all';
  if (ev.rep) {
    scope = await choose('반복 일정이에요. 어디부터 바꿀까요?', [
      { label: '이 날부터 바꾸기', value: 'after' },
      { label: '모든 반복 일정 바꾸기', value: 'all' },
    ]);
    if (!scope) return;
  }

  if (scope === 'all') {
    // 날짜를 옮겼다면 반복 시작일도 같은 만큼 옮긴다
    const next = { id: ev.id, ...f, date: f.rep ? addDays(ev.date, diffDays(f.date, ctx.k)) : f.date };
    if (f.rep && ev.until) next.until = ev.until;
    if (f.rep && ev.ex) next.ex = ev.ex;
    if (ev.done) next.done = ev.done;
    state.events[state.events.indexOf(ev)] = next;
  } else {
    const later = splitAt(ev, ctx.k);
    const next = { id: uid(), ...f };
    if (Object.keys(later).length) next.done = later;
    state.events.push(next);
  }
  save();
  closeSheet();
  afterSave(f.date);
  toast('저장했어요');
});

$('ev-del').addEventListener('click', async () => {
  const ctx = sheetCtx;
  const ev = state.events.find((x) => x.id === ctx.id);
  if (!ev) return;
  let scope = 'all';
  if (ev.rep) {
    scope = await choose('반복 일정이에요. 어떻게 지울까요?', [
      { label: '이 날만 삭제', value: 'one' },
      { label: '이 날부터 삭제', value: 'after', danger: true },
      { label: '모든 반복 일정 삭제', value: 'all', danger: true },
    ]);
    if (!scope) return;
  }
  closeSheet();
  undoable('일정을 삭제했어요', () => {
    const cur = state.events.find((x) => x.id === ctx.id);
    if (scope === 'one') {
      cur.ex = [...(cur.ex || []), ctx.k];
      if (cur.done) delete cur.done[ctx.k];
    } else if (scope === 'after') {
      splitAt(cur, ctx.k);
    } else {
      state.events = state.events.filter((x) => x.id !== ctx.id);
    }
  });
});

function afterSave(k) {
  ui.calSel = k;
  ui.calMonth = monthStart(k);
  render();
}
