'use strict';

/* ═════════════════ 일정 ═════════════════ */

const CATS = {
  work: { label: '공적', hint: '시험, 면접, 업무 마감처럼 공적인 일정' },
  life: { label: '사적', hint: '친구·가족 모임, 약속처럼 사적인 일정' },
  care: { label: '케어', hint: '투약·병원 진료 — 날마다 체크해서 기록해요' },
};
/* 케어 종류: 투약·처치(집에서 하는 약·수액 등) / 병원(진료·검사) */
const CARE_KINDS = {
  dose: { label: '투약·처치', short: '투약', hint: '집에서 하는 투약·처치 — 반복으로 등록하면 날마다 체크해요', yes: '먹였어요', no: '못 먹였어요', noShort: '못 먹임' },
  vet: { label: '병원', short: '병원', hint: '병원 진료·검사 — 다녀오면 체크해요. 진료 전 요약에 쓰여요', yes: '다녀왔어요', no: '안 갔어요', noShort: '안 감' },
};
const REP_LABEL = { d1: '매일', d2: '이틀마다', d3: '3일마다', w1: '매주', w2: '2주마다', m1: '매달' };
const repKey = (r) => (r ? `${r.t}${r.n}` : '');
const repLabel = (r) => (r ? REP_LABEL[repKey(r)] || `${r.n}${r.t === 'd' ? '일' : r.t === 'w' ? '주' : '달'}마다` : '');

const PILL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-45 12 12)"><rect x="3.5" y="8" width="17" height="8" rx="4"/><path d="M7.5 8H12v8H7.5a4 4 0 0 1 0-8z" fill="currentColor"/></g></svg>';
const CROSS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>';

/* 케어 일정은 날마다 '했음'을 체크해 기록한다 (투약, 병원 다녀옴) */
const checkable = (ev) => ev.cat === 'care';

/* '이 날만 바꾸기'로 만든 일정은 원래 반복의 한 회차다: of = 반복 일정 id, ok = 원래 날짜.
 * 반복 쪽에서는 그 날짜가 ex로 빠지고, 이 일정이 대신 그 회차를 맡는다. */
const seriesOf = (ev) => (ev.of ? state.events.find((x) => x.id === ev.of && x.rep) : null);
const overridesOf = (series) => state.events.filter((x) => x.of === series.id);
/* 케어 종류. ck가 없는 예전 일정은 반복(또는 이 날만 바꾼 회차)이면 투약, 아니면 병원으로 본다 */
const careKind = (ev) => (checkable(ev) ? ev.ck || (ev.rep || ev.of ? 'dose' : 'vet') : null);
/* 투약 회차 — 달력에선 알약 표시, 리포트에선 투약 기록 */
const isDose = (ev) => careKind(ev) === 'dose';
const isVet = (ev) => careKind(ev) === 'vet';

/* 반복 일정의 from–to 사이 회차들 (이 날만 바꾼 회차 포함): [{ ev, k }] */
function seriesDays(series, from, to) {
  const out = [];
  for (let k = from > series.date ? from : series.date; k <= to && (!series.until || k <= series.until); k = addDays(k, 1)) {
    if (occursOn(series, k)) out.push({ ev: series, k });
  }
  for (const o of overridesOf(series)) if (o.date >= from && o.date <= to) out.push({ ev: o, k: o.date });
  return out.sort((a, b) => a.k.localeCompare(b.k));
}

/* 반복 일정의 다음 회차 (이 날만 바꾼 회차 포함): { ev, k } | null */
function nextOfSeries(series, from) {
  const cands = overridesOf(series).filter((o) => o.date >= from).map((o) => ({ ev: o, k: o.date }));
  const n = nextOccurrence(series, from);
  if (n) cands.push({ ev: series, k: n });
  return cands.sort((a, b) => a.k.localeCompare(b.k))[0] || null;
}

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

/* 케어 기록은 세 가지: 했음(done) · 못 했음(skip, 예: 못 먹임·안 감) · 기록 없음(둘 다 없음) */
const isDone = (ev, k) => !!(ev.done && ev.done[k]);
const isSkipped = (ev, k) => !!(ev.skip && ev.skip[k]);

function setCareRecord(ev, k, rec) { // rec: 'done' | 'skip' | null
  for (const f of ['done', 'skip']) {
    if (ev[f]) { delete ev[f][k]; if (!Object.keys(ev[f]).length) delete ev[f]; }
  }
  if (rec) ev[rec] = { ...(ev[rec] || {}), [k]: Date.now() };
}

/* 기록(했음·못 했음)을 다른 일정·날짜로 옮긴다 ('이 날만 바꾸기', 되돌리기) */
function moveRecord(from, fk, to, tk) {
  const rec = isDone(from, fk) ? 'done' : isSkipped(from, fk) ? 'skip' : null;
  if (!rec) return;
  setCareRecord(from, fk, null);
  setCareRecord(to, tk, rec);
}

function toggleEventDone(id, k) {
  const ev = state.events.find((x) => x.id === id);
  if (!ev) return;
  const was = isDone(ev, k);
  setCareRecord(ev, k, was ? null : 'done');
  if (!was && navigator.vibrate) navigator.vibrate(8);
  save();
  render();
}

/* 오늘 화면·캘린더에서 같이 쓰는 일정 한 줄 */
function eventRow(ev, k) {
  const done = isDone(ev, k);
  const kind = careKind(ev);
  const skipped = kind && !done && isSkipped(ev, k);
  const changed = ev.of ? (ev.ok && ev.ok !== ev.date ? `이 날만 변경 (원래 ${md(ev.ok)})` : '이 날만 변경') : '';
  const meta = [CATS[ev.cat].label + (kind ? ` · ${CARE_KINDS[kind].short}` : ''), repLabel(ev.rep), changed].filter(Boolean).join(' · ');
  const late = kind && !done && !skipped && k < today;
  return `<li class="ev cat-${ev.cat}${done ? ' done' : ''}${skipped ? ' skipped' : ''}" data-eid="${ev.id}" data-k="${k}">
    <span class="ev-time">${ev.time || '종일'}</span>
    <span class="ev-body">
      <span class="ev-title">${esc(ev.title)}</span>
      <span class="ev-meta">${meta}${late ? ' · <em>기록 없음</em>' : ''}${skipped ? ` · <em class="muted">${CARE_KINDS[kind].noShort}</em>` : ''}${ev.memo ? ` · ${esc(ev.memo)}` : ''}</span>
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
let sheetKind = 'vet';

function setCat(cat) {
  sheetCat = cat;
  for (const b of $('cat-pick').children) b.setAttribute('aria-checked', String(b.dataset.cat === cat));
  $('care-kind').hidden = cat !== 'care';
  if (cat === 'care') setKind(sheetKind);
  else { $('cat-hint').textContent = CATS[cat].hint; $('vet-hint').hidden = true; }
  renderSheetRecord();
}

function setKind(kind) {
  sheetKind = kind;
  for (const b of $('care-kind').children) b.setAttribute('aria-checked', String(b.dataset.kind === kind));
  $('cat-hint').textContent = CARE_KINDS[kind].hint;
  renderVetHint();
  renderSheetRecord();
}

/* 병원 일정: 지난 진료일에서 4주·5주 뒤 날짜를 눌러 바로 채울 수 있게 (날짜는 직접 골라도 된다) */
function renderVetHint() {
  const el = $('vet-hint');
  const last = sheetCat === 'care' && sheetKind === 'vet' ? lastVisit(sheetCtx && sheetCtx.id ? sheetCtx.k : addDays(today, 1)) : null;
  el.hidden = !last;
  if (!last) return;
  const w4 = addDays(last.k, 28);
  const w5 = addDays(last.k, 35);
  el.innerHTML = `<span>지난 진료 ${md(last.k)}</span>
    <button type="button" data-d="${w4}">4주 후 ${md(w4)}</button>
    <button type="button" data-d="${w5}">5주 후 ${md(w5)}</button>`;
}

/* 수정할 때: 그 날의 케어 기록(했음 / 못 했음 / 기록 없음)을 바로 바꾼다 */
function renderSheetRecord() {
  const el = $('sheet-record');
  const ev = sheetCtx && sheetCtx.id ? state.events.find((x) => x.id === sheetCtx.id) : null;
  const kind = ev && careKind(ev);
  el.hidden = !kind || sheetCat !== 'care';
  if (el.hidden) return;
  const k = sheetCtx.k;
  const cur = isDone(ev, k) ? 'done' : isSkipped(ev, k) ? 'skip' : '';
  const K = CARE_KINDS[kind];
  el.innerHTML = `<span class="sr-label">${md(k)} 기록</span>
    <div class="sr-opts">${[['done', K.yes], ['skip', K.no], ['', '기록 없음']]
      .map(([v, l]) => `<button type="button" data-rec="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
}

/* preset: 새 일정 기본값 (예: 캘린더의 '투약 일정 추가') */
function openSheet({ id = null, k = ui.calSel || today, preset = null } = {}) {
  const ev = id ? state.events.find((x) => x.id === id) : null;
  sheetCtx = { id: ev ? ev.id : null, k };
  const src = ev || preset || {};
  $('sheet-title').textContent = ev ? '일정 수정' : '일정 추가';
  $('ev-title').value = src.title || '';
  sheetKind = careKind(src.cat === 'care' ? src : {}) || 'vet';
  $('ev-date').value = k;
  $('ev-time').value = src.time || '';
  $('ev-rep').value = repKey(src.rep);
  $('ev-memo').value = src.memo || '';
  $('ev-del').hidden = !ev;
  $('ev-revert').hidden = !(ev && seriesOf(ev));
  setCat(src.cat || 'work');
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
$('care-kind').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (b) setKind(b.dataset.kind);
});
$('vet-hint').addEventListener('click', (e) => {
  const b = e.target.closest('[data-d]');
  if (b) $('ev-date').value = b.dataset.d;
});
$('sheet-record').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rec]');
  const ev = b && state.events.find((x) => x.id === sheetCtx.id);
  if (!ev) return;
  setCareRecord(ev, sheetCtx.k, b.dataset.rec || null);
  save();
  render();
  renderSheetRecord();
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
    ck: sheetCat === 'care' ? sheetKind : undefined,
  };
  for (const key of Object.keys(f)) if (f[key] === undefined) delete f[key];
  return f;
}

/* 반복 일정을 '이 날부터' 바꾸거나 지울 때: 원래 반복은 전날까지로 끝내고 기록을 나눈다 */
function splitAt(ev, k) {
  const later = {};
  for (const f of ['done', 'skip']) {
    for (const d in ev[f] || {}) {
      if (d < k) continue;
      later[f] = { ...(later[f] || {}), [d]: ev[f][d] };
      delete ev[f][d];
    }
  }
  if (k <= ev.date) state.events = state.events.filter((x) => x !== ev);
  else ev.until = addDays(k, -1);
  return later;
}

/* 반복 일정의 k일 회차만 바꾼다: 반복에서 그 날을 빼고(ex), 바꾼 내용으로 한 번짜리 일정을 만든다 */
function overrideOne(series, k, f) {
  series.ex = [...new Set([...(series.ex || []), k])];
  const one = { id: uid(), ...f, of: series.id, ok: k };
  delete one.rep;
  moveRecord(series, k, one, one.date);
  state.events.push(one);
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
    scope = await choose('반복 일정이에요. 어떻게 바꿀까요?', [
      { label: '이 날만 바꾸기', value: 'one' },
      { label: '이 날부터 바꾸기', value: 'after' },
      { label: '모든 반복 일정 바꾸기', value: 'all' },
    ]);
    if (!scope) return;
  }

  if (scope === 'one') {
    overrideOne(ev, ctx.k, f);
  } else if (scope === 'all') {
    // 날짜를 옮겼다면 반복 시작일도 같은 만큼 옮긴다
    const next = { id: ev.id, ...f, date: f.rep ? addDays(ev.date, diffDays(f.date, ctx.k)) : f.date };
    if (f.rep && ev.until) next.until = ev.until;
    if (f.rep && ev.ex) next.ex = ev.ex;
    if (!f.rep && ev.of) { next.of = ev.of; next.ok = ev.ok; } // 이 날만 바꾼 회차를 다시 고칠 때
    if (ev.done) next.done = ev.done;
    if (ev.skip) next.skip = ev.skip;
    state.events[state.events.indexOf(ev)] = next;
  } else {
    const later = splitAt(ev, ctx.k);
    const next = { id: uid(), ...f, ...later };
    state.events.push(next);
    // 이 날 이후에 따로 바꿔 둔 회차는 새 반복에 이어 붙인다
    for (const o of overridesOf(ev)) if (o.ok >= ctx.k) o.of = next.id;
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
      setCareRecord(cur, ctx.k, null);
    } else if (scope === 'after') {
      state.events = state.events.filter((x) => !(x.of === cur.id && x.ok >= ctx.k));
      splitAt(cur, ctx.k);
    } else {
      // 반복 일정을 모두 지우면 이 날만 바꿔 둔 회차도 함께 지운다
      state.events = state.events.filter((x) => x.id !== ctx.id && x.of !== ctx.id);
    }
  });
});

/* 이 날만 바꾼 회차를 원래 반복 일정대로 되돌린다 */
$('ev-revert').addEventListener('click', () => {
  const ctx = sheetCtx;
  closeSheet();
  undoable('반복 일정대로 되돌렸어요', () => {
    const one = state.events.find((x) => x.id === ctx.id);
    const series = one && seriesOf(one);
    if (!series) return;
    series.ex = (series.ex || []).filter((d) => d !== one.ok);
    if (!series.ex.length) delete series.ex;
    moveRecord(one, one.date, series, one.ok);
    state.events = state.events.filter((x) => x !== one);
    ui.calSel = one.ok;
    ui.calMonth = monthStart(one.ok);
  });
});

function afterSave(k) {
  ui.calSel = k;
  ui.calMonth = monthStart(k);
  render();
}
