'use strict';

/* ═════════════════ 일기 ═════════════════
 * 하루에 한 장. 맨 위 '나침반'(내가 지향하는 문장) 아래에:
 *   ① 오늘 내 기준으로 인정하는 것 3가지 — 앱 기록에서 '지킨 약속'을 칩으로 보여 주고, 누르면 빈 줄에 들어간다
 *      ("내가 나를 인정한다"는 말이 공허하지 않게, 나를 믿을 근거를 실제 기록에서 꺼내 준다)
 *   ② 감사일기 — 한 줄에 하나씩 (20줄 안팎을 기준으로 줄 수를 보여 줌, 그 이상도 저장은 됨)
 *   ③ 마음에 이름 붙이기 — 무거운 마음을 고르면 '아끼는 친구에게 하듯 나에게 한마디' 칸이 열린다
 *   ④ 오늘의 질문 (하루 하나씩 돌아가며)
 *   나를 채우는 시간 — 혼자 회복(폰 없이 15분 · 독서 · 호흡 · 햇볕 …)과 연결(짧은 대화 · 안부 · 고마움 · 도움 청하기).
 *      이미 혼자 잘 지내는 사람에게는 '얼마나 자주 혼자'보다 '내가 고른 혼자인지'와 반대쪽인 '기대는 연결'이 연습 거리라서
 *      (기댈 곳이 있다고 느낄수록 혼자서 더 과감해진다 — 의존의 역설), 돈이 거의 안 드는 일상 위주로 고른다
 *   흔들린 순간 — 인정·애정 욕구가 올라온 순간을 그때그때 (언제 · 마음 · 그때 한 행동 · 아무도 모른다면)
 *   나를 지키는 환경 — 주간 SNS 시간, 월 지출 · 비상금 (몇 개월치인지)
 * 욕구를 없애는 게 아니라 끌려다니지 않는 연습이라, 모두 '알아차린 것'을 쌓는 곳이다:
 * 점수 · 연속 기록을 붙이지 않고, 안 쓴 날을 탓하지 않는다. 감정은 이름만 붙이고, 숫자는 행동과 환경에만 쓴다.
 *
 * state.diary = { 'YYYY-MM-DD': { t: 감사일기 글, at } }   글을 다 지우면 그 날은 지운다
 * state.mind  = { 'YYYY-MM-DD': { own: [세 줄], feel: [마음 이름], self: 나에게 한마디, q: { t: 질문, a: 답 }, qi: 다른 질문으로 넘긴 수,
 *                                  fill: [FILL_REST · FILL_LINK id 또는 직접 더한 이름], sh: [{ at, when, feel: [], act: [], nb, t }] } }
 *   (예전 '혼자만의 시간' alone은 처음 열 때 fill로 옮긴다 — core.js normalize)
 * state.compass = [문장]   state.compassHide = 접어 둠   state.feelCustom = [직접 더한 마음 이름]   state.fillCustom = [직접 더한 회복 활동]
 * state.sns   = { 주 시작(일요일) 'YYYY-MM-DD': 하루 평균 분 }   (휴대폰 디지털 웰빙에서 보고 적는다 — 웹앱은 사용 시간을 못 읽는다)
 * state.money = { 'YYYY-MM': { spend: 만원, fund: 만원 } }   비상금 ÷ 최근 3개월 지출 평균 = 몇 개월치 (목표 3–6개월)
 * 이 휴대폰에만 저장되고, 백업 파일(내보내기)에 함께 담긴다. 하루는 다른 탭처럼 새벽 4시에 바뀐다.
 * 피드백은 앱이 하지 않는다: '이번 달 일기 복사'로 채팅에 붙여 넣으면 감사 · 인정 · 흔들린 순간의 패턴과
 * 힘들었던 부분의 인지 왜곡, 생각 · 감정을 돌려 볼 방향을 같이 살펴본다. 리포트에는 숫자만 넣는다 (점수에는 넣지 않음). */

const DIARY_LINES = 20; // 줄 수 기준 (넘어도 저장)
const DIARY_MAX = 2000; // 하루 최대 글자 수 (저장 공간을 위해)
const OWN_N = 3;
const FEELS = ['외로움', '서운함', '인정받고 싶음', '불안', '지침', '슬픔', '화남', '편안함', '뿌듯함', '기쁨', '설렘', '고마움'];
const FEELS_HEAVY = new Set(['외로움', '서운함', '인정받고 싶음', '불안', '지침', '슬픔', '화남']);
const FEEL_CUSTOM_MAX = 12;
/* 오늘의 질문: 지향점 글의 연습과 나침반 문장에서 (날마다 하나씩 돌아가며) */
const QUESTIONS = [
  '아무도 모른다 해도 오늘 그걸 했을까요? (오늘 한 결정 하나)',
  '오늘 기꺼이 준 것은? (마음 · 시간 · 도움)',
  '오늘 도움을 청했나요, 청하고 싶었나요?',
  '남이 보지 않아도 좋았던 것은?',
  '오늘 내가 선택하고, 그 선택에 책임진 순간은?',
  '어제보다 조금 성숙해진 순간이 있었나요?',
  '오늘 나를 아껴 준 순간은?',
  '요즘 호기심이 가는 것은?',
  '오늘 내 행동을 정한 건 나였나요, 남의 반응이었나요?',
  "오늘 '와' 하고 감탄한 것은?",
  '오늘 천천히 음미한 순간은?',
  '이번 달 기다려지는 일은?',
];
/* 나를 채우는 시간: 혼자 회복 · 연결 (돈 거의 안 드는 일상 위주, 나들이는 도시에 가는 영화 · 연극 · 여행) */
const FILL_REST = [['nophone', '폰 없이 15분'], ['read', '독서'], ['breath', '호흡·명상'], ['sun', '햇볕·산책'], ['cook', '요리'], ['music', '음악·영화'], ['cat', '고양이와 교감'], ['outing', '나들이']];
const FILL_LINK = [['talk', '짧은 대화'], ['call', '안부 연락'], ['thanks', '고마움 전함'], ['help', '도움 청함']];
const FILL_OLD = [['meal', '혼밥']]; // 예전 '혼자만의 시간'에서 옮길 곳이 없던 것 (지난 기록에만 보인다)
const FILL_CUSTOM_MAX = 8;
const isLink = (v) => FILL_LINK.some(([x]) => x === v);
const fillLabel = (v) => pairLabel([...FILL_REST, ...FILL_LINK, ...FILL_OLD], v) || v; // 직접 더한 건 이름 그대로
/* 흔들린 순간: 언제 · 마음 · 그때 한 행동 · 아무도 모른다 해도 그렇게 했을까 */
const SH_WHEN = [['got', '인정받았을 때'], ['not', '못 받았을 때'], ['wait', '답을 기다릴 때'], ['compare', '비교될 때'], ['etc', '그 밖에']];
const SH_FEEL = ['서운함', '불안', '외로움', '부끄러움', '질투', '들뜸', '안도', '뿌듯함'];
const SH_ACT = [['check', '반응 확인'], ['push', '답장 재촉'], ['change', '결정을 바꿈'], ['pass', '그냥 느끼고 지나감'], ['help', '도움을 청함'], ['etc', '그 밖에']];
const SH_NB = [['yes', '했을 것'], ['no', '안 했을 것'], ['unsure', '모르겠다']];
const FUND_GOAL = '3–6개월';

$('dy-text').maxLength = DIARY_MAX;
const diaryOf = (k) => state.diary[k] || null;
const diaryLines = (t) => (t || '').split('\n').filter((l) => l.trim()).length;
const arr = (v) => (Array.isArray(v) ? v : []);
const mindOf = (k) => state.mind[k] || {};
const ownOf = (m) => arr(m.own).filter((t) => typeof t === 'string' && t.trim());
const shOf = (m) => arr(m.sh).filter((x) => x && typeof x === 'object');
/* 그 날 마음 기록에 내용이 있는지 (질문을 넘긴 표시 qi만 있는 건 빼고) */
const mindHas = (m) => !!(m && (ownOf(m).length || arr(m.feel).length || m.self || (m.q && m.q.a) || arr(m.fill).length || shOf(m).length));
const dayHas = (k) => !!diaryOf(k) || mindHas(state.mind[k]);
const pairLabel = (list, v) => (list.find(([x]) => x === v) || [])[1] || '';
const hhmm = (ms) => { const d = new Date(ms); return `${d.getHours()}:${pad(d.getMinutes())}`; };
let feelAdding = false; // 마음 이름 '+ 직접' 입력 칸을 연 상태
let fillAdding = false; // 회복 활동 '+ 직접' 입력 칸을 연 상태
let compassEdit = false;

/* 마음 기록 고치기: 빈 값은 지우고, 내용이 없으면 그 날을 지운다 (질문을 넘긴 표시는 남김) */
function setMind(k, patch, soon = false) {
  const m = { ...mindOf(k), ...patch };
  for (const f of Object.keys(m)) {
    const v = m[f];
    if (v === null || v === undefined || v === '' || v === 0 || (Array.isArray(v) && !v.some((x) => (typeof x === 'string' ? x.trim() : x)))) delete m[f];
  }
  if (Object.keys(m).length) state.mind[k] = m;
  else delete state.mind[k];
  if (soon) saveSoon(); else save();
}

function renderDiary() {
  const k = ui.diaryDate;
  const diff = diffDays(k, today);
  $('dy-sub').textContent = `${mdw(k)} · ${relDay(k)}`;
  $('dy-sub').classList.toggle('is-today', diff === 0);
  $('dy-today').hidden = diff === 0;
  $('dy-next').disabled = k >= today;

  renderCompass();
  renderOwn();
  const ta = $('dy-text');
  const rec = diaryOf(k);
  // 입력 중에 다시 그려도 글이 흔들리지 않게 (날짜가 바뀌었을 때만 칸을 채운다)
  if (ta.dataset.k !== k || document.activeElement !== ta) {
    ta.value = rec ? rec.t : '';
    ta.dataset.k = k;
  }
  const d = parse(k);
  ta.placeholder = diff === 0
    ? '예: 퇴근길 노을이 예뻤다\n고양이가 밥을 잘 먹었다\n동료가 커피를 사 줬다'
    : `${d.getMonth() + 1}월 ${d.getDate()}일에 감사했던 일`;
  growText(ta);
  updateDiaryCount();
  renderFeel();
  renderQuestion();
  renderFill();
  renderShakes();
  renderDiaryMonth();
  renderEnv();
}

/* ───────── 나침반 ───────── */
function renderCompass() {
  const list = state.compass;
  if (compassEdit) {
    const rows = [...list, ''].slice(0, 5);
    $('dy-compass').innerHTML = `<div class="dy-cp-head"><span>나침반</span><span class="spacer"></span>
        <button type="button" class="dy-cp-btn" data-cp="cancel">취소</button><button type="button" class="dy-cp-btn strong" data-cp="save">저장</button></div>
      ${rows.map((t, i) => `<input class="dy-cp-in" data-cpi="${i}" type="text" maxlength="60" enterkeyhint="done" aria-label="나침반 ${i + 1}번째 문장"
        placeholder="${i ? '' : '내가 지향하는 문장'}" value="${esc(t)}">`).join('')}`;
    return;
  }
  const hide = state.compassHide || !list.length;
  $('dy-compass').innerHTML = `<div class="dy-cp-head">
      <button type="button" class="dy-cp-toggle" data-cp="toggle" aria-expanded="${!hide}">나침반${hide && list.length ? ` <small>${esc(list[0])}${list.length > 1 ? ' …' : ''}</small>` : ''}</button>
      <span class="spacer"></span><button type="button" class="dy-cp-btn" data-cp="edit">${list.length ? '고치기' : '적기'}</button></div>
    ${hide ? '' : `<ul class="dy-cp-list">${list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`}`;
}
$('dy-compass').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cp]');
  if (!b) return;
  const a = b.dataset.cp;
  if (a === 'toggle') { state.compassHide = !state.compassHide; save(); }
  else if (a === 'edit') compassEdit = true;
  else if (a === 'cancel') compassEdit = false;
  else if (a === 'save') {
    state.compass = [...$('dy-compass').querySelectorAll('[data-cpi]')].map((x) => x.value.trim()).filter(Boolean);
    state.compassHide = false;
    compassEdit = false;
    save();
    toast(state.compass.length ? '나침반을 고쳤어요' : '나침반을 비웠어요');
  }
  renderCompass();
  if (a === 'edit') { const f = $('dy-compass').querySelector('[data-cpi]'); if (f) f.focus(); }
});
$('dy-compass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-cpi]')) { e.preventDefault(); $('dy-compass').querySelector('[data-cp="save"]').click(); }
});

/* ───────── ① 오늘 내 기준으로 인정하는 것 3가지 ───────── */
/* 앱 기록에서 꺼낸 '지킨 약속' (그 날): 할 일 · 공부 · 운동 · 스쿼트 · 케어 · 잠 · 과자 */
function keptPromises(k) {
  const out = [];
  const done = (state.days[k] || []).filter((t) => t.d).length;
  if (done) out.push(`할 일 ${done}개 끝냄`);
  const st = state.studies[k];
  if (st && st.min) out.push(`공부 ${fmtMin(st.min)}`);
  if (st && st.review) out.push('아침 복습');
  const wr = state.workouts[k];
  if (wr && (wr.ex20 || wr.bike || arr(wr.rows).length || EXERCISES.some((ex) => wr[ex.id]))) out.push(wr.ex20 ? '20분 운동' : '운동');
  if (wr && wr.sq) out.push(`식후 스쿼트 ${wr.sq}회`);
  const care = [...new Set(state.events.filter((ev) => ev.cat === 'care' && ev.done && ev.done[k]).map((ev) => ev.title))];
  for (const t of care) out.push(`${t} 챙김`);
  if (state.hstart && k >= state.hstart) {
    if (!hOn('snack', k)) out.push('과자 안 먹음');
    if (k < today && !hOn('late', k)) out.push('11:30 전에 잠');
  }
  return out;
}

function renderOwn() {
  const k = ui.diaryDate;
  const m = mindOf(k);
  const own = Array.from({ length: OWN_N }, (_, i) => (arr(m.own)[i] || ''));
  const chips = keptPromises(k);
  const ph = ['예: 퇴근하고 바로 1차 공부를 시작했다', '예: 피곤했는데 고양이 약을 챙겼다', '예: 답장이 없어도 내 할 일을 했다'];
  $('dy-own').innerHTML = `<div class="wo-head"><span class="wo-name">오늘 인정하는 것 3가지</span><span class="wo-target">남의 반응 말고, 내 기준으로 오늘 내가 한 일</span></div>
    ${chips.length ? `<div class="dy-kept"><span>오늘 지킨 약속 · 누르면 줄에 들어가요</span><div class="chips dy-chips" role="group" aria-label="오늘 지킨 약속 (누르면 줄에 들어가요)">${chips.map((c) => `<button type="button" data-kept="${esc(c)}" aria-pressed="${own.includes(c)}">${esc(c)}</button>`).join('')}</div></div>` : ''}
    ${own.map((t, i) => `<div class="dy-line"><span class="dy-no">${i + 1}</span><textarea class="dy-in" data-own="${i}" rows="1" maxlength="120" aria-label="인정하는 것 ${i + 1}" placeholder="${ph[i]}">${esc(t)}</textarea></div>`).join('')}`;
  for (const t of $('dy-own').querySelectorAll('textarea')) growText(t);
}
$('dy-own').addEventListener('click', (e) => {
  const c = e.target.closest('[data-kept]');
  if (!c) return;
  const k = ui.diaryDate;
  const own = Array.from({ length: OWN_N }, (_, i) => (arr(mindOf(k).own)[i] || ''));
  const t = c.dataset.kept;
  const at = own.indexOf(t);
  if (at >= 0) own[at] = ''; // 다시 누르면 뺀다
  else {
    const i = own.findIndex((x) => !x.trim());
    if (i < 0) { toast('세 줄이 다 찼어요. 한 줄을 비우면 넣을 수 있어요'); return; }
    own[i] = t;
  }
  setMind(k, { own });
  renderOwn();
  renderDiaryMonth();
});
$('dy-own').addEventListener('input', (e) => {
  const i = e.target.dataset.own;
  if (i === undefined) return;
  const k = ui.diaryDate;
  const had = dayHas(k);
  const own = Array.from({ length: OWN_N }, (_, j) => (arr(mindOf(k).own)[j] || ''));
  own[+i] = e.target.value.replace(/\s*\n\s*/g, ' ');
  setMind(k, { own }, true);
  growText(e.target);
  for (const c of $('dy-own').querySelectorAll('[data-kept]')) c.setAttribute('aria-pressed', String(own.includes(c.dataset.kept)));
  if (had !== dayHas(k)) renderDiaryMonth();
});

/* ───────── ② 감사일기: 줄 수 · 저장 표시 ───────── */
function updateDiaryCount() {
  const t = $('dy-text').value;
  const n = diaryLines(t);
  const over = n > DIARY_LINES;
  $('dy-count').textContent = `${n} / ${DIARY_LINES}줄`;
  $('dy-count').classList.toggle('over', over);
  const rec = diaryOf(ui.diaryDate);
  $('dy-status').textContent = over ? `${DIARY_LINES}줄을 넘었어요. 그래도 저장돼요.`
    : rec ? `저장됨 · ${hhmm(rec.at)}` : '쓰면 바로 저장돼요';
}

/* ───────── ③ 마음에 이름 붙이기 · 나에게 한마디 ───────── */
function renderFeel() {
  const k = ui.diaryDate;
  const m = mindOf(k);
  const sel = arr(m.feel);
  const all = [...FEELS, ...state.feelCustom.filter((f) => !FEELS.includes(f)), ...sel.filter((f) => !FEELS.includes(f) && !state.feelCustom.includes(f))];
  const heavy = sel.some((f) => FEELS_HEAVY.has(f)) || shOf(m).length;
  $('dy-feel').innerHTML = `<div class="wo-head"><span class="wo-name">지금 마음에 이름 붙이기</span><span class="wo-target">여러 개 · 눌러 없애지 말고 알아차리기만</span></div>
    <div class="chips dy-chips" role="group" aria-label="마음 이름">${all.map((f) => `<button type="button" data-feel="${esc(f)}" aria-pressed="${sel.includes(f)}">${esc(f)}</button>`).join('')}
      ${feelAdding ? '' : '<button type="button" class="dy-add-chip" data-feel-add>+ 직접</button>'}</div>
    ${feelAdding ? `<div class="dy-line"><input class="dy-in" id="dy-feel-new" type="text" maxlength="12" enterkeyhint="done" placeholder="마음 이름 (예: 허전함)" aria-label="새 마음 이름">
      <button type="button" class="dy-cp-btn strong" data-feel-ok>더하기</button></div>` : ''}
    ${heavy || m.self ? `<p class="dy-self-q">아끼는 친구에게 하듯, 나에게 한마디</p>
      <textarea class="dy-in dy-self" id="dy-self" rows="1" maxlength="300" aria-label="나에게 한마디" placeholder="예: 오늘 많이 지쳤지. 그래도 끝까지 해낸 거 알아.">${esc(m.self || '')}</textarea>` : ''}`;
  const s = $('dy-self');
  if (s) growText(s);
}
function addCustomFeel() {
  const inp = $('dy-feel-new');
  const t = inp ? inp.value.trim() : '';
  feelAdding = false;
  if (t) {
    const k = ui.diaryDate;
    if (!FEELS.includes(t) && !state.feelCustom.includes(t)) {
      if (state.feelCustom.length >= FEEL_CUSTOM_MAX) state.feelCustom.shift(); // 가장 오래된 것부터 빠진다
      state.feelCustom.push(t);
    }
    const sel = arr(mindOf(k).feel);
    setMind(k, { feel: sel.includes(t) ? sel : [...sel, t] });
  }
  renderFeel();
  renderDiaryMonth();
}
$('dy-feel').addEventListener('click', (e) => {
  const k = ui.diaryDate;
  if (e.target.closest('[data-feel-add]')) { feelAdding = true; renderFeel(); $('dy-feel-new').focus(); return; }
  if (e.target.closest('[data-feel-ok]')) { addCustomFeel(); return; }
  const b = e.target.closest('[data-feel]');
  if (!b) return;
  const f = b.dataset.feel;
  const sel = arr(mindOf(k).feel);
  setMind(k, { feel: sel.includes(f) ? sel.filter((x) => x !== f) : [...sel, f] });
  renderFeel();
  renderDiaryMonth();
});
$('dy-feel').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'dy-feel-new') { e.preventDefault(); addCustomFeel(); }
});
$('dy-feel').addEventListener('input', (e) => {
  if (e.target.id !== 'dy-self') return;
  const k = ui.diaryDate;
  const had = dayHas(k);
  setMind(k, { self: e.target.value.trim() ? e.target.value : null }, true);
  growText(e.target);
  if (had !== dayHas(k)) renderDiaryMonth();
});

/* ───────── ④ 오늘의 질문 ───────── */
const qIndex = (k) => {
  const n = diffDays(k, '2026-01-01') + (mindOf(k).qi || 0);
  return ((n % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length;
};
const questionOf = (k) => { const q = mindOf(k).q; return q && q.t ? q.t : QUESTIONS[qIndex(k)]; };

function renderQuestion() {
  const k = ui.diaryDate;
  const m = mindOf(k);
  const answered = !!(m.q && m.q.a);
  $('dy-q').innerHTML = `<div class="wo-head"><span class="wo-name">오늘의 질문</span><span class="wo-target">안 써도 괜찮아요</span>
      ${answered ? '' : '<button type="button" class="dy-cp-btn" data-q-next>다른 질문</button>'}</div>
    <p class="dy-question">${esc(questionOf(k))}</p>
    <textarea class="dy-in" id="dy-qa" rows="1" maxlength="500" aria-label="오늘의 질문에 답하기" placeholder="떠오르는 대로 한두 줄">${esc(answered ? m.q.a : '')}</textarea>`;
  growText($('dy-qa'));
}
$('dy-q').addEventListener('click', (e) => {
  const k = ui.diaryDate;
  if (e.target.closest('[data-q-next]')) {
    setMind(k, { qi: (mindOf(k).qi || 0) + 1 });
    renderQuestion();
  }
});
$('dy-q').addEventListener('input', (e) => {
  if (e.target.id !== 'dy-qa') return;
  const k = ui.diaryDate;
  const had = dayHas(k);
  const a = e.target.value;
  // 답을 쓰기 시작하면 그 날의 질문을 함께 남긴다 (질문 목록이 바뀌어도 그대로 보이게)
  setMind(k, { q: a.trim() ? { t: questionOf(k), a } : null }, true);
  growText(e.target);
  const nx = $('dy-q').querySelector('[data-q-next]');
  if (nx) nx.hidden = !!a.trim();
  if (had !== dayHas(k)) renderDiaryMonth();
});

/* ───────── 나를 채우는 시간: 혼자 회복 · 연결 ───────── */
/* k가 들어 있는 주(일–토)의 회복 · 연결 횟수 */
function fillWeek(k) {
  let rest = 0, link = 0;
  for (let i = 0, ws = weekStart(k); i < 7; i++) for (const v of arr(mindOf(addDays(ws, i)).fill)) if (isLink(v)) link++; else rest++;
  return { rest, link };
}

function renderFill() {
  const k = ui.diaryDate;
  const sel = arr(mindOf(k).fill);
  // 기본 + 직접 더한 것 + 그 날 고른 예전 항목(혼밥 등)
  const rest = [...FILL_REST, ...state.fillCustom.map((t) => [t, t]),
    ...sel.filter((v) => !isLink(v) && !FILL_REST.some(([x]) => x === v) && !state.fillCustom.includes(v)).map((v) => [v, fillLabel(v)])];
  const chip = ([v, l]) => `<button type="button" data-fill="${esc(v)}" aria-pressed="${sel.includes(v)}">${esc(l)}</button>`;
  const wk = fillWeek(k);
  const when = k >= weekStart(today) ? '이번 주' : '그 주';
  const hint = wk.rest + wk.link === 0 ? '돈이 들지 않아도, 내가 고른 시간이면 충분해요.'
    : wk.rest >= 3 && !wk.link ? `${when} 회복 ${wk.rest}번. 혼자 잘 지내는 사람일수록 기대는 연습이 도움이 돼요 — 짧은 대화 하나도 충분해요.`
      : `${when} 회복 ${wk.rest}번 · 연결 ${wk.link}번. 혼자 보낸 뒤 기운이 차면 쉼, 가라앉으면 연결 쪽을 하나 더 해 보세요.`;
  $('dy-fill').innerHTML = `<div class="wo-head"><span class="wo-name">나를 채우는 시간</span><span class="wo-target">혼자 회복하고, 기대고 주기</span></div>
    <div class="dy-fill-row"><span>혼자 회복</span><div class="chips dy-chips" role="group" aria-label="혼자 회복">${rest.map(chip).join('')}
      ${fillAdding ? '' : '<button type="button" class="dy-add-chip" data-fill-add>+ 직접</button>'}</div></div>
    ${fillAdding ? `<div class="dy-line"><input class="dy-in" id="dy-fill-new" type="text" maxlength="12" enterkeyhint="done" placeholder="예: 그림 그리기" aria-label="새 회복 활동">
      <button type="button" class="dy-cp-btn strong" data-fill-ok>더하기</button></div>` : ''}
    <div class="dy-fill-row"><span>연결</span><div class="chips dy-chips" role="group" aria-label="연결">${FILL_LINK.map(chip).join('')}</div></div>
    <p class="dy-hint">${hint}</p>`;
}
function addCustomFill() {
  const inp = $('dy-fill-new');
  const t = inp ? inp.value.trim() : '';
  fillAdding = false;
  if (t) {
    const k = ui.diaryDate;
    const known = [...FILL_REST, ...FILL_LINK].find(([, l]) => l === t);
    const v = known ? known[0] : t;
    if (!known && !state.fillCustom.includes(t)) {
      if (state.fillCustom.length >= FILL_CUSTOM_MAX) state.fillCustom.shift(); // 가장 오래된 것부터 빠진다
      state.fillCustom.push(t);
    }
    const sel = arr(mindOf(k).fill);
    setMind(k, { fill: sel.includes(v) ? sel : [...sel, v] });
  }
  renderFill();
  renderDiaryMonth();
}
$('dy-fill').addEventListener('click', (e) => {
  const k = ui.diaryDate;
  if (e.target.closest('[data-fill-add]')) { fillAdding = true; renderFill(); $('dy-fill-new').focus(); return; }
  if (e.target.closest('[data-fill-ok]')) { addCustomFill(); return; }
  const b = e.target.closest('[data-fill]');
  if (!b) return;
  const v = b.dataset.fill;
  const sel = arr(mindOf(k).fill);
  setMind(k, { fill: sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v] });
  renderFill();
  renderDiaryMonth();
});
$('dy-fill').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'dy-fill-new') { e.preventDefault(); addCustomFill(); }
});

/* ───────── 흔들린 순간 ───────── */
const shLine = (s) => [s.at ? hhmm(s.at) : '', pairLabel(SH_WHEN, s.when), arr(s.feel).join('·'),
  arr(s.act).map((a) => pairLabel(SH_ACT, a)).join('·'), s.nb ? `아무도 모른다면: ${pairLabel(SH_NB, s.nb)}` : ''].filter(Boolean).join(' · ');
/* k가 들어 있는 주의 흔들린 순간 수와 '그냥 느끼고 지나감' 수 */
function shakeWeek(k) {
  let n = 0, pass = 0;
  for (let i = 0, ws = weekStart(k); i < 7; i++) {
    for (const s of shOf(mindOf(addDays(ws, i)))) { n++; if (arr(s.act).includes('pass')) pass++; }
  }
  return { n, pass };
}

function renderShakes() {
  const k = ui.diaryDate;
  const list = shOf(mindOf(k));
  const wk = shakeWeek(k);
  $('dy-shake').innerHTML = `<div class="wo-head"><span class="wo-name">흔들린 순간</span><span class="wo-target">인정·애정 욕구가 올라왔을 때</span>
      <span class="wo-amt">${list.length ? `${list.length}번` : ''}</span></div>
    ${list.length ? `<ul class="dy-sh-list">${list.map((s, i) => `<li><button type="button" data-sh="${i}">
        <span>${esc(shLine(s)) || '기록'}</span>${s.t ? `<small>${esc(s.t)}</small>` : ''}</button></li>`).join('')}</ul>` : ''}
    <button type="button" class="h-add dy-sh-add" data-sh="new">+ 흔들린 순간 적기</button>
    <p class="dy-hint">${wk.n ? `${k >= weekStart(today) ? '이번 주' : '그 주'} ${wk.n}번${wk.pass ? ` · 그냥 느끼고 지나감 ${wk.pass}번` : ''}. 알아차린 횟수일 뿐, 잘하고 못한 게 아니에요.`
      : '없애려 하지 말고 "아, 지금 인정받고 싶구나" 하고 알아차리기만 해도 돼요.'}</p>`;
}
$('dy-shake').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sh]');
  if (b) openShake(b.dataset.sh === 'new' ? -1 : +b.dataset.sh);
});

let shCtx = null; // { k, i, when, feel, act, nb }
function renderShakeFields() {
  const c = shCtx;
  const group = (g, label, opts, sel, multi) => `<div class="sh-group"><p>${label}${multi ? ' <small>여러 개</small>' : ''}</p>
    <div class="chips dy-chips" role="group" aria-label="${label}" data-g="${g}">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${multi ? sel.includes(v) : sel === v}">${esc(l)}</button>`).join('')}</div></div>`;
  $('sh-fields').innerHTML = group('when', '언제', SH_WHEN, c.when, false)
    + group('feel', '마음', SH_FEEL.map((f) => [f, f]), c.feel, true)
    + group('act', '그때 한 행동', SH_ACT, c.act, true)
    + group('nb', '아무도 모른다 해도 그렇게 했을까?', SH_NB, c.nb, false);
}
function openShake(i) {
  const k = ui.diaryDate;
  const s = i >= 0 ? shOf(mindOf(k))[i] : null;
  shCtx = { k, i, at: s ? s.at : null, when: s ? s.when || '' : '', feel: s ? arr(s.feel).slice() : [], act: s ? arr(s.act).slice() : [], nb: s ? s.nb || '' : '' };
  $('sh-title').textContent = s ? `${ml(k)} 흔들린 순간` : k === today ? '흔들린 순간' : `${ml(k)} 흔들린 순간`;
  $('sh-memo').value = s ? s.t || '' : '';
  $('sh-del').hidden = !s;
  renderShakeFields();
  $('sh-sheet').hidden = false;
}
function closeShake() {
  $('sh-sheet').hidden = true;
  shCtx = null;
  document.activeElement.blur();
}
$('sh-sheet').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) { closeShake(); return; }
  const b = e.target.closest('[data-g] [data-v]');
  if (!b || !shCtx) return;
  const g = b.parentElement.dataset.g;
  const v = b.dataset.v;
  if (g === 'feel' || g === 'act') shCtx[g] = shCtx[g].includes(v) ? shCtx[g].filter((x) => x !== v) : [...shCtx[g], v];
  else shCtx[g] = shCtx[g] === v ? '' : v;
  renderShakeFields();
});
$('sh-sheet').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeShake(); });
$('sh-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const c = shCtx;
  if (!c) return;
  const t = $('sh-memo').value.trim();
  if (!c.when && !c.feel.length && !c.act.length && !c.nb && !t) { toast('하나만 골라도 돼요'); return; }
  const rec = { at: c.at || (c.k === today ? Date.now() : 0), when: c.when, feel: c.feel, act: c.act, nb: c.nb, t };
  for (const f of Object.keys(rec)) if (!rec[f] || (Array.isArray(rec[f]) && !rec[f].length)) delete rec[f];
  const list = shOf(mindOf(c.k)).slice();
  if (c.i >= 0) list[c.i] = rec; else list.push(rec);
  const had = dayHas(c.k);
  setMind(c.k, { sh: list });
  closeShake();
  toast(c.i >= 0 ? '고쳤어요' : '적어 두었어요. 알아차린 것만으로 충분해요');
  renderShakes();
  renderFeel(); // 흔들린 날엔 '나에게 한마디' 칸이 열린다
  if (had !== dayHas(c.k)) renderDiaryMonth();
});
$('sh-del').addEventListener('click', () => {
  const c = shCtx;
  if (!c || c.i < 0) return;
  closeShake();
  undoable('흔들린 순간 기록을 지웠어요', () => {
    const list = shOf(mindOf(c.k)).filter((_, j) => j !== c.i);
    const m = { ...mindOf(c.k), sh: list };
    if (!list.length) delete m.sh;
    if (Object.keys(m).length) state.mind[c.k] = m; else delete state.mind[c.k];
  });
});

/* ───────── 이번 달: 쓴 날 표시(누르면 그 날로) · 모아 보기 · 피드백용 복사 ───────── */
function renderDiaryMonth() {
  const k = ui.diaryDate;
  const start = monthStart(k);
  const end = monthEnd(k);
  const days = [];
  for (let x = start; x <= end; x = addDays(x, 1)) days.push(x);
  const written = days.filter(dayHas);
  const lines = written.reduce((a, x) => a + (diaryOf(x) ? diaryLines(diaryOf(x).t) : 0), 0);
  const shakes = written.reduce((a, x) => a + shOf(mindOf(x)).length, 0);
  const lead = parse(start).getDay();
  $('dy-month').innerHTML = `
    <div class="wo-head"><span class="wo-name">${parse(k).getMonth() + 1}월</span>
      <span class="wo-target">${written.length ? `${written.length}일 썼어요${lines ? ` · 감사 ${lines}줄` : ''}${shakes ? ` · 흔들린 순간 ${shakes}번` : ''}` : '아직 쓴 날이 없어요'}</span></div>
    <div class="dy-days">${'<span></span>'.repeat(lead)}${days.map((x) => `<button type="button" class="dy-day${dayHas(x) ? ' on' : ''}${x === k ? ' sel' : ''}${x === today ? ' today' : ''}"
      data-k="${x}" ${x > today ? 'disabled' : ''} aria-label="${mdw(x)}${dayHas(x) ? ' 일기 있음' : ''}">${parse(x).getDate()}</button>`).join('')}</div>
    ${written.length ? `<details class="r-week dy-all"><summary>이번 달 일기 모아 보기</summary>
      <ul>${written.map((x) => `<li><b>${ml(x)} (${WD[parse(x).getDay()]})</b>${dayParts(x).map(([h, v]) => `<span class="dy-part"><em>${esc(h)}</em>${esc(v).replace(/\n+/g, '<br>')}</span>`).join('')}</li>`).join('')}</ul></details>
      <button type="button" class="h-add dy-copy" id="dy-copy">이번 달 일기 복사 (피드백용)</button>` : ''}`;
}

/* 하루 일기를 [제목, 내용] 조각으로 (모아 보기 · 복사 공통) */
function dayParts(x) {
  const out = [];
  const r = diaryOf(x);
  const m = mindOf(x);
  const bul = (t) => t.split('\n').filter((l) => l.trim()).map((l) => `- ${l.trim()}`).join('\n');
  if (r) out.push(['감사', bul(r.t)]);
  if (ownOf(m).length) out.push(['내 기준으로 인정한 것', ownOf(m).map((t) => `- ${t.trim()}`).join('\n')]);
  if (arr(m.feel).length) out.push(['마음', arr(m.feel).join(', ')]);
  if (m.self) out.push(['나에게', m.self.trim()]);
  if (m.q && m.q.a) out.push(['질문', `${m.q.t} → ${m.q.a.trim()}`]);
  const fill = arr(m.fill);
  if (fill.length) {
    const part = (list) => list.map(fillLabel).join(', ');
    const rest = fill.filter((v) => !isLink(v)), link = fill.filter(isLink);
    out.push(['나를 채우는 시간', [rest.length ? `회복: ${part(rest)}` : '', link.length ? `연결: ${part(link)}` : ''].filter(Boolean).join(' / ')]);
  }
  if (shOf(m).length) out.push(['흔들린 순간', shOf(m).map((s) => `- ${shLine(s)}${s.t ? ` · ${s.t}` : ''}`).join('\n')]);
  return out;
}

/* 피드백용 텍스트: 나침반 → 날짜별 조각 → 이번 달 환경 */
function diaryMonthText(k) {
  const start = monthStart(k);
  const end = monthEnd(k);
  const out = [`[일기 ${parse(k).getFullYear()}년 ${parse(k).getMonth() + 1}월]`];
  if (state.compass.length) out.push(`나침반: ${state.compass.join(' / ')}`);
  for (let x = start; x <= end; x = addDays(x, 1)) {
    if (!dayHas(x)) continue;
    out.push('', `${ml(x)} (${WD[parse(x).getDay()]})`);
    for (const [h, v] of dayParts(x)) out.push(v.includes('\n') || v.startsWith('- ') ? `[${h}]\n${v}` : `[${h}] ${v}`);
  }
  const env = envLines(k);
  if (env.length) out.push('', '[이번 달 환경]', ...env);
  return out.join('\n');
}

function goDiary(k) {
  if (k > today) return;
  flushSave();
  feelAdding = false;
  fillAdding = false;
  ui.diaryDate = k;
  renderDiary();
}

$('dy-text').addEventListener('input', (e) => {
  const k = ui.diaryDate;
  const t = e.target.value;
  const had = dayHas(k);
  if (t.trim()) state.diary[k] = { t, at: Date.now() };
  else delete state.diary[k];
  saveSoon();
  growText(e.target); // 쓰는 만큼 칸이 늘어난다
  updateDiaryCount();
  if (had !== dayHas(k)) renderDiaryMonth(); // 쓴 날 표시가 바뀔 때만
});
$('dy-prev').addEventListener('click', () => goDiary(addDays(ui.diaryDate, -1)));
$('dy-next').addEventListener('click', () => goDiary(addDays(ui.diaryDate, 1)));
$('dy-today').addEventListener('click', () => goDiary(today));
$('dy-month').addEventListener('click', async (e) => {
  const b = e.target.closest('.dy-day[data-k]');
  if (b) { goDiary(b.dataset.k); $('dy-scroll').scrollTop = 0; return; }
  if (e.target.closest('#dy-copy')) {
    try {
      await navigator.clipboard.writeText(diaryMonthText(ui.diaryDate));
      toast('이번 달 일기를 복사했어요. 채팅에 붙여 넣으면 돼요');
    } catch (err) {
      toast('복사하지 못했어요');
    }
  }
});

/* ───────── 나를 지키는 환경: SNS 시간 · 지출 · 비상금 ───────── */
const ymOf = (k) => k.slice(0, 7);
const ymLabel = (ym) => `${+ym.slice(5)}월`;
/* ym 달 기준 비상금이 몇 개월치인지: 그 달까지 가장 최근 비상금 ÷ 최근 3개월(적은 달만) 지출 평균 */
function fundMonths(ym) {
  const keys = Object.keys(state.money).filter((x) => x <= ym).sort();
  const fk = [...keys].reverse().find((x) => state.money[x].fund > 0);
  const spends = keys.filter((x) => state.money[x].spend > 0).slice(-3).map((x) => state.money[x].spend);
  if (!fk) return null;
  const fund = state.money[fk].fund;
  const avg = spends.length ? spends.reduce((a, b) => a + b, 0) / spends.length : 0;
  return { fund, avg, months: avg ? fund / avg : null };
}
const monthsText = (f) => (f && f.months !== null ? `약 ${Math.round(f.months * 10) / 10}개월치` : '');

function renderEnv() {
  const k = ui.diaryDate;
  const env = $('dy-env');
  const wsK = weekStart(k);
  const sns = state.sns[wsK];
  const prev = state.sns[addDays(wsK, -7)];
  const ym = ymOf(k);
  const mo = state.money[ym] || {};
  const f = fundMonths(ym);
  const sum = [sns !== undefined ? `SNS 하루 ${sns}분` : '', monthsText(f) ? `비상금 ${monthsText(f)}` : ''].filter(Boolean).join(' · ');
  const open = env.open;
  env.innerHTML = `<summary><span class="wo-name">나를 지키는 환경</span><span class="wo-target">${sum || 'SNS 시간 · 돈'}</span></summary>
    <div class="dy-env-row"><label for="dy-sns">SNS 하루 평균<small>${ml(wsK)}–${ml(addDays(wsK, 6))} 주</small></label>
      <input class="cond-w" id="dy-sns" type="number" inputmode="numeric" min="0" max="1440" step="1" placeholder="0" value="${sns ?? ''}"><span class="cond-unit">분</span>
      ${prev !== undefined ? `<small class="dy-env-note">지난주 ${prev}분</small>` : ''}</div>
    <p class="dy-hint">휴대폰 설정 → 디지털 웰빙에서 보고 일주일에 한 번 적어요. 비교를 부르는 시간이 줄면 흔들리는 순간도 줄어요.</p>
    <div class="dy-env-row"><label for="dy-spend">${ymLabel(ym)} 지출</label>
      <input class="cond-w" id="dy-spend" type="number" inputmode="numeric" min="0" max="100000" step="1" placeholder="0" value="${mo.spend ?? ''}"><span class="cond-unit">만원</span></div>
    <div class="dy-env-row"><label for="dy-fund">비상금</label>
      <input class="cond-w" id="dy-fund" type="number" inputmode="numeric" min="0" max="1000000" step="1" placeholder="0" value="${mo.fund ?? ''}"><span class="cond-unit">만원</span>
      <small class="dy-env-note">${monthsText(f) ? `${monthsText(f)} · 목표 ${FUND_GOAL}` : f ? '지출을 적으면 몇 개월치인지 보여 드려요' : `목표: 생활비 ${FUND_GOAL}치`}</small></div>
    <p class="dy-hint">한 달에 한 번, 지출 합계와 비상금만 적어요 (은행 앱에서 확인). 비상금은 원치 않는 관계에 머무르지 않게 해 주는 바닥이에요.</p>`;
  env.open = open;
}
$('dy-env').addEventListener('change', (e) => {
  const k = ui.diaryDate;
  const v = e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value));
  if (e.target.id === 'dy-sns') {
    if (v === null || !Number.isFinite(v) || v > 1440) delete state.sns[weekStart(k)];
    else state.sns[weekStart(k)] = v;
  } else if (e.target.id === 'dy-spend' || e.target.id === 'dy-fund') {
    const f = e.target.id === 'dy-spend' ? 'spend' : 'fund';
    const mo = { ...(state.money[ymOf(k)] || {}) };
    if (v === null || !Number.isFinite(v)) delete mo[f]; else mo[f] = v;
    if (Object.keys(mo).length) state.money[ymOf(k)] = mo; else delete state.money[ymOf(k)];
  } else return;
  save();
  renderEnv();
});

/* 이번 달 환경 (복사 텍스트 · 리포트) */
function envLines(k) {
  const start = monthStart(k), end = monthEnd(k);
  const out = [];
  const weeks = Object.keys(state.sns).filter((w) => w >= addDays(start, -6) && w <= end).sort();
  if (weeks.length) out.push(`SNS 하루 평균: ${weeks.map((w) => `${ml(w)} 주 ${state.sns[w]}분`).join(' · ')}`);
  const mo = state.money[ymOf(k)];
  const f = fundMonths(ymOf(k));
  if (mo && (mo.spend || mo.fund)) out.push(`돈: ${[mo.spend ? `지출 ${mo.spend}만원` : '', mo.fund ? `비상금 ${mo.fund}만원` : ''].filter(Boolean).join(' · ')}${monthsText(f) ? ` (${monthsText(f)})` : ''}`);
  return out;
}

/* ═════════ 리포트: '마음' 칸 (숫자만, 점수에는 넣지 않음) ═════════ */
function analyzeMind(start, last) {
  const r = { days: 0, own: 0, ownDays: 0, feel: {}, self: 0, q: 0, rest: {}, link: {}, restN: 0, linkN: 0, sh: 0, when: {}, act: {}, nb: {}, shAfterLate: 0, shLateKnown: 0, sns: [], fund: null };
  const bump = (o, x) => { o[x] = (o[x] || 0) + 1; };
  for (const k in state.mind) {
    if (k < start || k > last) continue;
    const m = state.mind[k];
    if (!mindHas(m)) continue;
    r.days++;
    const own = ownOf(m).length;
    if (own) { r.own += own; r.ownDays++; }
    for (const f of arr(m.feel)) bump(r.feel, f);
    if (m.self) r.self++;
    if (m.q && m.q.a) r.q++;
    for (const v of arr(m.fill)) {
      if (isLink(v)) { r.linkN++; bump(r.link, v); } else { r.restN++; bump(r.rest, v); }
    }
    for (const s of shOf(m)) {
      r.sh++;
      if (s.when) bump(r.when, s.when);
      for (const a of arr(s.act)) bump(r.act, a);
      if (s.nb) bump(r.nb, s.nb);
      // 몸의 리듬과 연결: 전날 밤 늦게 잤는지 (건강 카드를 쓰기 시작한 뒤만)
      const prev = addDays(k, -1);
      if (state.hstart && prev >= state.hstart) { r.shLateKnown++; if (hOn('late', prev)) r.shAfterLate++; }
    }
  }
  r.sns = Object.keys(state.sns).filter((w) => w >= addDays(start, -6) && w <= last).sort().map((w) => [w, state.sns[w]]);
  r.fund = fundMonths(last.slice(0, 7));
  return r;
}
const topText = (o, label = (x) => x, n = 5) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([x, c]) => `${label(x)} ${c}`).join(' · ');

function mindSection(mi, yearly) {
  if (!mi.days && !mi.sns.length && !(mi.fund && mi.fund.months !== null)) return ['', []];
  const tiles = [];
  if (mi.own) tiles.push(['인정한 것', `${mi.own}<small>개</small>`, `<small>${mi.ownDays}일</small>`]);
  if (mi.sh) tiles.push(['흔들린 순간', `${mi.sh}<small>번</small>`, mi.act.pass ? `<small>그냥 느끼고 지나감 ${mi.act.pass}</small>` : '']);
  if (mi.restN + mi.linkN) tiles.push(['나를 채우는 시간', `${mi.restN + mi.linkN}<small>번</small>`, `<small>회복 ${mi.restN} · 연결 ${mi.linkN}</small>`]);
  if (mi.q) tiles.push(['오늘의 질문', `${mi.q}<small>번 답함</small>`, '']);
  if (mi.sns.length) {
    const a = mi.sns[0][1], b = mi.sns[mi.sns.length - 1][1];
    tiles.push(['SNS 하루 평균', `${b}<small>분</small>`, mi.sns.length > 1 ? `<small>${a}분 → ${b}분</small>` : `<small>${ml(mi.sns[0][0])} 주</small>`]);
  }
  if (mi.fund && mi.fund.months !== null) tiles.push(['비상금', `${Math.round(mi.fund.months * 10) / 10}<small>개월치</small>`, `<small>목표 ${FUND_GOAL}</small>`]);
  const dists = [];
  if (Object.keys(mi.feel).length) dists.push(['많이 붙인 마음 이름', topText(mi.feel)]);
  if (Object.keys(mi.when).length) dists.push(['흔들린 때', topText(mi.when, (x) => pairLabel(SH_WHEN, x))]);
  if (Object.keys(mi.act).length) dists.push(['그때 한 행동', topText(mi.act, (x) => pairLabel(SH_ACT, x), 6)]);
  if (Object.keys(mi.nb).length) dists.push(['아무도 모른다 해도', topText(mi.nb, (x) => pairLabel(SH_NB, x))]);
  if (mi.restN) dists.push(['혼자 회복', topText(mi.rest, fillLabel)]);
  if (mi.linkN) dists.push(['연결', topText(mi.link, fillLabel)]);
  else if (mi.restN >= 6) dists.push(['연결', '이번 기간엔 기록이 없어요. 혼자 잘 지내는 사람일수록 기대는 연습이 도움이 돼요 — 짧은 대화 하나도 충분해요.']);
  if (mi.shLateKnown >= 3 && mi.shAfterLate * 2 >= mi.shLateKnown) {
    dists.push(['몸의 리듬', `흔들린 순간 ${mi.shLateKnown}번 중 ${mi.shAfterLate}번이 늦게 잔 다음 날이었어요. 지친 몸은 마음을 더 크게 흔들어요.`]);
  }
  const lines = [
    ...tiles.map(([l, v, d]) => `- ${l}: ${v.replace(/<[^>]+>/g, '')}${d ? ` (${d.replace(/<[^>]+>/g, '')})` : ''}`),
    ...dists.map(([l, v]) => `- ${l}: ${v}`),
  ];
  const html = `<section class="r-sec r-mind"><h2>마음</h2>
    ${tiles.length ? `<div class="r-tiles">${tiles.map(([l, v, d]) => `<div class="r-tile"><span class="r-tl">${esc(l)}</span><span class="r-tv">${v}</span>${d}</div>`).join('')}</div>` : ''}
    ${dists.length ? `<ul class="r-dist">${dists.map(([l, v]) => `<li><b>${esc(l)}</b> ${esc(v)}</li>`).join('')}</ul>` : ''}
    <p class="r-tip">마음 칸은 점수에 넣지 않아요. 알아차린 횟수일 뿐, 잘하고 못한 게 아니에요. 내용은 일기 탭의 '${yearly ? '그 달' : '이번 달'} 일기 복사'로 채팅에서 함께 봐요.</p></section>`;
  return [html, lines];
}
