'use strict';

/* ═════════════════ 백업: 내보내기 / 불러오기 ═════════════════
 * 기록 전체를 JSON 파일 하나로 내보내고, 그 파일로 되살린다. 서버·계정 없이 휴대폰 안에서만 동작. */

const BACKUP_APP = 'today-list';
const BACKUP_REMIND_DAYS = 30;

function renderBackup() {
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
$('export-btn').addEventListener('click', async () => {
  const file = new File(
    [JSON.stringify({ app: BACKUP_APP, v: state.v, exportedAt: new Date().toISOString(), data: state }, null, 1)],
    `today-backup-${today}.json`,
    { type: 'application/json' },
  );
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const how = canShare
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
  toast(how === 'share' ? '백업 파일을 보냈어요' : `${file.name} 파일로 저장했어요`);
});

/* ───────── 불러오기 ───────── */
// accept를 지정하면 아이폰에서 .json 파일이 회색으로 막히는 경우가 있어, 아무 파일이나 고르게 하고 내용으로 확인한다
$('import-btn').addEventListener('click', () => $('import-file').click());

function readBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return null; }
  const s = j && j.app === BACKUP_APP && j.data ? j.data : j; // 예전에 그대로 저장한 데이터도 받아 준다
  if (!s || typeof s !== 'object' || !s.days || typeof s.days !== 'object' || Array.isArray(s.days)) return null;
  for (const k in s.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(s.days[k])) return null;
  }
  if (s.events !== undefined && !Array.isArray(s.events)) return null;
  return { data: normalize(s), exportedAt: j.exportedAt || null };
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
  undoable('백업을 불러왔어요', () => { state = b.data; });
});
