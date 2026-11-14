/* 計畫類別、欄位、清單、範本、活動類型、prompt 與初始資料定義
   新增計畫類別：在下方 KINDS 加一個區塊（名稱、計畫欄位、計畫清單、計畫層 prompt、活動類型、prompt 開頭的文件名稱），
   並在 F／L／T／ACT／P 定義該類別用到的欄位、清單、範本、活動與 prompt；app.js、model.js、engine.js 不需修改。 */
(function () {
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[,\s元]/g, '')); return isNaN(n) ? null : n; };
  const fmt = (v) => { const n = num(v); return n == null ? '' : n.toLocaleString('en-US'); };
  const pct = (a, b) => { a = num(a); b = num(b); return a == null || !b ? '' : Math.round((a / b) * 1000) / 10 + '%'; };

  // ---------------- 欄位 ----------------
  // scope: plan（計畫共用）/ act（活動）；type: text / textarea / select / check / number
  const F = {};
  const def = (key, o) => { F[key] = Object.assign({ key, type: 'text' }, o); };

  // 計畫層級
  def('year', { label: '學年度', scope: 'plan', group: '基本資料', hint: '例：115' });
  def('school', { label: '培育學校', scope: 'plan', group: '基本資料' });
  def('dept', { label: '系所', scope: 'plan', group: '基本資料' });
  def('title', { label: '計畫名稱', scope: 'plan', group: '基本資料' });
  def('park', { label: '所屬園區', scope: 'plan', group: '基本資料', type: 'select', options: ['竹科', '中科', '南科'] });
  def('type', { label: '計畫類型', scope: 'plan', group: '基本資料', type: 'select', options: ['A', 'B'], optionLabels: { A: 'A式模組課程計畫', B: 'B式企業實習計畫' } });
  def('field', { label: '領域別', scope: 'plan', group: '基本資料' });
  def('pi', { label: '計畫主持人', scope: 'plan', group: '基本資料' });
  def('piTitle', { label: '主持人職稱', scope: 'plan', group: '基本資料' });
  def('students', { label: '受補助培育學生', scope: 'plan', group: '基本資料', hint: '以「、」分隔' });
  def('partnerPark', { label: '合作廠商（園區）', scope: 'plan', group: '合作廠商與經費', hint: '例：○○股份有限公司 (中科)' });
  def('partnerOther', { label: '合作廠商（其他）', scope: 'plan', group: '合作廠商與經費' });
  def('mentor', { label: '業師', scope: 'plan', group: '合作廠商與經費', hint: '公司/姓名職稱，例：○○股份有限公司/○○○總經理' });
  def('grant', { label: '補助款（元）', scope: 'plan', group: '合作廠商與經費', type: 'number' });
  def('match', { label: '學校配合款（元）', scope: 'plan', group: '合作廠商與經費', type: 'number' });
  def('periodFrom', { label: '執行期間（起）', scope: 'plan', group: '合作廠商與經費', hint: '例：115年7月1日' });
  def('periodTo', { label: '執行期間（迄）', scope: 'plan', group: '合作廠商與經費', hint: '例：116年8月31日' });
  def('goals', { label: '計畫培育目標', scope: 'plan', group: '計畫內容', type: 'textarea', hint: '一行一項；「**標題：**說明」可讓標題粗體' });
  const OC = ['實習計畫專題名稱', '培育企業實習人數', '企業實習廠商名稱', '技術認證考照', '校外競賽', '就業輔導人數', '合作廠商挹注的資源與就業銜接及留用機制', '其他：衍生成果、產學合作、專利'];
  OC.forEach((n, i) => {
    def(`oc${i + 1}_plan`, { label: `預定培育成果${i + 1}：${n}`, short: n, scope: 'plan', group: '預定培育成果', type: 'textarea' });
    def(`oc${i + 1}_act`, { label: `實際達成情形${i + 1}：${n}`, short: n, scope: 'act', group: '培育成果達成情形', type: 'textarea', ai: 'p2' });
  });

  // 活動層級：查訪
  def('officeTo', { label: '回函收件單位', scope: 'act', group: '行程調查回函' });
  def('officeTel', { label: '計畫辦公室電話', scope: 'act', group: '行程調查回函' });
  def('officeEmail', { label: '計畫辦公室 E-mail', scope: 'act', group: '行程調查回函' });
  def('visitWindow', { label: '可查訪期間', scope: 'act', group: '行程調查回函', hint: '例：115年10月14日起至12月4日間' });
  def('replyDeadline', { label: '回函期限', scope: 'act', group: '行程調查回函' });
  def('term', { label: '學期', scope: 'act', group: '行程調查回函', type: 'select', options: ['上學期', '下學期'] });
  [1, 2, 3].forEach((i) => {
    const g = `建議時段 ${i}`;
    def(`s${i}m`, { label: `時段${i}：月`, scope: 'act', group: g, small: 1 });
    def(`s${i}d`, { label: `時段${i}：日`, scope: 'act', group: g, small: 1 });
    def(`s${i}ap`, { label: `時段${i}：上午/下午`, scope: 'act', group: g, type: 'select', options: ['上午', '下午'], small: 1 });
    def(`s${i}h`, { label: `時段${i}：時`, scope: 'act', group: g, small: 1 });
    def(`s${i}loc`, { label: `時段${i}：地點類型`, scope: 'act', group: g, type: 'select', options: ['校內', '廠商'], optionLabels: { 校內: '校內會議室', 廠商: '企業實習廠商會議室' } });
    def(`s${i}room`, { label: `時段${i}：校內會議室`, scope: 'act', group: g });
    def(`s${i}firm`, { label: `時段${i}：廠商會議室`, scope: 'act', group: g });
  });
  def('doneChk', { label: '已完成企業實習', scope: 'act', group: '學校企業實習狀況', type: 'check' });
  def('doneDate', { label: '已完成實習：日期', scope: 'act', group: '學校企業實習狀況', small: 1 });
  def('doneN', { label: '已完成實習：人數', scope: 'act', group: '學校企業實習狀況', small: 1 });
  def('doneHrs', { label: '已完成實習：時數', scope: 'act', group: '學校企業實習狀況', small: 1 });
  def('ongoChk', { label: '未完成企業實習', scope: 'act', group: '學校企業實習狀況', type: 'check' });
  def('ongoDate', { label: '實習中：日期', scope: 'act', group: '學校企業實習狀況', small: 1 });
  def('ongoN', { label: '實習中：人數', scope: 'act', group: '學校企業實習狀況', small: 1 });
  def('ongoHrs', { label: '實習中：預計時數', scope: 'act', group: '學校企業實習狀況', small: 1 });
  def('nextDate', { label: '預計實習：日期', scope: 'act', group: '學校企業實習狀況', small: 1 });
  def('nextN', { label: '預計實習：人數', scope: 'act', group: '學校企業實習狀況', small: 1 });
  def('nextHrs', { label: '預計實習：時數', scope: 'act', group: '學校企業實習狀況', small: 1 });

  def('visitDate', { label: '查訪日期', scope: 'act', group: '查訪內容', hint: '例：115年12月2日(星期三)' });
  def('visitStart', { label: '開始時間', scope: 'act', group: '查訪內容', hint: '例：14:00', small: 1 });
  def('visitEnd', { label: '結束時間', scope: 'act', group: '查訪內容', hint: '例：15:30', small: 1 });
  def('venue', { label: '查訪地點', scope: 'act', group: '查訪內容' });
  def('address', { label: '地址', scope: 'act', group: '查訪內容' });
  def('room', { label: '會議室（議程用）', scope: 'act', group: '查訪內容', hint: '例：○○會議室' });
  def('tourContent', { label: '參觀實作/實習情形內容', scope: 'act', group: '查訪內容' });
  def('tourPlace', { label: '參觀實作地點', scope: 'act', group: '查訪內容' });
  def('attendees', { label: '計畫出席人員', scope: 'act', group: '查訪內容', type: 'textarea', hint: '空白時自動由主持人、業師、學生組成' });
  def('transport', { label: '交通資訊', scope: 'act', group: '交通位置圖', type: 'textarea', ai: 'p1', hint: '一行一種交通方式；「**高鐵：**…」標題粗體' });
  def('transportLink', { label: '交通或位置圖說明', scope: 'act', group: '交通位置圖', type: 'textarea', ai: 'p1' });

  def('evalDate', { label: '自評報告日期', scope: 'act', group: '執行進度自評', hint: '例：115年11月20日' });
  const EV = [['ev1', '一、執行成效', '實習計畫內容的完備性及實務性、專題實作與課程內容之相關性、學生學習情況'],
    ['ev2', '二、外部資源', '實習環境是否完善且符合課程內容、業界資源提供之關連性及實用性、合作廠商挹注的資源與就業銜接及留用機制、業界聘用學生之意願'],
    ['ev3', '三、學校配合度', '學校資源投入與行政配合情形、計畫主持人對課程執行的用心、計畫主持人對學生輔導的用心']];
  EV.forEach(([k, n, items]) => {
    def(k, { label: `${n}：自我評估`, scope: 'act', group: '執行進度自評', type: 'select', options: ['優', '良', '可', '尚可', '待改進'], ai: 'p4', items });
    def(k + '_text', { label: `${n}：規劃及執行進度說明`, scope: 'act', group: '執行進度自評', type: 'textarea', ai: 'p4', items });
  });
  def('improve', { label: '結論：待改進事項', scope: 'act', group: '執行進度自評', type: 'textarea', ai: 'p4' });
  def('difficulty', { label: '結論：困難與建議', scope: 'act', group: '執行進度自評', type: 'textarea', ai: 'p4' });
  def('reviewSlide', { label: '簡報：檢討與建議（精簡版）', scope: 'act', group: '簡報文字', type: 'textarea', ai: 'p4' });

  def('briefDate', { label: '簡報日期', scope: 'act', group: '簡報文字', hint: '空白時使用查訪日期' });
  def('bud1_use', { label: '人事費：支出用途', scope: 'act', group: '經費運用', type: 'textarea', ai: 'p3' });
  def('bud1_amt', { label: '人事費：目前使用金額（元）', scope: 'act', group: '經費運用', type: 'number' });
  def('bud2_use', { label: '其他費用：支出用途', scope: 'act', group: '經費運用', type: 'textarea', ai: 'p3' });
  def('bud2_amt', { label: '其他費用：目前使用金額（元）', scope: 'act', group: '經費運用', type: 'number' });
  def('internNote', { label: '企業實習相關成果說明（簡報第10頁下方）', scope: 'act', group: '簡報文字', type: 'textarea', ai: 'p3' });
  def('partnerRes', { label: '合作廠商挹注資源說明', scope: 'act', group: '簡報文字', type: 'textarea', ai: 'p3' });
  def('retention', { label: '就業銜接及留用機制說明', scope: 'act', group: '簡報文字', type: 'textarea', ai: 'p3' });
  def('attachNote', { label: '附件說明', scope: 'act', group: '簡報文字', type: 'textarea' });

  // ---------------- 計算欄位（輸出用） ----------------
  const ap = (t) => { const h = parseInt(String(t || '').split(':')[0], 10); return isNaN(h) ? '' : h < 12 ? '上午' : '下午'; };
  const C = {
    grantFmt: { from: ['grant'], fn: (g) => fmt(g('grant')) },
    matchFmt: { from: ['match'], fn: (g) => fmt(g('match')) },
    totalFmt: { from: ['grant', 'match'], fn: (g) => { const a = num(g('grant')), b = num(g('match')); return a == null && b == null ? '' : fmt((a || 0) + (b || 0)); } },
    typeText: { from: ['type'], fn: (g) => (F.type.optionLabels[g('type')] || '') },
    visitTime: { from: ['visitDate', 'visitStart', 'visitEnd'], fn: (g) => g('visitDate') ? `${g('visitDate')}${ap(g('visitStart'))}${g('visitStart') || ''} ~ ${g('visitEnd') || ''}` : '' },
    bud1_amtFmt: { from: ['bud1_amt'], fn: (g) => g('bud1_amt') === '' || g('bud1_amt') == null ? '' : fmt(g('bud1_amt')) + '元' },
    bud2_amtFmt: { from: ['bud2_amt'], fn: (g) => g('bud2_amt') === '' || g('bud2_amt') == null ? '' : fmt(g('bud2_amt')) + '元' },
    bud1_rate: { from: ['bud1_amt', 'grant'], fn: (g) => pct(g('bud1_amt'), g('grant')) },
    bud2_rate: { from: ['bud2_amt', 'grant'], fn: (g) => pct(g('bud2_amt'), g('grant')) },
    budTotalFmt: { from: ['bud1_amt', 'bud2_amt'], fn: (g) => { const a = num(g('bud1_amt')), b = num(g('bud2_amt')); return a == null && b == null ? '' : fmt((a || 0) + (b || 0)) + '元'; } },
    budTotalRate: { from: ['bud1_amt', 'bud2_amt', 'grant'], fn: (g) => pct((num(g('bud1_amt')) || 0) + (num(g('bud2_amt')) || 0), g('grant')) },
  };
  // 空白時的預設值
  const D = {
    briefDate: (g) => String(g('visitDate') || '').replace(/\(.*?\)|（.*?）/g, ''),
    attendees: (g, L) => {
      const pis = (L('staff') || []).filter((s) => /主持人/.test(s.role || '')).map((s) => s.name).filter(Boolean);
      return [`計畫主持人/協同主持人：${pis.length ? pis.join('、') : g('pi') || ''}`, `業師：${g('mentor') || ''}`, `受補助培育學生：${g('students') || ''}。`, '計畫其他人員：'].join('\n');
    },
    attachNote: () => '計畫相關資料：實習紀錄、照片等佐證文件',
  };

  // ---------------- 清單 ----------------
  const L = {
    ms: { label: '查核點', scope: 'plan', group: '計畫內容', actGroup: '查核點與計畫人員', cols: [
      { k: 'item', label: '查核點項目', scope: 'plan', w: 30 },
      { k: 'due', label: '應完成時間', scope: 'plan', w: 15 },
      { k: 'actual', label: '實際完成時間', scope: 'act', ai: 'p2', w: 15 },
      { k: 'diff', label: '差異分析說明', scope: 'act', ai: 'p2', w: 40, area: 1 }] },
    staff: { label: '計畫人員', scope: 'plan', group: '計畫內容', actGroup: '查核點與計畫人員', idCols: 3, cols: [
      { k: 'name', label: '姓名', scope: 'plan', w: 10 },
      { k: 'pos', label: '現職', scope: 'plan', w: 12 },
      { k: 'role', label: '在本計畫所擔任之職務', scope: 'plan', w: 14 },
      { k: 'duty', label: '於本計畫中負責之工作內容', scope: 'act', ai: 'p2', w: 34, area: 1 },
      { k: 'pmPlan', label: '預定投入人月數', scope: 'plan', w: 8 },
      { k: 'pmActual', label: '實際投入人月數', scope: 'act', w: 8 },
      { k: 'note', label: '備註', scope: 'act', w: 14 }] },
    agenda: { label: '查訪議程', scope: 'act', group: '查訪議程', cols: [
      { k: 'min', label: '分鐘', scope: 'act', w: 6 },
      { k: 'time', label: '時間', scope: 'act', w: 12 },
      { k: 'topic', label: '主題', scope: 'act', w: 30, area: 1 },
      { k: 'who', label: '與會人員', scope: 'act', w: 18, area: 1 },
      { k: 'note', label: '備註', scope: 'act', w: 34, area: 1 }] },
    interns: { label: '企業實習辦理情形', scope: 'act', group: '企業實習辦理情形', ai: 'p3', cols: [
      { k: 'company', label: '實習廠商', scope: 'act', w: 18 },
      { k: 'status', label: '實習情形', scope: 'act', w: 40, area: 1 },
      { k: 'count', label: '實習中：人數', scope: 'act', w: 10 },
      { k: 'feedback', label: '學生反應', scope: 'act', w: 32, area: 1 }] },
  };

  function defaultAgenda(g) {
    const room = g('room') || '○○○會議室';
    const mentor = g('mentor') || '○○○';
    const stu = g('students') || '○○○';
    return [
      { min: '30', topic: '計畫執行進度簡報\n(一併與計畫主持人座談)', who: '計畫執行人員\n查訪人員', note: `(地點：${room})\n※業師、學生毋須列席` },
      { min: '15', topic: `業師代表座談\n(${mentor})`, who: '業師代表\n查訪人員', note: `(地點：${room})\n※計畫主持人、學生毋須列席` },
      { min: '15', topic: `學生座談\n(${stu})`, who: '學生\n查訪人員', note: `(地點：${room})\n※計畫主持人、業師毋須列席` },
      { min: '10', topic: `參觀實作/實習情形：\n${g('tourContent') || '○○○'}`, who: '計畫人員\n查訪人員', note: `(地點：${g('tourPlace') || '○○○實驗室'})` },
      { min: '10', topic: '查訪人員討論', who: '查訪人員', note: `(地點：${room})\n※計畫人員請離席` },
      { min: '10', topic: '委員給予今日查訪之建議', who: '計畫主持人\n查訪人員', note: `(地點：${room})\n※業師、學生可離席` },
      { min: '0', topic: '賦歸', who: '', note: '' },
    ];
  }
  function agendaTimes(rows, start) {
    const m = String(start || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return rows;
    let t = +m[1] * 60 + +m[2];
    const hm = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
    return rows.map((r) => { const d = parseInt(r.min, 10) || 0; const s = t; t += d; return Object.assign({}, r, { time: d ? `${hm(s)}~${hm(t)}` : hm(s) }); });
  }

  // ---------------- 範本 ----------------
  const T = {
    reply: { name: '計畫實地查訪行程調查回函', file: 'templates/reply.docx', kind: 'docx' },
    schedule: { name: '1.培育學校查訪建議行程表', file: 'templates/schedule.docx', kind: 'docx' },
    transport: { name: '2.查訪地點交通位置圖', file: 'templates/transport.docx', kind: 'docx' },
    selfeval: { name: '3.執行進度自評報告(B式)', file: 'templates/selfeval.docx', kind: 'docx' },
    briefing: { name: '4.實地查訪報告簡報', file: 'templates/briefing.pptx', kind: 'pptx',
      splits: { 5: { list: 'ms', max: 7 }, 8: { list: 'staff', max: 5 }, 10: { list: 'interns', max: 3 } },
      photos: [{ group: 'intern', after: 10, title: '四、企業實習辦理情形（照片）' }, { group: 'attach', after: 13, title: '附件：佐證照片' }],
      note: '簡報會自動帶入「照片」頁上傳的照片；查核點超過 7 列、人員超過 5 位、實習廠商超過 3 家時自動分頁並標示 (1/2)。' },
  };
  const PHOTO_GROUPS = { intern: '企業實習情形照片（放在簡報第 10 頁之後）', attach: '附件佐證照片（放在簡報最後）' };

  // ---------------- 活動類型 ----------------
  // calcs：在該欄位群組下方顯示的自動計算說明；optional：計算「尚有幾個欄位空白」時略過的欄位；
  // photoGroups：照片分組（沒有則不顯示「照片」頁）；init：新增活動時的初始內容
  const ACT = {
    visit: { name: '人培查訪', templates: ['reply', 'schedule', 'transport', 'selfeval', 'briefing'],
      groups: ['行程調查回函', '建議時段 1', '建議時段 2', '建議時段 3', '學校企業實習狀況', '查訪內容', '查訪議程', '交通位置圖', '培育成果達成情形', '查核點與計畫人員', '經費運用', '企業實習辦理情形', '執行進度自評', '簡報文字'],
      lists: ['agenda', 'ms', 'staff', 'interns'],
      prompts: ['p1', 'p2', 'p3', 'p4'],
      photoGroups: PHOTO_GROUPS,
      optional: ['partnerOther', 'officeEmail', 's1firm', 's2firm', 's3firm', 'evalDate'],
      calcs: {
        查訪內容: (g) => `輸出時的查訪時間：${C.visitTime.fn(g) || '—'}`,
        經費運用: (g) => `執行率（自動計算，以補助款為分母）：人事費 ${g('bud1_rate') || '—'}、其他費用 ${g('bud2_rate') || '—'}、合計 ${g('budTotalFmt') || '—'}／${g('budTotalRate') || '—'}`,
      },
      init: (a, g, uid) => { if (!(a.lists.agenda || []).length) a.lists.agenda = agendaTimes(defaultAgenda(g), g('visitStart')).map((r) => Object.assign({ id: uid() }, r)); } },
    blank: { name: '空白活動（只用自訂範本）', templates: [], groups: [], lists: [], prompts: [] },
  };

  // ---------------- Prompt ----------------
  // 開頭的文件名稱由計畫類別的 docName 提供
  const PREFACE = (g, K) => `你是協助大學教師撰寫「${K && K.docName ? K.docName(g) : '計畫'}」行政文件的助理。
請只根據本筆記本中的來源資料（計畫書、實習紀錄、會議紀錄、學生回饋等）撰寫：
- 來源沒有提到的內容，請寫「（資料未提及）」，不要推測或編造數字、人名、日期。
- 使用繁體中文、正式公文語氣；日期用民國紀年（例：115年12月2日），數字用阿拉伯數字。
- 下方「已知資料」是我已填寫的內容，請與之保持一致；若來源資料與已知資料不同，以來源為準，並在該欄最後加註「（與已填資料不同）」。`;
  const FORMAT = '請嚴格依下列格式輸出：每個欄位以「【欄位名稱】」單獨一行開頭，接著寫內容；表格請用 Markdown 表格並保留表頭與序號；不要輸出格式以外的說明文字。';

  const P = {
    p0: { scope: 'plan', title: '從計畫書擷取基本資料', desc: '把計畫書放進 NotebookLM，貼回後一次填好計畫層級欄位（所有活動共用）。只需做一次。',
      context: ['year', 'school', 'dept'],
      outputs: [
        ['title', '計畫名稱'], ['park', '竹科／中科／南科擇一'], ['type', '只寫 A 或 B（A式模組課程計畫、B式企業實習計畫）'], ['field', '領域別'],
        ['pi', '姓名'], ['piTitle', '職稱'], ['partnerPark', '園區合作廠商名稱，後加（所屬園區）'], ['partnerOther', '其他合作廠商，無則寫「無」'],
        ['mentor', '格式：公司名稱/姓名職稱，多位以「、」分隔'], ['grant', '只寫數字'], ['match', '只寫數字'],
        ['periodFrom', '例：115年7月1日'], ['periodTo', '例：116年8月31日'],
        ['goals', '依計畫書列出培育目標，一行一項，格式「**目標標題：** 一句說明」'],
        ['@ms', '依計畫書「預定實施進度及查核點(甘特圖)」'], ['@staff', '依計畫書「計畫主持人及主要工作人員之經驗及能力」'],
        ...OC.map((n, i) => [`oc${i + 1}_plan`, `依計畫書「預計完成培育成果」之「${n}」，照原文寫`]),
      ] },
    p1: { scope: 'act', title: '交通資訊', desc: '產出交通位置圖的交通方式說明。可在 NotebookLM 加入學校／系所交通資訊網頁當來源。',
      context: ['school', 'dept', 'venue', 'address'],
      outputs: [['transport', '分高鐵、台鐵、接駁巴士、計程車等，一行一種，格式「**高鐵：**說明」，每行 1–2 句'], ['transportLink', '一句話說明更多位置圖與乘車時刻可參考的網頁，附網址']] },
    p2: { scope: 'act', title: '執行成果：查核點、培育成果、人力', desc: '產出簡報第 5–8 頁與自評報告「預定培育成果達成情形」。',
      extra: (list) => { const ag = list('staff'); return ag.length ? [`- 計畫人員：${ag.map((s) => `${s.name}（${s.role}）`).join('、')}`] : []; },
      context: ['title', 'type', 'periodFrom', 'periodTo', 'visitDate', 'partnerPark', 'students', 'doneDate', 'doneN', 'doneHrs', 'ongoDate', 'ongoN', 'ongoHrs', 'nextDate', 'nextN', 'nextHrs', ...OC.map((_, i) => `oc${i + 1}_plan`)],
      outputs: [['@ms', '截至查訪日的實際完成時間；未完成寫「進行中」或「尚未開始」。差異分析說明 1–2 句，如期完成寫「依規劃如期完成」'],
        ...OC.map((n, i) => [`oc${i + 1}_act`, `對照預定成果，寫「${n}」目前實際達成情形，1–3 句，具體寫人數、時數、名稱`]),
        ['@staff', '每位人員負責之工作內容 1–2 句']] },
    p3: { scope: 'act', title: '經費、企業實習情形、廠商資源', desc: '產出簡報第 9–11 頁。經費金額請在「填寫」頁手填，這裡只寫支出用途。',
      context: ['title', 'grant', 'match', 'bud1_amt', 'bud2_amt', 'partnerPark', 'partnerOther', 'mentor', 'students', 'doneDate', 'doneN', 'ongoDate', 'ongoN'],
      outputs: [['bud1_use', '人事費實際支出項目，一行一項（例：主持人費1位）'], ['bud2_use', '其他費用實際支出項目，以「、」分隔'],
        ['@interns', '每家實習廠商一列：實習情形寫學生徵選方式與實習重點；學生反應寫學生回饋重點'],
        ['internNote', '企業實習相關成果的重點摘要，2–4 點，一行一點'],
        ['partnerRes', '合作廠商提供的額外實習薪資、餐費／交通／住宿補貼、就業預聘獎金等，簡扼條列，一行一點'],
        ['retention', '就業銜接及留用機制規劃，簡扼條列，一行一點']] },
    p4: { scope: 'act', title: '自評表、待改進事項、檢討與建議', desc: '產出自評報告第三部分與簡報第 12 頁。等第為 AI 建議，請自行確認。',
      context: ['title', 'type', 'visitDate', ...OC.map((_, i) => `oc${i + 1}_act`), 'partnerRes', 'retention'],
      outputs: [...EV.flatMap(([k, n, items]) => [[k, `${n}的自我評估等第，只寫「優、良、可、尚可、待改進」其中之一`], [k + '_text', `${n}的規劃及執行進度說明（已執行計畫與原規劃之差異性），涵蓋：${items}；約 100–150 字`]]),
        ['improve', '待改進事項，條列 2–3 點，一行一點'], ['difficulty', '目前遭遇困難及預期解決方案、相關建議，條列 2–4 點，一行一點'],
        ['reviewSlide', '把「結論：困難與建議」改寫成簡報用精簡條列，每點不超過 30 字，一行一點']] },
  };

  // ---------------- 計畫類別 ----------------
  // planFields：計畫資料頁的欄位；planLists：計畫共用的表格；planPrompt：計畫資料頁的擷取 prompt；
  // acts：可新增的活動類型（「空白活動」所有類別都有）；copyOnNew：新增同類別計畫時可複製的欄位；
  // planCalcs：計畫資料頁某欄位群組下方的自動計算說明；docName：prompt 開頭的文件名稱
  const KINDS = {
    talent: { name: '人才培育補助計畫',
      planFields: Object.keys(F).filter((k) => F[k].scope === 'plan'),
      planLists: ['ms', 'staff'],
      planPrompt: 'p0',
      acts: ['visit'],
      copyOnNew: ['school', 'dept', 'pi', 'piTitle', 'park', 'field', 'type'],
      planCalcs: { 合作廠商與經費: (g) => `計畫總經費（自動加總）：${C.totalFmt.fn(g) || '—'}` },
      docName: (g) => `${g('year') || ''}學年度科學園區人才培育補助計畫` },
  };
  const DEFAULT_KIND = 'talent';

  // 初始資料一律空白：個人資料只存在使用者瀏覽器（用「匯入備份」載入），不放在公開程式碼中
  const SEED_PLAN = {}, SEED_LISTS = { ms: [], staff: [] }, SEED_VISIT = {}, SEED_CONFLICTS = [];

  self.DEFS = { KINDS, DEFAULT_KIND, F, C, D, L, T, ACT, P, PREFACE, FORMAT, PHOTO_GROUPS, OC, EV, defaultAgenda, agendaTimes, num, fmt,
    SEED: { plan: SEED_PLAN, lists: SEED_LISTS, visit: SEED_VISIT, conflicts: SEED_CONFLICTS } };
})();
