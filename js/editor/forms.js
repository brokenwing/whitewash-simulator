/*
 * Schema-driven form renderer for the level editor.
 *   WW.Forms.render(fields, ctx) -> Element
 *   ctx = { obj, root, norm, onChange(), collapsed: {} }
 * obj is the object being edited (the level or one list item); root is the raw level (for
 * dynamic option lists); norm is the normalised level (defaults filled) cached per render.
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var U = WW.U;
  var D = WW.Data;

  /* ------------------------------------------------------------------ options */

  function optionsFor(name, ctx) {
    if (Array.isArray(name)) return name;
    var norm = ctx.norm || {};
    var root = ctx.root || {};
    switch (name) {
      case 'factions': return (norm.factions || []).map(function (f) { return { value: f.id, label: f.name + '（' + f.id + '）' }; });
      case 'facts': return (root.facts || []).map(function (f) { return { value: f.id, label: (f.isTrue ? '【真】' : '【假】') + (f.text || f.id) }; });
      case 'personas': return (root.personas || []).map(function (p) { return { value: p.id, label: p.name || p.id }; });
      case 'opponents': return (root.opponents || []).map(function (o) { return { value: o.id, label: (o.avatar || '') + ' ' + (o.name || o.id) }; });
      case 'platforms': return D.platformOrder.map(function (p) { return { value: p, label: D.platforms[p].name }; });
      case 'tiers': return Object.keys(D.tiers).map(function (t) { return { value: t, label: D.tiers[t].name }; });
      case 'channels': return Object.keys(D.channels).map(function (c) { return { value: c, label: D.channels[c].name }; });
      case 'difficulties': return D.difficultyOrder.map(function (d) { return { value: d, label: D.difficulties[d].icon + ' ' + D.difficulties[d].name }; });
      case 'libraryItems': return D.itemOrder.map(function (id) { var it = D.items[id]; return { value: id, label: it.icon + ' ' + it.name + '（' + D.tierNames[it.tier] + '）' }; });
      case 'items': {
        var list = (norm.items ? norm.items.enabled : []).map(function (id) { return { value: id, label: (D.items[id] || {}).name || id }; });
        ((root.items && root.items.custom) || []).forEach(function (c) { list.push({ value: c.id, label: (c.name || c.id) + '（自定义）' }); });
        return list;
      }
      case 'abilities': {
        var ab = D.abilityOrder.map(function (id) { return { value: id, label: D.abilities[id].icon + ' ' + D.abilities[id].name }; });
        (root.abilities || []).forEach(function (a) { ab.push({ value: a.id, label: (a.icon || '⚡') + ' ' + (a.name || a.id) + '（专属）' }); });
        return ab;
      }
      case 'sideTasks': return ((root.objectives && root.objectives.side) || []).map(function (t) { return { value: t.id, label: t.title || t.id }; });
      case 'tasks': {
        var tasks = [];
        ((norm.objectives && norm.objectives.stages) || []).forEach(function (s) { s.tasks.forEach(function (t) { tasks.push({ value: t.id, label: s.title + ' · ' + t.title }); }); });
        ((norm.objectives && norm.objectives.side) || []).forEach(function (t) { tasks.push({ value: t.id, label: '支线 · ' + t.title }); });
        return tasks;
      }
      case 'stats': return Object.keys(WW.Effects.STAT_NAMES).map(function (k) { return { value: k, label: WW.Effects.STAT_NAMES[k] }; });
      default: return [];
    }
  }

  function selectEl(options, value, onChange, empty) {
    var sel = h('select', { class: 'input' });
    if (empty !== undefined) sel.appendChild(h('option', { value: '' }, empty));
    var found = false;
    options.forEach(function (o) {
      var selected = String(o.value) === String(value);
      if (selected) found = true;
      sel.appendChild(h('option', { value: String(o.value), selected: selected }, o.label));
    });
    if (!found && value !== undefined && value !== null && value !== '' && empty === undefined) sel.appendChild(h('option', { value: String(value), selected: true }, String(value) + '（不存在）'));
    sel.addEventListener('change', function () {
      var raw = sel.value;
      var match = options.filter(function (o) { return String(o.value) === raw; })[0];
      onChange(raw === '' ? null : match ? match.value : raw);
    });
    return sel;
  }

  function parseScalar(s) {
    s = String(s).trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s !== '' && !isNaN(Number(s))) return Number(s);
    return s;
  }

  /* ------------------------------------------------------------------ condition builder */

  function parseVar(v) {
    var s = String(v || '');
    var p = s.split('.');
    if (p[0] === 'faction') return { key: 'faction.', param: p.slice(1).join('.') };
    if (p[0] === 'opp' || p[0] === 'fact' || p[0] === 'task') return { key: p[0] + '.{id}.' + p.slice(2).join('.'), param: p[1] || '' };
    if (['itemUses', 'itemUsesTurn', 'flags', 'counters'].indexOf(p[0]) >= 0) return { key: p[0] + '.', param: p.slice(1).join('.') };
    return { key: s, param: '' };
  }

  function buildVar(key, param) {
    if (key.indexOf('{id}') >= 0) return key.replace('{id}', param || '');
    if (/\.$/.test(key)) return key + (param || '');
    return key;
  }

  var PARAM_SOURCE = { faction: 'factions', opponent: 'opponents', fact: 'facts', task: 'tasks', item: 'items' };

  function isBoolVar(key) {
    return /^(fact|task)\.\{id\}\./.test(key) || /\.active$/.test(key) || key === 'flags.';
  }

  function condRow(leaf, onChange, onRemove, ctx) {
    var parsed = parseVar(leaf.var);
    var entry = WW.Cond.VARS.filter(function (x) { return x.key === parsed.key; })[0];
    var row = h('div', { class: 'cond-row' });
    var varSel = selectEl(WW.Cond.VARS.map(function (x) { return { value: x.key, label: x.label }; }), parsed.key, function (k) {
      leaf.var = buildVar(k, '');
      if (k === 'difficulty') { leaf.op = '>='; leaf.value = 'regular'; }
      else if (isBoolVar(k)) { leaf.op = '=='; leaf.value = true; }
      else if (typeof leaf.value !== 'number') { leaf.value = 0; }
      onChange(true);
    });
    varSel.classList.add('grow');
    row.appendChild(varSel);
    if (entry && entry.param) {
      if (PARAM_SOURCE[entry.param]) {
        row.appendChild(selectEl(optionsFor(PARAM_SOURCE[entry.param], ctx), parsed.param, function (id) { leaf.var = buildVar(parsed.key, id); onChange(); }, '（选择）'));
      } else {
        var pin = h('input', { class: 'input', value: parsed.param, placeholder: entry.param === 'counter' ? 'violations' : '标记名' });
        pin.addEventListener('change', function () { leaf.var = buildVar(parsed.key, pin.value.trim()); onChange(); });
        row.appendChild(pin);
      }
    }
    row.appendChild(selectEl(WW.Cond.OPS.map(function (o) { return { value: o, label: o }; }), leaf.op || '>=', function (op) { leaf.op = op; onChange(); }));
    if (parsed.key === 'difficulty') {
      row.appendChild(selectEl(optionsFor('difficulties', ctx), leaf.value, function (v) { leaf.value = v; onChange(); }));
    } else {
      var val = h('input', { class: 'input', value: leaf.value === undefined ? '' : String(leaf.value), style: { width: '90px' } });
      val.addEventListener('change', function () { leaf.value = parseScalar(val.value); onChange(); });
      row.appendChild(val);
    }
    row.appendChild(h('button', { class: 'icon-btn', title: '删除条件', type: 'button', on: { click: onRemove } }, '✕'));
    return row;
  }

  function isLeaf(c) { return c && c.var !== undefined; }

  function condEditor(get, set, ctx) {
    var box = h('div', { class: 'cond-box' });
    var render = function () {
      var c = get();
      var mode = c === null || c === undefined ? 'none' : isLeaf(c) ? 'all' : c.all && c.all.every(isLeaf) ? 'all' : c.any && c.any.every(isLeaf) ? 'any' : 'json';
      var leaves = mode === 'all' ? (isLeaf(c) ? [c] : c.all) : mode === 'any' ? c.any : [];
      var commit = function (rerender) {
        var out = mode === 'none' ? null : leaves.length === 0 ? null : leaves.length === 1 && mode === 'all' ? leaves[0] : mode === 'all' ? { all: leaves } : { any: leaves };
        set(out);
        if (rerender) render();
        else desc.textContent = WW.Cond.describe(out, ctx.norm);
      };
      var modeSel = selectEl([{ value: 'none', label: '无条件' }, { value: 'all', label: '全部满足' }, { value: 'any', label: '任一满足' }, { value: 'json', label: '高级（JSON）' }], mode, function (m) {
        if (m === 'none') set(null);
        else if (m === 'json') { set(get() || { all: [] }); jsonMode = true; }
        else {
          var ls = leaves.length ? leaves : [{ var: 'stats.heat', op: '<=', value: 50 }];
          set(m === 'all' ? (ls.length === 1 ? ls[0] : { all: ls }) : { any: ls });
        }
        render();
      });
      var desc = h('div', { class: 'cond-desc' }, WW.Cond.describe(c, ctx.norm));
      WW.DOM.replace(box, h('div', { class: 'cond-row' }, modeSel, h('span', { class: 'spacer' }), desc));
      if (mode === 'json' || jsonMode) {
        jsonMode = false;
        box.appendChild(jsonEditor(get, set, 4));
        return;
      }
      leaves.forEach(function (leaf, i) {
        box.appendChild(condRow(leaf, commit, function () { leaves.splice(i, 1); commit(true); }, ctx));
      });
      if (mode !== 'none') {
        box.appendChild(h('div', null, h('button', { class: 'btn small ghost', type: 'button', on: { click: function () { leaves.push({ var: 'stats.sentiment', op: '>=', value: 0 }); commit(true); } } }, '+ 添加条件')));
      }
    };
    var jsonMode = false;
    render();
    return box;
  }

  /* ------------------------------------------------------------------ effects builder */

  var EFFECT_TYPES = Object.keys(WW.Effects.TYPES).map(function (t) { return { value: t, label: WW.Effects.TYPES[t].label }; });

  function numInput(obj, key, onChange, w) {
    var el = h('input', { class: 'input', type: 'number', value: obj[key] === undefined || obj[key] === null ? '' : obj[key], style: { width: (w || 80) + 'px' } });
    el.addEventListener('change', function () { obj[key] = el.value === '' ? undefined : Number(el.value); onChange(); });
    return el;
  }
  function textInput(obj, key, onChange, ph, grow) {
    var el = h('input', { class: 'input' + (grow ? ' grow' : ''), value: obj[key] || '', placeholder: ph || '' });
    el.addEventListener('change', function () { obj[key] = el.value; onChange(); });
    return el;
  }
  function boolInput(obj, key, label, onChange) {
    var cb = h('input', { type: 'checkbox', checked: !!obj[key] });
    cb.addEventListener('change', function () { obj[key] = cb.checked; onChange(); });
    return h('label', { class: 'check small' }, cb, label);
  }
  function multiSelect(options, values, onChange) {
    var vs = (values || []).slice();
    return h('div', { class: 'checks' }, options.map(function (o) {
      var cb = h('input', { type: 'checkbox', checked: vs.indexOf(o.value) >= 0 });
      cb.addEventListener('change', function () {
        var i = vs.indexOf(o.value);
        if (cb.checked && i < 0) vs.push(o.value);
        if (!cb.checked && i >= 0) vs.splice(i, 1);
        onChange(vs.slice());
      });
      return h('label', null, cb, o.label);
    }));
  }

  function effectRow(e, onChange, onRemove, ctx) {
    var row = h('div', { class: 'eff-row' });
    var typeSel = selectEl(EFFECT_TYPES, e.type, function (t) {
      Object.keys(e).forEach(function (k) { delete e[k]; });
      e.type = t;
      onChange(true);
    });
    row.appendChild(typeSel);
    var sel = function (key, src, empty) { return selectEl(optionsFor(src, ctx), e[key], function (v) { e[key] = v; onChange(); }, empty); };
    switch (e.type) {
      case 'stat': row.appendChild(sel('stat', 'stats')); row.appendChild(numInput(e, 'delta', onChange)); break;
      case 'faction': row.appendChild(sel('faction', 'factions')); row.appendChild(numInput(e, 'delta', onChange)); break;
      case 'budget': case 'score': row.appendChild(numInput(e, 'delta', onChange)); break;
      case 'ap': row.appendChild(numInput(e, 'delta', onChange)); row.appendChild(boolInput(e, 'permanent', '永久', onChange)); break;
      case 'unlock':
        row.appendChild(selectEl([{ value: 2, label: '解锁进阶' }, { value: 3, label: '解锁高阶' }], e.tier, function (v) { e.tier = v; onChange(); }, '（不按层级）'));
        row.appendChild(h('div', { class: 'grow' }, multiSelect(optionsFor('items', ctx), e.items, function (v) { e.items = v; onChange(); })));
        break;
      case 'lockItem': row.appendChild(h('div', { class: 'grow' }, multiSelect(optionsFor('items', ctx), e.items, function (v) { e.items = v; onChange(); }))); row.appendChild(numInput(e, 'turns', onChange, 60)); break;
      case 'voucher': row.appendChild(sel('item', 'items')); row.appendChild(numInput(e, 'count', onChange, 60)); break;
      case 'posts':
        row.appendChild(numInput(e, 'count', onChange, 60));
        row.appendChild(selectEl(WW.EditorFields.STANCES, e.stance === undefined ? -1 : e.stance, function (v) { e.stance = v; onChange(); }));
        row.appendChild(textInput(e, 'hint', onChange, '让 AI 写什么（离线时也会用到）', true));
        row.appendChild(sel('fact', 'facts', '（不关联事实）'));
        row.appendChild(sel('tier', 'tiers', '（默认素人）'));
        row.appendChild(sel('platform', 'platforms', '（随机平台）'));
        break;
      case 'reveal': row.appendChild(sel('fact', 'facts')); break;
      case 'addFact':
        e.fact = e.fact || { text: '', isTrue: true, weight: 1 };
        row.appendChild(textInput(e.fact, 'text', onChange, '新事实内容', true));
        row.appendChild(boolInput(e.fact, 'isTrue', '属实', onChange));
        row.appendChild(boolInput(e.fact, 'regulatory', '违规把柄', onChange));
        break;
      case 'opponent':
        row.appendChild(sel('opp', 'opponents'));
        row.appendChild(h('span', { class: 'small muted' }, '势力'), numInput(e, 'strength', onChange, 60));
        row.appendChild(h('span', { class: 'small muted' }, '士气'), numInput(e, 'morale', onChange, 60));
        row.appendChild(h('span', { class: 'small muted' }, '资源'), numInput(e, 'resources', onChange, 60));
        break;
      case 'offerTask': row.appendChild(sel('task', 'sideTasks')); break;
      case 'message':
        row.appendChild(selectEl([{ value: 'client', label: '客户巨信' }, { value: 'system', label: '系统' }, { value: 'news', label: '新闻' }], e.from || 'system', function (v) { e.from = v; onChange(); }));
        row.appendChild(textInput(e, 'text', onChange, '消息内容，可用 {client} {contact} {kw}', true));
        break;
      case 'headline':
        row.appendChild(textInput(e, 'text', onChange, '热搜词条', true));
        row.appendChild(numInput(e, 'heat', onChange, 60));
        row.appendChild(selectEl([{ value: '爆', label: '爆' }, { value: '热', label: '热' }, { value: '新', label: '新' }], e.tag, function (v) { e.tag = v; onChange(); }, '（无标签）'));
        break;
      case 'flag': row.appendChild(textInput(e, 'name', onChange, '标记名')); break;
      case 'modifier': row.appendChild(sel('stat', 'stats')); row.appendChild(h('span', { class: 'small muted' }, '每回合'), numInput(e, 'delta', onChange, 60)); row.appendChild(h('span', { class: 'small muted' }, '回合数'), numInput(e, 'turns', onChange, 60)); break;
      case 'end':
        row.appendChild(selectEl([{ value: 'win', label: '胜利' }, { value: 'lose', label: '失败' }], e.result || 'lose', function (v) { e.result = v; onChange(); }));
        row.appendChild(textInput(e, 'title', onChange, '标题'));
        row.appendChild(textInput(e, 'text', onChange, '说明', true));
        break;
      case 'chance':
      case 'if': {
        if (e.type === 'chance') row.appendChild(h('span', { class: 'small muted' }, '概率'), numInput(e, 'p', onChange, 70));
        var nested = h('div', { class: 'eff-nested' });
        if (e.type === 'if') nested.appendChild(condEditor(function () { return e.cond; }, function (v) { e.cond = v; onChange(); }, ctx));
        nested.appendChild(h('div', { class: 'small muted' }, e.type === 'chance' ? '命中时：' : '满足时：'));
        nested.appendChild(effectsEditor(function () { return e.then || (e.then = []); }, function (v) { e.then = v; onChange(); }, ctx));
        nested.appendChild(h('div', { class: 'small muted' }, '否则：'));
        nested.appendChild(effectsEditor(function () { return e['else'] || (e['else'] = []); }, function (v) { e['else'] = v; onChange(); }, ctx));
        row.appendChild(nested);
        break;
      }
      default: break;
    }
    row.appendChild(h('button', { class: 'icon-btn', title: '删除效果', type: 'button', on: { click: onRemove } }, '✕'));
    return row;
  }

  function effectsEditor(get, set, ctx) {
    var box = h('div', { class: 'eff-box' });
    var render = function () {
      var list = get() || [];
      if (!Array.isArray(list)) list = [];
      var commit = function (rerender) { set(list); if (rerender) render(); };
      WW.DOM.replace(box, list.map(function (e, i) {
        return effectRow(e, commit, function () { list.splice(i, 1); commit(true); }, ctx);
      }), h('div', null, h('button', { class: 'btn small ghost', type: 'button', on: { click: function () { list.push({ type: 'stat', stat: 'heat', delta: -5 }); commit(true); } } }, '+ 添加效果')));
    };
    render();
    return box;
  }

  /* ------------------------------------------------------------------ simple editors */

  function jsonEditor(get, set, rows) {
    var ta = h('textarea', { class: 'input', rows: rows || 5, style: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px' } });
    var v = get();
    ta.value = v === undefined || v === null ? '' : JSON.stringify(v, null, 2);
    var err = h('div', { class: 'tiny', style: { color: 'var(--crit-ink)' } });
    ta.addEventListener('change', function () {
      var t = ta.value.trim();
      if (!t) { set(undefined); err.textContent = ''; return; }
      try { set(JSON.parse(t)); err.textContent = ''; } catch (e) { err.textContent = 'JSON 格式错误：' + e.message; }
    });
    return h('div', null, ta, err);
  }

  function sensEditor(get, set) {
    var sens = get() || {};
    return h('div', { class: 'sens-grid' }, D.channelOrder.map(function (c) {
      var inp = h('input', { class: 'input', type: 'number', step: 0.1, value: sens[c] === undefined ? '' : sens[c], placeholder: '默认' });
      inp.addEventListener('change', function () {
        var cur = get() || {};
        if (inp.value === '') delete cur[c]; else cur[c] = Number(inp.value);
        set(cur);
      });
      return h('label', null, D.channels[c].name, inp);
    }));
  }

  function condMapEditor(get, set, src, ctx) {
    var box = h('div', { class: 'col' });
    var render = function () {
      var map = get() || {};
      var ids = Object.keys(map);
      WW.DOM.replace(box, ids.map(function (id) {
        return h('div', { class: 'f-group' },
          h('div', { class: 'f-title' }, (optionsFor(src, ctx).filter(function (o) { return o.value === id; })[0] || { label: id }).label, h('span', { class: 'spacer' }),
            h('button', { class: 'icon-btn', type: 'button', on: { click: function () { var m = get() || {}; delete m[id]; set(m); render(); } } }, '✕')),
          condEditor(function () { return (get() || {})[id]; }, function (v) { var m = get() || {}; m[id] = v; set(m); }, ctx));
      }), h('div', { class: 'row' }, selectEl(optionsFor(src, ctx).filter(function (o) { return ids.indexOf(o.value) < 0; }), '', function (v) {
        if (!v) return;
        var m = get() || {};
        m[v] = { var: 'turn', op: '>=', value: 2 };
        set(m);
        render();
      }, '+ 为某个技能添加解锁条件')));
    };
    render();
    return box;
  }

  function offerEditor(get, set, ctx) {
    var box = h('div', { class: 'col' });
    var render = function () {
      var v = get();
      var atStart = v === undefined || v === null || v === 'start';
      var cb = h('input', { type: 'checkbox', checked: atStart });
      cb.addEventListener('change', function () { set(cb.checked ? 'start' : { var: 'turn', op: '>=', value: 3 }); render(); });
      WW.DOM.replace(box, h('label', { class: 'check small' }, cb, '开局发放'),
        atStart ? null : condEditor(function () { return get(); }, function (c) { set(c); }, ctx));
    };
    render();
    return box;
  }

  /* ------------------------------------------------------------------ main renderer */

  function render(fields, ctx) {
    var grid = h('div', { class: 'f-grid' });
    fields.forEach(function (f) {
      var el = renderField(f, ctx);
      if (el) grid.appendChild(el);
    });
    return grid;
  }

  function wrap(f, control) {
    return h('div', { class: 'field' + (f.full ? ' f-full' : '') },
      f.type === 'bool' ? null : h('label', null, f.label),
      control,
      f.help ? h('div', { class: 'f-help' }, f.help) : null);
  }

  function renderField(f, ctx) {
    var obj = ctx.obj;
    var get = function () { return U.get(obj, f.key); };
    var set = function (v) {
      if (v === undefined) {
        var parts = f.key.split('.');
        var parent = parts.length > 1 ? U.get(obj, parts.slice(0, -1).join('.')) : obj;
        if (parent) delete parent[parts[parts.length - 1]];
      } else U.set(obj, f.key, v);
      ctx.onChange();
    };
    var v = get();
    switch (f.type) {
      case 'text': {
        var t = h('input', { class: 'input', value: v === undefined || v === null ? '' : String(v) });
        t.addEventListener('change', function () { set(t.value); });
        return wrap(f, t);
      }
      case 'textarea': {
        var ta = h('textarea', { class: 'input', rows: f.rows || 3 });
        ta.value = v || '';
        ta.addEventListener('change', function () { set(ta.value); });
        return wrap(f, ta);
      }
      case 'number': {
        var n = h('input', { class: 'input', type: 'number', step: f.step || 1, min: f.min, max: f.max, value: v === undefined || v === null ? '' : v });
        n.addEventListener('change', function () { set(n.value === '' ? undefined : Number(n.value)); });
        return wrap(f, n);
      }
      case 'bool': {
        var cur = v === undefined ? f.def === true : !!v;
        var cb = h('input', { type: 'checkbox', checked: cur });
        cb.addEventListener('change', function () { set(cb.checked); });
        return h('div', { class: 'field' + (f.full ? ' f-full' : '') }, h('label', { class: 'check' }, cb, f.label));
      }
      case 'select': {
        var normVal = v;
        return wrap(f, selectEl(optionsFor(f.options, ctx), normVal === undefined || normVal === null ? '' : normVal, function (val) { set(val === null ? undefined : val); }, f.empty !== undefined ? f.empty : undefined));
      }
      case 'multi': {
        var cur2 = v;
        if (cur2 === undefined || cur2 === null) cur2 = f.key === 'platforms' ? (ctx.norm.platforms || []) : f.key === 'difficulty.allowed' ? (ctx.norm.difficulty ? ctx.norm.difficulty.allowed : []) : f.key === 'items.enabled' ? (ctx.norm.items ? ctx.norm.items.enabled : []) : [];
        return wrap(f, multiSelect(optionsFor(f.options, ctx), cur2, function (vals) { set(vals); }));
      }
      case 'tags': {
        var tg = h('input', { class: 'input', value: (v || []).join('，'), placeholder: '用逗号分隔' });
        tg.addEventListener('change', function () { set(tg.value.split(/[,，、]/).map(function (s) { return s.trim(); }).filter(Boolean)); });
        return wrap(f, tg);
      }
      case 'lines': {
        var ln = h('textarea', { class: 'input', rows: 3, placeholder: '每行一条' });
        ln.value = (v || []).map(function (x) { return typeof x === 'string' ? x : x.content || JSON.stringify(x); }).join('\n');
        ln.addEventListener('change', function () { set(ln.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)); });
        return wrap(f, ln);
      }
      case 'json': return wrap(f, jsonEditor(get, set, f.rows));
      case 'sens': return wrap(f, sensEditor(get, function (val) { set(val); }));
      case 'cond': return wrap(f, condEditor(get, set, ctx));
      case 'effects': return wrap(f, effectsEditor(get, set, ctx));
      case 'condMap': return wrap(f, condMapEditor(get, set, f.options, ctx));
      case 'offer': return wrap(f, offerEditor(get, set, ctx));
      case 'object': {
        var present = v !== undefined && v !== null;
        var group = h('div', { class: 'f-group f-full' });
        var title = h('div', { class: 'f-title' }, f.label);
        group.appendChild(title);
        if (f.optional) {
          var tog = h('input', { type: 'checkbox', checked: present });
          tog.addEventListener('change', function () {
            set(tog.checked ? f.newValue() : undefined);
            ctx.rerender();
          });
          title.appendChild(h('label', { class: 'check small' }, tog, '启用'));
          if (!present) return group;
        }
        if (!present) U.set(obj, f.key, {});
        group.appendChild(render(f.fields, { obj: U.get(obj, f.key), root: ctx.root, norm: ctx.norm, onChange: ctx.onChange, rerender: ctx.rerender, collapsed: ctx.collapsed }));
        return group;
      }
      case 'list': return listField(f, ctx);
      default: return null;
    }
  }

  function listField(f, ctx) {
    var obj = ctx.obj;
    var group = h('div', { class: 'f-group f-full' });
    var list = U.get(obj, f.key);
    var title = h('div', { class: 'f-title' }, f.label, h('span', { class: 'chip' }, String(Array.isArray(list) ? list.length : 0)));
    group.appendChild(title);
    if (!Array.isArray(list)) {
      if (f.defaultsFrom) {
        group.appendChild(h('div', { class: 'row wrap' }, h('span', { class: 'small muted' }, '当前使用引擎默认值。'),
          h('button', { class: 'btn small', type: 'button', on: { click: function () { U.set(obj, f.key, f.defaultsFrom(ctx.root)); ctx.onChange(); ctx.rerender(); } } }, '载入默认值以便编辑'),
          h('button', { class: 'btn small ghost', type: 'button', on: { click: function () { U.set(obj, f.key, []); ctx.onChange(); ctx.rerender(); } } }, '从空白开始')));
        return group;
      }
      list = [];
      U.set(obj, f.key, list);
    }
    var listEl = h('div', { class: 'f-list' });
    list.forEach(function (item, i) {
      var cKey = (ctx.pathPrefix || '') + f.key + '.' + i;
      var collapsed = ctx.collapsed[cKey] !== false;
      var body = h('div', { class: 'f-item-b' });
      var titleEl = h('span', { class: 't' }, f.itemTitle ? f.itemTitle(item, i) : '#' + (i + 1));
      var card = h('div', { class: 'f-item' + (collapsed ? ' collapsed' : '') },
        h('div', { class: 'f-item-h', on: { click: function (e) {
          if (e.target.closest('button')) return;
          ctx.collapsed[cKey] = !card.classList.contains('collapsed') ? true : false;
          card.classList.toggle('collapsed');
          if (!card.classList.contains('collapsed') && !body.firstChild) fill();
        } } },
          h('span', { class: 'muted small' }, '#' + (i + 1)), titleEl,
          h('button', { class: 'icon-btn', title: '上移', type: 'button', disabled: i === 0, on: { click: function () { list.splice(i - 1, 0, list.splice(i, 1)[0]); ctx.onChange(); ctx.rerender(); } } }, '↑'),
          h('button', { class: 'icon-btn', title: '下移', type: 'button', disabled: i === list.length - 1, on: { click: function () { list.splice(i + 1, 0, list.splice(i, 1)[0]); ctx.onChange(); ctx.rerender(); } } }, '↓'),
          h('button', { class: 'icon-btn', title: '复制', type: 'button', on: { click: function () { var copy = U.deepClone(item); if (copy.id) copy.id = copy.id + '_copy'; list.splice(i + 1, 0, copy); ctx.onChange(); ctx.rerender(); } } }, '⧉'),
          h('button', { class: 'icon-btn', title: '删除', type: 'button', on: { click: function () { list.splice(i, 1); ctx.onChange(); ctx.rerender(); } } }, '🗑')),
        body);
      var fill = function () {
        WW.DOM.replace(body, render(f.fields, {
          obj: item, root: ctx.root, norm: ctx.norm, collapsed: ctx.collapsed, pathPrefix: cKey + '.', rerender: ctx.rerender,
          onChange: function () { titleEl.textContent = f.itemTitle ? f.itemTitle(item, i) : '#' + (i + 1); ctx.onChange(); }
        }));
      };
      if (!collapsed) fill();
      listEl.appendChild(card);
    });
    group.appendChild(listEl);
    group.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } },
      h('button', { class: 'btn small', type: 'button', on: { click: function () {
        list.push(f.newItem ? f.newItem(ctx.root) : {});
        ctx.collapsed[(ctx.pathPrefix || '') + f.key + '.' + (list.length - 1)] = false;
        ctx.onChange();
        ctx.rerender();
      } } }, '+ 添加'),
      f.extra ? f.extra(ctx) : null));
    return group;
  }

  WW.Forms = { render: render, condEditor: condEditor, effectsEditor: effectsEditor, optionsFor: optionsFor };
})(window.WW);
