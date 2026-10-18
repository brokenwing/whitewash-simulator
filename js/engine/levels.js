/*
 * Level registry. Built-in levels are classic scripts listed in levels/manifest.js; each file only
 * calls WW.Levels.register({...pure JSON...}). Custom levels come from the editor (browser storage)
 * or from imported JSON files and are never executed as code.
 */
(function (WW) {
  'use strict';

  var builtin = {};
  var loaded = {};

  function register(level) {
    if (!level || !level.id) throw new Error('关卡缺少 id');
    builtin[level.id] = level;
  }

  function sortKey(l) { return (l.meta && l.meta.order !== undefined ? l.meta.order : 99) * 1000 + String(l.id).length; }

  function list() {
    var out = [];
    Object.keys(builtin).forEach(function (id) { out.push({ id: id, source: 'builtin', level: builtin[id] }); });
    var custom = WW.Store ? WW.Store.customLevels() : {};
    Object.keys(custom).forEach(function (id) {
      if (builtin[id]) return;
      out.push({ id: id, source: 'custom', level: custom[id] });
    });
    out.sort(function (a, b) {
      if (a.source !== b.source) return a.source === 'builtin' ? -1 : 1;
      return sortKey(a.level) - sortKey(b.level);
    });
    return out;
  }

  function get(id) {
    if (builtin[id]) return builtin[id];
    var custom = WW.Store ? WW.Store.customLevels() : {};
    return custom[id] || null;
  }

  function isBuiltin(id) { return !!builtin[id]; }

  /* Inject <script> tags for the manifest (works on file://). */
  function loadBuiltins(base) {
    base = base || 'levels/';
    var files = (WW.Levels.manifest || []).filter(function (f) { return !loaded[f]; });
    return Promise.all(files.map(function (f) {
      return new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = base + f;
        s.onload = function () { loaded[f] = true; resolve(true); };
        s.onerror = function () {
          if (typeof console !== 'undefined') console.error('[WW] 关卡文件加载失败：' + f);
          resolve(false);
        };
        document.head.appendChild(s);
      });
    }));
  }

  /* Parse an imported JSON level. Accepts raw JSON or the exported `WW.Levels.register({...});` wrapper. */
  function parseImport(text) {
    var t = String(text || '').trim();
    var m = t.match(/^WW\.Levels\.register\(([\s\S]*)\);?\s*$/);
    if (m) t = m[1];
    var data = JSON.parse(t);
    var v = WW.Schema.validate(data);
    return { level: data, validation: v };
  }

  function toScript(level) {
    return '/* 关卡文件：放入 levels/ 目录，并把文件名加到 levels/manifest.js */\nWW.Levels.register(' + JSON.stringify(level, null, 2) + ');\n';
  }

  WW.Levels = {
    manifest: (WW.Levels && WW.Levels.manifest) || [],
    register: register,
    list: list,
    get: get,
    isBuiltin: isBuiltin,
    loadBuiltins: loadBuiltins,
    parseImport: parseImport,
    toScript: toScript
  };
})(window.WW);
