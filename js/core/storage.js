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

  /* all keys (without PREFIX) currently stored under `kind` */
  function keys(kind) {
    var s = backend(kind);
    var out = [];
    try {
      if (s) {
        for (var i = 0; i < s.length; i++) {
          var k = s.key(i);
          if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
        }
        return out;
      }
    } catch (e) { /* fall through */ }
    return Object.keys(memory[kind]);
  }

  /* ---- runs (每局一份存档): index 'runs' = [meta], body 'run.<id>' = serialized game + extras ---- */
  var FINISHED_CAP = 30;
  var migrated = false;

  function runIndex() {
    var list = read('local', 'runs', []);
    return Array.isArray(list) ? list.filter(function (m) { return m && m.id; }) : [];
  }

  function metaFrom(id, data, prev, extra) {
    var st = (data && data.state) || {};
    var f = st.final || {};
    var now = Date.now();
    var m = {
      id: id, levelId: st.levelId || (data && data.levelId) || (prev && prev.levelId) || '',
      levelTitle: '', cover: '', turns: 0,
      difficulty: st.difficulty || '', turn: st.turn || 0, finished: !!st.finished, result: st.result || null,
      grade: f.grade || '', score: f.score !== undefined ? f.score : null,
      createdAt: prev ? prev.createdAt : now, updatedAt: now,
      starred: prev ? !!prev.starred : false, hasStory: !!(data && data.story)
    };
    if (prev) ['levelTitle', 'cover', 'turns'].forEach(function (k) { if (prev[k]) m[k] = prev[k]; });
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k] !== undefined) m[k] = extra[k]; });
    return m;
  }

  /* oldest finished, un-starred runs first; never `keepId` */
  function pruneCandidates(list, keepId) {
    return list.filter(function (m) { return m.finished && !m.starred && m.id !== keepId; })
      .sort(function (a, b) { return (a.updatedAt || 0) - (b.updatedAt || 0); });
  }

  function dropRun(list, id) {
    remove('local', 'run.' + id);
    return list.filter(function (m) { return m.id !== id; });
  }

  /* move pre-multi-save data ('save.<levelId>') into runs; the old key is removed only once the copy is stored */
  function migrate() {
    if (migrated) return;
    migrated = true;
    var list = runIndex();
    var changed = false;
    keys('local').forEach(function (k) {
      if (k.indexOf('save.') !== 0) return;
      var data = read('local', k, null);
      if (!data || !data.state) { remove('local', k); return; }
      var id = WW.U.uid('run');
      if (!write('local', 'run.' + id, data)) return;
      var m = metaFrom(id, data, null, { levelId: data.state.levelId || k.slice(5) });
      m.createdAt = m.updatedAt = data.savedAt || Date.now();
      list.push(m);
      if (!write('local', 'runs', list)) { list.pop(); remove('local', 'run.' + id); return; }
      remove('local', k);
      changed = true;
    });
    return changed;
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

    /* ---- runs: every game started is its own save; finished games stay as records ---- */
    /* newest first */
    runs: function () {
      migrate();
      return runIndex().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    },
    runsOf: function (levelId, unfinishedOnly) {
      return Store.runs().filter(function (m) { return m.levelId === levelId && (!unfinishedOnly || !m.finished); });
    },
    runMeta: function (id) {
      return Store.runs().filter(function (m) { return m.id === id; })[0] || null;
    },
    loadRunById: function (id) { return read('local', 'run.' + id, null); },
    /*
     * Store a run body and refresh its index entry (`meta` adds levelTitle / cover / turns).
     * When storage is full, the oldest finished un-starred runs are deleted until it fits.
     * -> { ok, pruned: [meta] }
     */
    saveRunById: function (id, data, meta) {
      migrate();
      var list = runIndex();
      var prev = list.filter(function (m) { return m.id === id; })[0] || null;
      var pruned = [];
      var ok = write('local', 'run.' + id, data);
      while (!ok) {
        var victim = pruneCandidates(list, id)[0];
        if (!victim) break;
        list = dropRun(list, victim.id);
        pruned.push(victim);
        ok = write('local', 'run.' + id, data);
      }
      if (!ok) {
        write('local', 'runs', list);
        return { ok: false, pruned: pruned };
      }
      var m = metaFrom(id, data, prev, meta);
      list = list.filter(function (x) { return x.id !== id; });
      list.push(m);
      if (m.finished) {
        var extra = pruneCandidates(list, id);
        var over = list.filter(function (x) { return x.finished; }).length - FINISHED_CAP;
        for (var i = 0; i < over && i < extra.length; i++) {
          list = dropRun(list, extra[i].id);
          pruned.push(extra[i]);
        }
      }
      while (!write('local', 'runs', list)) {
        var v2 = pruneCandidates(list, id)[0];
        if (!v2) break;
        list = dropRun(list, v2.id);
        pruned.push(v2);
      }
      return { ok: true, pruned: pruned };
    },
    /* merge top-level fields (ending, story ...) into a stored run */
    patchRun: function (id, fields) {
      var data = Store.loadRunById(id);
      if (!data) return { ok: false, pruned: [] };
      Object.keys(fields).forEach(function (k) { data[k] = fields[k]; });
      var prev = Store.runMeta(id);
      return Store.saveRunById(id, data, prev ? { updatedAt: prev.updatedAt } : null);
    },
    deleteRun: function (id) {
      write('local', 'runs', dropRun(runIndex(), id));
    },
    starRun: function (id, on) {
      var list = runIndex();
      list.forEach(function (m) { if (m.id === id) m.starred = !!on; });
      write('local', 'runs', list);
    },
    FINISHED_CAP: FINISHED_CAP
  };

  WW.Store = Store;
})(window.WW);
