/* ==========================================================================
   core.js — data logic only (no screen code). You should not need to edit this.
   Reads Excel/CSV/pasted rows, builds class and teacher indexes, lays out cross-tabs.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JadwalCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var POSITIONAL = { period: 0, class: 1, subject: 2, book: 3, mufawwaz: 4, number: 5, date: 6, time: 7 };
  var DEFAULTS = {
    appTitle: 'Jadwal', institution: '',
    admin: { itsId: '', password: '' },
    itsIdLength: 8, allowOnlyKnownIds: false,
    dataFile: 'data/jadwal.json',
    dateOrder: 'DMY', weekStartsOn: 1, locale: 'en-GB',
    showClassInTeacherView: false,
    github: { owner: '', repo: '', branch: '' },
    fallbackColor: '#E7E9EE', subjects: []
  };

  function pad(n) { return String(n).padStart(2, '0'); }

  /* Lower-case, strip accents / apostrophes / punctuation / spaces, so spelling variants match. */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f\u064B-\u065F\u0670]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
  }
  function clean(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function digits(v) { return v == null ? '' : String(v).replace(/\D/g, ''); }
  // ITS ID: first 8 digits of a run of 8+ digits, else first 4 digits of a run of 4+, else the whole value.
  function itsId(v) {
    var s = clean(v), m = s.match(/\d{8,}/) || s.match(/\d{4,}/);
    return m ? m[0].slice(0, m[0].length >= 8 ? 8 : 4) : s;
  }

  var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  function comparePeriod(a, b) {
    var an = typeof a === 'number', bn = typeof b === 'number';
    if (an && bn) return a - b;
    if (an) return -1;
    if (bn) return 1;
    return collator.compare(String(a), String(b));
  }
  function parsePeriod(v) {
    var s = clean(v);
    if (s === '') return '';
    if (/^\d+(\.0+)?$/.test(s)) return parseInt(s, 10);
    return s;
  }

  /* ---------- dates ---------- */
  function ymdToIso(y, m, d) {
    if (y < 100) y += 2000;
    if (y < 1900 || y > 2100) return null;        // also rejects Hijri years such as 1447
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function serialToIso(n) {                       // Excel serial day number -> yyyy-mm-dd
    var dt = new Date(Math.round((Math.floor(n) - 25569) * 86400000));
    return ymdToIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  function parseDate(v, order) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : ymdToIso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') return (v > 20000 && v < 80000) ? serialToIso(v) : null;
    var s = String(v).trim(), m;
    if (/^\d{5}(\.\d+)?$/.test(s)) return serialToIso(parseFloat(s));
    m = s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return ymdToIso(+m[1], +m[2], +m[3]);
    m = s.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})(?!\d)/);
    if (m) {
      var d = order === 'MDY' ? +m[2] : +m[1], mo = order === 'MDY' ? +m[1] : +m[2];
      if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; }
      return ymdToIso(+m[3], mo, d);
    }
    m = s.match(/(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.,]*([A-Za-z]{3,})[\s\-\/.,]*(\d{4}|\d{2})(?!\d)/);
    if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return ymdToIso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
    m = s.match(/([A-Za-z]{3,})[\s\-\/.,]*(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.,]+(\d{4}|\d{2})(?!\d)/);
    if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return ymdToIso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
    return null;
  }
  function fracToHM(f) {
    var mins = Math.round(f * 1440);
    return pad(Math.floor(mins / 60) % 24) + ':' + pad(mins % 60);
  }
  function parseTime(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      if (v > 0 && v < 1) return fracToHM(v);
      if (v >= 1 && v < 80000 && v % 1 > 0) return fracToHM(v % 1);
      return String(v);
    }
    var s = clean(v);
    if (/^0?\.\d+$/.test(s)) return fracToHM(parseFloat(s));
    return s;
  }

  /* ---------- delimited text (CSV / TSV / pasted from Excel) ---------- */
  function parseDelimited(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var lines = text.split(/\r?\n/), first = '';
    for (var k = 0; k < lines.length; k++) { if (lines[k].trim() !== '') { first = lines[k]; break; } }
    var count = function (ch) { return first.split(ch).length - 1; };
    var delim = count('\t') > 0 ? '\t' : (count(';') > count(',') ? ';' : ',');
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"' && cur === '') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = ''; rows.push(row); row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  /* ---------- header detection ---------- */
  var FIELD_TESTS = [
    ['period',   function (n) { return n.indexOf('period') === 0 || n === 'prd'; }],
    ['class',    function (n) { return n.indexOf('class') === 0; }],
    ['subject',  function (n) { return n.indexOf('subject') === 0; }],
    ['book',     function (n) { return n.indexOf('book') === 0 || n === 'kitab'; }],
    ['mufawwaz', function (n) { return /mufawwaz|department|dept|teacher|faculty/.test(n); }],
    ['number',   function (n) { return n === 'number' || n === 'no' || n === 'id' || n.indexOf('its') === 0; }],
    ['date',     function (n) { return n.indexOf('date') === 0; }],
    ['time',     function (n) { return n.indexOf('time') === 0 || n === 'timing'; }]
  ];
  function detectColumns(row) {
    var map = {};
    (row || []).forEach(function (cell, idx) {
      var n = norm(cell);
      if (!n) return;
      for (var i = 0; i < FIELD_TESTS.length; i++) {
        var f = FIELD_TESTS[i][0];
        if (map[f] === undefined && FIELD_TESTS[i][1](n)) { map[f] = idx; break; }
      }
    });
    return map;
  }

  function serialize(dataset) {
    var rows = dataset.rows.map(function (r) { return JSON.stringify(r); }).join(',\n');
    return '{"version":1,"updatedAt":' + JSON.stringify(dataset.updatedAt || null) + ',"rows":[\n' + rows + '\n]}\n';
  }

  /* ======================================================================
     create(cfg) — everything that depends on the settings
     ====================================================================== */
  function create(userCfg) {
    userCfg = userCfg || {};
    var cfg = Object.assign({}, DEFAULTS, userCfg);
    cfg.admin = Object.assign({}, DEFAULTS.admin, userCfg.admin);
    cfg.github = Object.assign({}, DEFAULTS.github, userCfg.github);

    var subjectMap = new Map();
    (cfg.subjects || []).forEach(function (s) {
      [s.name].concat(s.aliases || []).forEach(function (n) {
        var k = norm(n);
        if (k && !subjectMap.has(k)) subjectMap.set(k, s);
      });
    });
    function subjectInfo(name) { return subjectMap.get(norm(name)) || null; }
    function subjectColor(name) { var s = subjectInfo(name); return s ? s.color : cfg.fallbackColor; }

    var loc = cfg.locale || 'en-GB';
    var dayFmt = new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' });
    var dateFmt = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    function isoToDate(iso) { return new Date(iso + 'T00:00:00Z'); }
    function fmtDay(iso) { return dayFmt.format(isoToDate(iso)); }
    function fmtDate(iso) { return dateFmt.format(isoToDate(iso)); }
    function fmtRange(a, b) { return a === b ? fmtDate(a) : fmtDate(a) + ' – ' + fmtDate(b); }
    function addDays(iso, n) { var d = isoToDate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function daysBetween(a, b) { return Math.round((isoToDate(b) - isoToDate(a)) / 86400000); }
    function todayIso() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

    /* ---------- build a dataset from one or more sheets of cells ---------- */
    function buildDataset(sheets) {
      var issues = [], out = [], seen = new Set(), skipMsgs = [], skipped = 0, dupes = 0, noNumber = 0, noSubject = 0;
      var unknown = new Map(), multi = sheets.length > 1, anySubjectCol = false;

      sheets.forEach(function (sheet) {
        var matrix = sheet.matrix || [], label = multi ? 'Sheet "' + sheet.name + '": ' : '';
        var first = -1;
        for (var a = 0; a < matrix.length; a++) {
          if ((matrix[a] || []).some(function (c) { return clean(c) !== ''; })) { first = a; break; }
        }
        if (first < 0) return;
        var detected = detectColumns(matrix[first]), map, start;
        if (Object.keys(detected).length >= 4) { map = detected; start = first + 1; }
        else if (!multi) {
          map = POSITIONAL; start = first;
          issues.push({ level: 'warn', text: 'No header row was recognised, so the columns were read in this order: Period, Class, Subject, Book, Mufawwaz/Department, Number, Date, Time.' });
        } else {
          issues.push({ level: 'warn', text: label + 'skipped because it has no recognisable header row.' });
          return;
        }
        var missing = ['period', 'class', 'book', 'date'].filter(function (f) { return map[f] === undefined; });
        if (missing.length) {
          issues.push({ level: 'error', text: label + 'these columns could not be found: ' + missing.join(', ') + '. Check the header names.' });
          return;
        }
        if (map.subject !== undefined) anySubjectCol = true;
        if (map.subject === undefined) issues.push({ level: 'warn', text: label + 'there is no Subject column, so cells will not be coloured.' });
        if (map.number === undefined) issues.push({ level: 'warn', text: label + 'there is no Number column, so teacher jadwals cannot be built.' });

        for (var i = start; i < matrix.length; i++) {
          var r = matrix[i];
          if (!r || !r.some(function (c) { return clean(c) !== ''; })) continue;
          var get = function (f) { return map[f] === undefined ? '' : r[map[f]]; };
          var cls = clean(get('class')), per = parsePeriod(get('period')), date = parseDate(get('date'), cfg.dateOrder), problems = [];
          if (!cls) problems.push('class is empty');
          if (per === '') problems.push('period is empty');
          if (!date) problems.push('date "' + clean(get('date')) + '" is not a recognised date');
          if (problems.length) {
            skipped++;
            if (skipMsgs.length < 12) skipMsgs.push(label + 'Row ' + (i + 1) + ' was skipped: ' + problems.join(', ') + '.');
            continue;
          }
          var rec = {
            period: per, class: cls, subject: clean(get('subject')), book: clean(get('book')),
            mufawwaz: clean(get('mufawwaz')), number: itsId(get('mufawwaz') || get('number')), date: date, time: parseTime(get('time'))
          };
          var key = [rec.period, norm(rec.class), rec.date, rec.book, rec.number, rec.mufawwaz, rec.subject, rec.time].join('|');
          if (seen.has(key)) { dupes++; continue; }
          seen.add(key);
          if (!rec.number) noNumber++;
          if (!rec.subject) noSubject++;
          else if (!subjectInfo(rec.subject)) unknown.set(rec.subject, (unknown.get(rec.subject) || 0) + 1);
          out.push(rec);
        }
      });

      out.sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : (collator.compare(a.class, b.class) || comparePeriod(a.period, b.period));
      });

      if (skipped) {
        issues.push({ level: 'warn', text: skipped + ' row' + (skipped > 1 ? 's were' : ' was') + ' skipped.', details: skipMsgs.concat(skipped > skipMsgs.length ? ['…and ' + (skipped - skipMsgs.length) + ' more.'] : []) });
      }
      if (unknown.size) {
        var list = Array.from(unknown.entries()).map(function (e) { return e[0] + ' (' + e[1] + ')'; });
        issues.push({ level: 'warn', text: 'These subjects have no colour rule and will show in grey: ' + list.join(', ') + '. Fix the spelling in the file or add them to config.js.' });
      }
      if (noSubject && anySubjectCol) issues.push({ level: 'info', text: noSubject + ' row' + (noSubject > 1 ? 's have' : ' has') + ' no subject and will show in grey.' });
      if (noNumber) issues.push({ level: 'warn', text: noNumber + ' row' + (noNumber > 1 ? 's have' : ' has') + ' no Number (ITS ID). They appear in class jadwals but in no teacher jadwal.' });
      if (dupes) issues.push({ level: 'info', text: dupes + ' exact duplicate row' + (dupes > 1 ? 's were' : ' was') + ' ignored.' });
      if (!out.length && !issues.some(function (x) { return x.level === 'error'; })) {
        issues.push({ level: 'error', text: 'No usable rows were found in this data.' });
      }

      var dataset = { version: 1, updatedAt: new Date().toISOString(), rows: out };
      return { dataset: dataset, issues: issues, stats: summarise(out) };
    }

    function summarise(rows) {
      var classes = new Set(), teachers = new Set(), dates = [];
      rows.forEach(function (r) { classes.add(norm(r.class)); if (r.number) teachers.add(r.number); dates.push(r.date); });
      dates.sort();
      return { rows: rows.length, classes: classes.size, teachers: teachers.size, from: dates[0] || '', to: dates[dates.length - 1] || '' };
    }

    /* ---------- accept what was saved in jadwal.json ---------- */
    function normalizeDataset(json) {
      var src = Array.isArray(json) ? json : (json && Array.isArray(json.rows) ? json.rows : []);
      var rows = [];
      src.forEach(function (r) {
        if (!r || !r.class || r.period === '' || r.period == null || !/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) return;
        rows.push({
          period: typeof r.period === 'number' ? r.period : parsePeriod(r.period),
          class: clean(r.class), subject: clean(r.subject), book: clean(r.book),
          mufawwaz: clean(r.mufawwaz), number: itsId(r.mufawwaz || r.number), date: r.date, time: clean(r.time)
        });
      });
      return { version: 1, updatedAt: (json && json.updatedAt) || null, rows: rows };
    }

    /* ---------- indexes for lookups ---------- */
    function buildIndex(rows) {
      var classes = new Map(), teachers = new Map(), dateSet = new Set();
      rows.forEach(function (r) {
        dateSet.add(r.date);
        var ck = norm(r.class), c = classes.get(ck);
        if (!c) { c = { key: ck, name: r.class, rows: [] }; classes.set(ck, c); }
        c.rows.push(r);
        if (r.number) {
          var t = teachers.get(r.number);
          if (!t) { t = { its: r.number, name: '', rows: [], names: new Map() }; teachers.set(r.number, t); }
          t.rows.push(r);
          if (r.mufawwaz) t.names.set(r.mufawwaz, (t.names.get(r.mufawwaz) || 0) + 1);
        }
      });
      teachers.forEach(function (t) {
        var best = '', n = 0;
        t.names.forEach(function (cnt, name) { if (cnt > n) { n = cnt; best = name; } });
        t.name = best || ('ITS ' + t.its);
      });
      var classList = Array.from(classes.values()).sort(function (a, b) { return collator.compare(a.name, b.name); });
      var teacherList = Array.from(teachers.values()).sort(function (a, b) { return collator.compare(a.name, b.name); });
      var dates = Array.from(dateSet).sort();
      return { rows: rows, classes: classes, teachers: teachers, classList: classList, teacherList: teacherList, dates: dates, weeks: buildWeeks(dates) };
    }

    /* ---------- weeks (only when the upload spans more than 7 days) ---------- */
    function weekStart(iso) {
      var diff = (isoToDate(iso).getUTCDay() - (cfg.weekStartsOn || 0) + 7) % 7;
      return addDays(iso, -diff);
    }
    function buildWeeks(dates) {
      if (!dates.length || daysBetween(dates[0], dates[dates.length - 1]) + 1 <= 7) return [];
      var seen = new Set(), weeks = [];
      dates.forEach(function (d) {
        var s = weekStart(d);
        if (!seen.has(s)) { seen.add(s); weeks.push({ key: s, start: s, end: addDays(s, 6), label: fmtRange(s, addDays(s, 6)) }); }
      });
      return weeks;
    }
    function defaultWeekKey(weeks, today) {
      if (!weeks.length) return 'all';
      today = today || todayIso();
      var cur = weeks.find(function (w) { return today >= w.start && today <= w.end; });
      if (cur) return cur.key;
      var next = weeks.find(function (w) { return w.start > today; });
      return (next || weeks[weeks.length - 1]).key;
    }
    function filterWeek(rows, key) {
      return key === 'all' ? rows : rows.filter(function (r) { return weekStart(r.date) === key; });
    }

    /* ---------- cross-tab layout ---------- */
    function layout(rows, mode) {
      var dates = Array.from(new Set(rows.map(function (r) { return r.date; }))).sort();
      var pmap = new Map();
      rows.forEach(function (r) { var k = String(r.period); if (!pmap.has(k)) pmap.set(k, r.period); });
      var periods = Array.from(pmap.values()).sort(comparePeriod);
      var cells = new Map();
      rows.forEach(function (r) {
        var key = r.date + '|' + r.period;
        var list = cells.get(key); if (!list) { list = []; cells.set(key, list); }
        var sig = mode === 'class'
          ? [r.book, r.mufawwaz, r.subject, r.time].join('|')
          : [r.book, r.subject, r.time, cfg.showClassInTeacherView ? r.class : ''].join('|');
        if (!list.some(function (e) { return e._sig === sig; })) list.push({ _sig: sig, book: r.book, mufawwaz: r.mufawwaz, subject: r.subject, time: r.time, class: r.class });
      });
      cells.forEach(function (list) {
        list.sort(function (a, b) { return collator.compare(a.time || '', b.time || '') || collator.compare(a.book, b.book); });
      });
      return { dates: dates, periods: periods, cell: function (d, p) { return cells.get(d + '|' + p) || []; } };
    }

    return {
      cfg: cfg, norm: norm, digits: digits, itsId: itsId, subjectInfo: subjectInfo, subjectColor: subjectColor,
      parseDelimited: parseDelimited, buildDataset: buildDataset, normalizeDataset: normalizeDataset,
      buildIndex: buildIndex, filterWeek: filterWeek, defaultWeekKey: defaultWeekKey, layout: layout,
      fmtDay: fmtDay, fmtDate: fmtDate, fmtRange: fmtRange, serialize: serialize,
      _parseDate: function (v) { return parseDate(v, cfg.dateOrder); }, _parseTime: parseTime
    };
  }

  return { create: create, norm: norm, serialize: serialize };
});
