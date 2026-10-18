/*
 * Browser storage wrapper. Every access is guarded: private windows, file:// quirks or
 * blocked storage fall back to an in-memory map so the game still runs.
 */
(function (WW) {
  'use strict';

  var PREFIX = 'ww.';
  var memory = { local: {}, session: {} };

  function backend(kind) {
    try {
      var s = kind === 'session' ? window.sessionStorage : window.localStorage;
      if (!s) return null;
      var probe = PREFIX + '__probe';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return s;
    } catch (e) {
      return null;
    }
  }

  function read(kind, key, def) {
    var s = backend(kind);
    var raw;
    try {
      raw = s ? s.getItem(PREFIX + key) : memory[kind][key];
    } catch (e) {
      raw = memory[kind][key];
    }
    if (raw === null || raw === undefined) return def;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return def;
    }
  }

  function write(kind, key, value) {
    var raw = JSON.stringify(value);
    var s = backend(kind);
    try {
      if (s) s.setItem(PREFIX + key, raw);
      else memory[kind][key] = raw;
      return true;
    } catch (e) {
      memory[kind][key] = raw;
      return false;
    }
  }

  function remove(kind, key) {
    var s = backend(kind);
    try {
      if (s) s.removeItem(PREFIX + key);
    } catch (e) { /* ignore */ }
    delete memory[kind][key];
  }

  var Store = {
    available: function () { return !!backend('local'); },
    get: function (key, def) { return read('local', key, def); },
    set: function (key, value) { return write('local', key, value); },
    remove: function (key) { remove('local', key); },
    sessionGet: function (key, def) { return read('session', key, def); },
    sessionSet: function (key, value) { return write('session', key, value); },
    sessionRemove: function (key) { remove('session', key); },

    /* ---- custom levels made in the editor (pure JSON, never executed) ---- */
    customLevels: function () {
      var map = read('local', 'customLevels', {});
      return WW.U.isObj(map) ? map : {};
    },
    saveCustomLevel: function (level) {
      var map = Store.customLevels();
      map[level.id] = level;
      return write('local', 'customLevels', map);
    },
    deleteCustomLevel: function (id) {
      var map = Store.customLevels();
      delete map[id];
      write('local', 'customLevels', map);
    },

    /* ---- best result per level x difficulty ---- */
    records: function () {
      var r = read('local', 'records', {});
      return WW.U.isObj(r) ? r : {};
    },
    record: function (levelId, difficulty) {
      return Store.records()[levelId + '|' + difficulty] || null;
    },
    saveRecord: function (levelId, difficulty, rec) {
      var all = Store.records();
      var key = levelId + '|' + difficulty;
      var prev = all[key];
      if (!prev || (rec.score || 0) > (prev.score || 0)) {
        all[key] = rec;
        write('local', 'records', all);
        return true;
      }
      return false;
    },

    /* ---- in-progress run, keyed by level id so levels never share data ---- */
    loadRun: function (levelId) { return read('local', 'save.' + levelId, null); },
    saveRun: function (levelId, data) { return write('local', 'save.' + levelId, data); },
    clearRun: function (levelId) { remove('local', 'save.' + levelId); }
  };

  WW.Store = Store;
})(window.WW);
