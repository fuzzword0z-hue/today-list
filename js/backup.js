'use strict';

/* ═════════════════ 백업: 내보내기 / 불러오기 ═════════════════
 * 기록 전체를 JSON 파일 하나로 내보내고, 그 파일로 되살린다. 서버·계정 없이 휴대폰 안에서만 동작. */

const BACKUP_APP = 'today-list';
const BACKUP_REMIND_DAYS = 30;
const BEFORE_IMPORT = 'today-list:before-import'; // 불러오기 직전 기록 한 벌 (되돌리기용)

function beforeImport() {
  try { const j = JSON.parse(localStorage.getItem(BEFORE_IMPORT)); return j && j.data ? j : null; } catch (e) { return null; }
}

/* 저장 공간: 크롬은 사이트마다 약 524만 자(5MB)까지 저장한다 (한글·영어 모두 한 글자씩) */
const STORE_QUOTA = 5242880;
function storageUsed() {
  let n = 0;
  try { for (const k of [STORE, BEFORE_IMPORT]) n += (localStorage.getItem(k) || '').length + k.length; } catch (e) { /* 무시 */ }
  return n;
}

function renderBackup() {
  const used = storageUsed();
  const ratio = used / STORE_QUOTA;
  const size = used < 102400 ? `${Math.max(1, Math.round(used / 1024))}KB` : `${(used / 1048576).toFixed(2)}MB`;
  $('backup-size').textContent = `저장 공간: 약 ${size} 사용 · 휴대폰 저장 한도(약 5MB)의 ${ratio < 0.01 ? '1% 미만' : `${Math.round(ratio * 100)}%`}${ratio >= 0.6 ? ' — 곧 가득 차요. 내보내기를 해 두세요' : ''}`;
  $('backup-size').classList.toggle('warn', ratio >= 0.6);
  const bi = beforeImport();
  $('import-undo').hidden = !bi;
  if (bi) $('import-undo').textContent = `${md(keyOf(new Date(bi.at)))} 불러오기 전 기록으로 되돌리기`;
  const el = $('backup-last');
  const has = Object.keys(state.days).length || state.events.length;
  if (!state.lastExport) {
    el.textContent = has ? '아직 내보낸 적이 없어요.' : '';
    el.classList.toggle('warn', !!has);
    return;
  }
  const k = keyOf(new Date(state.lastExport));
  const ago = diffDays(today, k);
  el.textContent = `마지막 내보내기: ${md(k)}${ago === 0 ? ' (오늘)' : ` (${ago}일 전)`}`;
  el.classList.toggle('warn', ago >= BACKUP_REMIND_DAYS);
}

function countOf(s) {
  let tasks = 0;
  for (const k in s.days) tasks += s.days[k].length;
  return { tasks, events: s.events.length, days: Object.keys(s.days).length };
}

/* ───────── 내보내기 ───────── */
// 아이폰 홈 화면 앱은 '파일로 저장'(다운로드)이 조용히 안 될 때가 있어서 공유 시트로 보낸다 (공유 시트에 '파일에 저장'이 있음)
const iosApp = navigator.standalone === true;
$('export-btn').addEventListener('click', () => exportBackup());
async function exportBackup() {
  const file = new File(
    [JSON.stringify({ app: BACKUP_APP, v: state.v, exportedAt: new Date().toISOString(), data: state }, null, 1)],
    `today-backup-${today}.json`,
    { type: 'application/json' },
  );
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const how = canShare && iosApp ? 'share' : canShare
    ? await choose('백업 파일을 어떻게 저장할까요?', [
      { label: '휴대폰에 파일로 저장', value: 'download' },
      { label: '다른 앱으로 보내기 (드라이브·카톡 등)', value: 'share' },
    ])
    : 'download';
  if (!how) return;

  if (how === 'share') {
    try {
      await navigator.share({ files: [file], title: '오늘 백업' });
    } catch (e) {
      if (e && e.name === 'AbortError') return; // 사용자가 취소
      toast('보내지 못했어요. "휴대폰에 파일로 저장"을 써 보세요.');
      return;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  state.lastExport = Date.now();
  save();
  renderBackup();
  toast(how === 'share' ? '백업 파일을 보냈어요' : iosApp
    ? `${file.name} 저장을 요청했어요. 파일 앱에 없으면 Safari에서 열어 다시 내보내 주세요.`
    : `${file.name} 파일로 저장했어요`);
}

$('crash-export').addEventListener('click', () => exportBackup());
$('crash-reload').addEventListener('click', () => location.reload());

/* ───────── 불러오기 ───────── */
// accept를 지정하면 아이폰에서 .json 파일이 회색으로 막히는 경우가 있어, 아무 파일이나 고르게 하고 내용으로 확인한다
$('import-btn').addEventListener('click', () => $('import-file').click());

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const okTask = (t) => !!t && typeof t === 'object' && typeof t.id === 'string' && typeof t.t === 'string';
const okEvent = (ev) => !!ev && typeof ev === 'object' && typeof ev.id === 'string' && typeof ev.title === 'string'
  && DATE_RE.test(ev.date || '') && !!CATS[ev.cat];

/* 파일 내용 확인: 모양이 이상한 할 일·일정은 빼고 받는다 (하나라도 망가지면 화면이 멈출 수 있어서) */
function readBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return null; }
  const s = j && j.app === BACKUP_APP && j.data ? j.data : j; // 예전에 그대로 저장한 데이터도 받아 준다
  if (!s || typeof s !== 'object' || !s.days || typeof s.days !== 'object' || Array.isArray(s.days)) return null;
  if (s.events !== undefined && !Array.isArray(s.events)) return null;
  let dropped = 0, kept = 0;
  const days = {};
  for (const k in s.days) {
    if (!DATE_RE.test(k) || !Array.isArray(s.days[k])) { dropped++; continue; }
    const list = s.days[k].filter(okTask);
    dropped += s.days[k].length - list.length;
    kept += list.length;
    if (list.length) days[k] = list;
  }
  const events = (s.events || []).filter(okEvent);
  dropped += (s.events || []).length - events.length;
  kept += events.length;
  if (!kept && dropped) return null;
  for (const f of ['cond', 'workouts', 'studies', 'health', 'weights', 'labs', 'daymode']) {
    if (s[f] && typeof s[f] === 'object' && !Array.isArray(s[f])) {
      for (const k in s[f]) if (!DATE_RE.test(k)) delete s[f][k];
    }
  }
  return { data: normalize({ ...s, days, events }), exportedAt: j.exportedAt || null, dropped };
}

$('import-file').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = ''; // 같은 파일을 다시 골라도 동작하도록
  if (!f) return;
  let text = '';
  try { text = await f.text(); } catch (err) { /* 아래에서 안내 */ }
  const b = readBackup(text);
  if (!b) {
    toast('이 앱의 백업 파일이 아니에요. 내보내기로 만든 .json 파일을 골라 주세요.');
    return;
  }
  const n = countOf(b.data);
  const cur = countOf(state);
  const when = b.exportedAt ? `${md(keyOf(new Date(b.exportedAt)))}에 내보낸 ` : '';
  const ok = await choose(
    `${when}백업 (할 일 ${n.tasks}개 · 일정 ${n.events}개)으로 지금 기록(할 일 ${cur.tasks}개 · 일정 ${cur.events}개)을 바꿀까요?`,
    [{ label: '불러오기 (지금 기록을 바꿈)', value: 'yes', danger: true }],
  );
  if (ok !== 'yes') return;
  // 지금 기록을 한 벌 따로 둔다: 실행 취소 시간이 지나도 '불러오기 전 기록으로 되돌리기'로 되살릴 수 있게
  try {
    localStorage.setItem(BEFORE_IMPORT, JSON.stringify({ at: Date.now(), data: state }));
  } catch (err) {
    const go = await choose('저장 공간이 부족해서 지금 기록을 따로 보관하지 못해요. 그래도 불러올까요? (불러온 직후 실행 취소는 할 수 있어요)', [{ label: '그래도 불러오기', value: 'yes', danger: true }]);
    if (go !== 'yes') return;
  }
  const before = JSON.stringify(state);
  state = b.data;
  try {
    save();
    render();
  } catch (err) {
    // 화면을 그리다 멈추면 원래 기록으로 되돌린다
    state = JSON.parse(before);
    save();
    render();
    toast('이 파일은 불러올 수 없어요. 지금 기록은 그대로예요.');
    return;
  }
  toast(`백업을 불러왔어요${b.dropped ? ` (읽을 수 없는 항목 ${b.dropped}개는 뺐어요)` : ''}`, () => {
    state = JSON.parse(before);
    save();
    render();
  });
});

/* 불러오기 전 기록으로 되돌리기 */
$('import-undo').addEventListener('click', async () => {
  const bi = beforeImport();
  if (!bi) return;
  const n = countOf(normalize(bi.data));
  const ok = await choose(`${md(keyOf(new Date(bi.at)))}에 불러오기 전 기록(할 일 ${n.tasks}개 · 일정 ${n.events}개)으로 되돌릴까요? 지금 기록은 바뀌어요.`, [
    { label: '되돌리기', value: 'yes', danger: true },
  ]);
  if (ok !== 'yes') return;
  const cur = JSON.stringify(state);
  state = normalize(bi.data);
  try { localStorage.removeItem(BEFORE_IMPORT); } catch (e) { /* 무시 */ }
  save();
  render();
  toast('불러오기 전 기록으로 되돌렸어요', () => {
    state = JSON.parse(cur);
    try { localStorage.setItem(BEFORE_IMPORT, JSON.stringify(bi)); } catch (e) { /* 무시 */ }
    save();
    render();
  });
});
