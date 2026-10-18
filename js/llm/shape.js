/*
 * Tiny output-shape helper for AI tasks.
 *   S.obj({ ... }), S.arr(item, max), S.str(def, maxLen), S.int(min, max, def), S.num(min, max, def),
 *   S.bool(def), S.enumOf(values, def)
 * toJSONSchema(): strict JSON Schema for structured outputs (every object additionalProperties:false,
 *   every key required; numeric ranges are NOT sent — the API does not support them).
 * coerce(): validates AI output, fills defaults and clamps ranges locally.
 * describe(): compact Chinese description for providers without schema enforcement.
 */
(function (WW) {
  'use strict';

  var U = WW.U;

  var S = {
    str: function (def, max) { return { t: 'str', def: def === undefined ? '' : def, max: max || 4000 }; },
    int: function (min, max, def) { return { t: 'int', min: min, max: max, def: def === undefined ? min : def }; },
    num: function (min, max, def) { return { t: 'num', min: min, max: max, def: def === undefined ? min : def }; },
    bool: function (def) { return { t: 'bool', def: !!def }; },
    enumOf: function (values, def) { return { t: 'enum', values: values, def: def === undefined ? values[0] : def }; },
    arr: function (item, max) { return { t: 'arr', item: item, max: max || 50 }; },
    obj: function (props) { return { t: 'obj', props: props }; }
  };

  S.toJSONSchema = function (shape) {
    switch (shape.t) {
      case 'str': return { type: 'string' };
      case 'int': return { type: 'integer' };
      case 'num': return { type: 'number' };
      case 'bool': return { type: 'boolean' };
      case 'enum': return { type: 'string', enum: shape.values.slice() };
      case 'arr': return { type: 'array', items: S.toJSONSchema(shape.item) };
      case 'obj': {
        var props = {};
        Object.keys(shape.props).forEach(function (k) { props[k] = S.toJSONSchema(shape.props[k]); });
        return { type: 'object', properties: props, required: Object.keys(shape.props), additionalProperties: false };
      }
      default: return {};
    }
  };

  S.coerce = function (shape, v) {
    switch (shape.t) {
      case 'str': {
        if (v === null || v === undefined) return shape.def;
        var s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return s.slice(0, shape.max);
      }
      case 'int': {
        var n = Math.round(Number(v));
        if (!isFinite(n)) n = shape.def;
        return U.clamp(n, shape.min, shape.max);
      }
      case 'num': {
        var x = Number(v);
        if (!isFinite(x)) x = shape.def;
        return U.clamp(x, shape.min, shape.max);
      }
      case 'bool':
        if (typeof v === 'string') return /^(true|1|yes|是)$/i.test(v.trim());
        return v === undefined || v === null ? shape.def : !!v;
      case 'enum':
        return shape.values.indexOf(v) >= 0 ? v : shape.def;
      case 'arr': {
        var list = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
        return list.slice(0, shape.max).map(function (x) { return S.coerce(shape.item, x); });
      }
      case 'obj': {
        var src = U.isObj(v) ? v : {};
        var out = {};
        Object.keys(shape.props).forEach(function (k) { out[k] = S.coerce(shape.props[k], src[k]); });
        return out;
      }
      default: return v;
    }
  };

  S.describe = function (shape) {
    switch (shape.t) {
      case 'str': return '"字符串"';
      case 'int': return '整数(' + shape.min + '~' + shape.max + ')';
      case 'num': return '数字(' + shape.min + '~' + shape.max + ')';
      case 'bool': return 'true/false';
      case 'enum': return shape.values.map(function (x) { return '"' + x + '"'; }).join('|');
      case 'arr': return '[' + S.describe(shape.item) + ', ...]';
      case 'obj':
        return '{' + Object.keys(shape.props).map(function (k) { return '"' + k + '": ' + S.describe(shape.props[k]); }).join(', ') + '}';
      default: return '?';
    }
  };

  WW.Shape = S;
})(window.WW);
