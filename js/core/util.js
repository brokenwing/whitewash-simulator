/* Small, dependency-free helpers shared by engine, UI and editor. */
(function (WW) {
  'use strict';

  var U = {};

  U.clamp = function (v, lo, hi) {
    v = Number(v);
    if (!isFinite(v)) v = 0;
    return v < lo ? lo : v > hi ? hi : v;
  };

  U.round = function (v, digits) {
    var p = Math.pow(10, digits || 0);
    return Math.round(v * p) / p;
  };

  U.isObj = function (v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  };

  U.deepClone = function (v) {
    if (v === undefined) return undefined;
    return JSON.parse(JSON.stringify(v));
  };

  /* Objects merge recursively; arrays and primitives from `over` replace `base`. */
  U.deepMerge = function (base, over) {
    if (over === undefined) return U.deepClone(base);
    if (!U.isObj(base) || !U.isObj(over)) return U.deepClone(over);
    var out = U.deepClone(base);
    Object.keys(over).forEach(function (k) {
      var ov = over[k];
      if (ov === undefined) return;
      out[k] = U.isObj(out[k]) && U.isObj(ov) ? U.deepMerge(out[k], ov) : U.deepClone(ov);
    });
    return out;
  };

  U.get = function (obj, path, def) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return def;
      cur = cur[parts[i]];
    }
    return cur === undefined ? def : cur;
  };

  U.set = function (obj, path, value) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      var nextIsIndex = /^\d+$/.test(parts[i + 1]);
      if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = nextIsIndex ? [] : {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  };

  U.sum = function (arr, fn) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += fn ? fn(arr[i], i) : arr[i];
    return s;
  };

  U.uniq = function (arr) {
    return arr.filter(function (v, i) { return arr.indexOf(v) === i; });
  };

  /* Fill "{key}" placeholders; unknown keys are left as-is. */
  U.tpl = function (str, vars) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m;
    });
  };

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* Chinese-style big numbers: 12345 -> "1.2万" */
  U.fmtNum = function (n) {
    n = Number(n) || 0;
    var a = Math.abs(n);
    if (a >= 1e8) return U.round(n / 1e8, 1) + '亿';
    if (a >= 1e4) return U.round(n / 1e4, 1) + '万';
    return String(Math.round(n));
  };

  /* Budget is stored in 万元 (ten-thousand yuan). */
  U.fmtMoney = function (wan, unit) {
    var v = U.round(Number(wan) || 0, 1);
    return '¥' + v + (unit || '万');
  };

  U.signed = function (v, digits) {
    var r = U.round(v, digits === undefined ? 0 : digits);
    return (r > 0 ? '+' : '') + r;
  };

  /* ---------- deterministic RNG (mulberry32), serialisable state ---------- */

  U.hash = function (str) {
    str = String(str);
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };

  function Rng(seed) {
    this.s = (typeof seed === 'number' ? seed : U.hash(seed == null ? Date.now() : seed)) >>> 0;
  }
  Rng.prototype.next = function () {
    var t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.int = function (lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  };
  Rng.prototype.range = function (lo, hi) {
    return lo + this.next() * (hi - lo);
  };
  Rng.prototype.chance = function (p) {
    return this.next() < p;
  };
  Rng.prototype.pick = function (arr) {
    return arr && arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined;
  };
  Rng.prototype.weighted = function (arr, weightFn) {
    var total = 0, i, w = [];
    for (i = 0; i < arr.length; i++) {
      var x = Math.max(0, Number(weightFn ? weightFn(arr[i]) : arr[i].weight) || 0);
      w.push(x);
      total += x;
    }
    if (total <= 0) return undefined;
    var r = this.next() * total;
    for (i = 0; i < arr.length; i++) {
      r -= w[i];
      if (r < 0) return arr[i];
    }
    return arr[arr.length - 1];
  };
  Rng.prototype.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  Rng.prototype.sample = function (arr, n) {
    return this.shuffle(arr).slice(0, n);
  };

  U.Rng = Rng;
  U.rng = function (seed) { return new Rng(seed); };

  var uidCounter = 0;
  U.uid = function (prefix) {
    uidCounter += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + uidCounter.toString(36);
  };

  U.sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  /* Turn label: "第2天 下午". Two slots per day by default. */
  U.turnLabel = function (turn, slotsPerDay, labels) {
    if (labels && labels[turn - 1]) return labels[turn - 1];
    var slots = slotsPerDay === 3 ? ['上午', '下午', '深夜'] : slotsPerDay === 1 ? [''] : ['白天', '深夜'];
    var per = slots.length;
    var day = Math.floor((turn - 1) / per) + 1;
    var slot = slots[(turn - 1) % per];
    return '第' + day + '天' + (slot ? ' ' + slot : '');
  };

  WW.U = U;
})(window.WW);
