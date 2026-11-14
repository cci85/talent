/* 你畫了沒：介面 */
(function () {
  const VERSION = '2026.11.14-4';
  const D = self.DEFS, M = self.MODEL, E = self.TalentEngine;
  const KEY = 'talent.v1', PWKEY = 'talent.pw';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ---------------- 儲存 ----------------
  let S = null, started = false;
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const go = () => {
      if (saveLocal()) $('#saved').textContent = '瀏覽器已儲存 ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
      if (self.onStoreSave) self.onStoreSave();
    };
    if (now) go(); else saveTimer = setTimeout(go, 400);
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); return true; }
    catch (e) { alert('儲存失敗：瀏覽器空間不足。請先匯出備份。'); return false; }
  }
  const DB = { db: null };
  function idb() {
    if (DB.db) return Promise.resolve(DB.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('talent', 2);
      r.onupgradeneeded = () => { ['photos', 'files', 'kv'].forEach((n) => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); }); };
      r.onsuccess = () => { DB.db = r.result; res(DB.db); };
      r.onerror = () => rej(r.error);
    });
  }
  async function idbOp(store, mode, fn) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode); const st = tx.objectStore(store);
      const rq = fn(st); tx.oncomplete = () => res(rq && rq.result); tx.onerror = () => rej(tx.error);
    });
  }
  const idbGet = (s, k) => idbOp(s, 'readonly', (st) => st.get(k));
  const idbPut = (s, k, v) => idbOp(s, 'readwrite', (st) => st.put(v, k));
  const idbDel = (s, k) => idbOp(s, 'readwrite', (st) => st.delete(k));
  const idbAll = (s) => idbOp(s, 'readonly', (st) => st.getAllKeys());

  function seed() {
    const plan = M.newPlan(true, D.DEFAULT_KIND);
    const first = M.kindOf(plan).acts[0] || 'blank';
    const act = M.newActivity(plan, first, D.ACT[first].name, null, true);
    plan.name = '我的計畫';
    D.SEED.conflicts.forEach((c) => M.addConflict(plan, { actId: c.scope === 'plan' ? null : act.id, ref: 'f:' + c.key, ai: c.ai, src: c.src, label: M.outLabel(plan, c.key) }));
    return { plans: [plan], cur: plan.id, view: { page: 'act', actId: act.id, tab: 'fill' } };
  }

  const plan = () => S.plans.find((p) => p.id === S.cur) || S.plans[0];
  const actOf = (id) => plan().activities.find((a) => a.id === id);
  const V = () => S.view || (S.view = { page: 'plan' });
  function go(v) { S.view = v; save(); render(); window.scrollTo(0, 0); }
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, ms || 2600); }

  // ---------------- 範本 ----------------
  const scanCache = {};
  async function tplBuffer(act, tplId) {
    if (D.T[tplId]) {
      const r = await fetch(D.T[tplId].file + '?v=' + VERSION);
      if (!r.ok) throw new Error('讀不到範本檔 ' + D.T[tplId].file);
      return r.arrayBuffer();
    }
    const ct = act.customTemplates.find((c) => c.id === tplId);
    const f = await idbGet('files', ct.id);
    if (!f) throw new Error('找不到自訂範本檔案，請重新上傳。');
    return f.buf;
  }
  function tplInfo(act, tplId) {
    if (D.T[tplId]) return Object.assign({ id: tplId, custom: false }, D.T[tplId]);
    const ct = act.customTemplates.find((c) => c.id === tplId);
    return ct && { id: ct.id, name: ct.name, kind: ct.kind, custom: true, map: ct.map };
  }
  function actTemplates(act) {
    return D.ACT[act.type].templates.map((id) => tplInfo(act, id)).concat(act.customTemplates.map((c) => tplInfo(act, c.id)));
  }
  async function scanTpl(act, tplId) {
    const ck = D.T[tplId] ? tplId : act.id + ':' + tplId;
    if (!scanCache[ck]) scanCache[ck] = tplBuffer(act, tplId).then((b) => E.scanPlaceholders(b));
    const r = await scanCache[ck];
    return M.placeholderFields(r.names, (tplInfo(act, tplId) || {}).map);
  }
  async function blankCount(p, act, tplId) {
    const { fields } = await scanTpl(act, tplId);
    const g = M.getter(p, act, tplId);
    const skip = (D.ACT[act.type] || {}).optional || [];
    return fields.filter((k) => skip.indexOf(k) < 0 && (M.fieldDef(p, k) || {}).type !== 'check' && M.empty(g(k))).length;
  }
  function dataUrlBytes(u) {
    const b = atob(u.split(',')[1]); const a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }
  async function buildFile(p, act, tplId) {
    const t = tplInfo(act, tplId);
    const buf = await tplBuffer(act, tplId);
    const ctx = M.makeCtx(p, act, tplId, t.map);
    let blob;
    if (t.kind === 'docx') blob = await E.fillDocx(buf, ctx);
    else {
      const photos = [];
      for (const g of t.photos || []) {
        const items = [];
        for (const ph of act.photos.filter((x) => x.group === g.group)) {
          const rec = await idbGet('photos', ph.id);
          if (rec) items.push({ data: dataUrlBytes(rec.dataUrl), ext: 'jpeg', w: rec.w, h: rec.h, caption: ph.caption || '' });
        }
        photos.push({ after: g.after, title: g.title, items });
      }
      blob = await E.fillPptx(buf, ctx, { splits: t.splits, photos });
    }
    return { blob, name: `${act.name}_${t.name}.${t.kind}`.replace(/[\\/:*?"<>|]/g, '_') };
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  // ---------------- 元件 ----------------
  function conflictsFor(p, act, refs) {
    return (p.conflicts || []).filter((c) => (act ? c.actId === act.id || c.actId === null : c.actId === null) && (!refs || refs.indexOf(c.ref) >= 0));
  }
  function fieldHTML(p, act, key, tpl) {
    const f = M.fieldDef(p, key) || { key, label: key, type: 'text', scope: 'act' };
    const unl = tpl && act && act.unlinked[tpl] && act.unlinked[tpl][key];
    let v = unl ? (act.overrides[tpl] || {})[key] : M.rawVal(p, act, key);
    if (v == null) v = '';
    const dflt = M.defaultOf(p, act, key);
    const ph = dflt ? String(dflt).split('\n')[0] + (String(dflt).indexOf('\n') >= 0 ? '…' : '') : (f.hint || '');
    const conf = conflictsFor(p, act, ['f:' + key]).length && !unl;
    const data = `data-k="${esc(key)}"${tpl ? ` data-t="${esc(tpl)}"` : ''}`;
    let input;
    if (f.type === 'textarea') {
      const rows = Math.min(10, Math.max(2, String(v || dflt || '').split('\n').length + 1));
      input = `<textarea ${data} rows="${rows}" placeholder="${esc(dflt || f.hint || '')}">${esc(v)}</textarea>`;
    } else if (f.type === 'select') {
      input = `<select ${data}><option value=""></option>${f.options.map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc((f.optionLabels || {})[o] || o)}</option>`).join('')}</select>`;
    } else if (f.type === 'check') {
      return `<div class="fld chk"><input type="checkbox" ${data}${v ? ' checked' : ''} id="c_${esc(key)}"><label for="c_${esc(key)}">${esc(f.label)}</label></div>`;
    } else {
      input = `<input ${data} value="${esc(v)}" placeholder="${esc(ph)}"${f.type === 'number' ? ' inputmode="numeric"' : ''}>`;
    }
    const tags = [];
    if (f.scope === 'plan') tags.push('<span class="tag plan" title="所有活動共用，修改會同步">計畫共用</span>');
    if (f.ai) tags.push('<span class="tag ai">AI</span>');
    if (conf) tags.push('<span class="tag cf">待確認差異</span>');
    if (unl) tags.push('<span class="tag unl">此範本獨立</span>');
    const link = tpl ? ` <button class="link small" data-a="unlink" data-k="${esc(key)}" data-t="${esc(tpl)}" title="${unl ? '恢復與其他範本同步' : '只改這份範本，不影響其他範本'}">${unl ? '恢復連動' : '解除連動'}</button>` : '';
    const wide = f.type === 'textarea' ? ' wide' : '';
    return `<div class="fld${wide}${conf ? ' has-conflict' : ''}"><label>${esc(f.label)}${tags.join('')}${link}</label>${input}${f.hint && f.type === 'textarea' ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
  }

  function listHTML(p, act, name, mode) {
    // mode: plan（只顯示計畫欄）／act（全部欄）
    const L = D.L[name];
    const cols = mode === 'plan' ? L.cols.filter((c) => c.scope === 'plan') : L.cols;
    const rows = L.scope === 'plan' ? M.list(p, act, name) : M.list(p, act, name);
    const head = cols.map((c) => `<th class="${c.scope === 'act' && L.scope === 'plan' ? 'act' : ''}" style="width:${c.w}%">${esc(c.label)}${c.scope === 'act' && L.scope === 'plan' ? '<br><span class="muted">本活動</span>' : ''}</th>`).join('');
    const body = rows.map((r, i) => {
      const confs = conflictsFor(p, act).map((c) => c.ref);
      return `<tr>${cols.map((c) => {
        const val = r[c.k] == null ? '' : r[c.k];
        const ref = (L.scope === 'plan' ? (c.scope === 'plan' ? 'p' : 'l') : 'a') + `:${name}:${r.id}:${c.k}`;
        const st = confs.indexOf(ref) >= 0 ? ' style="border-color:#e39b3b;background:#fffaf2"' : '';
        const data = `data-l="${name}" data-r="${r.id}" data-c="${c.k}"${st}`;
        return `<td>${c.area ? `<textarea ${data} rows="${Math.min(6, Math.max(2, String(val).split('\n').length))}">${esc(val)}</textarea>` : `<input ${data} value="${esc(val)}">`}</td>`;
      }).join('')}<td class="ops">${`<button class="small" data-a="rowUp" data-l="${name}" data-r="${r.id}" title="上移">↑</button><button class="small danger" data-a="rowDel" data-l="${name}" data-r="${r.id}" title="刪除此列">✕</button>`}</td></tr>`;
    }).join('');
    const extra = name === 'agenda' ? `<button class="small" data-a="agTimes">依開始時間重算各列時間</button><button class="small" data-a="agReset">依目前資料重建議程</button><span class="muted">「分鐘」為每段長度；重算後時間會依「查訪內容」的開始時間排出。</span>` : '';
    const note = L.scope === 'plan' && mode !== 'plan' ? '<div class="muted">黑色欄位為計畫共用（修改會同步到所有活動），綠色標題欄位只屬於本活動。</div>' : '';
    return `<div class="card"><h3>${esc(L.label)}${L.ai || cols.some((c) => c.ai) ? ' <span class="tag ai">AI</span>' : ''}</h3>${note}
      <table class="lt"><thead><tr>${head}<th></th></tr></thead><tbody>${body}</tbody></table>
      <div class="row" style="margin-top:8px"><button class="small" data-a="rowAdd" data-l="${name}">＋新增一列</button>${extra}</div></div>`;
  }

  function conflictPanel(p, act) {
    const list = conflictsFor(p, act);
    if (!list.length) return '';
    return `<div class="card warn"><h3>待確認差異（${list.length}）</h3><div class="muted">AI 回覆或原始檔案與已填資料不一致。請選擇要保留的版本，之後仍可在欄位中修改。</div>
      ${list.map((c) => {
        const r = M.resolveRef(p, act || {}, c.ref);
        const cur = r ? r.get() : '';
        return `<div class="conf"><b>${esc(c.label)}</b><div class="two"><div><b>目前填寫</b>${esc(cur) || '<span class="muted">（空白）</span>'}</div><div><b>${esc(c.src)}</b>${esc(c.ai)}</div></div>
        <div class="row"><button class="small" data-a="cfKeep" data-id="${c.id}">保留目前填寫</button><button class="small primary" data-a="cfTake" data-id="${c.id}">改用右邊版本</button></div></div>`;
      }).join('')}</div>`;
  }

  // ---------------- 頁面 ----------------
  function renderSide() {
    const p = plan(), v = V();
    let h = `<div class="sec">計畫</div><a data-go="plan" class="${v.page === 'plan' ? 'on' : ''}">${esc(p.name || '計畫資料')}${conflictsFor(p, null).length ? ' <span class="tag cf badge">' + conflictsFor(p, null).length + '</span>' : ''}</a>`;
    h += `<div class="sec">活動 <button class="small" data-a="newAct">＋活動</button></div>`;
    p.activities.forEach((a) => {
      const n = (p.conflicts || []).filter((c) => c.actId === a.id).length;
      h += `<a data-go="act:${a.id}" class="${v.actId === a.id && v.page === 'act' ? 'on' : ''}">${esc(a.name)}${n ? ' <span class="tag cf badge">' + n + '</span>' : ''}</a>`;
      if (v.actId === a.id) actTemplates(a).forEach((t) => {
        h += `<a class="sub ${v.page === 'tpl' && v.tplId === t.id ? 'on' : ''}" data-go="tpl:${a.id}:${t.id}"><span class="kind ${t.kind}">${t.kind === 'pptx' ? 'PPT' : 'Word'}</span>${esc(t.name)}</a>`;
      });
    });
    $('#side').innerHTML = h;
    $('#planSel').innerHTML = S.plans.map((x) => `<option value="${x.id}"${x.id === S.cur ? ' selected' : ''}>${esc(x.name || x.data.title || '未命名計畫')}</option>`).join('');
  }

  function groupedFields(p, keys) {
    const groups = {};
    keys.forEach((k) => { const f = M.fieldDef(p, k); const g = (f && f.group) || '其他'; (groups[g] = groups[g] || []).push(k); });
    return groups;
  }

  function pagePlan() {
    const p = plan();
    const K = M.kindOf(p);
    const keys = K.planFields.concat(Object.keys(p.customFields).filter((k) => p.customFields[k].scope === 'plan'));
    const groups = groupedFields(p, keys);
    let h = `<div class="row" style="margin-bottom:6px"><h2 style="margin:0" id="planH">${esc(p.name || '計畫資料')}</h2><span class="muted">計畫共用資料｜計畫類別：${esc(K.name)}</span></div><div class="note">這裡的資料所有活動、所有範本共用；在任何地方修改都會同步。${K.planPrompt ? '可先用下方 prompt 從計畫書一次擷取。' : ''}</div>`;
    h += `<div class="card"><div class="grid"><div class="fld"><label>計畫名稱（顯示在左側選單與上方切換選單）</label><input data-pn="1" value="${esc(p.name)}"></div></div></div>`;
    h += conflictPanel(p, null);
    if (K.planPrompt) h += promptCard(p, null, K.planPrompt);
    const shown = new Set();
    Object.keys(groups).forEach((g) => {
      h += `<div class="card"><h3>${esc(g)}</h3><div class="grid">${groups[g].map((k) => fieldHTML(p, null, k)).join('')}</div>`;
      if (K.planCalcs && K.planCalcs[g]) h += `<div class="calc" style="margin-top:8px">${esc(K.planCalcs[g](M.getter(p, null)))}</div>`;
      h += '</div>';
      K.planLists.filter((n) => D.L[n].group === g).forEach((n) => { shown.add(n); h += listHTML(p, null, n, 'plan'); });
    });
    K.planLists.filter((n) => !shown.has(n)).forEach((n) => { h += listHTML(p, null, n, 'plan'); });
    h += `<div class="card"><h3>管理</h3><div class="row"><button class="danger" data-a="delPlan">刪除這個計畫</button><span class="muted">會一併刪除其中所有活動。</span></div></div>`;
    return h;
  }

  function promptCard(p, act, pid) {
    const P = M.promptDef(pid, p, act);
    if (!P) return '';
    const g = M.getter(p, act);
    const chips = P.outputs.map(([k]) => {
      let done;
      if (k[0] === '@') { const rows = M.list(p, act, k.slice(1)); const cols = M.listCols(pid, k.slice(1)).filter((c) => M.isPlanPrompt(pid) || c.ai === pid || D.L[k.slice(1)].scope === 'act'); done = rows.length && rows.every((r) => cols.every((c) => !M.empty(r[c.k]))); }
      else done = !M.empty(M.rawVal(p, act, k));
      return `<span class="chip ${done ? 'done' : ''}">${esc(M.outLabel(p, k).replace(/^實際達成情形\d：|^預定培育成果\d：/, ''))}</span>`;
    }).join('');
    const resp = (act ? act.responses : (p.responses = p.responses || {}))[pid] || '';
    return `<div class="card prompt-card"><h3>${esc(P.title)}</h3><div class="muted">${esc(P.desc)}</div><div class="chips">${chips}</div>
      <div class="row"><button class="primary" data-a="copyPrompt" data-p="${pid}">複製 prompt</button><span class="muted">貼到 NotebookLM（或其他 AI），把回覆整段貼到下方。</span></div>
      <details style="margin-top:8px"><summary>查看 prompt 內容</summary><pre class="prompt">${esc(M.buildPrompt(pid, p, act))}</pre></details>
      <div class="fld" style="margin-top:10px"><label>貼上 AI 回覆</label><textarea data-resp="${pid}" rows="5" placeholder="把 AI 的回覆整段貼在這裡">${esc(resp)}</textarea></div>
      <div class="row"><button data-a="applyResp" data-p="${pid}">套用到欄位</button><span class="muted">空白欄位直接填入；與已填內容不同的會列入「待確認差異」由你選擇。</span></div></div>`;
  }

  function pageAct() {
    const p = plan(), act = actOf(V().actId);
    if (!act) { go({ page: 'plan' }); return ''; }
    const AT = D.ACT[act.type];
    const tabs = [['fill', '填寫'], ['ai', 'AI 產生']].concat(AT.photoGroups ? [['photos', '照片']] : [], [['files', '範本與下載']]);
    let tab = V().tab || 'fill';
    if (!tabs.some(([k]) => k === tab)) tab = 'fill';
    let h = `<div class="row" style="margin-bottom:6px"><h2 style="margin:0">${esc(act.name)}</h2><button class="small" data-a="renameAct">改名</button><span class="muted">${esc(AT.name)}</span></div>`;
    h += `<div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    h += conflictPanel(p, act);
    if (tab === 'fill') h += tabFill(p, act);
    if (tab === 'ai') {
      const pp = M.kindOf(p).planPrompt;
      h += `<div class="note">${pp ? `建議先到「${esc(p.name || '計畫資料')}」（左側計畫）用「${esc(D.P[pp].title)}」填好共用資料，再依序產生以下內容。` : ''}每段 prompt 都會帶入已填好的資料當背景。</div>`;
      D.ACT[act.type].prompts.concat(act.customTemplates.filter((c) => Object.values(c.map).some((k) => p.customFields[k] && p.customFields[k].ai)).map((c) => 'c_' + c.id)).forEach((pid) => { h += promptCard(p, act, pid); });
    }
    if (tab === 'photos') h += tabPhotos(p, act);
    if (tab === 'files') h += tabFiles(p, act);
    return h;
  }

  function tabFill(p, act) {
    const T = D.ACT[act.type];
    const keys = Object.keys(D.F).filter((k) => D.F[k].scope === 'act');
    const groups = groupedFields(p, keys);
    let h = '';
    T.groups.forEach((g) => {
      const lists = T.lists.filter((n) => (D.L[n].actGroup || D.L[n].group) === g);
      if (groups[g]) {
        h += `<div class="card"><h3>${esc(g)}</h3><div class="grid">${groups[g].map((k) => fieldHTML(p, act, k)).join('')}</div>`;
        if (T.calcs && T.calcs[g]) h += `<div class="calc" style="margin-top:8px">${esc(T.calcs[g](M.getter(p, act)))}</div>`;
        h += '</div>';
      }
      lists.forEach((n) => { h += listHTML(p, act, n, 'act'); });
    });
    const cks = Object.keys(p.customFields).filter((k) => p.customFields[k].scope === 'act' && act.customTemplates.some((c) => Object.values(c.map).indexOf(k) >= 0));
    if (cks.length) h += `<div class="card"><h3>自訂範本欄位</h3><div class="grid">${cks.map((k) => fieldHTML(p, act, k)).join('')}</div></div>`;
    if (!T.groups.length && !cks.length) h += '<div class="note">這是空白活動。請到「範本與下載」上傳自訂範本，欄位會出現在這裡。</div>';
    return h;
  }

  function tabPhotos(p, act) {
    const PG = D.ACT[act.type].photoGroups || {};
    const groups = Object.keys(PG);
    let h = `<div class="note">照片會壓縮後存在這台電腦的瀏覽器，下載簡報時自動放進投影片（每頁 2 張，說明文字放在照片下方）。</div>`;
    groups.forEach((g) => {
      const list = act.photos.filter((x) => x.group === g);
      h += `<div class="card"><h3>${esc(PG[g])}（${list.length}）</h3>
        <div class="row" style="margin-bottom:10px"><label class="btn">上傳照片<input type="file" accept="image/*" multiple hidden data-upphoto="${g}"></label></div>
        <div class="photos">${list.map((ph) => `<div class="photo"><img data-ph="${ph.id}" alt=""><input data-cap="${ph.id}" value="${esc(ph.caption)}" placeholder="照片說明" style="margin-top:6px">
          <div class="row" style="margin-top:4px"><button class="small" data-a="phUp" data-id="${ph.id}">← 前移</button><button class="small danger" data-a="phDel" data-id="${ph.id}">刪除</button></div></div>`).join('')}</div></div>`;
    });
    setTimeout(async () => { for (const img of $$('img[data-ph]')) { const r = await idbGet('photos', img.dataset.ph); if (r) img.src = r.dataUrl; } }, 0);
    return h;
  }

  function tabFiles(p, act) {
    const list = actTemplates(act);
    let h = `<div class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">範本</h3><button class="primary" data-a="dlAll">全部下載（zip）</button></div>
      ${list.map((t) => `<div class="tpl-row"><span class="kind ${t.kind}">${t.kind === 'pptx' ? 'PPT' : 'Word'}</span><span class="nm"><a href="#" data-go="tpl:${act.id}:${t.id}">${esc(t.name)}</a> <span class="muted" data-blank="${t.id}"></span></span>
        ${t.custom ? `<button class="small danger" data-a="delCustom" data-id="${t.id}">移除</button>` : ''}<button data-a="dl" data-t="${t.id}">下載</button></div>`).join('')}</div>`;
    h += `<div class="card"><h3>上傳自訂範本</h3><div class="muted">在 Word／PowerPoint 檔中，把要填的地方寫成 <code>{{欄位名稱}}</code>（例如 <code>{{計畫名稱}}</code>、<code>{{活動成果說明}}</code>）。網站會比對已有欄位，名稱相近的請你確認一次，之後就記住。勾選框寫 <code>{{?欄位=選項}}</code>。</div>
      <div class="row" style="margin-top:10px"><label class="btn">選擇 .docx／.pptx<input type="file" accept=".docx,.pptx" hidden data-upcustom="1"></label></div></div>`;
    h += `<div class="card"><h3>管理</h3><div class="row"><button class="danger" data-a="delAct">刪除這個活動</button></div></div>`;
    setTimeout(() => list.forEach(async (t) => {
      try { const n = await blankCount(p, act, t.id); const el = $(`[data-blank="${t.id}"]`); if (el) el.textContent = n ? `尚有 ${n} 個欄位空白` : '欄位已填齊'; } catch (e) { const el = $(`[data-blank="${t.id}"]`); if (el) el.textContent = e.message; }
    }), 0);
    return h;
  }

  function pageTpl() {
    const p = plan(), act = actOf(V().actId);
    const t = act && tplInfo(act, V().tplId);
    if (!t) { go({ page: 'plan' }); return ''; }
    setTimeout(async () => {
      const box = $('#tplFields');
      try {
        const { fields: raw, lists } = await scanTpl(act, t.id);
        const order = M.kindFields(p);
        const fields = raw.slice().sort((a, b) => (order.indexOf(a) < 0 ? 999 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 999 : order.indexOf(b)));
        const planK = fields.filter((k) => M.scopeOf(p, k) === 'plan'), actK = fields.filter((k) => M.scopeOf(p, k) !== 'plan');
        let h = '';
        if (planK.length) h += `<div class="card"><h3>計畫共用欄位</h3><div class="muted">修改會同步到所有活動與範本；按「解除連動」可只改這份範本。</div><div class="grid" style="margin-top:8px">${planK.map((k) => fieldHTML(p, act, k, t.id)).join('')}</div></div>`;
        if (actK.length) h += `<div class="card"><h3>本活動欄位</h3><div class="grid">${actK.map((k) => fieldHTML(p, act, k, t.id)).join('')}</div></div>`;
        lists.forEach((n) => { if (D.L[n]) h += listHTML(p, act, n, 'act'); });
        box.innerHTML = h;
        const n = await blankCount(p, act, t.id);
        $('#tplBlank').textContent = n ? `尚有 ${n} 個欄位空白` : '欄位已填齊';
      } catch (e) { box.innerHTML = `<div class="card warn">${esc(e.message)}</div>`; }
    }, 0);
    let note = '';
    if (t.note) note = `<div class="note">${esc(t.note)}</div>`;
    return `<div class="row" style="margin-bottom:10px"><h2 style="margin:0"><span class="kind ${t.kind}">${t.kind === 'pptx' ? 'PPT' : 'Word'}</span>${esc(t.name)}</h2><span class="grow"></span><span class="muted" id="tplBlank"></span><button class="primary" data-a="dl" data-t="${t.id}">下載</button></div>
      <div class="muted" style="margin-bottom:10px">所屬活動：<a href="#" data-go="act:${act.id}">${esc(act.name)}</a></div>${note}${conflictPanel(p, act)}<div id="tplFields"><div class="muted">讀取範本中…</div></div>`;
  }

  function render() {
    renderSide();
    const v = V();
    const main = $('#main');
    const sy = window.scrollY;
    main.innerHTML = v.page === 'act' ? pageAct() : v.page === 'tpl' ? pageTpl() : pagePlan();
    window.scrollTo(0, sy);
  }
  function rerenderKeep() { const sy = window.scrollY; render(); window.scrollTo(0, sy); }

  // ---------------- 事件 ----------------
  function setField(el) {
    const p = plan(), act = actOf(V().actId);
    const key = el.dataset.k, tpl = el.dataset.t;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (tpl && act.unlinked[tpl] && act.unlinked[tpl][key]) { (act.overrides[tpl] = act.overrides[tpl] || {})[key] = v; }
    else M.setVal(p, M.scopeOf(p, key) === 'plan' ? null : act, key, v);
    save();
  }
  function setCell(el) {
    const p = plan(), act = actOf(V().actId);
    const name = el.dataset.l, id = el.dataset.r, c = el.dataset.c;
    const L = D.L[name], col = L.cols.find((x) => x.k === c);
    if (L.scope === 'plan' && col.scope === 'plan') { const row = p.lists[name].find((r) => r.id === id); if (row) row[c] = el.value; }
    else if (L.scope === 'plan') { act.listCols[name] = act.listCols[name] || {}; (act.listCols[name][id] = act.listCols[name][id] || {})[c] = el.value; }
    else { const row = act.lists[name].find((r) => r.id === id); if (row) row[c] = el.value; }
    save();
  }
  function rowsOf(name) {
    const p = plan(), act = actOf(V().actId);
    return D.L[name].scope === 'plan' ? (p.lists[name] = p.lists[name] || []) : (act.lists[name] = act.lists[name] || []);
  }

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.k) setField(el);
    else if (el.dataset.l) setCell(el);
    else if (el.dataset.resp) { const p = plan(), act = actOf(V().actId); const store = V().page === 'plan' ? (p.responses = p.responses || {}) : act.responses; store[el.dataset.resp] = el.value; save(); }
    else if (el.dataset.cap) { const act = actOf(V().actId); const ph = act.photos.find((x) => x.id === el.dataset.cap); if (ph) { ph.caption = el.value; save(); } }
    else if (el.dataset.pn) { plan().name = el.value; save(); renderSide(); const hh = $('#planH'); if (hh) hh.textContent = el.value || '計畫資料'; }
  });
  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.k && (el.tagName === 'SELECT' || el.type === 'checkbox')) { setField(el); rerenderKeep(); }
    if (el.id === 'planSel') { if (self.__talentFile) await self.__talentFile.writeNow(); S.cur = el.value; go({ page: 'plan' }); if (self.__talentFile) self.__talentFile.attach(S.cur, false); }
    if (el.dataset.upphoto) { await addPhotos(el.files, el.dataset.upphoto); }
    if (el.dataset.upcustom) { await uploadCustom(el.files[0]); el.value = ''; }
    if (el.id === 'importFile') { await importBackup(el.files[0]); el.value = ''; }
  });
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-go],[data-a],[data-tab]');
    if (!t) return;
    if (t.dataset.go) {
      e.preventDefault();
      const [pg, a, b] = t.dataset.go.split(':');
      if (pg === 'plan') go({ page: 'plan' });
      if (pg === 'act') go({ page: 'act', actId: a, tab: V().actId === a ? V().tab || 'fill' : 'fill' });
      if (pg === 'tpl') go({ page: 'tpl', actId: a, tplId: b });
      return;
    }
    if (t.dataset.tab) { S.view.tab = t.dataset.tab; save(); render(); return; }
    const A = t.dataset.a, p = plan(), act = actOf(V().actId);
    try {
      switch (A) {
        case 'newPlan': return newPlanDlg();
        case 'newAct': return newActDlg();
        case 'renameAct': { const n = prompt('活動名稱', act.name); if (n) { act.name = n.trim(); save(); render(); } return; }
        case 'delAct': if (confirm(`確定刪除活動「${act.name}」？（建議先匯出備份）`)) { for (const ph of act.photos) await idbDel('photos', ph.id); p.activities = p.activities.filter((x) => x !== act); p.conflicts = (p.conflicts || []).filter((c) => c.actId !== act.id); go({ page: 'plan' }); } return;
        case 'delPlan': if (S.plans.length < 2) return alert('至少要保留一個計畫。'); if (confirm('確定刪除這個計畫與其中所有活動？')) { S.plans = S.plans.filter((x) => x !== p); S.cur = S.plans[0].id; go({ page: 'plan' }); } return;
        case 'unlink': {
          const k = t.dataset.k, tp = t.dataset.t;
          act.unlinked[tp] = act.unlinked[tp] || {};
          if (act.unlinked[tp][k]) delete act.unlinked[tp][k];
          else { act.unlinked[tp][k] = true; (act.overrides[tp] = act.overrides[tp] || {})[k] = M.getter(p, act)(k); }
          save(); rerenderKeep(); return;
        }
        case 'rowAdd': { const rows = rowsOf(t.dataset.l); rows.push({ id: M.uid() }); save(); rerenderKeep(); return; }
        case 'rowDel': { const rows = rowsOf(t.dataset.l); const i = rows.findIndex((r) => r.id === t.dataset.r); if (i >= 0 && confirm('刪除這一列？' + (D.L[t.dataset.l].scope === 'plan' ? '（計畫共用，所有活動都會刪除）' : ''))) { rows.splice(i, 1); save(); rerenderKeep(); } return; }
        case 'rowUp': { const rows = rowsOf(t.dataset.l); const i = rows.findIndex((r) => r.id === t.dataset.r); if (i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; save(); rerenderKeep(); } return; }
        case 'agTimes': { act.lists.agenda = D.agendaTimes(act.lists.agenda, M.getter(p, act)('visitStart')); save(); rerenderKeep(); toast('已依開始時間重算'); return; }
        case 'agReset': if (confirm('用目前的會議室、業師、學生等資料重建議程？（會取代目前議程）')) { const g = M.getter(p, act); act.lists.agenda = D.agendaTimes(D.defaultAgenda(g), g('visitStart')).map((r) => Object.assign({ id: M.uid() }, r)); save(); rerenderKeep(); } return;
        case 'cfKeep': case 'cfTake': {
          const c = p.conflicts.find((x) => x.id === t.dataset.id);
          if (c && A === 'cfTake') { const cAct = c.actId ? actOf(c.actId) : act; const r = M.resolveRef(p, cAct || {}, c.ref); if (r) r.set(c.ai); }
          p.conflicts = p.conflicts.filter((x) => x.id !== t.dataset.id); save(); rerenderKeep(); return;
        }
        case 'copyPrompt': { const txt = M.buildPrompt(t.dataset.p, p, act); await navigator.clipboard.writeText(txt); toast('已複製 prompt，可貼到 NotebookLM'); return; }
        case 'applyResp': {
          const pid = t.dataset.p;
          const txt = $(`[data-resp="${pid}"]`).value;
          if (!txt.trim()) return toast('請先貼上 AI 回覆');
          const parsed = M.parseResponse(pid, p, act, txt);
          const nf = Object.keys(parsed.fields).length + Object.keys(parsed.lists).length;
          if (!nf) return alert('沒有讀到任何【欄位名稱】。請確認 AI 有照格式輸出（每個欄位以【欄位名稱】開頭）。');
          const st = M.applyResult(pid, p, act, parsed);
          save(true); rerenderKeep();
          toast(`填入 ${st.filled} 欄、與已填相同 ${st.same} 欄、待確認差異 ${st.conflict} 筆${parsed.unknown.length ? `；未辨識：${parsed.unknown.join('、')}` : ''}`, 5000);
          return;
        }
        case 'dl': { toast('產生檔案中…'); const f = await buildFile(p, act, t.dataset.t); saveBlob(f.blob, f.name); return; }
        case 'dlAll': {
          toast('產生檔案中…');
          const zip = new JSZip();
          for (const tp of actTemplates(act)) { const f = await buildFile(p, act, tp.id); zip.file(f.name, f.blob); }
          saveBlob(await zip.generateAsync({ type: 'blob' }), `${act.name}.zip`.replace(/[\\/:*?"<>|]/g, '_'));
          return;
        }
        case 'phDel': if (confirm('刪除這張照片？')) { await idbDel('photos', t.dataset.id); act.photos = act.photos.filter((x) => x.id !== t.dataset.id); save(); rerenderKeep(); } return;
        case 'phUp': { const ph = act.photos.find((x) => x.id === t.dataset.id); const same = act.photos.filter((x) => x.group === ph.group); const i = same.indexOf(ph); if (i > 0) { const a = act.photos.indexOf(same[i - 1]), b = act.photos.indexOf(ph); [act.photos[a], act.photos[b]] = [act.photos[b], act.photos[a]]; save(); rerenderKeep(); } return; }
        case 'delCustom': if (confirm('移除這份自訂範本？（已填的欄位資料會保留）')) { await idbDel('files', t.dataset.id); act.customTemplates = act.customTemplates.filter((c) => c.id !== t.dataset.id); save(); rerenderKeep(); } return;
        case 'export': return exportBackup();
        case 'mclose': return closeModal();
      }
    } catch (err) { console.error(err); alert('發生錯誤：' + err.message); }
  });

  // ---------------- 對話框 ----------------
  function openModal(html, onOk) {
    $('#mbox').innerHTML = html + `<div class="row"><button data-a="mclose">取消</button>${onOk ? '<button class="primary" id="mok">確定</button>' : ''}</div>`;
    $('#modal').hidden = false;
    if (onOk) $('#mok').onclick = async () => { if ((await onOk()) !== false) closeModal(); };
  }
  function closeModal() { $('#modal').hidden = true; $('#mbox').innerHTML = ''; }

  function newActDlg() {
    const p = plan(), types = M.actTypes(p);
    openModal(`<h3>新增活動</h3>
      <div class="fld"><label>活動類型</label><select id="naType">${types.map((k) => `<option value="${k}">${esc(D.ACT[k].name)}</option>`).join('')}</select></div>
      <div class="fld"><label>活動名稱</label><input id="naName" placeholder="例：${esc(p.data.year || '')}學年度${esc(D.ACT[types[0]].name)}"></div>
      <div class="fld"><label>沿用前一個活動的內容（可不選）</label><select id="naCopy"><option value="">不沿用，從空白開始</option>${p.activities.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></div>
      <div class="muted">沿用時會複製該活動已填的欄位與表格（不含照片、AI 回覆），之後再修改。計畫共用資料本來就會自動帶入。</div>`, () => {
      const type = $('#naType').value, from = $('#naCopy').value ? actOf($('#naCopy').value) : null;
      if (from && from.type !== type && !confirm('沿用的活動類型不同，仍要複製嗎？')) return false;
      const a = M.newActivity(p, type, $('#naName').value.trim() || D.ACT[type].name, from);
      go({ page: 'act', actId: a.id, tab: 'fill' });
    });
  }
  function newPlanDlg() {
    // 只有一種計畫類別時不顯示類別選單
    const kinds = Object.keys(D.KINDS), curKind = plan().kind || D.DEFAULT_KIND;
    const kindSel = kinds.length > 1 ? `<div class="fld"><label>計畫類別</label><select id="npKind">${kinds.map((k) => `<option value="${k}"${k === curKind ? ' selected' : ''}>${esc(D.KINDS[k].name)}</option>`).join('')}</select></div>` : '';
    openModal(`<h3>新增計畫</h3>${kindSel}<div class="fld"><label>計畫名稱</label><input id="npName"></div>
      <label class="row" style="margin:6px 0"><input type="checkbox" id="npCopy" style="width:auto" checked> 複製目前計畫的學校、系所、主持人等基本資料（同類別時）</label>`, () => {
      const kind = $('#npKind') ? $('#npKind').value : D.DEFAULT_KIND;
      const np = M.newPlan(false, kind);
      if ($('#npCopy').checked && curKind === kind) (D.KINDS[kind].copyOnNew || []).forEach((k) => { if (plan().data[k]) np.data[k] = plan().data[k]; });
      np.name = $('#npName').value.trim() || '新計畫'; np.data.title = np.name;
      S.plans.push(np); S.cur = np.id; go({ page: 'plan' });
      if (self.__talentFile) self.__talentFile.attach(S.cur, false);
    });
  }

  // ---------------- 照片 ----------------
  function compress(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res({ dataUrl: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height });
      };
      img.onerror = () => rej(new Error('無法讀取圖片：' + file.name));
      img.src = url;
    });
  }
  async function addPhotos(files, group) {
    const act = actOf(V().actId);
    for (const f of Array.from(files)) {
      const r = await compress(f); const id = M.uid();
      await idbPut('photos', id, r);
      act.photos.push({ id, group, caption: f.name.replace(/\.[^.]+$/, '') });
    }
    save(true); rerenderKeep(); toast(`已加入 ${files.length} 張照片`);
  }

  // ---------------- 自訂範本 ----------------
  function dice(a, b) {
    const bg = (s) => { const o = []; s = s.replace(/\s/g, ''); for (let i = 0; i < s.length - 1; i++) o.push(s.slice(i, i + 2)); return o.length ? o : [s]; };
    const A = bg(a), B = bg(b); let n = 0; const Bc = B.slice();
    A.forEach((x) => { const i = Bc.indexOf(x); if (i >= 0) { n++; Bc.splice(i, 1); } });
    return (2 * n) / (A.length + B.length);
  }
  async function uploadCustom(file) {
    if (!file) return;
    const p = plan(), act = actOf(V().actId);
    const buf = await file.arrayBuffer();
    const sc = await E.scanPlaceholders(buf);
    const names = Array.from(new Set(sc.names.filter((n) => n[0] !== '@').map((n) => (n[0] === '?' ? n.slice(1).split('=')[0] : n).trim())));
    if (!names.length) return alert('這個檔案裡沒有 {{欄位名稱}} 標記。請先在 Word／PowerPoint 中把要填的地方改成 {{欄位名稱}}。');
    p.aliases = p.aliases || {};
    const all = M.kindFields(p).map((k) => ({ k, label: D.F[k].label })).concat(Object.keys(D.C).map((k) => ({ k, label: k })), Object.keys(p.customFields).map((k) => ({ k, label: p.customFields[k].label })));
    const rows = names.map((n) => {
      let auto = D.F[n] || D.C[n] || p.customFields[n] ? n : p.aliases[n] || (all.find((x) => x.label === n) || {}).k;
      const sugg = all.map((x) => ({ k: x.k, label: x.label, s: Math.max(dice(n, x.label), x.label.indexOf(n) >= 0 || n.indexOf(x.label) >= 0 ? 0.6 : 0) })).filter((x) => x.s >= 0.34).sort((a, b) => b.s - a.s).slice(0, 6);
      return { n, auto, sugg };
    });
    const id = M.uid();
    openModal(`<h3>確認欄位對應：${esc(file.name)}</h3><div class="muted">每個 {{標記}} 要對應到哪個欄位？選「新欄位」會建立新的欄位；對應已有欄位時，資料會自動帶入。確認後網站會記住這組對應。</div>
      <div class="fld" style="margin-top:10px"><label>範本名稱</label><input id="ctName" value="${esc(file.name.replace(/\.(docx|pptx)$/i, ''))}"></div>
      <table class="lt"><thead><tr><th>範本中的標記</th><th>對應到</th><th>新欄位設定</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td>{{${esc(r.n)}}}</td><td><select data-map="${i}">
        ${r.auto ? `<option value="${esc(r.auto)}" selected>✓ ${esc((all.find((x) => x.k === r.auto) || { label: r.auto }).label)}</option>` : ''}
        <option value="__new"${r.auto ? '' : (r.sugg[0] && r.sugg[0].s >= 0.6 ? '' : ' selected')}>新欄位「${esc(r.n)}」</option>
        ${r.sugg.filter((s) => s.k !== r.auto).map((s, si) => `<option value="${esc(s.k)}"${!r.auto && si === 0 && s.s >= 0.6 ? ' selected' : ''}>相近：${esc(s.label)}</option>`).join('')}
        <optgroup label="全部欄位">${all.filter((x) => D.F[x.k] || p.customFields[x.k]).map((x) => `<option value="${esc(x.k)}">${esc(x.label)}</option>`).join('')}</optgroup>
      </select></td><td><label style="font-size:13px"><input type="checkbox" data-ai="${i}" style="width:auto"> 請 AI 撰寫</label> <label style="font-size:13px"><input type="checkbox" data-pl="${i}" style="width:auto"> 計畫共用</label></td></tr>`).join('')}
      </tbody></table>`, async () => {
      const map = {};
      rows.forEach((r, i) => {
        let k = $(`[data-map="${i}"]`).value;
        if (k === '__new') {
          k = 'cf_' + M.uid();
          p.customFields[k] = { key: k, label: r.n, scope: $(`[data-pl="${i}"]`).checked ? 'plan' : 'act', type: 'textarea', ai: $(`[data-ai="${i}"]`).checked ? 'custom' : '', group: '自訂範本欄位' };
        }
        map[r.n] = k; p.aliases[r.n] = k;
      });
      await idbPut('files', id, { buf, name: file.name });
      act.customTemplates.push({ id, name: $('#ctName').value.trim() || file.name, kind: sc.kind, map });
      save(true); rerenderKeep(); toast('已加入自訂範本');
    });
  }

  // ---------------- 備份 ----------------
  async function exportBackup() {
    const photos = {}, files = {};
    for (const k of await idbAll('photos')) photos[k] = await idbGet('photos', k);
    for (const k of await idbAll('files')) {
      const f = await idbGet('files', k); const u = new Uint8Array(f.buf); let s = '';
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      files[k] = { name: f.name, b64: btoa(s) };
    }
    const d = new Date(); const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    saveBlob(new Blob([JSON.stringify({ app: 'talent', version: VERSION, state: S, photos, files })], { type: 'application/json' }), `你畫了沒備份_${stamp}.json`);
  }
  async function importBackup(file) {
    if (!file) return;
    let d; try { d = JSON.parse(await file.text()); } catch (e) { return alert('這不是有效的備份檔。'); }
    if (d.app !== 'talent' || !d.state) return alert('這不是本網站的備份檔。');
    if (!confirm('匯入會覆蓋目前這台電腦上的所有資料，確定？')) return;
    S = M.migrate(d.state);
    for (const k of Object.keys(d.photos || {})) await idbPut('photos', k, d.photos[k]);
    for (const k of Object.keys(d.files || {})) { const b = atob(d.files[k].b64); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); await idbPut('files', k, { buf: u.buffer, name: d.files[k].name }); }
    Object.keys(scanCache).forEach((k) => delete scanCache[k]);
    save(true); render(); toast('已匯入備份');
    if (self.__talentFile) self.__talentFile.attach(S.cur, false);
  }

  // ---------------- 密碼與啟動 ----------------
  async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('talent:' + s)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
  function start() {
    S = load() || seed();
    if (!S.plans || !S.plans.length) S = seed();
    M.migrate(S);
    save(true);
    $('#lock').hidden = true; $('#app').hidden = false;
    render();
    started = true;
    if (self.__talentFileInit) self.__talentFileInit();
  }
  function lock() {
    const has = localStorage.getItem(PWKEY);
    if (sessionStorage.getItem('talent.ok') === '1' && has) return start();
    $('#lock').hidden = false;
    $('#lockMsg').textContent = has ? '請輸入密碼' : '第一次使用：請設定這台電腦的進入密碼。';
    $('#pw2').hidden = !!has;
    const goBtn = async () => {
      const a = $('#pw1').value;
      if (!a) return;
      if (!has) {
        if (a !== $('#pw2').value) { $('#lockMsg').textContent = '兩次輸入不一致'; return; }
        localStorage.setItem(PWKEY, await sha(a));
      } else if ((await sha(a)) !== has) { $('#lockMsg').textContent = '密碼錯誤'; return; }
      sessionStorage.setItem('talent.ok', '1'); start();
    };
    $('#pwGo').onclick = goBtn;
    ['#pw1', '#pw2'].forEach((s) => $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') goBtn(); }));
    $('#pw1').focus();
  }
  fetch('version.json', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
    if (j.version && j.version !== VERSION) { const b = $('#banner'); b.hidden = false; b.textContent = '網站已更新，請按 Ctrl+F5 重新整理。資料存在這台電腦的瀏覽器，重新整理不會遺失。'; }
  }).catch(() => {});
  const kvGet = (k) => idbGet('kv', k).catch(() => null);
  const kvSet = (k, v) => idbPut('kv', k, v).catch(() => {});
  self.__talent = { get S() { return S; }, get started() { return started; }, plan, render, saveLocal, idbGet, idbPut, kvGet, kvSet, dataUrlBytes, openModal, closeModal, saveBlob, buildFile, M };
  lock();
})();
