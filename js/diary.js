'use strict';

/* ═════════════════ 감사일기 ═════════════════
 * 하루에 한 장, 한 줄에 하나씩 감사한 일을 적는다 (20줄 안팎을 기준으로 줄 수를 보여 줌, 그 이상도 저장은 됨).
 * state.diary = { 'YYYY-MM-DD': { t: 글, at: 마지막으로 고친 때 } }   글을 다 지우면 그 날은 지운다.
 * 이 휴대폰에만 저장되고, 백업 파일(내보내기)에 함께 담긴다. 하루는 다른 탭처럼 새벽 4시에 바뀐다.
 * 피드백은 앱이 하지 않는다: '이번 달 일기 복사'로 글을 복사해 채팅에 붙여 넣으면,
 * 감사·긍정적인 부분과 함께 힘들었던 부분의 인지 왜곡 여부, 생각·감정을 돌려 볼 방향을 같이 살펴본다. */

const DIARY_LINES = 20; // 줄 수 기준 (넘어도 저장)
const DIARY_MAX = 2000; // 하루 최대 글자 수 (저장 공간을 위해)

$('dy-text').maxLength = DIARY_MAX;
const diaryOf = (k) => state.diary[k] || null;
const diaryLines = (t) => (t || '').split('\n').filter((l) => l.trim()).length;

function renderDiary() {
  const k = ui.diaryDate;
  const d = parse(k);
  const diff = diffDays(k, today);
  $('dy-sub').textContent = `${mdw(k)} · ${relDay(k)}`;
  $('dy-sub').classList.toggle('is-today', diff === 0);
  $('dy-today').hidden = diff === 0;
  $('dy-next').disabled = k >= today;

  const ta = $('dy-text');
  const rec = diaryOf(k);
  // 입력 중에 다시 그려도 글이 흔들리지 않게 (날짜가 바뀌었을 때만 칸을 채운다)
  if (ta.dataset.k !== k || document.activeElement !== ta) {
    ta.value = rec ? rec.t : '';
    ta.dataset.k = k;
  }
  ta.placeholder = diff === 0
    ? '예: 퇴근길 노을이 예뻤다\n고양이가 밥을 잘 먹었다\n동료가 커피를 사 줬다'
    : `${d.getMonth() + 1}월 ${d.getDate()}일에 감사했던 일`;
  growText(ta);
  updateDiaryCount();
  renderDiaryMonth();
}

/* 줄 수 · 저장 표시 */
function updateDiaryCount() {
  const t = $('dy-text').value;
  const n = diaryLines(t);
  const over = n > DIARY_LINES;
  $('dy-count').textContent = `${n} / ${DIARY_LINES}줄`;
  $('dy-count').classList.toggle('over', over);
  const rec = diaryOf(ui.diaryDate);
  $('dy-status').textContent = over ? `${DIARY_LINES}줄을 넘었어요. 그래도 저장돼요.`
    : rec ? `저장됨 · ${new Date(rec.at).getHours()}:${pad(new Date(rec.at).getMinutes())}` : '쓰면 바로 저장돼요';
}

/* 이번 달: 쓴 날 표시(누르면 그 날로) · 모아 보기 · 피드백용 복사 */
function renderDiaryMonth() {
  const k = ui.diaryDate;
  const start = monthStart(k);
  const end = monthEnd(k);
  const days = [];
  for (let x = start; x <= end; x = addDays(x, 1)) days.push(x);
  const written = days.filter((x) => diaryOf(x));
  const lines = written.reduce((a, x) => a + diaryLines(diaryOf(x).t), 0);
  const lead = parse(start).getDay();
  $('dy-month').innerHTML = `
    <div class="wo-head"><span class="wo-name">${parse(k).getMonth() + 1}월</span>
      <span class="wo-target">${written.length ? `${written.length}일 · ${lines}줄 썼어요` : '아직 쓴 날이 없어요'}</span></div>
    <div class="dy-days">${'<span></span>'.repeat(lead)}${days.map((x) => `<button type="button" class="dy-day${diaryOf(x) ? ' on' : ''}${x === k ? ' sel' : ''}${x === today ? ' today' : ''}"
      data-k="${x}" ${x > today ? 'disabled' : ''} aria-label="${mdw(x)}${diaryOf(x) ? ' 일기 있음' : ''}">${parse(x).getDate()}</button>`).join('')}</div>
    ${written.length ? `<details class="r-week dy-all"><summary>이번 달 일기 모아 보기</summary>
      <ul>${written.map((x) => `<li><b>${ml(x)} (${WD[parse(x).getDay()]})</b>${esc(diaryOf(x).t).replace(/\n+/g, '<br>')}</li>`).join('')}</ul></details>
      <button type="button" class="h-add dy-copy" id="dy-copy">이번 달 일기 복사 (피드백용)</button>` : ''}`;
}

/* 피드백용 텍스트: 날짜별로 한 줄씩 '- ' */
function diaryMonthText(k) {
  const start = monthStart(k);
  const end = monthEnd(k);
  const out = [`[감사일기 ${parse(k).getFullYear()}년 ${parse(k).getMonth() + 1}월]`];
  for (let x = start; x <= end; x = addDays(x, 1)) {
    const r = diaryOf(x);
    if (!r) continue;
    out.push('', `${ml(x)} (${WD[parse(x).getDay()]})`, ...r.t.split('\n').filter((l) => l.trim()).map((l) => `- ${l.trim()}`));
  }
  return out.join('\n');
}

function goDiary(k) {
  if (k > today) return;
  flushSave();
  ui.diaryDate = k;
  renderDiary();
}

$('dy-text').addEventListener('input', (e) => {
  const k = ui.diaryDate;
  const t = e.target.value;
  const had = !!diaryOf(k);
  if (t.trim()) state.diary[k] = { t, at: Date.now() };
  else delete state.diary[k];
  saveSoon();
  growText(e.target); // 쓰는 만큼 칸이 늘어난다
  updateDiaryCount();
  if (had !== !!diaryOf(k)) renderDiaryMonth(); // 쓴 날 표시가 바뀔 때만
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
