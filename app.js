/* ==========================================================================
   app.js — screens and behaviour. You should not need to edit this.
   Settings live in config.js. Data logic lives in core.js.
   ========================================================================== */
(function () {
  'use strict';

  const core = JadwalCore.create(window.JADWAL_CONFIG || {});
  const CFG = core.cfg;
  const app = document.getElementById('app');

  const KEYS = { draft: 'jadwal.draft.v1', session: 'jadwal.session.v1', gh: 'jadwal.gh.v1', token: 'jadwal.gh.token' };
  const emptyDataset = () => ({ version: 1, updatedAt: null, rows: [] });

  const state = {
    published: emptyDataset(),
    draft: null,
    session: null,
    loadError: '',
    view: null,            // what a normal user is looking at: {kind:'teacher'|'class', key}
    weekKey: null,
    adminFilter: '',
    adminSort: 'default',
    lookupText: '', lookupMsg: '', lookupSuggest: [],
    adminTab: 'upload',
    adminView: null,
    parseResult: null,
    pasteText: '',
    publishMsg: null
  };

  /* ---------- small helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const store = {
    get(area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set(area, k, v) { try { window[area].setItem(k, v); return true; } catch (e) { return false; } },
    del(area, k) { try { window[area].removeItem(k); } catch (e) { /* ignore */ } }
  };
  const idxCache = new WeakMap();
  function indexOf(ds) {
    let i = idxCache.get(ds);
    if (!i) { i = core.buildIndex(ds.rows); idxCache.set(ds, i); }
    return i;
  }
  const activeDataset = () => state.draft || state.published;
  const hasUnpublishedDraft = () => !!state.draft && state.draft.updatedAt !== state.published.updatedAt;
  function fmtStamp(iso) {
    if (!iso) return 'date unknown';
    try { return new Date(iso).toLocaleString(CFG.locale, { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return iso; }
  }
  const notice = (level, text) => h('p', { class: 'notice ' + level, role: level === 'error' ? 'alert' : 'status' }, text);
  const emptyState = (title, text) => h('div', { class: 'empty' }, h('h2', null, title), h('p', null, text));

  /* ---------- loading ---------- */
  async function loadPublished() {
    try {
      const res = await fetch(CFG.dataFile + '?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status === 404 ? 'file not found' : 'HTTP ' + res.status);
      state.published = core.normalizeDataset(await res.json());
    } catch (e) {
      state.published = emptyDataset();
      state.loadError = location.protocol === 'file:'
        ? 'Browsers block data files on file:// addresses. Open this page through GitHub Pages or a local web server.'
        : 'The published jadwal could not be loaded (' + e.message + ').';
    }
  }
  function loadDraft() {
    const raw = store.get('localStorage', KEYS.draft);
    if (!raw) return null;
    try {
      const ds = core.normalizeDataset(JSON.parse(raw));
      if (!ds.rows.length) return null;
      if (ds.updatedAt && ds.updatedAt === state.published.updatedAt) { store.del('localStorage', KEYS.draft); return null; }
      return ds;
    } catch (e) { return null; }
  }

  /* ---------- session ---------- */
  function signIn(s) {
    state.session = s; state.view = null; state.weekKey = null;
    store.set('sessionStorage', KEYS.session, JSON.stringify(s));
    render();
  }
  function logout() {
    state.session = null; state.view = null; state.lookupText = ''; state.lookupMsg = ''; state.lookupSuggest = [];
    store.del('sessionStorage', KEYS.session);
    render();
  }

  /* ======================================================================
     LOGIN
     ====================================================================== */
  function loginScreen() {
    const adminId = core.digits(CFG.admin.itsId);
    const err = h('p', { class: 'form-error', role: 'alert' });
    const its = h('input', { id: 'its', type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false' });
    const pwd = h('input', { id: 'pwd', type: 'password', autocomplete: 'current-password' });
    const pwdField = h('div', { class: 'field', hidden: true }, h('label', { for: 'pwd' }, 'Admin password'), pwd);

    its.addEventListener('input', () => {
      if (!pwdField.hidden && core.digits(its.value) !== adminId) { pwdField.hidden = true; pwd.value = ''; }
    });
    const fail = (msg, el) => { err.textContent = msg; (el || its).focus(); };

    const form = h('form', {
      class: 'login', novalidate: true,
      onsubmit: (e) => {
        e.preventDefault(); err.textContent = '';
        const id = core.digits(its.value);
        if (!id) return fail('Enter your ITS ID.');
        if (adminId && id === adminId) {
          if (pwdField.hidden) { pwdField.hidden = false; pwd.focus(); return; }
          if (pwd.value === CFG.admin.password) return signIn({ role: 'admin', its: id });
          return fail('That password is not correct.', pwd);
        }
        if (CFG.itsIdLength && id.length !== CFG.itsIdLength) return fail('An ITS ID has ' + CFG.itsIdLength + ' digits.');
        if (CFG.allowOnlyKnownIds && !indexOf(state.published).teachers.has(id)) return fail('This ITS ID is not in the published jadwal.');
        signIn({ role: 'user', its: id });
      }
    },
      h('div', { class: 'field' }, h('label', { for: 'its' }, 'ITS ID'), its),
      pwdField,
      err,
      h('button', { class: 'btn primary wide', type: 'submit' }, 'Continue')
    );

    return h('main', { class: 'login-page' },
      h('div', { class: 'login-hero' },
        h('div', { class: 'wordmark', lang: 'ar', dir: 'rtl' }, 'جدول'),
        h('h1', { class: 'login-title' }, CFG.appTitle),
        CFG.institution ? h('p', { class: 'login-inst' }, CFG.institution) : null
      ),
      form,
      state.loadError ? notice('warn', state.loadError) : null
    );
  }

  /* ======================================================================
     JADWAL (shared by users and admin)
     ====================================================================== */
  function resolve(idx, view) {
    if (!view) return null;
    if (view.kind === 'teacher') {
      const t = idx.teachers.get(view.key);
      return t ? { rows: t.rows, title: t.name, mode: 'teacher' } : null;
    }
    const c = idx.classes.get(view.key);
    return c ? { rows: c.rows, title: c.name, mode: 'class' } : null;
  }

  function slot(entries, mode) {
    const td = h('td', { class: 'slot' + (entries.length ? '' : ' empty') });
    const stack = h('div', { class: 'stack' });
    td.append(stack);
    entries.forEach((e) => {
      const box = h('div', { class: 'entry' });
      box.style.background = core.subjectColor(e.subject);
      if (e.time) box.append(h('span', { class: 'e-time' }, e.time));
      box.append(h('div', { class: 'e-book', dir: 'auto' }, e.book || e.subject || '—'));
      if (mode === 'class') { if (e.mufawwaz) box.append(h('div', { class: 'e-meta', dir: 'auto' }, e.mufawwaz)); }
      else if (CFG.showClassInTeacherView && e.class) box.append(h('div', { class: 'e-meta', dir: 'auto' }, e.class));
      stack.append(box);
    });
    return td;
  }

  function legend(rows) {
    const seen = new Map();
    rows.forEach((r) => {
      if (!r.subject) return;
      const info = core.subjectInfo(r.subject);
      const name = info ? info.name : r.subject;
      if (!seen.has(name)) seen.set(name, core.subjectColor(r.subject));
    });
    if (!seen.size) return null;
    return h('ul', { class: 'legend', 'aria-label': 'Subject colours' },
      Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([name, color]) => {
        const sw = h('span', { class: 'swatch', 'aria-hidden': 'true' });
        sw.style.background = color;
        return h('li', null, sw, h('span', { dir: 'auto' }, name));
      }));
  }

  function sortRows(rows, sortMode) {
    const out = rows.slice();
    if (sortMode === 'period') return out.sort((a, b) => (Number(a.period) || 9999) - (Number(b.period) || 9999) || (a.date || '').localeCompare(b.date || ''));
    if (sortMode === 'date') return out.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (Number(a.period) || 9999) - (Number(b.period) || 9999));
    if (sortMode === 'class') return out.sort((a, b) => (a.class || '').localeCompare(b.class || '') || (a.date || '').localeCompare(b.date || ''));
    if (sortMode === 'subject') return out.sort((a, b) => (a.subject || '').localeCompare(b.subject || '') || (a.date || '').localeCompare(b.date || ''));
    return out;
  }

  function buildSheet(spec, rows, stamp) {
    const sec = h('section', { class: 'jadwal' });
    sec.append(h('h1', { class: 'jadwal-title', dir: 'auto' }, spec.title));
    if (!rows.length) {
      sec.append(h('p', { class: 'jadwal-sub' }, 'Nothing is scheduled in this period.'));
      return sec;
    }
    const L = core.layout(rows, spec.mode);
    sec.append(h('p', { class: 'jadwal-sub' }, core.fmtRange(L.dates[0], L.dates[L.dates.length - 1])));
    const head = h('tr', null,
      h('th', { class: 'corner', scope: 'col' }, 'Day'),
      L.periods.map((p) => {
        const timeTag = L.periodTimes && L.periodTimes.get(String(p));
        return h('th', { class: 'period', scope: 'col' },
          h('span', { class: 'p-label' }, 'Period'),
          h('span', { class: 'p-num' }, String(p)),
          timeTag ? h('span', { class: 'p-time' }, '(' + timeTag + ')') : null);
      }));
    const body = L.dates.map((d) => h('tr', null,
      h('th', { class: 'day', scope: 'row' }, h('span', { class: 'day-name' }, core.fmtDay(d)), h('span', { class: 'day-date' }, core.fmtDate(d))),
      L.periods.map((p) => slot(L.cell(d, p), spec.mode))));
    sec.append(h('div', { class: 'sheet-wrap' }, h('table', { class: 'jadwal-table' }, h('thead', null, head), h('tbody', null, body))));
    sec.append(legend(rows));
    if (stamp) sec.append(h('p', { class: 'stamp' }, stamp));
    return sec;
  }

  function showJadwal(target, idx, view, stamp) {
    const spec = resolve(idx, view);
    if (!spec) { target.append(emptyState('Nothing to show', 'This jadwal is not in the data any more.')); return; }
    const weeks = idx.weeks;
    let weekKey = (state.weekKey === 'all' || weeks.some((w) => w.key === state.weekKey)) ? state.weekKey : core.defaultWeekKey(weeks);
    const holder = h('div', { class: 'sheet-holder' });
    const draw = () => {
      const baseRows = core.filterWeek(spec.rows, weekKey);
      const query = (state.adminFilter || '').trim().toLowerCase();
      const filteredRows = query
        ? baseRows.filter((r) => [r.class, r.subject, r.book, r.mufawwaz, r.number].some((v) => String(v || '').toLowerCase().includes(query)))
        : baseRows;
      holder.replaceChildren(buildSheet(spec, sortRows(filteredRows, state.adminSort), stamp));
    };
    const toolbar = h('div', { class: 'toolbar no-print' });
    if (weeks.length) {
      const sel = h('select', { id: 'week-sel', onchange: (e) => { weekKey = e.target.value; state.weekKey = weekKey; draw(); } },
        weeks.map((w) => h('option', { value: w.key }, w.label)),
        h('option', { value: 'all' }, 'All dates'));
      sel.value = weekKey;
      toolbar.append(h('label', { for: 'week-sel' }, 'Week'), sel);
    }
    const filterInput = h('input', {
      type: 'text',
      placeholder: 'Filter by class / teacher / subject',
      value: state.adminFilter,
      oninput: (e) => { state.adminFilter = e.target.value; draw(); }
    });
    const sortSelect = h('select', {
      onchange: (e) => { state.adminSort = e.target.value; draw(); }
    },
      h('option', { value: 'default' }, 'Default sort'),
      h('option', { value: 'period' }, 'Sort by period'),
      h('option', { value: 'date' }, 'Sort by date'),
      h('option', { value: 'class' }, 'Sort by class'),
      h('option', { value: 'subject' }, 'Sort by subject'));
    sortSelect.value = state.adminSort;
    toolbar.append(filterInput, sortSelect);
    toolbar.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => window.print() }, 'Print or save as PDF'));
    target.append(toolbar, holder);
    draw();
  }

  /* ======================================================================
     NORMAL USER
     ====================================================================== */
  function lookupBar(idx, me) {
    const input = h('input', {
      id: 'class-q', type: 'text', list: 'class-options', autocomplete: 'off', spellcheck: 'false',
      placeholder: idx.classList[0] ? idx.classList[0].name : '', value: state.lookupText || ''
    });
    const open = (key) => { state.view = { kind: 'class', key }; state.lookupMsg = ''; state.lookupSuggest = []; render(); };
    const form = h('form', {
      class: 'lookup',
      onsubmit: (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;
        state.lookupText = q;
        const c = idx.classes.get(core.norm(q));
        if (c) return open(c.key);
        const qk = core.norm(q);
        state.lookupMsg = 'No class named “' + q + '” was found.';
        state.lookupSuggest = qk ? idx.classList.filter((x) => x.key.includes(qk) || qk.includes(x.key)).slice(0, 6) : [];
        render();
      }
    },
      h('label', { for: 'class-q' }, 'View a class jadwal'),
      h('div', { class: 'lookup-row' },
        input,
        h('button', { class: 'btn primary', type: 'submit' }, 'View class'),
        (me && state.view && state.view.kind === 'class')
          ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.view = { kind: 'teacher', key: me.its }; render(); } }, 'Back to my jadwal')
          : null),
      h('datalist', { id: 'class-options' }, idx.classList.map((c) => h('option', { value: c.name }))),
      state.lookupMsg ? h('p', { class: 'form-error', role: 'alert' }, state.lookupMsg) : null,
      state.lookupSuggest.length
        ? h('p', { class: 'suggest' }, 'Did you mean ', state.lookupSuggest.map((c) => h('button', { class: 'chip', type: 'button', onclick: () => open(c.key) }, c.name)))
        : null);
    return form;
  }

  function userScreen() {
    const ds = state.published, idx = indexOf(ds), its = state.session.its, me = idx.teachers.get(its);
    const page = h('main', { class: 'page' });
    if (state.loadError) page.append(notice('warn', state.loadError));
    if (!ds.rows.length) {
      page.append(emptyState('No jadwal has been published yet', 'Please check again later.'));
      return page;
    }
    if (!state.view && me) state.view = { kind: 'teacher', key: me.its };
    page.append(lookupBar(idx, me));
    const out = h('div', { class: 'view' });
    page.append(out);
    if (state.view) showJadwal(out, idx, state.view, 'Published ' + fmtStamp(ds.updatedAt));
    else out.append(emptyState('No teaching jadwal is linked to ITS ' + its, 'Type a class name above to see that class’s jadwal.'));
    return page;
  }

  /* ======================================================================
     ADMIN
     ====================================================================== */
  function saveDraft(ds) {
    state.draft = ds;
    const ok = store.set('localStorage', KEYS.draft, JSON.stringify(ds));
    if (!ok) state.parseResult && state.parseResult.issues.push({ level: 'warn', text: 'This browser would not store the draft. Keep this tab open until you have published.' });
  }
  function ingest(sheets, source) {
    const res = core.buildDataset(sheets);
    const ok = res.dataset.rows.length > 0;
    state.parseResult = { source, issues: res.issues, stats: res.stats, ok };
    if (ok) { saveDraft(res.dataset); state.publishMsg = null; state.adminView = null; }
    render();
  }
  async function readFile(file) {
    try {
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        if (typeof XLSX === 'undefined') throw new Error('The Excel reader did not load (is this device online?). Save the sheet as CSV UTF-8 or paste the rows instead.');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        ingest(wb.SheetNames.map((n) => ({ name: n, matrix: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: true }) })), file.name);
      } else {
        ingest([{ name: 'data', matrix: core.parseDelimited(await file.text()) }], file.name);
      }
    } catch (e) {
      state.parseResult = { source: file.name, error: e.message || String(e) };
      render();
    }
  }

  function detectRepo() {
    const saved = (() => { try { return JSON.parse(store.get('localStorage', KEYS.gh) || '{}'); } catch (e) { return {}; } })();
    let owner = saved.owner || CFG.github.owner, repo = saved.repo || CFG.github.repo;
    const host = location.hostname;
    if ((!owner || !repo) && host.endsWith('.github.io')) {
      owner = owner || host.split('.')[0];
      const seg = location.pathname.split('/')[1];
      repo = repo || (seg && !seg.includes('.') ? seg : host);
    }
    return { owner: owner || '', repo: repo || '' };
  }
  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async function publishToGitHub(owner, repo, token, ds) {
    const api = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents';
    const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const path = CFG.dataFile.replace(/^\/+/, ''), parts = path.split('/'), name = parts.pop(), dir = parts.join('/');
    const branch = CFG.github.branch;
    const explain = (res) => {
      if (res.status === 401) return 'GitHub rejected the token. Create a new token and paste it again.';
      if (res.status === 403) return 'The token is not allowed to change this repository. Give it “Contents: Read and write” access to it.';
      if (res.status === 404) return 'The repository “' + owner + '/' + repo + '” was not found, or the token cannot see it. Check both names and the token’s repository access.';
      if (res.status === 409 || res.status === 422) return 'GitHub reported a conflict. Press Publish again.';
      return 'GitHub answered with error ' + res.status + '.';
    };
    let sha;
    const list = await fetch((dir ? api + '/' + dir : api) + (branch ? '?ref=' + encodeURIComponent(branch) : ''), { headers });
    if (list.ok) {
      const items = await list.json();
      const f = Array.isArray(items) ? items.find((x) => x.name === name) : null;
      if (f) sha = f.sha;
    } else if (list.status !== 404) throw new Error(explain(list));
    const body = { message: 'Update jadwal ' + new Date().toISOString(), content: toBase64(core.serialize(ds)) };
    if (sha) body.sha = sha;
    if (branch) body.branch = branch;
    const put = await fetch(api + '/' + path, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, headers), body: JSON.stringify(body) });
    if (!put.ok) throw new Error(explain(put));
  }
  function downloadJson(ds) {
    const url = URL.createObjectURL(new Blob([core.serialize(ds)], { type: 'application/json' }));
    const a = h('a', { href: url, download: 'jadwal.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function resultBlock(r) {
    if (r.error) return h('div', { class: 'result' }, notice('error', 'Could not read ' + r.source + '. ' + r.error));
    const s = r.stats;
    return h('div', { class: 'result' },
      r.ok
        ? notice('ok', 'Read ' + s.rows + ' rows from ' + r.source + '. Saved as a draft in this browser. Nothing is public until you publish.')
        : notice('error', 'No timetable was read from ' + r.source + '.'),
      r.ok ? h('dl', { class: 'facts' },
        h('div', null, h('dt', null, 'Classes'), h('dd', null, String(s.classes))),
        h('div', null, h('dt', null, 'Teachers with an ITS ID'), h('dd', null, String(s.teachers))),
        h('div', null, h('dt', null, 'Dates'), h('dd', null, core.fmtRange(s.from, s.to)))) : null,
      r.issues.length ? h('ul', { class: 'issues' }, r.issues.map((i) => h('li', { class: 'issue ' + i.level },
        i.text, i.details ? h('ul', null, i.details.map((d) => h('li', null, d))) : null))) : null);
  }

  function uploadPanel() {
    const wrap = h('div', { class: 'panel' });

    /* step 1 */
    const input = h('input', { type: 'file', accept: '.xlsx,.xlsm,.xls,.csv,.tsv,.txt', onchange: (e) => { if (e.target.files[0]) readFile(e.target.files[0]); } });
    const drop = h('label', { class: 'drop' }, input,
      h('span', { class: 'drop-main' }, 'Choose an Excel or CSV file'),
      h('span', { class: 'drop-sub' }, 'or drag it onto this box'));
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });

    const paste = h('textarea', { id: 'paste', rows: '6', spellcheck: 'false', placeholder: 'Period\tClass\tSubject\tBook\tMufawwaz/Department\tNumber\tDate\tTime' });
    paste.value = state.pasteText;
    paste.addEventListener('input', () => { state.pasteText = paste.value; });

    wrap.append(
      h('section', { class: 'step' },
        h('h2', null, '1. Add the timetable'),
        h('p', { class: 'hint' }, 'Columns: Period, Class, Subject, Book, Mufawwaz/Department, Number, Date and an optional Time. The teacher ITS ID is now generated from the department or Mufawwaz value, while the mobile number is preserved in the data for admin review and sorting.'),
        drop,
        h('label', { class: 'plain-label', for: 'paste' }, 'Or paste rows copied from Excel'),
        paste,
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => {
            if (!paste.value.trim()) { state.parseResult = { source: 'the pasted text', error: 'Paste some rows first.' }; return render(); }
            ingest([{ name: 'pasted', matrix: core.parseDelimited(paste.value) }], 'the pasted text');
          } }, 'Read pasted rows')),
        state.parseResult ? resultBlock(state.parseResult) : null));

    /* step 2 */
    const hasDraft = !!state.draft;
    const repo = detectRepo();
    const owner = h('input', { id: 'gh-owner', type: 'text', value: repo.owner, autocomplete: 'off', spellcheck: 'false' });
    const repoIn = h('input', { id: 'gh-repo', type: 'text', value: repo.repo, autocomplete: 'off', spellcheck: 'false' });
    const token = h('input', { id: 'gh-token', type: 'password', autocomplete: 'off', value: store.get('sessionStorage', KEYS.token) || '' });
    const msg = h('div', { class: 'msg', 'aria-live': 'polite' }, state.publishMsg ? notice(state.publishMsg.level, state.publishMsg.text) : null);
    const setMsg = (level, text) => msg.replaceChildren(notice(level, text));
    const pubBtn = h('button', { class: 'btn primary', type: 'button', disabled: !hasDraft, onclick: async () => {
      const o = owner.value.trim(), r = repoIn.value.trim(), t = token.value.trim();
      if (!o || !r || !t) return setMsg('error', 'Fill in the owner, the repository and the token.');
      store.set('localStorage', KEYS.gh, JSON.stringify({ owner: o, repo: r }));
      store.set('sessionStorage', KEYS.token, t);
      pubBtn.disabled = true; setMsg('info', 'Publishing…');
      try {
        await publishToGitHub(o, r, t, state.draft);
        state.published = state.draft;
        state.publishMsg = { level: 'ok', text: 'Published. The live site updates within a minute or two; reload it to see the new jadwal.' };
      } catch (e) {
        state.publishMsg = { level: 'error', text: (e && e.message && !/fetch/i.test(e.message)) ? e.message : 'Could not reach GitHub. Check the connection and try again.' };
      }
      render();
    } }, 'Publish to GitHub');

    wrap.append(
      h('section', { class: 'step' },
        h('h2', null, '2. Publish for everyone'),
        !hasDraft ? h('p', { class: 'hint' }, 'Add a timetable in step 1 first.') : h('p', { class: 'hint' }, 'The draft has ' + state.draft.rows.length + ' rows. Publishing replaces the timetable on the site. Admins can filter and sort before publishing from the preview tab.'),
        h('div', { class: 'gh-grid' },
          h('div', { class: 'field' }, h('label', { for: 'gh-owner' }, 'GitHub owner'), owner),
          h('div', { class: 'field' }, h('label', { for: 'gh-repo' }, 'Repository'), repoIn),
          h('div', { class: 'field wide' }, h('label', { for: 'gh-token' }, 'Access token'), token,
            h('span', { class: 'hint' }, 'Kept only until this tab closes. Create a fine-grained token for this one repository with “Contents: Read and write”.'))),
        h('div', { class: 'row-actions' }, pubBtn,
          h('button', { class: 'btn', type: 'button', disabled: !hasDraft, onclick: () => downloadJson(state.draft) }, 'Download jadwal.json')),
        msg,
        h('details', { class: 'manual' },
          h('summary', null, 'Publish by hand instead'),
          h('ol', null,
            h('li', null, 'Press Download jadwal.json.'),
            h('li', null, 'On GitHub, open your repository, then the data folder.'),
            h('li', null, 'Choose Add file, then Upload files, and drop jadwal.json in. It replaces the old file.'),
            h('li', null, 'Press Commit changes. The site updates within a minute or two.')))));
    return wrap;
  }

  function browsePanel() {
    const ds = activeDataset(), idx = indexOf(ds);
    if (!ds.rows.length) return emptyState('Nothing to browse yet', 'Add a timetable on the Upload tab first.');
    const holder = h('div', { class: 'view' });
    const draw = () => { holder.replaceChildren(); if (state.adminView) showJadwal(holder, idx, state.adminView, (hasUnpublishedDraft() ? 'Draft ' : 'Published ') + fmtStamp(ds.updatedAt)); };
    const sel = h('select', { id: 'browse-sel', onchange: (e) => {
      const v = e.target.value, at = v.indexOf('::');
      state.adminView = v ? { kind: v.slice(0, at), key: v.slice(at + 2) } : null;
      draw();
    } },
      h('option', { value: '' }, 'Choose a class or a teacher'),
      h('optgroup', { label: 'Classes' }, idx.classList.map((c) => h('option', { value: 'class::' + c.key }, c.name))),
      h('optgroup', { label: 'Teachers' }, idx.teacherList.map((t) => h('option', { value: 'teacher::' + t.its }, t.name + ' (' + t.its + ')'))));
    if (state.adminView) sel.value = state.adminView.kind + '::' + state.adminView.key;
    draw();
    return h('div', { class: 'panel' },
      h('div', { class: 'lookup' }, h('label', { for: 'browse-sel' }, hasUnpublishedDraft() ? 'Preview the draft' : 'Browse the published jadwal'), sel),
      holder);
  }

  function adminScreen() {
    const page = h('main', { class: 'page' });
    const pub = state.published, d = hasUnpublishedDraft() ? state.draft : null;
    page.append(h('h1', { class: 'page-title' }, 'Timetable data'));
    if (CFG.admin.password === 'change-this-password' || CFG.admin.itsId === '12345678') {
      page.append(notice('warn', 'config.js still has the sample admin ITS ID or password. Change them before you share the site.'));
    }
    if (state.loadError) page.append(notice('warn', state.loadError));
    page.append(h('dl', { class: 'status' },
      h('div', null, h('dt', null, 'Published on the site'),
        h('dd', null, pub.rows.length ? pub.rows.length + ' rows, updated ' + fmtStamp(pub.updatedAt) : 'Nothing yet')),
      d ? h('div', null, h('dt', null, 'Draft in this browser'),
        h('dd', null, d.rows.length + ' rows, not published yet ',
          h('button', { class: 'link', type: 'button', onclick: () => { state.draft = null; state.parseResult = null; store.del('localStorage', KEYS.draft); render(); } }, 'Discard draft'))) : null));
    const tab = (id, label) => h('button', { class: 'tab', type: 'button', 'aria-current': state.adminTab === id ? 'page' : null, onclick: () => { state.adminTab = id; render(); } }, label);
    page.append(h('nav', { class: 'tabs', 'aria-label': 'Admin sections' }, tab('upload', 'Upload and publish'), tab('browse', 'Browse jadwals')));
    page.append(state.adminTab === 'browse' ? browsePanel() : uploadPanel());
    return page;
  }

  /* ======================================================================
     SHELL
     ====================================================================== */
  function topbar() {
    const s = state.session;
    return h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-ar', lang: 'ar', dir: 'rtl' }, 'جدول'), h('span', { class: 'brand-name' }, CFG.appTitle)),
      h('div', { class: 'who' },
        h('span', { class: 'who-id' }, s.role === 'admin' ? 'Admin' : 'ITS ' + s.its),
        h('button', { class: 'btn ghost', type: 'button', onclick: logout }, 'Log out')));
  }

  function render() {
    app.replaceChildren();
    const s = state.session;
    document.title = CFG.appTitle;
    if (!s) {
      app.append(loginScreen());
      const f = document.getElementById('its'); if (f) f.focus();
    } else {
      app.append(topbar(), s.role === 'admin' ? adminScreen() : userScreen());
    }
  }

  async function boot() {
    app.append(h('p', { class: 'boot' }, 'Loading…'));
    await loadPublished();
    state.draft = loadDraft();
    try { const s = JSON.parse(store.get('sessionStorage', KEYS.session) || 'null'); if (s && (s.role === 'admin' || s.role === 'user')) state.session = s; } catch (e) { /* ignore */ }
    render();
  }
  boot();
})();
