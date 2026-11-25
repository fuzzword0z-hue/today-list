'use strict';

/* ═════════════════ 가계부 (통계 탭 → [가계부]) ═════════════════
 * 매일 쓰는 가계부가 아니라, 급여일(매달 25일, 가끔 앞당겨짐)에 한 번 적고 흐름을 보는 표 (7-23).
 * 예전 구글 시트 그대로: 들어온 돈 · 나간 돈 · 모은 돈 → 남은 돈. 금액이 정해진 항목('매달 같은 돈')은 자동으로 채우고,
 * 매달 바뀌는 칸(급여 · 카드값 · 저축)만 적는다.
 * 신용카드로 한 달을 살고 급여일에 카드값을 0원으로 만들기 때문에 'M월 가계부' = M월 급여일에 적는 표:
 *   그날 낸 카드값 = 지난 한 달 쓴 돈, '쓸 돈 계획' = M월 급여일 ~ 다음 급여일 전날까지 쓸 돈 (다음 달 표에서 실제 카드값과 나란히).
 * state.budget = {
 *   items:  [{ id, label, g: 'in' | 'out' | 'save', amt?, card?, off? }]   amt가 있으면 매달 같은 돈 (그 달에 고치면 그 달만), card = 카드값
 *   cats:   [{ id, label, amt?, off? }]   쓸 돈 계획 항목 (식비 · 고양이 간식·캔 · 가족·친구 · 고양이 병원비)
 *   inst:   [{ id, label, total, n, start: 'YYYY-MM', done?: 'YYYY-MM' }]   할부: start 달 카드값부터 n번 (한꺼번에 갚으면 done)
 *   months: { 'YYYY-MM': { v: { 항목 id: 원 }, plan: { 계획 id: 원 }, fund?: 비상금 잔액, draw?: 비상금에서 꺼낸 돈,
 *                          bal: { 모은 돈 항목 id: 통장 잔액 }, memo? } }
 *   남은 돈이 모자란 달은 비상금에서 채운 금액(draw)을 적고, 남은 돈 = 들어온 − 나간 − 모은 + 꺼낸 돈.
 *   모아 둔 돈(bal)은 생각날 때 적는 통장 잔액 — 안 적은 달은 마지막에 적은 금액을 보여 준다 (투자 계좌는 오르내려서 자동으로 더하지 않는다).
 *   '비상금' 항목(id emerg)의 잔액은 fund에 둔다.
 * }   기본 항목은 core.js (BUDGET_ITEMS · BUDGET_CATS)
 * 좋다 · 나쁘다 판단 없이 숫자와 흐름만 보여 준다. 이 휴대폰에만 저장되고, 백업 파일에 함께 담긴다. */

const PAYDAY = 25;
const PAY_EARLY = 3; // 급여일이 앞당겨질 때를 위해 22일부터 그 달 가계부로 본다
const INST_MAX = 5;
const B_GROUPS = [['in', '들어온 돈'], ['out', '나간 돈'], ['save', '모은 돈']];
const ymOf = (k) => k.slice(0, 7);
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const ymDiff = (a, b) => { const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };
const ymName = (ym) => `${ym.slice(0, 4)}년 ${+ym.slice(5)}월`;
/* 오늘이 어느 달 가계부에 속하는지: 22일부터는 그 달, 그 전은 지난달 */
const cycleMonth = (k = today) => (parse(k).getDate() >= PAYDAY - PAY_EARLY ? ymOf(k) : ymAdd(ymOf(k), -1));
/* 그 달 급여일 (짐작): 25일이 주말 · 성탄절이면 그 앞 평일. 설 · 추석처럼 해마다 바뀌는 휴일은 알 수 없어서
 * 그런 달은 22일부터 통계 → 가계부를 직접 열면 그 달 표가 나온다 */
function payKey(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, PAYDAY);
  const off = () => d.getDay() === 0 || d.getDay() === 6 || (m === 12 && d.getDate() === 25);
  while (off()) d.setDate(d.getDate() - 1);
  return keyOf(d);
}
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
/* 짧게: 1,560,000 → 156만, 952,000 → 95.2만 */
const man = (n) => (Math.abs(n) < 10000 ? won(n) : `${Math.round(n / 1000) / 10}만`);
const digits = (s) => { const t = String(s).replace(/[^\d]/g, ''); return t ? Math.min(+t, 1e10) : null; };
const comma = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('ko-KR'));

const B = () => state.budget;
const bm = (ym) => B().months[ym] || {};
/* 그 달에 보일 항목: 쓰는 항목 + 뺐더라도 그 달에 적어 둔 항목 */
const bItems = (ym, g) => B().items.filter((x) => x.g === g && (!x.off || (bm(ym).v || {})[x.id] !== undefined));
const bStored = (ym, x) => (bm(ym).v || {})[x.id];
const bVal = (ym, x) => (bStored(ym, x) !== undefined ? bStored(ym, x) : x.off ? 0 : x.amt || 0);
const bSum = (ym, g) => bItems(ym, g).reduce((a, x) => a + bVal(ym, x), 0);
const bLeft = (ym) => bSum(ym, 'in') - bSum(ym, 'out') - bSum(ym, 'save');
/* 비상금에서 꺼낸 돈까지 더한 남은 돈 */
const bFinal = (ym) => bLeft(ym) + (bm(ym).draw || 0);
const cardSum = (ym) => B().items.filter((x) => x.card).reduce((a, x) => a + (bStored(ym, x) || 0), 0);
const bHas = (ym) => !!B().months[ym] && Object.keys(B().months[ym].v || {}).length > 0;

/* 할부: ym 카드값에 들어가는 몫 (start ≤ ym < start + n, 한꺼번에 갚은 달 뒤로는 없음) */
const instAmt = (x) => Math.round(x.total / x.n);
const instDue = (ym) => B().inst.filter((x) => ym >= x.start && ymDiff(x.start, ym) < x.n && (!x.done || ym <= x.done));
/* ym 카드값까지 낸 뒤 남은 횟수 */
const instLeft = (x, ym) => (x.done && x.done <= ym ? 0 : Math.max(0, x.n - Math.max(0, ymDiff(x.start, ym) + 1)));

/* 쓸 돈 계획: 그 달에 적은 값 → 없으면 지난달 계획 → 기본 금액 */
function planVal(ym, c) {
  for (let i = 0, m = ym; i < 12; i++, m = ymAdd(m, -1)) {
    const v = (bm(m).plan || {})[c.id];
    if (v !== undefined) return v;
  }
  return c.amt || 0;
}
const bCats = (ym) => B().cats.filter((c) => !c.off || (bm(ym).plan || {})[c.id] !== undefined);
const planTotal = (ym) => bCats(ym).reduce((a, c) => a + planVal(ym, c), 0) + instDue(ymAdd(ym, 1)).reduce((a, x) => a + instAmt(x), 0);
/* 모아 둔 돈: id 'fund'는 비상금 잔액(m.fund), 나머지는 m.bal[id]. 'emerg'(비상금) 항목의 잔액 = 비상금 잔액 */
const FUND_ITEM = 'emerg';
const balRaw = (m, id) => (id === 'fund' ? m.fund : (m.bal || {})[id]);
/* ym까지(before면 ym 전까지) 마지막으로 적은 잔액 { ym, v } */
function balLast(ym, id, before = false) {
  const ks = Object.keys(B().months).filter((m) => (before ? m < ym : m <= ym) && balRaw(B().months[m], id) !== undefined).sort();
  const k = ks[ks.length - 1];
  return k ? { ym: k, v: balRaw(B().months[k], id) } : null;
}
/* 모아 둔 돈 줄: 모은 돈 항목마다 하나 (비상금 항목은 비상금 잔액 칸). 비상금 항목을 뺐어도 비상금 잔액 줄은 남긴다 */
function balRows(ym) {
  const rows = B().items.filter((x) => x.g === 'save' && (!x.off || ((bm(ym).bal || {})[x.id] !== undefined)))
    .map((x) => ({ id: x.id === FUND_ITEM ? 'fund' : x.id, label: x.label }));
  if (!rows.some((r) => r.id === 'fund')) rows.unshift({ id: 'fund', label: '비상금' });
  return rows;
}
/* 잔액 줄 아래 한 줄: 이 달에 적었으면 지난번과 차이, 아니면 언제 적은 금액인지 */
function balNote(ym, id) {
  const here = balRaw(bm(ym), id);
  if (here === undefined) { const last = balLast(ym, id); return last ? `${ymLabelShort(last.ym)}에 적은 금액` : ''; }
  const prevB = balLast(ym, id, true);
  return prevB && here !== prevB.v ? `${ymLabelShort(prevB.ym)}보다 ${here > prevB.v ? '+' : ''}${man(here - prevB.v)}` : '';
}
const balTotal = (ym) => balRows(ym).reduce((a, r) => a + ((balLast(ym, r.id) || {}).v || 0), 0);

function bEnsure(ym) {
  const b = B();
  const m = b.months[ym] = b.months[ym] || {};
  m.v = m.v || {};
  m.plan = m.plan || {};
  m.bal = m.bal || {};
  return m;
}

let bEdit = false;    // 항목 고치기
let bInstAdd = false; // 할부 적기 칸

function renderBudget() {
  const el = $('budget');
  const ym = ui.budgetMonth || (ui.budgetMonth = cycleMonth());
  if (bEdit) { el.innerHTML = budgetEditHtml(); return; }
  const m = bm(ym);
  const next = ymAdd(ym, 1);
  const inp = (attr, v, label, ph = '0') => `<input class="b-in" ${attr} type="text" inputmode="numeric" autocomplete="off" aria-label="${esc(label)}" placeholder="${ph}" value="${comma(v)}">`;
  const groups = B_GROUPS.map(([g, name]) => {
    const rows = bItems(ym, g).map((x) => {
      const fixed = !x.off && x.amt !== undefined && bStored(ym, x) === undefined;
      return `<label class="b-row${fixed ? ' fixed' : ''}"><span class="b-lab">${esc(x.label)}${x.amt !== undefined ? '<small>매달 같은 돈</small>' : x.card ? '<small>지난 한 달 쓴 돈</small>' : ''}</span>
        ${inp(`data-bv="${x.id}"`, bStored(ym, x) !== undefined ? bStored(ym, x) : x.amt, x.label)}<span class="b-unit">원</span></label>`;
    }).join('');
    const inst = g === 'out' && instDue(ym).length
      ? `<p class="b-sub">카드값에 들어 있는 할부: ${instDue(ym).map((x) => `${esc(x.label)} ${won(instAmt(x))} (${ymDiff(x.start, ym) + 1}/${x.n}회)`).join(' · ')}</p>` : '';
    return `<section class="b-card"><div class="b-head"><b>${name}</b><span class="b-sum" data-bsum="${g}">${won(bSum(ym, g))}</span></div>${rows}${inst}</section>`;
  }).join('');

  // 지난 한 달 계획과 이번 카드값 (판단 없이 나란히)
  const prev = ymAdd(ym, -1);
  const card = cardSum(ym);
  const compare = bHas(prev) && card
    ? `<p class="b-compare">지난 한 달(${ymLabelShort(prev)}) 계획 <b>${man(planTotal(prev))}</b> · 실제 카드값 <b>${man(card)}</b>${card !== planTotal(prev) ? ` (${card > planTotal(prev) ? '+' : ''}${man(card - planTotal(prev))})` : ''}</p>` : '';
  const left = bLeft(ym);
  // 모아 둔 돈: 이 달에 적은 잔액, 없으면 마지막에 적은 잔액(점선 칸)
  const bals = balRows(ym).map((r) => {
    const here = balRaw(m, r.id);
    const last = balLast(ym, r.id);
    const attr = r.id === 'fund' ? 'data-bfund' : `data-bbal="${r.id}"`;
    return `<label class="b-row${here === undefined && last ? ' fixed' : ''}"><span class="b-lab">${esc(r.label)}<small data-bnote="${r.id}">${balNote(ym, r.id)}</small></span>
      ${inp(attr, here !== undefined ? here : last ? last.v : undefined, `${r.label} 잔액`, '잔액')}<span class="b-unit">원</span></label>`;
  }).join('');
  const plans = bCats(ym).map((c) => `<label class="b-row"><span class="b-lab">${esc(c.label)}</span>
      ${inp(`data-bp="${c.id}"`, planVal(ym, c), c.label)}<span class="b-unit">원</span></label>`).join('');
  const dueNext = instDue(next);
  const active = B().inst.filter((x) => instLeft(x, ym) > 0 || ym < x.start || x.done === ym);

  el.innerHTML = `
    <div class="period">
      <button class="icon-btn" data-bmonth="-1" aria-label="지난달 가계부"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
      <span class="period-label">${ymName(ym)} 가계부<small>${md(payKey(ym))} 급여일 · 다음 ${md(payKey(next))}</small></span>
      <button class="icon-btn" data-bmonth="1" aria-label="다음 달 가계부" ${ym >= cycleMonth() ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
    </div>
    ${groups}
    <section class="b-card b-left-card"><div class="b-head"><b>남은 돈</b><span class="b-left" data-bleft>${won(bFinal(ym))}</span></div>
      <p class="b-sub">들어온 돈 − 나간 돈 − 모은 돈${m.draw !== undefined ? ' + 비상금에서 꺼낸 돈' : ''}</p>
      ${m.draw !== undefined
        ? `<label class="b-row b-draw"><span class="b-lab">비상금에서 꺼낸 돈<small>${left < 0 ? `모자란 ${won(-left)}` : '모자란 돈을 채운 만큼'}</small></span>
          ${inp('data-bdraw', m.draw, '비상금에서 꺼낸 돈')}<span class="b-unit">원</span></label>`
        : left < 0 ? `<button type="button" class="b-fill" data-bdrawfill>모자란 ${won(-left)}은 비상금에서 채웠어요</button>` : ''}
      ${compare}</section>
    <section class="b-card"><div class="b-head"><b>모아 둔 돈<small>통장 잔액</small></b><span class="b-sum" data-bbaltotal>${won(balTotal(ym))}</span></div>
      <p class="b-sub">통장 잔액을 생각날 때 적어요. 안 적은 달은 마지막에 적은 금액이 나와요. 넣은 돈이 없는 달에도 모아 둔 돈은 그대로예요.</p>
      ${bals}</section>
    <section class="b-card"><div class="b-head"><b>다음 급여일까지 쓸 돈</b><span class="b-sum" data-bplan>${won(planTotal(ym))}</span></div>
      <p class="b-sub">${md(payKey(ym))} – ${md(addDays(payKey(next), -1))} · 계획일 뿐이에요. 다음 달 카드값과 나란히 보여 줘요</p>
      ${plans}
      ${dueNext.map((x) => `<div class="b-row b-ro"><span class="b-lab">할부 · ${esc(x.label)}<small>${ymDiff(x.start, next) + 1}/${x.n}회</small></span><span class="b-ro-v">${won(instAmt(x))}</span></div>`).join('')}
    </section>
    <section class="b-card"><div class="b-head"><b>할부</b><span class="b-sum">${active.some((x) => x.done !== ym) ? `${active.filter((x) => x.done !== ym).length}건` : ''}</span></div>
      ${active.length ? active.map((x) => (x.done === ym
        ? `<div class="b-inst"><span><b>${esc(x.label)}</b> 이번 달에 다 갚았어요 ✓</span></div>`
        : `<div class="b-inst"><span><b>${esc(x.label)}</b> 월 ${won(instAmt(x))} · ${ym < x.start ? `${+x.start.slice(5)}월 카드값부터 ${x.n}회` : `남은 ${instLeft(x, ym)}회`}</span>
          <button type="button" class="b-mini" data-bdone="${x.id}">한꺼번에 갚았어요</button></div>`)).join('') : '<p class="b-sub">할부가 없어요.</p>'}
      ${bInstAdd ? `<div class="b-inst-form">
          <input class="b-text" id="bi-label" type="text" maxlength="20" placeholder="무엇 (예: 패딩)" aria-label="할부 이름">
          <input class="b-in" id="bi-total" type="text" inputmode="numeric" placeholder="총액" aria-label="할부 총액">
          <select id="bi-n" aria-label="할부 개월">${Array.from({ length: INST_MAX }, (_, i) => `<option value="${i + 1}"${i + 1 === INST_MAX ? ' selected' : ''}>${i + 1}개월</option>`).join('')}</select>
          <button type="button" class="b-mini strong" data-binst="save">적기</button><button type="button" class="b-mini" data-binst="cancel">취소</button>
          <p class="b-sub">${+next.slice(5)}월 카드값부터 나눠 나가요. 돈이 모이면 '한꺼번에 갚았어요'를 눌러요.</p></div>`
        : '<button type="button" class="b-add" data-binst="open">+ 할부 적기</button>'}
    </section>
    <textarea class="b-memo" id="b-memo" rows="2" maxlength="300" placeholder="이번 달 메모 (예: 연차수당 40만 원은 비상금으로)" aria-label="이번 달 메모">${esc(m.memo || '')}</textarea>
    <button type="button" class="b-add" data-bedit>항목 고치기</button>
    ${budgetFlowHtml(ym)}
    <p class="wo-note">가계부는 이 휴대폰에만 저장되고 백업 파일에 함께 담겨요. 백업 파일을 나눌 때는 금액도 들어 있다는 걸 기억해 주세요.</p>`;
  growText($('b-memo'));
}
const ymLabelShort = (ym) => `${+ym.slice(5)}월`;

/* 흐름: 적은 달 최근 6개월 (카드값 · 모은 돈 · 남은 돈 · 비상금) + 올해 모은 돈 */
function budgetFlowHtml(ym) {
  const ms = Object.keys(B().months).filter((m) => m <= ym && bHas(m)).sort().slice(-6);
  if (!ms.length) return '';
  const y = ym.slice(0, 4);
  const yms = Object.keys(B().months).filter((m) => m.slice(0, 4) === y && m <= ym && bHas(m));
  const saved = B().items.filter((x) => x.g === 'save').map((x) => [x.label, yms.reduce((a, m) => a + bVal(m, x), 0)]).filter(([, v]) => v);
  const pension = B().items.filter((x) => x.g === 'save' && /irp|연금/i.test(x.label)).reduce((a, x) => a + yms.reduce((b, m) => b + bVal(m, x), 0), 0);
  return `<section class="b-card"><div class="b-head"><b>흐름</b><span class="b-sum">최근 ${ms.length}달</span></div>
    <div class="b-flow"><span></span><span>카드값</span><span>모은 돈</span><span>남은 돈</span><span>비상금</span>
      ${ms.map((m) => `<button type="button" data-bgo="${m}">${ymLabelShort(m)}</button><span>${man(cardSum(m))}</span><span>${man(bSum(m, 'save'))}</span><span>${man(bFinal(m))}</span>
        <span>${bm(m).fund !== undefined ? man(bm(m).fund) : '–'}${bm(m).draw ? `<small>꺼냄 ${man(bm(m).draw)}</small>` : ''}</span>`).join('')}</div>
    ${balTotal(ym) ? `<p class="b-sub"><b>모아 둔 돈</b> <span data-bbaltotal>${won(balTotal(ym))}</span> (${ymLabelShort(ym)}까지 적은 잔액 합)</p>` : ''}
    ${saved.length ? `<p class="b-sub"><b>${y}년 모은 돈</b> ${saved.map(([l, v]) => `${esc(l)} ${man(v)}`).join(' · ')}</p>` : ''}
    ${pension ? `<p class="b-sub">IRP · 연금저축 올해 ${won(pension)} — 세액공제 한도는 연말정산 안내로 확인해요.</p>` : ''}
  </section>`;
}

/* 항목 고치기: 이름 · 금액(적으면 매달 같은 돈, 비우면 매달 적는 칸) · 빼기, 묶음마다 더하기 */
function budgetEditHtml() {
  const row = (x, kind) => `<div class="b-edit-row" data-kind="${kind}" data-id="${x.id || ''}">
      <input class="b-text" data-f="label" type="text" maxlength="30" value="${esc(x.label || '')}" placeholder="이름" aria-label="이름">
      <input class="b-in" data-f="amt" type="text" inputmode="numeric" value="${comma(x.amt)}" placeholder="${kind === 'cat' ? '기본 금액' : '매달 적기'}" aria-label="금액">
      <button type="button" class="b-mini" data-bdel aria-label="빼기">✕</button></div>`;
  const group = (title, kind, list) => `<section class="b-card"><div class="b-head"><b>${title}</b></div>
    <div class="b-edit-list" data-kind="${kind}">${list.map((x) => row(x, kind)).join('')}</div>
    <button type="button" class="b-add" data-badd="${kind}">+ 항목</button></section>`;
  return `<div class="b-edit-head"><b>가계부 항목 고치기</b><span class="spacer"></span>
      <button type="button" class="dy-cp-btn" data-bsave="0">취소</button><button type="button" class="dy-cp-btn strong" data-bsave="1">저장</button></div>
    <p class="b-sub">금액을 적으면 '매달 같은 돈'으로 다음 달에도 자동으로 채워지고, 비우면 매달 적는 칸이에요.</p>
    ${B_GROUPS.map(([g, name]) => group(name, g, B().items.filter((x) => x.g === g && !x.off))).join('')}
    ${group('다음 급여일까지 쓸 돈 (계획)', 'cat', B().cats.filter((c) => !c.off))}`;
}

function saveBudgetEdit() {
  const b = B();
  for (const list of $('budget').querySelectorAll('.b-edit-list')) {
    const kind = list.dataset.kind;
    const arr = kind === 'cat' ? b.cats : b.items;
    const seen = new Set();
    for (const r of list.querySelectorAll('.b-edit-row')) {
      const label = r.querySelector('[data-f=label]').value.trim();
      const amt = digits(r.querySelector('[data-f=amt]').value);
      const id = r.dataset.id;
      if (!label) continue;
      // 새 줄인데 같은 이름을 빼 둔 적이 있으면 그 항목을 살린다 (지난 달 금액과 이어지게)
      let x = id ? arr.find((y) => y.id === id) : arr.find((y) => y.off && y.label === label && (kind === 'cat' || y.g === kind));
      if (!x) { x = kind === 'cat' ? { id: uid() } : { id: uid(), g: kind }; arr.push(x); }
      x.label = label;
      if (amt === null) delete x.amt; else x.amt = amt;
      delete x.off;
      seen.add(x.id);
    }
    // 목록에서 지운 항목은 빼 둔다 (지난 달에 적은 금액은 그 달 표에 남는다)
    for (const x of arr) if ((kind === 'cat' || x.g === kind) && !seen.has(x.id)) x.off = 1;
  }
  save();
}

/* 금액 칸: 쓰는 동안은 숫자만 저장하고 합계만 고친다 (다시 그리지 않아 다음 칸으로 바로 넘어갈 수 있게) */
function updateBudgetSums() {
  const ym = ui.budgetMonth;
  for (const [g] of B_GROUPS) { const s = $('budget').querySelector(`[data-bsum="${g}"]`); if (s) s.textContent = won(bSum(ym, g)); }
  const l = $('budget').querySelector('[data-bleft]');
  if (l) l.textContent = won(bFinal(ym));
  for (const bt of $('budget').querySelectorAll('[data-bbaltotal]')) bt.textContent = won(balTotal(ym));
  const p = $('budget').querySelector('[data-bplan]');
  if (p) p.textContent = won(planTotal(ym));
}
$('budget').addEventListener('input', (e) => {
  const t = e.target;
  const ym = ui.budgetMonth;
  if (t.id === 'b-memo') { const m = bEnsure(ym); if (t.value.trim()) m.memo = t.value; else delete m.memo; growText(t); saveSoon(); return; }
  if (!t.matches('.b-in') || bEdit || t.id === 'bi-total') return;
  const v = digits(t.value);
  const m = bEnsure(ym);
  if (t.dataset.bv) { if (v === null) delete m.v[t.dataset.bv]; else m.v[t.dataset.bv] = v; }
  else if (t.dataset.bp) { if (v === null) delete m.plan[t.dataset.bp]; else m.plan[t.dataset.bp] = v; }
  else if (t.hasAttribute('data-bfund')) { if (v === null) delete m.fund; else m.fund = v; }
  else if (t.dataset.bbal) { m.bal = m.bal || {}; if (v === null) delete m.bal[t.dataset.bbal]; else m.bal[t.dataset.bbal] = v; }
  else if (t.hasAttribute('data-bdraw')) m.draw = v || 0; // 쓰는 동안은 칸을 남기고, 비운 채 나가면 지운다 (focusout)
  if (t.dataset.bv || t.dataset.bbal || t.hasAttribute('data-bfund')) t.closest('.b-row').classList.remove('fixed'); // 이 달에 적은 금액
  if (t.dataset.bbal || t.hasAttribute('data-bfund')) { const id = t.dataset.bbal || 'fund'; t.closest('.b-row').querySelector('[data-bnote]').textContent = balNote(ym, id); }
  saveSoon();
  updateBudgetSums();
});
$('budget').addEventListener('focusin', (e) => { if (e.target.matches('.b-in')) e.target.value = e.target.value.replace(/,/g, ''); });
$('budget').addEventListener('focusout', (e) => {
  if (!e.target.matches('.b-in')) return;
  e.target.value = comma(digits(e.target.value));
  // 비상금에서 꺼낸 돈을 비우면 그 줄을 지우고 다시 '채웠어요' 버튼으로
  if (e.target.hasAttribute('data-bdraw') && !digits(e.target.value)) { delete bEnsure(ui.budgetMonth).draw; save(); renderBudget(); }
});

$('budget').addEventListener('click', (e) => {
  const ym = ui.budgetMonth;
  const mv = e.target.closest('[data-bmonth]');
  if (mv) { ui.budgetMonth = ymAdd(ym, +mv.dataset.bmonth); bInstAdd = false; renderBudget(); return; }
  const go = e.target.closest('[data-bgo]');
  if (go) { ui.budgetMonth = go.dataset.bgo; renderBudget(); $('budget').scrollIntoView({ block: 'start' }); return; }
  if (e.target.closest('[data-bedit]')) { bEdit = true; renderBudget(); return; }
  const sv = e.target.closest('[data-bsave]');
  if (sv) {
    if (sv.dataset.bsave === '1') { saveBudgetEdit(); toast('가계부 항목을 고쳤어요'); }
    bEdit = false;
    renderBudget();
    return;
  }
  const add = e.target.closest('[data-badd]');
  if (add) {
    const list = $('budget').querySelector(`.b-edit-list[data-kind="${add.dataset.badd}"]`);
    list.insertAdjacentHTML('beforeend', `<div class="b-edit-row" data-kind="${add.dataset.badd}" data-id="">
      <input class="b-text" data-f="label" type="text" maxlength="30" placeholder="이름" aria-label="이름">
      <input class="b-in" data-f="amt" type="text" inputmode="numeric" placeholder="${add.dataset.badd === 'cat' ? '기본 금액' : '매달 적기'}" aria-label="금액">
      <button type="button" class="b-mini" data-bdel aria-label="빼기">✕</button></div>`);
    list.lastElementChild.querySelector('input').focus();
    return;
  }
  const del = e.target.closest('[data-bdel]');
  if (del) { del.closest('.b-edit-row').remove(); return; }
  const ins = e.target.closest('[data-binst]');
  if (ins) {
    const a = ins.dataset.binst;
    if (a === 'save') {
      const label = $('bi-label').value.trim();
      const total = digits($('bi-total').value);
      const n = +$('bi-n').value;
      if (!label || !total) { toast('이름과 총액을 적어 주세요'); return; }
      bInstAdd = false;
      undoable(`할부 ${label} ${won(total)} (${n}개월)을 적었어요`, () => { B().inst.push({ id: uid(), label, total, n, start: ymAdd(ym, 1) }); });
      return;
    }
    bInstAdd = a === 'open';
    renderBudget();
    if (bInstAdd) $('bi-label').focus();
    return;
  }
  if (e.target.closest('[data-bdrawfill]')) {
    const need = -bLeft(ym);
    undoable(`모자란 ${won(need)}을 비상금에서 채웠어요`, () => { bEnsure(ym).draw = need; });
    const f = $('budget').querySelector('[data-bdraw]');
    if (f) f.closest('.b-row').scrollIntoView({ block: 'center' });
    return;
  }
  const dn = e.target.closest('[data-bdone]');
  if (dn) {
    const x = B().inst.find((y) => y.id === dn.dataset.bdone);
    if (x) undoable(`${x.label} 할부를 다 갚았어요`, () => { B().inst.find((y) => y.id === x.id).done = ym; });
  }
});

/* ───────── 오늘 화면: 급여일 배너 (그 달 급여일부터, 그 달 '들어온 돈'을 적기 전까지 · 다음 달 1일이 되면 사라진다) ───────── */
function renderBudgetBanner() {
  const el = $('budget-banner');
  const ym = ymOf(today);
  const show = ui.date === today && today >= payKey(ym) && !B().items.some((x) => x.g === 'in' && bStored(ym, x) !== undefined);
  el.innerHTML = show ? `<button class="banner report-banner" id="budget-go">
      <span class="banner-text"><b>급여일 가계부</b> · ${ymLabelShort(ym)} 카드값과 쓸 돈 계획 적기</span><span class="banner-act">적기 ›</span></button>` : '';
}
$('budget-banner').addEventListener('click', (e) => {
  if (!e.target.closest('#budget-go')) return;
  ui.statsTab = 'money';
  ui.budgetMonth = ymOf(today);
  go('stats');
});
