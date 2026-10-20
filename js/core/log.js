/*
 * Error / warning log. Loaded right after ns.js so it can catch errors from every later script.
 * Never touches the DOM (the viewer lives in js/ui/logview.js), so it also runs in the Node tests.
 *   WW.Log.error(source, message, detail)   source: uncaught|promise|resource|bus|engine|ai|levelgen|ui|editor|storage|...
 *   WW.Log.warn / info                      same signature
 *   WW.Log.list() / clear() / export() / unseen() / markSeen() / setContext({levelId})
 * warn/error entries are persisted (WW.Store key 'errorLog') so they survive a reload; secrets are scrubbed first.
 */
(function (root) {
  'use strict';
  var WW = root.WW;

  var MAX_MEM = 300, MAX_SAVED = 100, MAX_FIELD = 4000, SAVE_KEY = 'errorLog';
  var entries = [];
  var seq = 0, seenId = 0, saveTimer = null, loaded = false;
  var context = {};
  var BROWSER_PRINTED = { uncaught: 1, promise: 1, resource: 1 };   // the browser already prints these itself
  var echo = null;   // browser only: the original console methods, so explicit WW.Log calls still show up in F12

  var SECRET_RES = [
    [/\bsk-[A-Za-z0-9_\-]{8,}/g, 'sk-***'],
    [/\bAIza[0-9A-Za-z_\-]{20,}/g, 'AIza***'],
    [/(Bearer\s+)[A-Za-z0-9._\-]{8,}/gi, '$1***'],
    [/((?:api[_-]?key|x-api-key|apikey)["']?\s*[:=]\s*["']?)[^"'\s,&}]+/gi, '$1***']
  ];

  function scrub(s) {
    s = String(s === undefined || s === null ? '' : s);
    for (var i = 0; i < SECRET_RES.length; i++) s = s.replace(SECRET_RES[i][0], SECRET_RES[i][1]);
    return s.length > MAX_FIELD ? s.slice(0, MAX_FIELD) + '…（截断）' : s;
  }

  /* duck-typed: errors from another realm (iframe, vm) fail instanceof Error */
  function isErr(v) { return !!v && typeof v === 'object' && typeof v.message === 'string' && typeof v.stack === 'string'; }

  function stringify(v) {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v === 'string') return v;
    if (isErr(v)) return v.stack || v.message;
    try { return JSON.stringify(v, null, 2); } catch (e) { return String(v); }
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function page() {
    try { return String(root.location && root.location.pathname || '').split('/').pop() || ''; } catch (e) { return ''; }
  }

  /* ---------------------------------------------------------------- persistence */

  function store() { return WW.Store || null; }

  function load() {
    if (loaded || !store()) return;
    loaded = true;
    var saved = store().get(SAVE_KEY, []);
    if (!Array.isArray(saved) || !saved.length) return;
    var prev = saved.map(function (e) { e.prev = true; return e; });
    entries = prev.concat(entries);
    var maxId = prev.reduce(function (m, e) { return Math.max(m, e.id || 0); }, 0);
    // keep ids monotonic across reloads; last session's errors don't count as unseen
    if (maxId >= seq) {
      var shift = maxId;
      entries.forEach(function (e) { if (!e.prev) e.id += shift; });
      seq += shift;
    }
    seenId = Math.max(seenId, maxId);
    trim();
  }

  function save() {
    saveTimer = null;
    load();
    if (!store()) return;
    var keep = entries.filter(function (e) { return e.level !== 'info'; }).slice(-MAX_SAVED).map(function (e) {
      var c = {}; for (var k in e) if (k !== 'prev') c[k] = e[k]; return c;
    });
    store().set(SAVE_KEY, keep);
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(save, 300);
  }

  function trim() { if (entries.length > MAX_MEM) entries.splice(0, entries.length - MAX_MEM); }

  /* ---------------------------------------------------------------- write */

  function write(level, source, message, detail) {
    load();
    if (echo && echo[level] && !BROWSER_PRINTED[source]) echo[level]('[WW:' + source + ']', message, detail === undefined ? '' : detail);
    var msg = scrub(isErr(message) ? message.message : stringify(message));
    var stack = isErr(message) ? message.stack : (isErr(detail) ? detail.stack : '');
    var det = isErr(detail) ? '' : stringify(detail);
    source = String(source || 'app');
    var last = entries[entries.length - 1];
    if (last && !last.prev && last.level === level && last.source === source && last.msg === msg) {
      last.count++;
      last.time = stamp(new Date());
      last.id = ++seq;
      emit(last);
      if (level !== 'info') scheduleSave();
      return last;
    }
    var e = {
      id: ++seq, time: stamp(new Date()), level: level, source: source, msg: msg,
      stack: scrub(stack || ''), detail: scrub(det), page: page(), levelId: context.levelId || '', count: 1
    };
    entries.push(e);
    trim();
    emit(e);
    if (level !== 'info') scheduleSave();
    return e;
  }

  var emitting = false;
  function emit(e) {
    if (emitting || !WW.bus) return;   // a failing 'log' listener must not recurse into the log
    emitting = true;
    try { WW.bus.emit('log', e); } finally { emitting = false; }
  }

  function list() { load(); return entries.slice(); }

  function clear() {
    entries = [];
    seenId = seq;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (store()) store().remove(SAVE_KEY);
    loaded = true;
    emit(null);
  }

  function unseen() {
    load();
    return entries.filter(function (e) { return e.level === 'error' && e.id > seenId; }).length;
  }

  function markSeen() { seenId = seq; emit(null); }

  function exportData(env) {
    return { exportedAt: stamp(new Date()), version: WW.VERSION, page: page(), env: env || {}, entries: list() };
  }

  WW.Log = {
    error: function (s, m, d) { return write('error', s, m, d); },
    warn: function (s, m, d) { return write('warn', s, m, d); },
    info: function (s, m, d) { return write('info', s, m, d); },
    list: list, clear: clear, unseen: unseen, markSeen: markSeen, scrub: scrub,
    export: exportData,
    setContext: function (c) { for (var k in c) context[k] = c[k]; },
    flush: save
  };

  /* ---------------------------------------------------------------- global capture (browser only) */

  if (typeof root.addEventListener !== 'function' || typeof root.document === 'undefined') return;

  root.addEventListener('error', function (ev) {
    var t = ev.target;
    if (t && t !== root && (t.src || t.href)) {
      write('error', 'resource', '资源加载失败：' + (t.tagName || '').toLowerCase() + ' ' + (t.src || t.href));
      return;
    }
    var where = ev.filename ? ev.filename.split('/').pop() + ':' + ev.lineno + ':' + ev.colno : '';
    write('error', 'uncaught', ev.error || ev.message || 'Script error.', where ? '位置：' + where : '');
  }, true);

  root.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    write('error', 'promise', isErr(r) ? r : ('未处理的 Promise 拒绝：' + stringify(r)));
  });

  // keep console output as-is, but mirror console.error / console.warn into the log
  var con = root.console;
  if (con) {
    echo = {};
    ['error', 'warn', 'info'].forEach(function (lvl) { if (typeof con[lvl] === 'function') echo[lvl] = con[lvl].bind(con); });
  }
  if (con) ['error', 'warn'].forEach(function (lvl) {
    var orig = con[lvl];
    if (typeof orig !== 'function') return;
    con[lvl] = function () {
      orig.apply(con, arguments);
      var args = Array.prototype.slice.call(arguments);
      var err = null;
      var text = args.map(function (a) { if (isErr(a)) { err = err || a; return a.message; } return stringify(a); }).join(' ');
      var saved = echo; echo = null;   // already printed above
      try { write(lvl, 'console', text, err || ''); } finally { echo = saved; }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
