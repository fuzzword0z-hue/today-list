'use strict';

/* ═════════════════ 고양이 케어: 컨디션 기록 · 체크 누락 확인 · 진료 전 요약 ═════════════════
 * state.cond = { 'YYYY-MM-DD': { ap, en, vo, st, w, n } }
 *   ap 식욕 · en 활력 · vo 구토 · st 배변 (아래 COND의 값) · w 체중(kg) · n 메모 */

const COND = [
  { f: 'ap', label: '식욕', opts: [['good', '잘 먹음'], ['normal', '보통'], ['low', '적게'], ['none', '안 먹음']], bad: ['low', 'none'] },
  { f: 'en', label: '활력', opts: [['good', '좋음'], ['normal', '보통'], ['low', '처짐']], bad: ['low'] },
  { f: 'vo', label: '구토', opts: [['0', '없음'], ['1', '1회'], ['2', '2회 이상']], bad: ['1', '2'] },
  { f: 'st', label: '배변', opts: [['normal', '정상'], ['loose', '묽음·설사'], ['hard', '변비']], bad: ['loose', 'hard'] },
];
const PAW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16" rx="4.6" ry="3.6"/><circle cx="6" cy="10.5" r="1.8"/><circle cx="9.6" cy="6.6" r="1.8"/><circle cx="14.4" cy="6.6" r="1.8"/><circle cx="18" cy="10.5" r="1.8"/></svg>';
const PROMPT_DAYS = 3; // 오늘 화면에서 체크가 빠진 케어를 물어보는 기간 (어제부터 며칠 전까지)

const optLabel = (f, v) => { const c = COND.find((x) => x.f === f); const o = c && c.opts.find((x) => x[0] === v); return o ? o[1] : ''; };
const condOf = (k) => state.cond[k] || null;
const isBad = (f, v) => COND.find((x) => x.f === f).bad.includes(v);
const hasSymptom = (c) => !!c && COND.some((x) => c[x.f] && isBad(x.f, c[x.f]));
const fmtKg = (w) => `${Math.round(w * 100) / 100}kg`;
const ml = (k) => `${parse(k).getMonth() + 1}/${parse(k).getDate()}`;
const agoText = (n) => (n < 7 ? `${n}일 전` : `${Math.floor(n / 7)}주${n % 7 ? ` ${n % 7}일` : ''} 전`);

/* 한 줄 요약: 이상 있는 항목 + 체중 */
function condSummary(c) {
  if (!c) return '';
  const bad = COND.filter((x) => c[x.f] && isBad(x.f, c[x.f])).map((x) => `${x.label} ${optLabel(x.f, c[x.f])}`);
  const recorded = COND.some((x) => c[x.f]);
  const parts = bad.length ? bad : recorded ? ['특이 사항 없음'] : [];
  if (c.w) parts.push(fmtKg(c.w));
  if (!parts.length && c.n) parts.push('메모');
  return parts.join(' · ');
}

/* ───────── 병원 진료 찾기 ───────── */
function vetEvents() { return state.events.filter(isVet); }

/* from–to 사이의 진료 회차들: [{ ev, k }] */
function vetDays(from, to) {
  const out = [];
  for (const ev of vetEvents()) {
    if (!ev.rep) { if (ev.date >= from && ev.date <= to) out.push({ ev, k: ev.date }); continue; }
    for (let k = from > ev.date ? from : ev.date; k <= to && (!ev.until || k <= ev.until); k = addDays(k, 1)) {
      if (occursOn(ev, k)) out.push({ ev, k });
    }
  }
  return out.sort((a, b) => a.k.localeCompare(b.k));
}

/* before 이전(미포함)의 가장 최근 진료 ('안 감'으로 기록한 날은 뺀다) */
function lastVisit(before) {
  let best = null;
  for (const ev of vetEvents()) {
    if (!ev.rep) {
      if (ev.date < before && !isSkipped(ev, ev.date) && (!best || ev.date > best.k)) best = { ev, k: ev.date };
      continue;
    }
    for (let i = 1, k = addDays(before, -1); i <= 400 && k >= ev.date; i++, k = addDays(k, -1)) {
      if (occursOn(ev, k) && !isSkipped(ev, k)) { if (!best || k > best.k) best = { ev, k }; break; }
    }
  }
  return best;
}

/* from 이후(포함)의 가장 가까운 진료 */
function nextVisit(from) {
  let best = null;
  for (const ev of vetEvents()) {
    let k = null;
    if (!ev.rep) k = ev.date >= from ? ev.date : null;
    else {
      // 반복 진료: '안 감'으로 기록한 회차는 건너뛰고 그다음 회차
      for (let d = from, i = 0; d && i < 50; i++) {
        const n = nextOccurrence(ev, d);
        if (!n) break;
        if (!isSkipped(ev, n)) { k = n; break; }
        d = addDays(n, 1);
      }
    }
    if (k && !isSkipped(ev, k) && (!best || k < best.k || (k === best.k && (ev.time || '') < (best.ev.time || '')))) best = { ev, k };
  }
  return best;
}

/* ───────── 오늘 화면: 체크가 빠진 케어 물어보기 ───────── */
function missingCare() {
  const out = [];
  for (let i = 1; i <= PROMPT_DAYS; i++) {
    const k = addDays(today, -i);
    for (const ev of eventsOn(k)) {
      if (careKind(ev) && !isDone(ev, k) && !isSkipped(ev, k)) out.push({ ev, k });
    }
  }
  return out;
}

function renderCarePrompts() {
  const el = $('care-prompts');
  const list = ui.date === today ? missingCare() : [];
  el.innerHTML = list.map(({ ev, k }) => {
    const K = CARE_KINDS[careKind(ev)];
    const q = careKind(ev) === 'vet' ? `${esc(ev.title)} 다녀왔나요?` : `${esc(ev.title)} 체크가 없어요`;
    return `<div class="banner care-prompt" data-eid="${ev.id}" data-k="${k}">
      <span class="banner-text"><b>${relDay(k)}(${ml(k)})</b> ${q}</span>
      <button class="cp-btn yes" data-rec="done">${K.yes}</button>
      <button class="cp-btn" data-rec="skip">${K.no}</button>
    </div>`;
  }).join('');
}

$('care-prompts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rec]');
  const box = b && b.closest('.care-prompt');
  const ev = box && state.events.find((x) => x.id === box.dataset.eid);
  if (!ev) return;
  const k = box.dataset.k;
  undoable(`${ml(k)} ${ev.title}: ${b.textContent}로 기록했어요`, () => {
    setCareRecord(state.events.find((x) => x.id === ev.id), k, b.dataset.rec);
  });
});

/* ───────── 오늘 화면: 컨디션 카드 ───────── */
let condOpenFor = null; // 펼쳐 둔 날짜

function renderCond() {
  const k = ui.date;
  const el = $('cond');
  const c = condOf(k);
  const show = k <= today && (c || state.events.some((ev) => ev.cat === 'care'));
  el.hidden = !show;
  if (!show) return;
  const open = condOpenFor === k;
  const sum = condSummary(c);
  el.innerHTML = `
    <button class="cond-head" aria-expanded="${open}">
      <span class="cond-ic">${PAW_SVG}</span>
      <span class="cond-title">고양이 컨디션</span>
      <span class="cond-sum${hasSymptom(c) ? ' bad' : ''}">${sum ? esc(sum) : '기록하기'}</span>
      <svg class="cond-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    ${open ? `<div class="cond-body">
      ${COND.map((x) => `<div class="cond-row"><span class="cond-label">${x.label}</span><div class="chips" data-f="${x.f}">
        ${x.opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${!!c && c[x.f] === v}" class="${x.bad.includes(v) ? 'bad' : ''}">${l}</button>`).join('')}
      </div></div>`).join('')}
      <div class="cond-row"><span class="cond-label">체중</span>
        <input class="cond-w" id="cond-w" type="number" inputmode="decimal" step="0.01" min="0" max="30" placeholder="0.00" value="${c && c.w ? c.w : ''}"><span class="cond-unit">kg</span>
        ${lastWeight(k) ? `<span class="cond-prev">지난 ${fmtKg(lastWeight(k).w)} (${ml(lastWeight(k).k)})</span>` : ''}
      </div>
      <textarea class="cond-memo" id="cond-memo" rows="2" maxlength="500" placeholder="메모 (먹은 양, 약 반응, 특이 사항 등)">${c && c.n ? esc(c.n) : ''}</textarea>
      <p class="cond-help">고른 항목을 한 번 더 누르면 지워져요. 진료 전 요약과 월간 리포트에 쓰여요.</p>
    </div>` : ''}`;
}

function lastWeight(before) {
  const ks = Object.keys(state.cond).filter((k) => k < before && state.cond[k].w).sort();
  const k = ks[ks.length - 1];
  return k ? { k, w: state.cond[k].w } : null;
}

function setCond(k, f, v) {
  const c = { ...(state.cond[k] || {}) };
  if (v === undefined || v === null || v === '') delete c[f];
  else c[f] = v;
  if (Object.keys(c).length) state.cond[k] = c;
  else delete state.cond[k];
  save();
}

$('cond').addEventListener('click', (e) => {
  if (e.target.closest('.cond-head')) {
    condOpenFor = condOpenFor === ui.date ? null : ui.date;
    renderCond();
    return;
  }
  const b = e.target.closest('.chips [data-v]');
  if (!b) return;
  const f = b.parentElement.dataset.f;
  const cur = condOf(ui.date);
  setCond(ui.date, f, cur && cur[f] === b.dataset.v ? null : b.dataset.v);
  // 칸만 다시 그려서 입력 중인 체중·메모가 흔들리지 않게
  for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(!!condOf(ui.date) && condOf(ui.date)[f] === x.dataset.v));
  updateCondHead();
});
$('cond').addEventListener('input', (e) => {
  if (e.target.id === 'cond-w') {
    const w = parseFloat(e.target.value);
    setCond(ui.date, 'w', w > 0 && w < 30 ? Math.round(w * 100) / 100 : null);
  } else if (e.target.id === 'cond-memo') {
    setCond(ui.date, 'n', e.target.value.trim() || null);
  } else return;
  updateCondHead();
});

function updateCondHead() {
  const c = condOf(ui.date);
  const s = $('cond').querySelector('.cond-sum');
  if (!s) return;
  const sum = condSummary(c);
  s.textContent = sum || '기록하기';
  s.classList.toggle('bad', hasSymptom(c));
}

/* ───────── 진료 전 요약 ───────── */
function careSummaryData() {
  const last = lastVisit(today);
  const next = nextVisit(today);
  const from = last ? addDays(last.k, 1) : addDays(today, -30);
  const to = today;
  const days = diffDays(to, from) + 1;

  // 투약: 반복 투약별로 먹임 / 못 먹임 / 기록 없음 (오늘 회차는 체크 전이면 빼고 센다)
  const doses = state.events.filter((ev) => isDose(ev) && ev.rep).map((ev) => {
    const r = { ev, sched: 0, given: 0, skipped: [], missing: [] };
    for (const d of seriesDays(ev, from, to)) {
      if (d.k === today && !isDone(d.ev, d.k) && !isSkipped(d.ev, d.k)) continue;
      r.sched++;
      if (isDone(d.ev, d.k)) r.given++;
      else if (isSkipped(d.ev, d.k)) r.skipped.push(d.k);
      else r.missing.push(d.k);
    }
    return r;
  }).filter((r) => r.sched);

  // 컨디션
  const recs = [];
  for (let k = from; k <= to; k = addDays(k, 1)) if (condOf(k)) recs.push([k, condOf(k)]);
  const count = (f) => {
    const c = {};
    for (const [k, r] of recs) if (r[f]) (c[r[f]] = c[r[f]] || []).push(k);
    return c;
  };
  const vomit = recs.filter(([, r]) => r.vo && r.vo !== '0').map(([k, r]) => ({ k, n: +r.vo }));
  const weights = recs.filter(([, r]) => r.w).map(([k, r]) => ({ k, w: r.w }));
  const notes = recs.filter(([, r]) => r.n).map(([k, r]) => ({ k, n: r.n }));
  return { last, next, from, to, days, doses, recs, ap: count('ap'), en: count('en'), st: count('st'), vomit, weights, notes };
}

function renderCareSummary() {
  $('report-title').textContent = '진료 전 요약';
  const s = careSummaryData();
  const el = $('report');
  const dl = (ks) => ks.map(ml).join(', ');
  const lines = []; // 복사용 텍스트
  const sec = [];

  const head = `${md(s.from)} – ${md(s.to)} (${s.days}일)${s.last ? ` · 지난 진료 ${md(s.last.k)}` : ' · 지난 진료 기록 없음 (최근 30일)'}`;
  lines.push(`[진료 전 요약] ${head}`);
  if (s.next) lines.push(`다음 진료: ${mdw(s.next.k)}${s.next.ev.time ? ` ${s.next.ev.time}` : ''} (${dday(s.next.k)})${s.next.ev.memo ? ` · ${s.next.ev.memo}` : ''}`);

  // 투약
  if (s.doses.length) {
    const items = s.doses.map((r) => {
      const t = `${r.ev.title} (${repLabel(r.ev.rep)}): ${r.sched}회 중 ${r.given}회 먹임`
        + (r.skipped.length ? ` · 못 먹임 ${r.skipped.length}회 (${dl(r.skipped)})` : '')
        + (r.missing.length ? ` · 기록 없음 ${r.missing.length}회 (${dl(r.missing)})` : '');
      return t;
    });
    sec.push(['투약', items]);
  }

  // 컨디션
  const cond = [];
  if (s.recs.length) {
    cond.push(`기록한 날 ${s.recs.length}일 / ${s.days}일`);
    for (const x of COND.filter((c) => c.f !== 'vo')) {
      const cnt = s[x.f];
      const parts = x.opts.filter(([v]) => cnt[v]).map(([v, l]) => `${l} ${cnt[v].length}일${x.bad.includes(v) ? ` (${dl(cnt[v])})` : ''}`);
      if (parts.length) cond.push(`${x.label}: ${parts.join(' · ')}`);
    }
    if (s.vomit.length) {
      const total = s.vomit.reduce((a, v) => a + v.n, 0);
      cond.push(`구토: ${s.vomit.length}일, ${total}회${s.vomit.some((v) => v.n >= 2) ? ' 이상' : ''} (${s.vomit.map((v) => `${ml(v.k)}${v.n >= 2 ? ' 2회+' : ''}`).join(', ')})`);
    } else if (s.recs.some(([, r]) => r.vo === '0')) cond.push('구토: 없음');
  }
  if (s.weights.length) {
    const a = s.weights[0];
    const b = s.weights[s.weights.length - 1];
    const d = Math.round((b.w - a.w) * 100) / 100;
    const pctv = a.w ? Math.round((d / a.w) * 1000) / 10 : 0;
    cond.push(s.weights.length > 1
      ? `체중: ${fmtKg(a.w)} (${ml(a.k)}) → ${fmtKg(b.w)} (${ml(b.k)}) · ${d > 0 ? '+' : ''}${d}kg (${pctv > 0 ? '+' : ''}${pctv}%)`
      : `체중: ${fmtKg(a.w)} (${ml(a.k)})`);
    if (s.weights.length > 2) cond.push(`체중 기록: ${s.weights.map((x) => `${ml(x.k)} ${x.w}`).join(' · ')}`);
  }
  if (cond.length) sec.push(['컨디션', cond]);
  if (s.notes.length) sec.push(['메모', s.notes.map((x) => `${ml(x.k)} ${x.n}`)]);

  for (const [h, items] of sec) { lines.push('', h, ...items.map((t) => `- ${t}`)); }
  lastReportText = lines.join('\n');

  if (!sec.length) {
    el.innerHTML = `<p class="r-period">${esc(head)}</p><div class="r-empty">아직 요약할 기록이 없어요.<br>오늘 화면의 '고양이 컨디션'과 투약 체크가 쌓이면 여기에 정리돼요.</div>`;
    lastReportText = '';
    return;
  }

  el.innerHTML = `
    <p class="r-period">${esc(head)}</p>
    ${s.next ? `<section class="r-sec cs-next"><h2>다음 진료</h2>
      <ul class="up-list"><li class="up cat-care"><span class="dday">${dday(s.next.k)}</span>
        <span class="up-body"><span class="up-title">${esc(s.next.ev.title)}</span>
        <span class="up-sub">${mdw(s.next.k)}${s.next.ev.time ? ` ${s.next.ev.time}` : ''}${s.next.ev.memo ? ` · ${esc(s.next.ev.memo)}` : ''}</span></span></li></ul></section>` : ''}
    ${sec.map(([h, items]) => `<section class="r-sec cs"><h2>${h}</h2><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('')}
    <p class="r-note">'텍스트 복사'로 복사해서 병원에 보여 주거나 메모에 붙여 넣을 수 있어요.</p>`;
}

function openCareSummary() { go('report', { push: true, id: 'care' }); }
