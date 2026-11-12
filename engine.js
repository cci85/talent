/* 範本填寫引擎：把 {{欄位}} 填進 .docx / .pptx，保留原範本格式。
   語法：
     {{key}}            一般欄位（值中的換行 → 換行；**粗體** → 粗體）
     {{?key=值}}        勾選框：相符輸出 ▓，否則 □；{{?key}} 為是非勾選
     {{@list.field}}    表格列重複：含此標記的列會依清單筆數複製
     {{@#}}             清單序號；{{@page}} 簡報自動分頁時的 (1/2)
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.TalentEngine = factory(root.JSZip, root.DOMParser, root.XMLSerializer);
})(typeof self !== 'undefined' ? self : this, function (JSZip, DOMParserImpl, XMLSerializerImpl) {
  const NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
    ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  };
  const PH = /\{\{([^{}]+)\}\}/g;
  const parse = (s) => new DOMParserImpl().parseFromString(s, 'application/xml');
  const ser = (d) => new XMLSerializerImpl().serializeToString(d);
  const arr = (x) => Array.prototype.slice.call(x);
  const tags = (el, t) => arr(el.getElementsByTagName(t));

  function lookup(key, sc) {
    if (key === '@#') return sc.idx != null ? sc.idx + 1 : '';
    if (key === '@page') return sc.page || '';
    if (key[0] === '@') {
      const i = key.indexOf('.');
      const ln = key.slice(1, i), f = key.slice(i + 1);
      return sc.item && sc.listName === ln ? sc.item[f] : '';
    }
    return sc.ctx.val(key);
  }
  function truthy(v) { return v === true || v === '是' || v === 'true' || v === '1' || v === 1; }
  function resolve(expr, sc) {
    expr = expr.trim();
    if (expr[0] === '?') {
      const body = expr.slice(1), eq = body.indexOf('=');
      if (eq < 0) return truthy(lookup(body, sc)) ? '▓' : '□';
      const v = lookup(body.slice(0, eq), sc);
      return String(v == null ? '' : v) === body.slice(eq + 1) ? '▓' : '□';
    }
    const v = lookup(expr, sc);
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? '是' : '';
    return String(v);
  }

  const K = {
    w: { p: 'w:p', r: 'w:r', t: 'w:t', tr: 'w:tr' },
    a: { p: 'a:p', r: 'a:r', t: 'a:t', tr: 'a:tr' },
  };
  const textOf = (el, kind) => tags(el, K[kind].t).map((t) => t.textContent).join('');

  function tokens(text) {
    const out = [];
    text.split('\n').forEach((line, li) => {
      if (li > 0) out.push({ br: true });
      line.split(/\*\*(.+?)\*\*/).forEach((seg, si) => { if (seg !== '') out.push({ text: seg, bold: si % 2 === 1 }); });
    });
    return out;
  }

  function setBold(run, kind) {
    const doc = run.ownerDocument;
    if (kind === 'w') {
      let rpr = tags(run, 'w:rPr')[0];
      if (!rpr) { rpr = doc.createElementNS(NS.w, 'w:rPr'); run.insertBefore(rpr, run.firstChild); }
      if (!tags(rpr, 'w:b').length) { rpr.insertBefore(doc.createElementNS(NS.w, 'w:b'), rpr.firstChild); }
    } else {
      let rpr = tags(run, 'a:rPr')[0];
      if (!rpr) { rpr = doc.createElementNS(NS.a, 'a:rPr'); run.insertBefore(rpr, run.firstChild); }
      rpr.setAttribute('b', '1');
    }
  }

  function makeRun(proto, text, kind) {
    const doc = proto.ownerDocument;
    const r = proto.cloneNode(true);
    if (kind === 'w') {
      arr(r.childNodes).forEach((c) => { if (c.nodeName !== 'w:rPr') r.removeChild(c); });
      const t = doc.createElementNS(NS.w, 'w:t');
      t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
      t.appendChild(doc.createTextNode(text));
      r.appendChild(t);
    } else {
      const t = tags(r, 'a:t')[0];
      while (t.firstChild) t.removeChild(t.firstChild);
      t.appendChild(doc.createTextNode(text));
    }
    return r;
  }
  function makeBreak(proto, kind) {
    const doc = proto.ownerDocument;
    if (kind === 'w') {
      const r = proto.cloneNode(true);
      arr(r.childNodes).forEach((c) => { if (c.nodeName !== 'w:rPr') r.removeChild(c); });
      r.appendChild(doc.createElementNS(NS.w, 'w:br'));
      return r;
    }
    const br = doc.createElementNS(NS.a, 'a:br');
    const rpr = tags(proto, 'a:rPr')[0];
    if (rpr) br.appendChild(rpr.cloneNode(true));
    return br;
  }

  function writeRun(run, text, kind) {
    const parent = run.parentNode;
    const toks = tokens(text);
    if (!toks.length) toks.push({ text: '' });
    toks.forEach((tk) => {
      let node;
      if (tk.br) node = makeBreak(run, kind);
      else { node = makeRun(run, tk.text, kind); if (tk.bold) setBold(node, kind); }
      parent.insertBefore(node, run);
    });
    parent.removeChild(run);
  }

  // Word 常把 {{欄位}} 拆成好幾個 run，先合併
  function setRunText(r, s, kind) {
    const ts = tags(r, K[kind].t);
    ts.forEach((t, i) => { if (i > 0) t.parentNode.removeChild(t); });
    while (ts[0].firstChild) ts[0].removeChild(ts[0].firstChild);
    ts[0].appendChild(r.ownerDocument.createTextNode(s));
  }
  const unbalanced = (s) => s.lastIndexOf('{') > s.lastIndexOf('}');
  function normalize(p, kind) {
    const rs = tags(p, K[kind].r).filter((r) => tags(r, K[kind].t).length);
    let open = null, buf = '';
    rs.forEach((r) => {
      const t = textOf(r, kind);
      if (open) {
        buf += t; r.parentNode.removeChild(r);
        if (!unbalanced(buf)) { setRunText(open, buf, kind); open = null; }
        return;
      }
      if (unbalanced(t)) { open = r; buf = t; }
    });
    if (open) setRunText(open, buf, kind);
  }

  function processPara(p, kind, sc) {
    let full = textOf(p, kind);
    if (full.indexOf('{') < 0) return;
    normalize(p, kind);
    full = textOf(p, kind);
    if (full.indexOf('{{') < 0) return;
    const m = full.trim().match(/^\{\{([^{}]+)\}\}$/);
    if (m && m[1].trim()[0] !== '?') {
      // 整段只有一個欄位：多行值 → 複製段落（保留項目符號、縮排）
      const val = resolve(m[1], sc);
      const lines = val.split('\n');
      const proto = p.cloneNode(true);
      let anchor = p;
      lines.forEach((line, i) => {
        let np = p;
        if (i > 0) { np = proto.cloneNode(true); anchor.parentNode.insertBefore(np, anchor.nextSibling); anchor = np; }
        const rs = tags(np, K[kind].r).filter((r) => tags(r, K[kind].t).length);
        const target = rs.find((r) => textOf(r, kind).indexOf('{{') >= 0) || rs[0];
        rs.forEach((r) => { if (r !== target && textOf(r, kind).trim() === '') r.parentNode.removeChild(r); });
        writeRun(target, line, kind);
      });
      return;
    }
    tags(p, K[kind].r).forEach((r) => {
      const t = textOf(r, kind);
      if (t.indexOf('{{') < 0) return;
      writeRun(r, t.replace(PH, (_, e) => resolve(e, sc)), kind);
    });
  }

  function processDoc(doc, kind, sc) {
    // 1. 重複列
    tags(doc, K[kind].tr).forEach((tr) => {
      const txt = textOf(tr, kind);
      const mm = txt.match(/\{\{@([A-Za-z0-9_]+)\./);
      if (!mm) return;
      const name = mm[1];
      let items = (sc.lists && sc.lists[name]) || sc.ctx.list(name) || [];
      if (!items.length) items = [{}];
      items.forEach((item, idx) => {
        const row = tr.cloneNode(true);
        tr.parentNode.insertBefore(row, tr);
        const isc = Object.assign({}, sc, { item, listName: name, idx });
        tags(row, K[kind].p).forEach((p) => processPara(p, kind, isc));
      });
      tr.parentNode.removeChild(tr);
    });
    // 2. 其餘段落
    tags(doc, K[kind].p).forEach((p) => processPara(p, kind, sc));
  }

  async function fillDocx(buf, ctx, opts) {
    opts = opts || {};
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n));
    for (const n of names) {
      const doc = parse(await zip.file(n).async('string'));
      processDoc(doc, 'w', { ctx });
      zip.file(n, ser(doc));
    }
    return zip.generateAsync({ type: opts.type || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // ---------- pptx ----------
  const EMU = { W: 9144000, H: 6858000 };
  function picXml(id, rid, x, y, cx, cy) {
    return `<p:pic xmlns:p="${NS.p}" xmlns:a="${NS.a}" xmlns:r="${NS.r}"><p:nvPicPr><p:cNvPr id="${id}" name="照片 ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function capXml(id, text, x, y, cx, cy) {
    return `<p:sp xmlns:p="${NS.p}" xmlns:a="${NS.a}"><p:nvSpPr><p:cNvPr id="${id}" name="說明 ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="zh-TW" altLang="en-US" sz="1400"/><a:t>${esc(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
  }

  function photoSlide(baseXml, title, pics, ridOf) {
    const doc = parse(baseXml);
    const tree = tags(doc, 'p:spTree')[0];
    let titleSp = null;
    arr(tree.childNodes).forEach((c) => {
      if (c.nodeType !== 1) return;
      if (['p:sp', 'p:graphicFrame', 'p:pic', 'p:grpSp', 'p:cxnSp'].indexOf(c.nodeName) < 0) return;
      const ph = tags(c, 'p:ph')[0];
      const type = ph && ph.getAttribute('type');
      if (type === 'title' || type === 'ctrTitle') { titleSp = c; return; }
      if (type === 'sldNum') return;
      tree.removeChild(c);
    });
    if (titleSp) {
      const ts = tags(titleSp, 'a:t');
      if (ts.length) {
        ts.forEach((t, i) => { if (i > 0) t.parentNode.parentNode.removeChild(t.parentNode); });
        while (ts[0].firstChild) ts[0].removeChild(ts[0].firstChild);
        ts[0].appendChild(doc.createTextNode(title));
        tags(titleSp, 'a:p').slice(1).forEach((p) => p.parentNode.removeChild(p));
      }
    }
    let maxId = 1;
    tags(doc, 'p:cNvPr').forEach((c) => { maxId = Math.max(maxId, +c.getAttribute('id') || 0); });
    const n = pics.length;
    const top = 1550000, boxH = n === 1 ? 4250000 : 3900000, capH = 520000;
    const margin = 457200, gap = 228600;
    const boxW = n === 1 ? EMU.W - 2 * margin * 2 : (EMU.W - 2 * margin - gap) / 2;
    pics.forEach((pic, i) => {
      const bx = n === 1 ? margin * 2 : margin + i * (boxW + gap);
      const s = Math.min(boxW / pic.w, boxH / pic.h);
      const cx = Math.round(pic.w * s), cy = Math.round(pic.h * s);
      const x = Math.round(bx + (boxW - cx) / 2), y = Math.round(top + (boxH - cy) / 2);
      tree.appendChild(doc.importNode(parse(picXml(++maxId, ridOf(pic), x, y, cx, cy)).documentElement, true));
      if (pic.caption) tree.appendChild(doc.importNode(parse(capXml(++maxId, pic.caption, Math.round(bx), top + boxH + 60000, Math.round(boxW), capH)).documentElement, true));
    });
    return ser(doc);
  }

  function stripNotes(relsXml) {
    const d = parse(relsXml);
    tags(d, 'Relationship').forEach((r) => { if (/notesSlide$/.test(r.getAttribute('Type'))) r.parentNode.removeChild(r); });
    return d;
  }

  async function fillPptx(buf, ctx, opts) {
    opts = opts || {};
    const zip = await JSZip.loadAsync(buf);
    const presDoc = parse(await zip.file('ppt/presentation.xml').async('string'));
    const presRels = parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string'));
    const ctDoc = parse(await zip.file('[Content_Types].xml').async('string'));
    const relById = {};
    let maxRid = 0;
    tags(presRels, 'Relationship').forEach((r) => {
      relById[r.getAttribute('Id')] = r.getAttribute('Target');
      const m = r.getAttribute('Id').match(/(\d+)$/); if (m) maxRid = Math.max(maxRid, +m[1]);
    });
    const lst = tags(presDoc, 'p:sldIdLst')[0];
    const sldIds = tags(lst, 'p:sldId');
    let maxSldId = 255;
    sldIds.forEach((s) => { maxSldId = Math.max(maxSldId, +s.getAttribute('id')); });
    let maxSlideNum = 0;
    Object.keys(zip.files).forEach((n) => { const m = n.match(/^ppt\/slides\/slide(\d+)\.xml$/); if (m) maxSlideNum = Math.max(maxSlideNum, +m[1]); });
    const orig = sldIds.map((s) => ({ el: s, path: 'ppt/' + relById[s.getAttributeNS(NS.r, 'id') || s.getAttribute('r:id')] }));
    const srcXml = {}, srcRels = {};
    for (const o of orig) {
      srcXml[o.path] = await zip.file(o.path).async('string');
      const rp = o.path.replace('slides/', 'slides/_rels/') + '.rels';
      srcRels[o.path] = zip.file(rp) ? await zip.file(rp).async('string') : null;
    }
    const exts = {};
    let mediaN = 0;
    const out = [];
    const newSlide = (xml, relsDoc) => {
      const num = ++maxSlideNum;
      const path = `ppt/slides/slide${num}.xml`;
      zip.file(path, xml);
      if (relsDoc) zip.file(`ppt/slides/_rels/slide${num}.xml.rels`, ser(relsDoc));
      const rid = 'rId' + (++maxRid);
      const rel = presRels.createElementNS(NS.rel, 'Relationship');
      rel.setAttribute('Id', rid);
      rel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide');
      rel.setAttribute('Target', `slides/slide${num}.xml`);
      presRels.documentElement.appendChild(rel);
      const ov = ctDoc.createElementNS(NS.ct, 'Override');
      ov.setAttribute('PartName', '/' + path);
      ov.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml');
      ctDoc.documentElement.appendChild(ov);
      const el = presDoc.createElementNS(NS.p, 'p:sldId');
      el.setAttribute('id', String(++maxSldId));
      el.setAttributeNS(NS.r, 'r:id', rid);
      return el;
    };
    const fillXml = (xml, sc) => { const d = parse(xml); processDoc(d, 'a', sc); return ser(d); };

    orig.forEach((o, i) => {
      const no = i + 1;
      const split = opts.splits && opts.splits[no];
      if (split) {
        const items = ctx.list(split.list) || [];
        const chunks = [];
        for (let k = 0; k < Math.max(items.length, 1); k += split.max) chunks.push(items.slice(k, k + split.max));
        chunks.forEach((ch, ci) => {
          const sc = { ctx, lists: { [split.list]: ch.length ? ch : [{}] }, page: chunks.length > 1 ? `(${ci + 1}/${chunks.length})` : '' };
          if (ci === 0) { zip.file(o.path, fillXml(srcXml[o.path], sc)); out.push(o.el); }
          else out.push(newSlide(fillXml(srcXml[o.path], sc), srcRels[o.path] ? stripNotes(srcRels[o.path]) : null));
        });
        // 讓序號延續：清單分頁時 @# 從頭算即可（每頁獨立表格）
      } else {
        zip.file(o.path, fillXml(srcXml[o.path], { ctx }));
        out.push(o.el);
      }
      (opts.photos || []).filter((g) => g.after === no && g.items && g.items.length).forEach((g) => {
        const basePath = orig[(g.base || no) - 1].path;
        const pages = [];
        for (let k = 0; k < g.items.length; k += 2) pages.push(g.items.slice(k, k + 2));
        pages.forEach((pics, pi) => {
          const relsDoc = srcRels[basePath] ? stripNotes(srcRels[basePath]) : parse(`<Relationships xmlns="${NS.rel}"/>`);
          let rmax = 0;
          tags(relsDoc, 'Relationship').forEach((r) => { const m = r.getAttribute('Id').match(/(\d+)$/); if (m) rmax = Math.max(rmax, +m[1]); });
          const ridOf = (pic) => {
            const ext = pic.ext === 'png' ? 'png' : 'jpeg';
            exts[ext] = 1;
            const mp = `ppt/media/talent_photo${++mediaN}.${ext}`;
            zip.file(mp, pic.data);
            const rid = 'rId' + (++rmax);
            const rel = relsDoc.createElementNS(NS.rel, 'Relationship');
            rel.setAttribute('Id', rid);
            rel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
            rel.setAttribute('Target', '../media/' + mp.split('/').pop());
            relsDoc.documentElement.appendChild(rel);
            return rid;
          };
          const title = g.title + (pages.length > 1 ? `(${pi + 1}/${pages.length})` : '');
          const xml = photoSlide(srcXml[basePath], title, pics, ridOf);
          out.push(newSlide(xml, relsDoc));
        });
      });
    });
    // 重排投影片順序
    sldIds.forEach((s) => lst.removeChild(s));
    out.forEach((el) => lst.appendChild(el));
    Object.keys(exts).forEach((ext) => {
      const has = tags(ctDoc, 'Default').some((d) => d.getAttribute('Extension').toLowerCase() === ext);
      if (!has) {
        const d = ctDoc.createElementNS(NS.ct, 'Default');
        d.setAttribute('Extension', ext);
        d.setAttribute('ContentType', 'image/' + ext);
        ctDoc.documentElement.insertBefore(d, ctDoc.documentElement.firstChild);
      }
    });
    zip.file('ppt/presentation.xml', ser(presDoc));
    zip.file('ppt/_rels/presentation.xml.rels', ser(presRels));
    zip.file('[Content_Types].xml', ser(ctDoc));
    return zip.generateAsync({ type: opts.type || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }

  async function scanPlaceholders(buf) {
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter((n) => /^(word\/(document|header\d*|footer\d*)|ppt\/slides\/slide\d+)\.xml$/.test(n));
    const found = new Set();
    for (const n of names) {
      const doc = parse(await zip.file(n).async('string'));
      const kind = n.startsWith('word') ? 'w' : 'a';
      tags(doc, K[kind].p).forEach((p) => {
        normalize(p, kind);
        const t = textOf(p, kind);
        let m; PH.lastIndex = 0;
        while ((m = PH.exec(t))) found.add(m[1].trim());
      });
    }
    return { kind: names.some((n) => n.startsWith('ppt')) ? 'pptx' : 'docx', names: Array.from(found) };
  }

  return { fillDocx, fillPptx, scanPlaceholders };
});
