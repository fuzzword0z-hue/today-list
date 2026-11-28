'use strict';

/* ═════════════════ 고양이 케어: 컨디션 기록 · 체크 누락 확인 · 진료 전 요약 ═════════════════
 * state.cond = { 'YYYY-MM-DD': { ap, en, vo, vl, st, w, n, th } }
 *   ap 식욕 · en 활력 · st 배변 (아래 COND의 값) · w 체중(kg) · n 메모 · th 치아 이 닦임(1)
 *   구토는 한 번에 한 줄: vl = [{ t: 종류(VOMIT), at: 'HH:MM', b: 1 피 섞임, n: 메모 }]
 *     오늘 누르면 지금 시각으로 1회가 더해지고, 줄을 눌러 종류 · 시각 · 피 섞임 · 메모를 고친다 (지난 날은 시각 없이도 됨).
 *     하루에 거품 1 · 사료 1 · 위액 1처럼 섞여도, 같은 종류를 여러 번 해도 그대로 남고, 언제 토했는지가 진료에 단서가 된다.
 *   vo = '0' 오늘 안 토함 (확인했다는 기록). 예전 기록의 '1' · '2'(2회 이상)는 그대로 읽고, 그 날 새로 적으면 바뀐다.
 *   night = 밤에 지켜봄: nausea 오심이 심해 토할까 봐 · vomit 구토 후 멈췄는지 확인 (예전 '늦게 잠 · 고양이 케어'에서 옮긴 것은 watch일 수 있다)
 *     그 날 밤(새벽 4시 전까지)을 지켜본 기록. 진료 전 요약 · 리포트에 '밤에 지켜본 날'로 들어간다. */

const COND = [
  { f: 'ap', label: '식욕', opts: [['good', '잘 먹음'], ['normal', '보통'], ['low', '적게'], ['none', '안 먹음']], bad: ['low', 'none'] },
  { f: 'en', label: '활력', opts: [['good', '좋음'], ['normal', '보통'], ['low', '처짐']], bad: ['low'] },
  { f: 'st', label: '배변', opts: [['normal', '정상'], ['loose', '묽음·설사'], ['hard', '변비']], bad: ['loose', 'hard'] },
];
const NIGHT = [['nausea', '오심 지켜봄'], ['vomit', '구토 후 확인']];
const nightOf = (c) => (c && Array.isArray(c.night) ? c.night : []);
/* 아픈 고양이를 밤에 지켜본 날 */
const catNight = (d) => nightOf(condOf(d)).length > 0;
const VOMIT = [['foam', '거품'], ['food', '사료'], ['bile', '위액'], ['hair', '헤어볼'], ['med', '약 직후'], ['etc', '기타']];
const PAW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16" rx="4.6" ry="3.6"/><circle cx="6" cy="10.5" r="1.8"/><circle cx="9.6" cy="6.6" r="1.8"/><circle cx="14.4" cy="6.6" r="1.8"/><circle cx="18" cy="10.5" r="1.8"/></svg>';
const PROMPT_DAYS = 3; // 오늘 화면에서 체크가 빠진 케어를 물어보는 기간 (어제부터 며칠 전까지)

const optLabel = (f, v) => { const c = COND.find((x) => x.f === f); const o = c && c.opts.find((x) => x[0] === v); return o ? o[1] : ''; };
const condOf = (k) => state.cond[k] || null;
const isBad = (f, v) => COND.find((x) => x.f === f).bad.includes(v);

/* ───────── 구토 ───────── */
const vomitLabel = (t) => (VOMIT.find(([x]) => x === t) || [])[1] || '기타';
const vomitList = (c) => (c && Array.isArray(c.vl) ? c.vl.filter((x) => x && typeof x === 'object') : []);
/* 그 날 구토 횟수: 새 기록은 줄 수, 예전 기록은 1회 · 2회 이상(plus) */
function vomitCount(c) {
  const vl = vomitList(c);
  if (vl.length) return { n: vl.length, plus: false };
  if (c && (c.vo === '1' || c.vo === '2')) return { n: +c.vo, plus: c.vo === '2' };
  return { n: 0, plus: false };
}
const vomited = (c) => vomitCount(c).n > 0;
const vomitBlood = (c) => vomitList(c).some((x) => x.b);
const vomitText = (c) => { const v = vomitCount(c); return v.n ? `구토 ${v.n}회${v.plus ? ' 이상' : ''}${vomitBlood(c) ? ' (피 섞임)' : ''}` : ''; };
/* 하루가 새벽 4시에 바뀌므로 0–4시는 그 날 밤 끝으로 놓고 정렬 */
const timeKey = (at) => { if (!at) return 9999; const [h, m] = at.split(':').map(Number); return (h < DAY_START_HOUR ? h + 24 : h) * 60 + m; };
/* 종류별 횟수 (많은 순): '위액 2 · 사료 1' */
function vomitTypes(list, n = 6) {
  const o = {};
  for (const x of list) o[x.t] = (o[x.t] || 0) + 1;
  return Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([t, c]) => `${vomitLabel(t)} ${c}`).join(' · ');
}
const vomitEntry = (x) => `${x.at ? `${hm(x.at)} ` : ''}${vomitLabel(x.t)}${x.b ? '(피 섞임)' : ''}${x.n ? ` "${x.n}"` : ''}`;
const hasSymptom = (c) => !!c && (COND.some((x) => c[x.f] && isBad(x.f, c[x.f])) || vomited(c));
const fmtKg = (w) => `${Math.round(w * 100) / 100}kg`;
const ml = (k) => `${parse(k).getMonth() + 1}/${parse(k).getDate()}`;
const agoText = (n) => (n < 7 ? `${n}일 전` : `${Math.floor(n / 7)}주${n % 7 ? ` ${n % 7}일` : ''} 전`);

/* 한 줄 요약: 이상 있는 항목 + 체중 */
function condSummary(c, withTh = true) {
  if (!c) return '';
  const bad = [vomitText(c), ...COND.filter((x) => c[x.f] && isBad(x.f, c[x.f])).map((x) => `${x.label} ${optLabel(x.f, c[x.f])}`)].filter(Boolean);
  const recorded = COND.some((x) => c[x.f]) || c.vo === '0' || vomited(c);
  if (nightOf(c).length) bad.push('밤에 지켜봄');
  const parts = bad.length ? bad : recorded ? ['특이 사항 없음'] : [];
  if (c.w) parts.push(fmtKg(c.w));
  if (c.th && withTh) parts.push('양치 ✓');
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

let carePromptsOpen = false; // 빠진 체크가 여러 개일 때 펼쳐 봤는지

function renderCarePrompts() {
  const el = $('care-prompts');
  const list = ui.date === today ? missingCare() : [];
  if (list.length < 2) carePromptsOpen = false;
  // 여러 개면 한 줄로 묶어서, 눌러야 하나씩 보여 준다 (할 일이 화면 밖으로 밀리지 않게)
  const head = list.length >= 2 ? `<button class="banner care-group" id="care-group" aria-expanded="${carePromptsOpen}">
      <span class="banner-text"><b>케어 체크가 빠진 날 ${list.length}개</b> ${carePromptsOpen ? '' : esc([...new Set(list.map(({ ev }) => ev.title))].join(' · '))}</span>
      <span class="banner-act">${carePromptsOpen ? '접기' : '확인하기'}</span>
    </button>` : '';
  el.innerHTML = head + (list.length >= 2 && !carePromptsOpen ? [] : list).map(({ ev, k }) => {
    const K = CARE_KINDS[careKind(ev)];
    const q = careKind(ev) === 'vet' ? `${esc(ev.title)} 다녀왔나요?` : `${esc(ev.title)} 체크가 없어요`;
    return `<div class="banner care-prompt" data-eid="${ev.id}" data-k="${k}">
      <span class="banner-text"><b>${relDay(k)}(${ml(k)})</b> ${q}</span>
      <button class="cp-btn yes" data-rec="done">${K.yes}</button>
      <button class="cp-btn" data-rec="skip">${K.no}</button>
    </div>`;
  }).join('') + (list.length >= 2 && carePromptsOpen
    ? `<div class="care-all"><button class="cp-btn yes" id="care-all">${list.length}개 모두 했어요</button></div>` : '');
}

$('care-prompts').addEventListener('click', (e) => {
  if (e.target.closest('#care-group')) {
    carePromptsOpen = !carePromptsOpen;
    renderCarePrompts();
    return;
  }
  // 빠진 체크를 한 번에 '했어요'로 (실행 취소 가능)
  if (e.target.closest('#care-all')) {
    const list = missingCare();
    undoable(`케어 체크 ${list.length}개를 했어요로 기록했어요`, () => {
      for (const { ev, k } of list) setCareRecord(state.events.find((x) => x.id === ev.id), k, 'done');
    });
    return;
  }
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
  const sum = condSummary(c, false); // 양치는 머리 오른쪽 버튼에 보이므로 뺀다
  el.innerHTML = `
    <div class="cond-top">
      <button class="cond-head" aria-expanded="${open}">
        <span class="cond-ic">${PAW_SVG}</span>
        <span class="cond-title">고양이 컨디션</span>
        <span class="cond-sum${hasSymptom(c) ? ' bad' : ''}">${sum ? esc(sum) : '기록하기'}</span>
        <svg class="cond-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <button class="cond-th${c && c.th ? ' on' : ''}" id="cond-th" aria-pressed="${!!(c && c.th)}" aria-label="치아 이 닦이기">
        <span class="check">${CHECK_SVG}</span><span>양치</span>
      </button>
    </div>
    ${open ? `<div class="cond-body">
      ${COND.map((x) => `<div class="cond-row"><span class="cond-label">${x.label}</span><div class="chips" data-f="${x.f}">
        ${x.opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${!!c && c[x.f] === v}" class="${x.bad.includes(v) ? 'bad' : ''}">${l}</button>`).join('')}
      </div></div>`).join('')}
      ${vomitRow(k, c)}
      <div class="cond-row"><span class="cond-label">밤</span><div class="chips" data-night role="group" aria-label="밤에 지켜봄">
        ${NIGHT.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${nightOf(c).includes(v)}">${l}</button>`).join('')}</div></div>
      ${nightOf(c).includes('vomit') && !vomited(c) ? '<p class="vo-note">토한 것도 위에 적어 두면 진료 때 도움이 돼요.</p>' : ''}
      <div class="cond-row"><span class="cond-label">체중</span>
        <input class="cond-w" id="cond-w" aria-label="고양이 체중" type="number" inputmode="decimal" step="0.01" min="0" max="30" placeholder="0.00" value="${c && c.w ? c.w : ''}"><span class="cond-unit">kg</span>
        ${lastWeight(k) ? `<span class="cond-prev">지난 ${fmtKg(lastWeight(k).w)} (${ml(lastWeight(k).k)})</span>` : ''}
      </div>
      <textarea class="cond-memo" id="cond-memo" aria-label="고양이 컨디션 메모" rows="2" maxlength="500" placeholder="메모 (먹은 양, 약 반응, 특이 사항 등)">${c && c.n ? esc(c.n) : ''}</textarea>
      <p class="cond-help">고른 항목을 한 번 더 누르면 지워져요. 진료 전 요약과 월간 리포트에 쓰여요.</p>
    </div>` : ''}`;
}

/* 구토 줄: [+ 종류]를 누르면 1회씩 더해지고, 아래 목록의 줄을 누르면 고친다 */
function vomitRow(k, c) {
  const vl = vomitList(c);
  const order = vl.map((x, i) => ({ x, i })).sort((a, b) => timeKey(a.x.at) - timeKey(b.x.at) || a.i - b.i);
  const legacy = !vl.length && c && (c.vo === '1' || c.vo === '2');
  return `<div class="cond-row vo-row"><span class="cond-label">구토</span><div class="chips vo-add" role="group" aria-label="구토 1회 더하기">
      ${VOMIT.map(([t, l]) => `<button type="button" data-vadd="${t}">+ ${l}</button>`).join('')}
      ${vl.length ? '' : `<button type="button" data-vnone aria-pressed="${!!c && c.vo === '0'}">${k === today ? '오늘 ' : ''}안 토함</button>`}</div></div>
    ${vl.length ? `<ul class="vo-list">${order.map(({ x, i }) => `<li><button type="button" data-vi="${i}">
        <b>${x.at ? hm(x.at) : '–'}</b><span>${vomitLabel(x.t)}</span>${x.b ? '<span class="vo-blood">피 섞임</span>' : ''}${x.n ? `<small>${esc(x.n)}</small>` : ''}</button></li>`).join('')}</ul>
      <p class="vo-sum">${k === today ? '오늘' : ml(k)} ${vl.length}회 · ${vomitTypes(vl)} · 줄을 누르면 고칠 수 있어요</p>` : ''}
    ${vl.some((x) => x.b) ? '<p class="vo-note bad">피가 섞였어요. 병원에 꼭 알려 주세요.</p>' : ''}
    ${vl.some((x) => x.t === 'med') ? '<p class="vo-note">약을 먹자마자 토했다면, 다시 먹일지는 꼭 병원 지시대로 해 주세요.</p>' : ''}
    ${legacy ? `<p class="vo-legacy">예전 기록: ${c.vo === '2' ? '2회 이상' : '1회'} · 종류를 골라 다시 적으면 이 기록은 바뀌어요</p>` : ''}`;
}
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function lastWeight(before) {
  const ks = Object.keys(state.cond).filter((k) => k < before && state.cond[k].w).sort();
  const k = ks[ks.length - 1];
  return k ? { k, w: state.cond[k].w } : null;
}

function setCond(k, f, v, typing = false) {
  const c = { ...(state.cond[k] || {}) };
  if (v === undefined || v === null || v === '') delete c[f];
  else c[f] = v;
  if (Object.keys(c).length) state.cond[k] = c;
  else delete state.cond[k];
  if (typing) saveSoon(); else save();
}

$('cond').addEventListener('click', (e) => {
  if (e.target.closest('.cond-head')) {
    condOpenFor = condOpenFor === ui.date ? null : ui.date;
    renderCond();
    return;
  }
  // 치아 이 닦이기: 카드를 펼치지 않아도 바로 체크
  const th = e.target.closest('#cond-th');
  if (th) {
    const on = !(condOf(ui.date) && condOf(ui.date).th);
    setCond(ui.date, 'th', on ? 1 : null);
    th.classList.toggle('on', on);
    th.setAttribute('aria-pressed', String(on));
    if (on && navigator.vibrate) navigator.vibrate(8);
    updateCondHead();
    return;
  }
  // 구토 1회 더하기 (오늘이면 지금 시각으로) · 안 토함 · 줄 고치기
  const va = e.target.closest('[data-vadd]');
  if (va) {
    const k = ui.date;
    const t = va.dataset.vadd;
    const at = k === today ? nowHM() : '';
    if (navigator.vibrate) navigator.vibrate(8);
    undoable(`${vomitLabel(t)} 구토 1회 기록했어요${at ? ` (${hm(at)})` : ''}`, () => {
      const c = { ...(state.cond[k] || {}) };
      c.vl = [...vomitList(c), at ? { t, at } : { t }];
      delete c.vo; // 안 토함 · 예전 1회/2회 이상 기록은 새 기록으로 바뀐다
      state.cond[k] = c;
    });
    return;
  }
  if (e.target.closest('[data-vnone]')) {
    const cur = condOf(ui.date);
    setCond(ui.date, 'vo', cur && cur.vo === '0' ? null : '0');
    renderCond();
    return;
  }
  const vi = e.target.closest('[data-vi]');
  if (vi) { openVomit(ui.date, +vi.dataset.vi); return; }
  // 밤에 지켜봄 (여러 개)
  const nb = e.target.closest('[data-night] [data-v]');
  if (nb) {
    const cur = nightOf(condOf(ui.date));
    const v = nb.dataset.v;
    const nx = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur.filter((x) => x !== 'watch'), v];
    setCond(ui.date, 'night', nx.length ? nx : null);
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
    setCond(ui.date, 'n', e.target.value.trim() || null, true);
  } else return;
  updateCondHead();
});

function updateCondHead() {
  const c = condOf(ui.date);
  const s = $('cond').querySelector('.cond-sum');
  if (!s) return;
  const sum = condSummary(c, false);
  s.textContent = sum || '기록하기';
  s.classList.toggle('bad', hasSymptom(c));
}

/* ───────── 구토 한 줄 고치기 (시트) ───────── */
let voCtx = null; // { k, i, t, b }
function renderVomitFields() {
  const x = voCtx;
  $('vo-fields').innerHTML = `<div class="sh-group"><p>종류</p><div class="chips dy-chips" role="group" aria-label="구토 종류">
      ${VOMIT.map(([t, l]) => `<button type="button" data-vt="${t}" aria-pressed="${x.t === t}">${l}</button>`).join('')}</div></div>
    <div class="sh-group"><p>함께 본 것</p><div class="chips" role="group" aria-label="피 섞임">
      <button type="button" class="bad" data-vb aria-pressed="${!!x.b}">피 섞임</button></div></div>`;
}
function openVomit(k, i) {
  const x = vomitList(condOf(k))[i];
  if (!x) return;
  voCtx = { k, i, t: x.t || 'etc', b: !!x.b };
  $('vo-title').textContent = `${k === today ? '오늘' : ml(k)} 구토 기록`;
  $('vo-at').value = x.at || '';
  $('vo-memo').value = x.n || '';
  renderVomitFields();
  $('vo-sheet').hidden = false;
}
function closeVomit() {
  $('vo-sheet').hidden = true;
  voCtx = null;
  document.activeElement.blur();
}
$('vo-sheet').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) { closeVomit(); return; }
  if (!voCtx) return;
  const t = e.target.closest('[data-vt]');
  if (t) { voCtx.t = t.dataset.vt; renderVomitFields(); return; }
  if (e.target.closest('[data-vb]')) { voCtx.b = !voCtx.b; renderVomitFields(); }
});
$('vo-sheet').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeVomit(); });
$('vo-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const x = voCtx;
  if (!x) return;
  const rec = { t: x.t };
  if ($('vo-at').value) rec.at = $('vo-at').value;
  if (x.b) rec.b = 1;
  const n = $('vo-memo').value.trim();
  if (n) rec.n = n;
  closeVomit();
  undoable(`${ml(x.k)} 구토 기록을 고쳤어요`, () => {
    const c = { ...(state.cond[x.k] || {}) };
    const vl = vomitList(c).slice();
    vl[x.i] = rec;
    c.vl = vl;
    state.cond[x.k] = c;
  });
});
$('vo-del').addEventListener('click', () => {
  const x = voCtx;
  if (!x) return;
  closeVomit();
  undoable(`${ml(x.k)} 구토 기록 1회를 지웠어요`, () => {
    const c = { ...(state.cond[x.k] || {}) };
    const vl = vomitList(c).filter((_, j) => j !== x.i);
    if (vl.length) c.vl = vl; else delete c.vl;
    if (Object.keys(c).length) state.cond[x.k] = c; else delete state.cond[x.k];
  });
});

/* ───────── 진료 전 요약 ───────── */
function careSummaryData() {
  const last = lastVisit(today);
  const next = nextVisit(today);
  const from = last ? addDays(last.k, 1) : addDays(today, -30);
  const to = today;
  const days = diffDays(to, from) + 1;

  // 투약: 반복 투약별로 함 / 못 함 / 기록 없음 (오늘 회차는 체크 전이면 빼고 센다)
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
  const vomit = recs.filter(([, r]) => vomited(r)).map(([k, r]) => ({ k, ...vomitCount(r), list: vomitList(r).slice().sort((a, b) => timeKey(a.at) - timeKey(b.at)) }));
  const weights = recs.filter(([, r]) => r.w).map(([k, r]) => ({ k, w: r.w }));
  const notes = recs.filter(([, r]) => r.n).map(([k, r]) => ({ k, n: r.n }));
  const teeth = recs.filter(([, r]) => r.th).length;
  // 밤에 지켜본 날: 오심이 심해 토할까 봐, 구토 후 멈췄는지 보느라 늦게 잔 밤 (고양이 컨디션의 '밤에 지켜봄')
  const watch = [];
  for (let k = from; k <= to; k = addDays(k, 1)) if (catNight(k)) watch.push({ k, why: nightOf(condOf(k)).filter((w) => w !== 'watch') });
  return { last, next, from, to, days, doses, recs, ap: count('ap'), en: count('en'), st: count('st'), vomit, weights, notes, teeth, watch };
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
      const t = `${r.ev.title} (${repLabel(r.ev.rep)}): ${r.sched}회 중 ${r.given}회 했음`
        + (r.skipped.length ? ` · 못 함 ${r.skipped.length}회 (${dl(r.skipped)})` : '')
        + (r.missing.length ? ` · 기록 없음 ${r.missing.length}회 (${dl(r.missing)})` : '');
      return t;
    });
    sec.push(['투약', items]);
  }

  // 컨디션
  const cond = [];
  if (s.recs.length) {
    cond.push(`기록한 날 ${s.recs.length}일 / ${s.days}일`);
    for (const x of COND) {
      const cnt = s[x.f];
      const parts = x.opts.filter(([v]) => cnt[v]).map(([v, l]) => `${l} ${cnt[v].length}일${x.bad.includes(v) ? ` (${dl(cnt[v])})` : ''}`);
      if (parts.length) cond.push(`${x.label}: ${parts.join(' · ')}`);
    }
    if (s.vomit.length) {
      const total = s.vomit.reduce((a, v) => a + v.n, 0);
      const all = s.vomit.flatMap((v) => v.list.map((x) => ({ ...x, k: v.k })));
      const types = vomitTypes(all);
      cond.push(`구토: ${s.vomit.length}일, ${total}회${s.vomit.some((v) => v.plus) ? ' 이상' : ''}${types ? ` (${types})` : ''}`);
      cond.push(`구토 기록: ${s.vomit.map((v) => `${ml(v.k)} ${v.list.length ? v.list.map(vomitEntry).join(', ') : `${v.n}회${v.plus ? ' 이상' : ''}`}`).join(' / ')}`);
      // 피 섞임은 따로 눈에 띄게
      const blood = all.filter((x) => x.b);
      if (blood.length) cond.push(`⚠ 피 섞인 구토: ${blood.length}회 (${blood.map((x) => `${ml(x.k)}${x.at ? ` ${hm(x.at)}` : ''} ${vomitLabel(x.t)}`).join(', ')})`);
      // 시간대: 같은 종류가 아침(4–10시)에 몰려 있으면 사실대로 (판단은 진료에서)
      for (const [t, l] of VOMIT) {
        const timed = all.filter((x) => x.t === t && x.at);
        const am = timed.filter((x) => timeKey(x.at) < 10 * 60).length;
        if (timed.length >= 2 && am * 3 >= timed.length * 2) cond.push(`${l} 구토 ${timed.length}번 중 ${am}번이 아침(4–10시)이었어요`);
      }
      // 약 먹자마자 토한 날: 그 날 챙긴 투약과 함께
      const med = all.filter((x) => x.t === 'med');
      if (med.length) {
        const given = (k) => [...new Set(state.events.filter((ev) => isDose(ev) && ev.done && ev.done[k]).map((ev) => ev.title))].join('·');
        cond.push(`약 먹자마자 토함: ${med.length}회 (${med.map((x) => `${ml(x.k)}${given(x.k) ? ` ${given(x.k)}` : ''}`).join(', ')}) — 다시 먹여야 하는지 확인`);
      }
    } else if (s.recs.some(([, r]) => r.vo === '0')) cond.push('구토: 없음');
    if (s.teeth) cond.push(`양치: ${s.teeth}일 / ${s.days}일`);
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
  if (s.watch.length) {
    const n = (w) => s.watch.filter((x) => x.why.includes(w)).length;
    const parts = [n('nausea') ? `오심 ${n('nausea')}일` : '', n('vomit') ? `구토 ${n('vomit')}일` : ''].filter(Boolean).join(' · ');
    cond.push(`밤에 지켜본 날: ${s.watch.length}일${parts ? ` (${parts})` : ''} — ${s.watch.map((x) => `${ml(x.k)}${x.why.length ? ` ${x.why.map((w) => (w === 'nausea' ? '오심' : '구토')).join('·')}` : ''}`).join(', ')}`);
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
    ${s.weights.length >= 2 ? `<section class="r-sec cs"><h2>체중 추이</h2>${weightChart(s.weights)}</section>` : ''}
    <p class="r-note">'텍스트 복사'로 복사해서 병원에 보여 주거나 메모에 붙여 넣을 수 있어요.</p>`;
}

/* 체중 추이 (지난 진료 이후): 날짜 간격대로 점을 찍고 잇는다. 처음·마지막·가장 낮은 값에 숫자 */
function weightChart(ws) {
  const W = 300, H = 110, P = 18;
  const d0 = ws[0].k, span = Math.max(1, diffDays(ws[ws.length - 1].k, d0));
  const vals = ws.map((x) => x.w);
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max(0.05, (hi - lo) * 0.15);
  const x = (k) => P + ((W - P * 2) * diffDays(k, d0)) / span;
  const y = (w) => P + (H - P * 2) * (1 - (w - (lo - pad)) / (hi - lo + pad * 2));
  const pts = ws.map((p) => [x(p.k), y(p.w)]);
  const minI = vals.indexOf(lo);
  const label = (i) => `<text x="${pts[i][0]}" y="${pts[i][1] - 7}" text-anchor="${i === 0 ? 'start' : i === ws.length - 1 ? 'end' : 'middle'}">${ws[i].w}</text>`;
  const labels = [...new Set([0, ws.length - 1, minI])].map(label).join('');
  return `<svg class="w-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="체중 ${ws.map((p) => `${ml(p.k)} ${p.w}kg`).join(', ')}">
    <polyline points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>
    ${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"/>`).join('')}
    ${labels}
    <text class="w-date" x="${P}" y="${H - 2}">${ml(ws[0].k)}</text><text class="w-date" x="${W - P}" y="${H - 2}" text-anchor="end">${ml(ws[ws.length - 1].k)}</text>
  </svg>`;
}

function openCareSummary() { go('report', { push: true, id: 'care' }); }

/* ───────── 통계 → 기록: 고양이 체중 (7-26) ─────────
 * 오늘 화면 '고양이 컨디션'의 체중(cond[날짜].w)을 모아 변화만 본다: 마지막 체중, 지난번 · 처음 기록과의 차이(kg · %),
 * 그래프(최근 12번), 기록 목록(지난번과 차이). 병원에서 잰 체중을 나중에 적을 수 있게 날짜를 골라 적기 · 지우기.
 * 좋다 · 나쁘다 판단 없이 숫자만 보여 준다. */
const CW_LIST = 6; // 목록에 바로 보이는 기록 수 (나머지는 '이전 기록'에 접어 둔다)
const catWeights = () => Object.keys(state.cond).filter((k) => state.cond[k] && state.cond[k].w).sort().map((k) => ({ k, w: state.cond[k].w }));
/* a → b 차이: '−0.15kg (−2.3%)', 같으면 '변화 없음' */
function kgDiff(a, b) {
  const d = Math.round((b - a) * 100) / 100;
  if (!d) return '변화 없음';
  const p = Math.round((Math.abs(d) / a) * 1000) / 10;
  return `${d > 0 ? '+' : '−'}${Math.abs(d)}kg (${d > 0 ? '+' : '−'}${p}%)`;
}

function renderCatStats() {
  const ws = catWeights();
  const n = ws.length;
  const last = ws[n - 1];
  const prev = ws[n - 2];
  const row = (x, i) => `<li><span class="cw-date">${md(x.k)}</span><b>${fmtKg(x.w)}</b>
      <span class="cw-ch">${i ? kgDiff(ws[i - 1].w, x.w) : '처음 기록'}</span>
      <button type="button" class="cw-del" data-cwdel="${x.k}" aria-label="${md(x.k)} ${fmtKg(x.w)} 지우기">✕</button></li>`;
  const rows = ws.map(row).reverse(); // 최근 것부터
  $('catstats').innerHTML = `<h2 class="sub-head">고양이 체중</h2>
    <div class="hs-card">
      ${last ? `<p class="hs-one">${fmtKg(last.w)} <small>${md(last.k)}</small></p>`
        : '<p class="h-empty">아직 체중 기록이 없어요. 병원이나 집에서 잰 날 적어 두면 변화가 보여요.</p>'}
      ${prev ? `<p class="cw-sum">지난번 ${ml(prev.k)} ${fmtKg(prev.w)}보다 <b>${kgDiff(prev.w, last.w)}</b></p>` : ''}
      ${n >= 3 ? `<p class="cw-sum">처음 기록 ${ml(ws[0].k)} ${fmtKg(ws[0].w)}보다 <b>${kgDiff(ws[0].w, last.w)}</b></p>` : ''}
      ${n >= 2 ? weightChart(ws.slice(-12)) : n ? '<p class="h-empty">한 번 더 적으면 변화가 보여요.</p>' : ''}
      <div class="hs-w-row">
        <input type="date" id="cw-d" max="${today}" value="${today}" aria-label="잰 날">
        <input class="cond-w" id="cw-w" type="number" inputmode="decimal" step="0.01" min="0" max="30" placeholder="0.00" aria-label="고양이 체중"><span class="cond-unit">kg</span>
        <button type="button" class="hs-save cw-save" id="cw-save">기록</button>
      </div>
      ${n ? `<ul class="cw-list">${rows.slice(0, CW_LIST).join('')}</ul>` : ''}
      ${n > CW_LIST ? `<details class="cw-more"><summary>이전 기록 ${n - CW_LIST}개</summary><ul class="cw-list">${rows.slice(CW_LIST).join('')}</ul></details>` : ''}
    </div>`;
}
$('catstats').addEventListener('click', (e) => {
  if (e.target.closest('#cw-save')) {
    const d = $('cw-d').value || today;
    const w = parseFloat($('cw-w').value);
    if (d > today) { toast('오늘이나 지난 날짜만 적을 수 있어요'); return; }
    if (!(w > 0 && w < 30)) { toast('체중은 0–30kg 사이로 적어 주세요'); return; }
    const v = Math.round(w * 100) / 100;
    const had = state.cond[d] && state.cond[d].w;
    undoable(`${ml(d)} 고양이 체중 ${fmtKg(v)}을 ${had ? '고쳤어요' : '적었어요'}`, () => setCond(d, 'w', v));
    return;
  }
  const del = e.target.closest('[data-cwdel]');
  if (del) undoable(`${ml(del.dataset.cwdel)} 고양이 체중 기록을 지웠어요`, () => setCond(del.dataset.cwdel, 'w', null));
});
$('catstats').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'cw-w') { e.preventDefault(); $('cw-save').click(); }
});
