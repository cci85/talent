/* 計畫存檔：一個計畫一個 .md（可閱讀的內容＋我的筆記＋網頁讀取用的資料區塊）
   照片與自訂範本另存於同一資料夾的「計畫名稱_檔案」子資料夾。
   選定資料夾後自動儲存（停止修改約 1 秒）；寫入前檢查檔案是否屬於同一計畫、是否已在其他電腦更新。
   資料夾存取使用 File System Access API（Chrome、Edge）；不支援時改用下載與開啟檔案。 */
(function () {
  const T = self.__talent, D = self.DEFS, M = self.MODEL;
  if (!T) return;
  const FS_OK = 'showDirectoryPicker' in window;
  const TAG = 'talent-data';
  const NOTE_START = '<!-- 我的筆記：以下可自由編輯，網頁存檔時會保留 -->';
  const NOTE_END = '<!-- 我的筆記結束 -->';
  const NOTE_EMPTY = '（在這裡寫下你的筆記）';
  const UNDO_KEY = 'talent.undo';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const proj = { dir: null, file: '', planId: null, lastMod: 0, lastPayload: '', bound: false, busy: false, timer: 0, pending: null, assets: new Set(), msg: '', cls: '' };

  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n]+/g, '').trim().slice(0, 80);
  const stemOf = (file) => file.replace(/\.md$/i, '');
  const payHash = (t) => { let h = 5381; const s = String(t || ''); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return s.length + ':' + (h >>> 0); };
  const payOf = (plan) => JSON.stringify({ app: 'talent', v: 1, plan });
  const curPlan = () => T.S.plans.find((p) => p.id === proj.planId);
  const binds = () => (T.S.binds = T.S.binds || {});

  function parseFile(text) {
    const m = String(text).match(/<!-- talent-data[^\n]*\r?\n([\s\S]*?)\r?\n-->\s*$/);
    if (!m) return null;
    try { const d = JSON.parse(m[1]); return d && d.app === 'talent' && d.plan ? d : null; } catch (e) { return null; }
  }
  function notesOf(text) {
    const a = text.indexOf(NOTE_START), b = text.indexOf(NOTE_END);
    return a >= 0 && b > a ? text.slice(a + NOTE_START.length, b).replace(/^\r?\n|\r?\n$/g, '') : '';
  }

  // ---------- 可閱讀的內容 ----------
  const cell = (v) => String(v == null ? '' : v).trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>') || ' ';
  function show(p, key, v) {
    const f = M.fieldDef(p, key) || {};
    if (f.type === 'check') return v ? '是' : '否';
    if (f.optionLabels && f.optionLabels[v]) return f.optionLabels[v];
    return String(v);
  }
  function fieldLines(p, act, keys) {
    const out = [];
    keys.forEach((k) => {
      const f = M.fieldDef(p, k); if (!f) return;
      const v = M.rawVal(p, act, k);
      if (M.empty(v)) return;
      out.push(f.type === 'textarea' ? `**${f.label}**\n\n${String(v).trim()}` : `**${f.label}**：${show(p, k, v)}`);
    });
    return out;
  }
  function tableMd(p, act, name, cols) {
    const rows = M.list(p, act, name);
    if (!rows.length) return '';
    return ['| ' + cols.map((c) => c.label).join(' | ') + ' |', '|' + cols.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + cols.map((c) => cell(r[c.k])).join(' | ') + ' |')].join('\n');
  }
  function readable(p, stem) {
    const out = [];
    const K = M.kindOf(p);
    const planKeys = K.planFields.concat(Object.keys(p.customFields || {}).filter((k) => p.customFields[k].scope === 'plan'));
    const groups = {};
    planKeys.forEach((k) => { const g = (M.fieldDef(p, k) || {}).group || '其他'; (groups[g] = groups[g] || []).push(k); });
    out.push('## 計畫資料', '', `**計畫類別**：${K.name}`, '');
    Object.keys(groups).forEach((g) => {
      const lines = fieldLines(p, null, groups[g]);
      {
        K.planLists.filter((n) => D.L[n].group === g).forEach((n) => { const t = tableMd(p, null, n, D.L[n].cols.filter((c) => c.scope === 'plan')); if (t) lines.push(`**${D.L[n].label}**\n\n${t}`); });
      }
      if (lines.length) out.push(`### ${g}`, '', lines.join('\n\n'), '');
    });
    const pp = K.planPrompt;
    if (pp && p.responses && p.responses[pp] && p.responses[pp].trim()) out.push(`### AI 回覆：${D.P[pp].title}`, '', p.responses[pp].trim(), '');
    (p.activities || []).forEach((a) => {
      out.push(`## 活動：${a.name}`, '');
      const AT = D.ACT[a.type] || { groups: [], lists: [], prompts: [] };
      const actKeys = Object.keys(D.F).filter((k) => D.F[k].scope === 'act');
      AT.groups.forEach((g) => {
        const lines = fieldLines(p, a, actKeys.filter((k) => D.F[k].group === g));
        AT.lists.filter((n) => (D.L[n].actGroup || D.L[n].group) === g).forEach((n) => {
          const cols = D.L[n].cols.filter((c) => c.k !== 'min');
          const t = tableMd(p, a, n, D.L[n].scope === 'plan' ? cols.filter((c) => c.scope === 'act' || c === cols[0]) : cols);
          if (t) lines.push(`**${D.L[n].label}**\n\n${t}`);
        });
        if (lines.length) out.push(`### ${g}`, '', lines.join('\n\n'), '');
      });
      const cks = Object.keys(p.customFields || {}).filter((k) => p.customFields[k].scope === 'act' && (a.customTemplates || []).some((c) => Object.values(c.map).indexOf(k) >= 0));
      const cl = fieldLines(p, a, cks); if (cl.length) out.push('### 自訂範本欄位', '', cl.join('\n\n'), '');
      Object.keys(a.responses || {}).forEach((pid) => {
        const r = a.responses[pid]; if (!r || !r.trim()) return;
        const P = M.promptDef(pid, p, a);
        out.push(`### AI 回覆：${P ? P.title : pid}`, '', r.trim(), '');
      });
      if ((a.photos || []).length) {
        out.push('### 照片', '');
        a.photos.forEach((ph) => out.push(`![${ph.caption || ''}](<${stem}_檔案/照片_${ph.id}.jpg>)`, ph.caption ? `${ph.caption}` : '', ''));
      }
    });
    return out.join('\n');
  }
  function fileText(p, notes, stem) {
    const ts = new Date().toLocaleString('zh-TW', { hour12: false });
    const title = p.name || p.data.title || '';
    return ['---', `title: ${title}`, `updated: ${ts}`, 'source: 你畫了嗎', '---', '',
      `# ${title}`, '', '## 我的筆記', NOTE_START, notes || NOTE_EMPTY, NOTE_END, '',
      readable(p, stem), '',
      '<!-- ' + TAG + '（「你畫了嗎」讀回資料用，閱讀時不顯示，請勿修改）', payOf(p).replace(/>/g, '\\u003e'), '-->', ''].join('\n');
  }

  // ---------- 資料夾與權限 ----------
  async function permOk(ask, dir) {
    dir = dir || proj.dir; if (!dir) return false;
    if (!dir.queryPermission) return true;
    const o = { mode: 'readwrite' };
    if ((await dir.queryPermission(o)) === 'granted') return true;
    return ask ? (await dir.requestPermission(o)) === 'granted' : false;
  }
  async function chooseDir() {
    try { const h = await window.showDirectoryPicker({ id: 'talent-save', mode: 'readwrite' }); return (await permOk(true, h)) ? h : null; }
    catch (e) { if (e && e.name !== 'AbortError') status('無法選擇資料夾：' + e.message, 'warn'); return null; }
  }
  function setBind(p, dir, file, mod) {
    proj.dir = dir; proj.file = file; proj.planId = p.id; proj.lastMod = mod || 0; proj.bound = !!(dir && file); proj.assets = new Set();
    if (proj.bound) { binds()[p.id] = { dir: dir.name, file, mod: proj.lastMod }; T.kvSet('dir:' + p.id, dir); }
    else delete binds()[p.id];
    T.saveLocal(); renderBar();
  }
  function unbind(msg) {
    clearTimeout(proj.timer); proj.bound = false;
    if (proj.planId) delete binds()[proj.planId];
    T.saveLocal(); renderBar();
    if (msg) status(msg, 'warn');
  }

  // ---------- 寫入 ----------
  async function bytesOfPhoto(id) { const r = await T.idbGet('photos', id); return r ? T.dataUrlBytes(r.dataUrl) : null; }
  async function syncAssets(p, stem) {
    const want = [];
    (p.activities || []).forEach((a) => {
      (a.photos || []).forEach((ph) => want.push({ name: `照片_${ph.id}.jpg`, get: () => bytesOfPhoto(ph.id) }));
      (a.customTemplates || []).forEach((c) => want.push({ name: `範本_${c.id}.${c.kind}`, get: async () => { const f = await T.idbGet('files', c.id); return f ? new Uint8Array(f.buf) : null; } }));
    });
    const todo = want.filter((w) => !proj.assets.has(w.name));
    if (!todo.length) return;
    const sub = await proj.dir.getDirectoryHandle(stem + '_檔案', { create: true });
    for (const w of todo) {
      const exists = await sub.getFileHandle(w.name).then(() => true, () => false);
      if (!exists) {
        const data = await w.get(); if (!data) continue;
        const wr = await (await sub.getFileHandle(w.name, { create: true })).createWritable();
        await wr.write(data); await wr.close();
      }
      proj.assets.add(w.name);
    }
  }
  async function writeNow() {
    clearTimeout(proj.timer); proj.timer = 0;
    if (!proj.bound || proj.busy) return;
    const p = curPlan(); if (!p) return;
    if (!(await permOk(false))) { renderBar(); status('需要重新允許存取資料夾，請按「繼續使用資料夾」。', 'warn'); return; }
    proj.busy = true;
    try {
      const name = proj.file, stem = stemOf(name);
      const fh = await proj.dir.getFileHandle(name, { create: true });
      const f = await fh.getFile(), old = f.size ? await f.text() : '', notes = notesOf(old), pay = payOf(p);
      if (old.trim()) {
        const d = parseFile(old);
        if (!d) { unbind(`「${name}」不是「你畫了嗎」的存檔，已停止自動存檔，檔案沒有被修改。`); return; }
        if (d.plan.id !== p.id) { unbind(`「${name}」是另一個計畫「${d.plan.name || d.plan.data.title || ''}」的存檔，已停止自動存檔，檔案沒有被修改。請按「開啟計畫檔」。`); return; }
        const theirs = payOf(d.plan);
        if (f.lastModified !== proj.lastMod && theirs !== pay && theirs !== proj.lastPayload) {
          await applyData(d, proj.dir, name, f.lastModified);
          status(`「${name}」已在其他電腦更新，已載入最新版本；這台電腦原本的內容可按「復原載入前的內容」取回。`, 'warn');
          return;
        }
      }
      await syncAssets(p, stem);
      if (pay === proj.lastPayload && f.lastModified === proj.lastMod) { status(`已儲存：${proj.dir.name}／${name}`); return; }
      const w = await fh.createWritable();
      await w.write(fileText(p, notes, stem)); await w.close();
      proj.lastMod = (await fh.getFile()).lastModified; proj.lastPayload = pay;
      binds()[p.id] = { dir: proj.dir.name, file: name, mod: proj.lastMod, h: payHash(pay) };
      T.saveLocal();
      status(`已存入 ${proj.dir.name}／${name}（${new Date().toLocaleTimeString('zh-TW', { hour12: false })}）`);
    } catch (e) {
      status('存檔失敗：' + ((e && e.message) || e), 'warn');
    } finally { proj.busy = false; }
  }
  // app.js 每次儲存後呼叫
  self.onStoreSave = () => {
    if (!proj.bound || proj.busy || T.S.cur !== proj.planId) return;
    const p = curPlan(); if (!p || payOf(p) === proj.lastPayload) return;
    status('修改中…');
    clearTimeout(proj.timer); proj.timer = setTimeout(writeNow, 1000);
  };
  window.addEventListener('pagehide', () => { if (proj.timer) writeNow(); });

  // ---------- 讀入 ----------
  function backupCurrent(newPlan) {
    const old = T.S.plans.find((x) => x.id === newPlan.id);
    if (!old || payOf(old) === payOf(newPlan)) return;
    const stamp = new Date().toLocaleString('zh-TW', { hour12: false });
    try { localStorage.setItem(UNDO_KEY, JSON.stringify({ stamp, plan: old })); } catch (e) {}
  }
  async function importAssets(p, dir, stem) {
    let sub = null;
    try { sub = await dir.getDirectoryHandle(stem + '_檔案'); } catch (e) { return; }
    for (const a of p.activities || []) {
      for (const ph of a.photos || []) {
        if (await T.idbGet('photos', ph.id)) continue;
        try {
          const f = await (await sub.getFileHandle(`照片_${ph.id}.jpg`)).getFile();
          const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
          const dim = await new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res({ w: 1600, h: 1200 }); i.src = url; });
          await T.idbPut('photos', ph.id, { dataUrl: url, w: dim.w, h: dim.h });
        } catch (e) {}
      }
      for (const c of a.customTemplates || []) {
        if (await T.idbGet('files', c.id)) continue;
        try { const f = await (await sub.getFileHandle(`範本_${c.id}.${c.kind}`)).getFile(); await T.idbPut('files', c.id, { buf: await f.arrayBuffer(), name: f.name }); } catch (e) {}
      }
    }
  }
  async function applyData(d, dir, file, mod) {
    const p = M.migratePlan(d.plan);
    backupCurrent(p);
    const i = T.S.plans.findIndex((x) => x.id === p.id);
    if (i >= 0) T.S.plans[i] = p; else T.S.plans.push(p);
    T.S.cur = p.id;
    if (!T.S.view || (T.S.view.actId && !p.activities.some((a) => a.id === T.S.view.actId))) T.S.view = { page: 'plan' };
    if (dir) { setBind(p, dir, file, mod); await importAssets(p, dir, stemOf(file)); }
    else { proj.planId = p.id; proj.bound = false; }
    proj.lastPayload = payOf(p);
    T.saveLocal(); T.render(); renderBar();
  }

  async function openPlan() {
    if (!FS_OK) { $('#fupload').click(); return; }
    const dir = await chooseDir(); if (!dir) return;
    await writeNow();
    const items = [];
    for await (const [n, h] of dir.entries()) {
      if (h.kind !== 'file' || !/\.md$/i.test(n)) continue;
      const f = await h.getFile(); if (!f.size || f.size > 3e7) continue;
      const d = parseFile(await f.text());
      if (d) items.push({ n, t: f.lastModified, name: d.plan.name || d.plan.data.title || '' });
    }
    items.sort((a, b) => b.t - a.t);
    proj.pending = dir;
    T.openModal(`<h3>開啟計畫檔：${esc(dir.name)}</h3>${items.length ? items.map((x) => `<button class="filepick" data-fopen="${esc(x.n)}"><b>${esc(x.n.replace(/\.md$/i, ''))}</b><small>${esc(x.name)}｜${new Date(x.t).toLocaleString('zh-TW', { hour12: false })}</small></button>`).join('') : '<p class="muted">這個資料夾沒有「你畫了嗎」的存檔。要把目前的計畫存到這裡，請按「存到資料夾」。</p>'}`, null);
  }
  async function openFromDir(name) {
    const dir = proj.pending; proj.pending = null; T.closeModal(); if (!dir) return;
    try {
      const fh = await dir.getFileHandle(name), f = await fh.getFile(), d = parseFile(await f.text());
      if (!d) { status(`「${name}」沒有網頁的資料區塊，無法開啟。`, 'warn'); return; }
      await applyData(d, dir, name, f.lastModified);
      status(`已開啟「${name}」，之後的修改會自動存回這個檔案。`);
    } catch (e) { status('開啟失敗：' + ((e && e.message) || e), 'warn'); }
  }
  async function saveToDir(asNew) {
    const p = T.plan();
    const def = safeName(p.name || p.data.title || '計畫') + (asNew ? '_2' : '');
    T.openModal(`<h3>${asNew ? '另存新檔（原檔保留不動）' : '存到資料夾'}</h3>
      <div class="fld"><label>檔案名稱</label><input id="fname" value="${esc(def)}"></div>
      <div class="muted">按「確定」後選擇存放的資料夾（例如 Google 雲端硬碟中的資料夾）。會建立「檔案名稱.md」與存放照片、自訂範本的「檔案名稱_檔案」資料夾。</div>`, async () => {
      const name = safeName($('#fname').value);
      if (!name) return false;
      if (!FS_OK) { downloadMd(); return; }
      const dir = await chooseDir(); if (!dir) return false;
      if (await dir.getFileHandle(name + '.md').then(() => true, () => false)) { alert(`資料夾「${dir.name}」裡已經有「${name}.md」，沒有做任何變更。要繼續那個檔案請改按「開啟計畫檔」；要建立新檔請換名稱。`); return false; }
      let target = p;
      if (asNew) {
        await writeNow();
        target = JSON.parse(JSON.stringify(p)); target.id = M.uid(); target.name = name;
        (target.conflicts || []).forEach((c) => { c.id = M.uid(); });
        T.S.plans.push(target); T.S.cur = target.id;
      }
      proj.lastPayload = '';
      setBind(target, dir, name + '.md', 0);
      T.saveLocal(); T.render();
      await writeNow();
      status(`已建立「${dir.name}／${name}.md」，之後的修改會自動存檔。`);
    });
  }
  // 換資料夾：把目前計畫改存到另一個資料夾（同一個計畫，不另建副本）；可選擇刪除原位置的舊檔
  async function moveDir() {
    const p = T.plan(); if (!proj.bound) return saveToDir(false);
    await writeNow();
    const oldDir = proj.dir, file = proj.file, stem = stemOf(file);
    const dir = await chooseDir(); if (!dir) return;
    if (await dir.isSameEntry(oldDir)) { status('選的是同一個資料夾，沒有變更。', 'warn'); return; }
    const exist = await dir.getFileHandle(file).then((h) => h.getFile()).then((x) => x.text()).catch(() => null);
    if (exist != null) {
      const d = parseFile(exist);
      if (!d || d.plan.id !== p.id) { alert(`資料夾「${dir.name}」裡已經有另一個「${file}」，沒有做任何變更。請換一個資料夾，或先用「另存新檔」取不同的名稱。`); return; }
    }
    proj.lastPayload = '';
    setBind(p, dir, file, 0);
    await writeNow();
    if (!proj.bound) return;
    if (confirm(`已改存到「${dir.name}／${file}」。\n\n要刪除原本位置「${oldDir.name}」裡的舊檔「${file}」和「${stem}_檔案」資料夾嗎？\n（按「取消」則保留舊檔，可自行刪除）`)) {
      try { await oldDir.removeEntry(file); } catch (e) {}
      try { await oldDir.removeEntry(stem + '_檔案', { recursive: true }); } catch (e) {}
      status(`已改存到「${dir.name}／${file}」，並刪除原位置的舊檔。`);
    } else status(`已改存到「${dir.name}／${file}」；原位置「${oldDir.name}」的舊檔保留。`);
  }
  function downloadMd() {
    const p = T.plan(), name = safeName(p.name || p.data.title || '計畫');
    T.saveBlob(new Blob([fileText(p, '', name)], { type: 'text/markdown' }), name + '.md');
    status('已下載 .md 存檔（不含照片與自訂範本）。請放到雲端硬碟的存檔資料夾。');
  }

  // 啟動或切換計畫：資料夾、檔名、檔案內的計畫都對得上，才接回自動存檔
  async function attach(planId, ask) {
    clearTimeout(proj.timer);
    proj.planId = planId; proj.bound = false; proj.dir = null; proj.file = ''; proj.lastPayload = ''; proj.assets = new Set();
    const bd = binds()[planId];
    if (!FS_OK || !bd) { renderBar(); status(''); return true; }
    const h = await T.kvGet('dir:' + planId);
    if (!h || h.name !== bd.dir) { unbind(); return true; }
    if (!(await permOk(ask, h))) { proj.dir = h; proj.file = bd.file; renderBar(true); status(`瀏覽器重新開啟後，需要再允許一次資料夾存取。`, 'warn'); return false; }
    try {
      const f = await (await h.getFileHandle(bd.file)).getFile(), d = parseFile(await f.text());
      if (!d || d.plan.id !== planId) { unbind(`上次的存檔「${bd.file}」與目前的計畫對不上，未接回自動存檔。請按「開啟計畫檔」。`); return true; }
      const p = curPlan();
      if (f.lastModified !== bd.mod && !(bd.h && payHash(payOf(d.plan)) === bd.h) && (!p || payOf(p) !== payOf(d.plan))) {
        await applyData(d, h, bd.file, f.lastModified);
        status(`「${bd.file}」已在其他電腦更新，已載入最新版本；這台電腦原本的內容可按「復原載入前的內容」取回。`, 'warn');
        return true;
      }
      proj.dir = h; proj.file = bd.file; proj.lastMod = f.lastModified; proj.bound = true;
      proj.lastPayload = payOf(d.plan);
      await importAssets(p, h, stemOf(bd.file));
      renderBar(); status('已接回存檔。');
      writeNow();
    } catch (e) { unbind(`找不到上次的存檔「${bd.file}」，未接回自動存檔。請按「開啟計畫檔」。`); }
    return true;
  }

  // ---------- 介面 ----------
  function whyNoFs() {
    const ua = navigator.userAgent, tail = '目前只能用「下載 .md」與「開啟 .md」。';
    if (window.self !== window.top) return '網頁被嵌在其他頁面裡，無法存取資料夾，請直接在 Chrome 的分頁開啟本網址。' + tail;
    if (/Android|iPhone|iPad|Mobile/i.test(ua)) return '手機與平板的瀏覽器不支援資料夾存取，請在電腦版 Chrome 或 Edge 開啟。' + tail;
    if (/Firefox\//.test(ua)) return 'Firefox 不支援資料夾存取，請改用 Chrome 或 Edge 開啟。' + tail;
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari 不支援資料夾存取，請改用 Chrome 或 Edge 開啟。' + tail;
    if (!window.isSecureContext) return '網頁不是以 https 開啟，無法存取資料夾。' + tail;
    return '這個瀏覽器不支援資料夾存取，請改用電腦版 Chrome 或 Edge 開啟。' + tail;
  }
  function status(t, cls) { proj.msg = t || ''; proj.cls = cls || ''; const s = $('#fstat'); if (s) { s.textContent = proj.msg; s.className = 'fstat' + (cls ? ' ' + cls : ''); } }
  function renderBar(needResume) {
    const bar = $('#fbar'); if (!bar) return;
    let undo = null; try { undo = JSON.parse(localStorage.getItem(UNDO_KEY) || 'null'); } catch (e) {}
    const cur = proj.bound ? `存檔：<b>${esc(proj.dir.name)}／${esc(proj.file)}</b>`
      : FS_OK ? '<span class="warn">目前計畫沒有連結存檔（只存在這個瀏覽器）。</span>' : `<span class="warn">${esc(whyNoFs())}</span>`;
    bar.innerHTML = `<span class="fcur">${cur}</span>
      ${needResume && proj.dir ? `<button class="small primary" data-f="resume">繼續使用「${esc(proj.dir.name)}／${esc(proj.file)}」</button>` : ''}
      <button class="small" data-f="open">${FS_OK ? '開啟計畫檔' : '開啟 .md'}</button>
      ${FS_OK ? (proj.bound ? '<button class="small" data-f="move" title="同一個計畫改存到另一個資料夾">換資料夾</button><button class="small" data-f="saveas" title="複製成另一個計畫，原檔保留">另存新檔</button>' : '<button class="small" data-f="save">存到資料夾</button>') : '<button class="small" data-f="dl">下載 .md</button>'}
      ${undo && undo.plan ? `<button class="small" data-f="undo" title="${esc(undo.stamp)}">復原載入前的內容</button>` : ''}
      <span id="fstat" class="fstat ${proj.cls}">${esc(proj.msg)}</span>
      <input type="file" id="fupload" accept=".md" hidden>`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-f],[data-fopen]'); if (!b) return;
    if (b.dataset.fopen) return openFromDir(b.dataset.fopen);
    const a = b.dataset.f;
    if (a === 'open') return openPlan();
    if (a === 'save') return saveToDir(false);
    if (a === 'saveas') return saveToDir(true);
    if (a === 'move') return moveDir();
    if (a === 'dl') return downloadMd();
    if (a === 'resume') { if (await attach(proj.planId, true)) renderBar(); return; }
    if (a === 'undo') {
      let u = null; try { u = JSON.parse(localStorage.getItem(UNDO_KEY) || 'null'); } catch (e) {}
      if (!u || !u.plan) return;
      if (!confirm(`把計畫換回 ${u.stamp} 載入前的內容？\n復原後會寫入目前連結的存檔。`)) return;
      const i = T.S.plans.findIndex((x) => x.id === u.plan.id);
      if (i >= 0) T.S.plans[i] = u.plan; else T.S.plans.push(u.plan);
      localStorage.removeItem(UNDO_KEY);
      T.S.cur = u.plan.id; T.saveLocal(); T.render(); renderBar(); self.onStoreSave();
    }
  });
  document.addEventListener('change', async (e) => {
    if (e.target.id !== 'fupload') return;
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const d = parseFile(await f.text());
    if (!d) { status(`「${f.name}」沒有網頁的資料區塊，無法讀回。`, 'warn'); return; }
    await applyData(d, null, '', 0);
    status(`已載入「${f.name}」。這個瀏覽器不支援自動存檔，修改後請用「下載 .md」。`);
  });

  self.__talentFile = { attach, writeNow, parseFile, fileText, setBind, proj, applyData };
  // 啟動（密碼通過、資料載入後由 app.js 呼叫）
  self.__talentFileInit = async () => {
    renderBar();
    if (!FS_OK) { status(whyNoFs(), 'warn'); return; }
    await attach(T.S.cur, false);
  };
  if (T.started) self.__talentFileInit();
})();
