/* 資料模型：取值、連動、prompt 產生、AI 回覆解析與套用 */
(function () {
  const D = self.DEFS;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const empty = (v) => v == null || v === '' || v === false;
  const norm = (s) => String(s == null ? '' : s).replace(/[\s　]+/g, '').replace(/[，,]/g, ',');

  function fieldDef(plan, key) { return D.F[key] || (plan && plan.customFields && plan.customFields[key]) || null; }
  function scopeOf(plan, key) { const f = fieldDef(plan, key); return f ? f.scope : 'act'; }

  // ---------- 建立 ----------
  function newPlan(withSeed) {
    const p = { id: uid(), name: '', data: {}, lists: { ms: [], staff: [] }, activities: [], customFields: {}, conflicts: [] };
    if (withSeed) {
      p.data = clone(D.SEED.plan);
      p.lists.ms = D.SEED.lists.ms.map((r) => Object.assign({ id: uid() }, r));
      p.lists.staff = D.SEED.lists.staff.map((r) => Object.assign({ id: uid() }, r));
      p.name = p.data.title;
    }
    return p;
  }
  function newActivity(plan, type, name, copyFrom, withSeed) {
    const a = { id: uid(), type, name: name || D.ACT[type].name, data: {}, lists: { agenda: [], interns: [] }, listCols: {}, overrides: {}, unlinked: {}, photos: [], customTemplates: [], responses: {} };
    if (copyFrom) {
      ['data', 'lists', 'listCols', 'overrides', 'unlinked'].forEach((k) => { a[k] = clone(copyFrom[k] || {}); });
    } else if (withSeed && type === 'visit') {
      a.data = clone(D.SEED.visit);
    }
    if (type === 'visit' && !(a.lists.agenda || []).length) {
      const g = getter(plan, a);
      a.lists.agenda = D.agendaTimes(D.defaultAgenda(g), g('visitStart')).map((r) => Object.assign({ id: uid() }, r));
    }
    plan.activities.push(a);
    return a;
  }

  // ---------- 取值 ----------
  function rawVal(plan, act, key) {
    return scopeOf(plan, key) === 'plan' ? plan.data[key] : act ? act.data[key] : undefined;
  }
  function setVal(plan, act, key, v) {
    if (scopeOf(plan, key) === 'plan') plan.data[key] = v; else if (act) act.data[key] = v;
  }
  function list(plan, act, name) {
    const L = D.L[name];
    if (!L) return [];
    if (L.scope === 'plan') {
      const ext = (act && act.listCols && act.listCols[name]) || {};
      return (plan.lists[name] || []).map((r) => Object.assign({}, r, ext[r.id] || {}));
    }
    return (act && act.lists && act.lists[name]) || [];
  }
  function getter(plan, act, tpl) {
    const g = (key) => {
      if (tpl && act && act.unlinked && act.unlinked[tpl] && act.unlinked[tpl][key]) {
        const o = act.overrides[tpl] && act.overrides[tpl][key];
        return o == null ? '' : o;
      }
      if (D.C[key]) return D.C[key].fn(g);
      let v = rawVal(plan, act, key);
      if (empty(v) && D.D[key]) v = D.D[key](g, (n) => list(plan, act, n));
      return v == null ? '' : v;
    };
    return g;
  }
  function defaultOf(plan, act, key) { return D.D[key] ? D.D[key](getter(plan, act), (n) => list(plan, act, n)) : ''; }

  function makeCtx(plan, act, tplId, map) {
    const g = getter(plan, act, tplId);
    return { val: (k) => g(map && map[k] ? map[k] : k), list: (n) => list(plan, act, n) };
  }

  // 範本內的欄位名稱 → 實際欄位（計算欄位展開為來源欄位）
  function placeholderFields(names, map) {
    const fields = new Set(), lists = new Set();
    names.forEach((n) => {
      let k = n.trim();
      if (k === '@#' || k === '@page') return;
      if (k[0] === '@') { lists.add(k.slice(1).split('.')[0]); return; }
      if (k[0] === '?') k = k.slice(1).split('=')[0];
      if (map && map[k]) k = map[k];
      if (D.C[k]) D.C[k].from.forEach((x) => fields.add(x)); else fields.add(k);
    });
    return { fields: Array.from(fields), lists: Array.from(lists) };
  }

  // ---------- Prompt ----------
  function show(plan, key, v) {
    const f = fieldDef(plan, key);
    if (f && f.optionLabels && f.optionLabels[v]) return f.optionLabels[v];
    if (v === true) return '是';
    return String(v);
  }
  function listCols(pid, name) {
    const L = D.L[name];
    if (pid === 'p0') return L.cols.filter((c) => c.scope === 'plan');
    if (L.scope === 'plan') {
      const idc = L.cols.filter((c) => c.scope === 'plan').slice(0, name === 'staff' ? 3 : 2);
      return idc.concat(L.cols.filter((c) => c.ai === pid));
    }
    return L.cols.filter((c) => c.k !== 'min');
  }
  function outLabel(plan, key) {
    if (key[0] === '@') return D.L[key.slice(1)].label;
    const f = fieldDef(plan, key);
    return f ? f.label : key;
  }
  function promptDef(pid, plan, act) {
    if (D.P[pid]) return D.P[pid];
    const ct = act && act.customTemplates.find((c) => 'c_' + c.id === pid);
    if (!ct) return null;
    const keys = Object.values(ct.map).filter((k) => plan.customFields[k] && plan.customFields[k].ai);
    return { scope: 'act', title: `自訂範本：${ct.name}`, desc: '依自訂範本中的新欄位產生。', context: ['title', 'school', 'dept', 'pi'],
      outputs: Array.from(new Set(keys)).map((k) => [k, plan.customFields[k].hint || '依來源資料撰寫']) };
  }
  function buildPrompt(pid, plan, act) {
    const P = promptDef(pid, plan, act);
    const g = getter(plan, act);
    const lines = [D.PREFACE(g), '', '## 已知資料'];
    P.context.forEach((k) => { const v = g(k); if (!empty(v)) lines.push(`- ${outLabel(plan, k)}：${show(plan, k, v).replace(/\*\*/g, '').replace(/\n/g, '；')}`); });
    if (pid !== 'p0') {
      const ag = list(plan, act, 'staff');
      if (ag.length && pid === 'p2') lines.push(`- 計畫人員：${ag.map((s) => `${s.name}（${s.role}）`).join('、')}`);
    }
    lines.push('', '## 請撰寫的內容');
    P.outputs.forEach(([k, hint], i) => lines.push(`${i + 1}. 【${outLabel(plan, k)}】${hint}`));
    lines.push('', '## 輸出格式', D.FORMAT, '');
    P.outputs.forEach(([k]) => {
      lines.push(`【${outLabel(plan, k)}】`);
      if (k[0] !== '@') { lines.push('（內容）', ''); return; }
      const name = k.slice(1), cols = listCols(pid, name);
      lines.push('| 序號 | ' + cols.map((c) => c.label).join(' | ') + ' |');
      lines.push('|---|' + cols.map(() => '---').join('|') + '|');
      const rows = pid === 'p0' ? [] : D.L[name].scope === 'plan' ? list(plan, act, name) : [];
      if (rows.length) rows.forEach((r, ri) => lines.push(`| ${ri + 1} | ` + cols.map((c) => (c.scope === 'plan' && c.ai !== pid ? String(r[c.k] || '') : '')).join(' | ') + ' |'));
      else lines.push('| 1 | ' + cols.map(() => '').join(' | ') + ' |');
      lines.push('');
    });
    return lines.join('\n');
  }

  // ---------- 解析 ----------
  const key0 = (s) => String(s).replace(/[\s　*#：:、，,（）()「」]/g, '');
  function matchLabel(lbl, candidates) {
    const k = key0(lbl);
    let hit = candidates.find((c) => key0(c.label) === k);
    if (!hit) hit = candidates.find((c) => key0(c.label).indexOf(k) >= 0 || k.indexOf(key0(c.label)) >= 0);
    return hit;
  }
  function parseTable(lines) {
    const rows = lines.filter((l) => /^\s*\|/.test(l)).map((l) => {
      const parts = l.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((x) => x.trim().replace(/<br\s*\/?>/gi, '\n'));
      return parts;
    }).filter((p) => !p.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
    if (!rows.length) return { head: [], body: [] };
    return { head: rows[0], body: rows.slice(1) };
  }
  function cleanVal(f, v) {
    v = v.replace(/^（內容）$/, '').trim();
    if (!f) return v;
    if (f.type === 'select') {
      const opts = f.options.slice().sort((a, b) => b.length - a.length);
      const lab = f.optionLabels || {};
      const hit = opts.find((o) => v === o) || opts.find((o) => lab[o] && v.indexOf(lab[o]) >= 0) || opts.find((o) => v.indexOf(o) >= 0);
      return hit || v;
    }
    if (f.type === 'number') { const n = v.replace(/[^\d.]/g, ''); return n || v; }
    return v;
  }
  function parseResponse(pid, plan, act, text) {
    const P = promptDef(pid, plan, act);
    const cands = P.outputs.map(([k]) => ({ k, label: outLabel(plan, k) }));
    const src = String(text || '').replace(/```[a-z]*\n?/gi, '').replace(/\r/g, '');
    const blocks = [];
    let cur = null;
    src.split('\n').forEach((line) => {
      const m = line.match(/^\s*(?:[#>*\-\d.]+\s*)*\**\s*【([^】]+)】\**\s*[:：]?\s*(.*)$/);
      if (m) { cur = { label: m[1], lines: m[2] ? [m[2]] : [] }; blocks.push(cur); return; }
      if (cur) cur.lines.push(line);
    });
    const res = { fields: {}, lists: {}, unknown: [] };
    blocks.forEach((b) => {
      const c = matchLabel(b.label, cands);
      if (!c) { res.unknown.push(b.label); return; }
      if (c.k[0] === '@') {
        const name = c.k.slice(1), cols = listCols(pid, name);
        const t = parseTable(b.lines);
        const idx = t.head.map((h) => (key0(h) === '序號' ? '#' : (matchLabel(h, cols.map((x) => ({ k: x.k, label: x.label }))) || {}).k));
        res.lists[name] = t.body.map((cells) => {
          const o = {};
          cells.forEach((v, i) => { if (idx[i]) o[idx[i]] = v.replace(/（資料未提及）/g, '（資料未提及）'); });
          return o;
        }).filter((o) => Object.keys(o).some((k) => k !== '#' && o[k]));
      } else {
        const v = b.lines.join('\n').replace(/^\n+|\n+$/g, '').trim();
        res.fields[c.k] = cleanVal(fieldDef(plan, c.k), v);
      }
    });
    return res;
  }

  // ---------- 套用（衝突交給使用者判斷） ----------
  function addConflict(plan, c) {
    plan.conflicts = (plan.conflicts || []).filter((x) => !(x.actId === c.actId && x.ref === c.ref));
    plan.conflicts.push(Object.assign({ id: uid() }, c));
  }
  function applyResult(pid, plan, act, parsed) {
    const P = promptDef(pid, plan, act);
    const stat = { filled: 0, same: 0, conflict: 0 };
    const src = `AI 回覆（${P.title}）`;
    const put = (ref, cur, nv, setter, label, actId) => {
      if (nv == null || nv === '') return;
      if (empty(cur)) { setter(nv); stat.filled++; return; }
      if (norm(cur) === norm(nv)) { stat.same++; return; }
      addConflict(plan, { actId, ref, ai: nv, src, label }); stat.conflict++;
    };
    Object.keys(parsed.fields).forEach((k) => {
      const sc = scopeOf(plan, k);
      put('f:' + k, rawVal(plan, act, k), parsed.fields[k], (v) => setVal(plan, act, k, v), outLabel(plan, k), sc === 'plan' ? null : act.id);
    });
    Object.keys(parsed.lists).forEach((name) => {
      const L = D.L[name], rows = parsed.lists[name], cols = listCols(pid, name);
      if (L.scope === 'plan' && pid === 'p0') {
        const cur = plan.lists[name] || (plan.lists[name] = []);
        rows.forEach((r, i) => {
          let row = cur[i];
          if (!row) { row = { id: uid() }; cur.push(row); }
          cols.forEach((c) => put(`p:${name}:${row.id}:${c.k}`, row[c.k], r[c.k], (v) => { row[c.k] = v; }, `${L.label}第${i + 1}列：${c.label}`, null));
        });
      } else if (L.scope === 'plan') {
        const base = plan.lists[name] || [];
        act.listCols[name] = act.listCols[name] || {};
        rows.forEach((r, i) => {
          let row = null;
          const n = parseInt(r['#'], 10);
          if (n && base[n - 1]) row = base[n - 1];
          const idc = cols[0].k;
          if (!row && r[idc]) row = base.find((b) => norm(b[idc]) === norm(r[idc]));
          if (!row) row = base[i];
          if (!row) return;
          const ext = act.listCols[name][row.id] || (act.listCols[name][row.id] = {});
          cols.filter((c) => c.ai === pid).forEach((c) => put(`l:${name}:${row.id}:${c.k}`, ext[c.k], r[c.k], (v) => { ext[c.k] = v; }, `${L.label}「${row[cols[0].k] || i + 1}」：${c.label}`, act.id));
        });
      } else {
        const cur = act.lists[name] || (act.lists[name] = []);
        rows.forEach((r, i) => {
          let row = cur[i];
          if (!row) { row = { id: uid() }; cur.push(row); }
          cols.forEach((c) => put(`a:${name}:${row.id}:${c.k}`, row[c.k], r[c.k], (v) => { row[c.k] = v; }, `${L.label}第${i + 1}列：${c.label}`, act.id));
        });
      }
    });
    return stat;
  }
  function resolveRef(plan, act, ref) {
    const [t, a, b, c] = ref.split(':');
    if (t === 'f') return { get: () => rawVal(plan, act, a), set: (v) => setVal(plan, act, a, v) };
    if (t === 'p') { const row = (plan.lists[a] || []).find((r) => r.id === b); return row && { get: () => row[c], set: (v) => { row[c] = v; } }; }
    if (t === 'l') { act.listCols[a] = act.listCols[a] || {}; const ext = act.listCols[a][b] || (act.listCols[a][b] = {}); return { get: () => ext[c], set: (v) => { ext[c] = v; } }; }
    if (t === 'a') { const row = (act.lists[a] || []).find((r) => r.id === b); return row && { get: () => row[c], set: (v) => { row[c] = v; } }; }
    return null;
  }

  self.MODEL = { uid, clone, empty, fieldDef, scopeOf, newPlan, newActivity, rawVal, setVal, list, getter, defaultOf, makeCtx, placeholderFields,
    buildPrompt, parseResponse, applyResult, resolveRef, promptDef, addConflict, outLabel, listCols };
})();
