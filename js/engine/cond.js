/*
 * Condition DSL (条件 DSL).
 *   leaf:  { "var": "stats.heat", "op": "<=", "value": 60 }
 *   group: { "all": [cond, ...] } | { "any": [cond, ...] } | { "not": cond }
 * An empty / missing condition is always true.
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var OPS = ['<', '<=', '>', '>=', '==', '!='];

  /* Catalog used by the editor and by describe(). `param` marks vars with an id segment. */
  var VARS = [
    { key: 'stats.sentiment', label: '舆论好感' },
    { key: 'stats.heat', label: '事件热度' },
    { key: 'stats.credibility', label: '公信力' },
    { key: 'stats.exposure', label: '暴露度' },
    { key: 'stats.satisfaction', label: '客户满意度' },
    { key: 'budget', label: '预算' },
    { key: 'ap', label: '剩余行动点' },
    { key: 'turn', label: '回合' },
    { key: 'turnsLeft', label: '剩余回合' },
    { key: 'difficulty', label: '难度档位(' + (WW.Data.difficultyOrder || []).map(function (id, i) { return i + ' ' + WW.Data.difficulties[id].name; }).join(' / ') + ')' },
    { key: 'phase', label: '舆情阶段(0平息-3爆发)' },
    { key: 'trend.rank', label: '热搜排名' },
    { key: 'lieDebt', label: '谎言债' },
    { key: 'progress', label: '主任务推进度(0-1)' },
    { key: 'stage', label: '已完成阶段数' },
    { key: 'result', label: '结局(win/lose，结案前为空)' },
    { key: 'posts.negative', label: '可见负面帖数' },
    { key: 'posts.positive', label: '可见正面帖数' },
    { key: 'posts.deleted', label: '累计删帖数' },
    { key: 'faction.', label: '阵营好感', param: 'faction' },
    { key: 'opp.{id}.morale', label: '对手士气', param: 'opponent' },
    { key: 'opp.{id}.strength', label: '对手势力', param: 'opponent' },
    { key: 'opp.{id}.active', label: '对手仍在场', param: 'opponent' },
    { key: 'fact.{id}.revealed', label: '事实已曝光', param: 'fact' },
    { key: 'fact.{id}.admitted', label: '事实已承认', param: 'fact' },
    { key: 'fact.{id}.denied', label: '事实被否认', param: 'fact' },
    { key: 'fact.{id}.refuted', label: '谣言已被证伪', param: 'fact' },
    { key: 'fact.{id}.known', label: '玩家已知真相', param: 'fact' },
    { key: 'fact.{id}.fixed', label: '问题已整改', param: 'fact' },
    { key: 'task.{id}.done', label: '子任务已完成', param: 'task' },
    { key: 'task.{id}.failed', label: '子任务已失败', param: 'task' },
    { key: 'itemUses.', label: '技能累计使用次数', param: 'item' },
    { key: 'itemUsesTurn.', label: '技能本回合使用次数', param: 'item' },
    { key: 'flags.', label: '剧情标记', param: 'flag' },
    { key: 'counters.', label: '计数器（violations 红线违规、exposeSuccess 扒皮成功、faceSlaps 被打脸、regulated 被约谈……）', param: 'counter' }
  ];

  function num(v) {
    if (v === true) return 1;
    if (v === false || v === null || v === undefined) return 0;
    var n = Number(v);
    return isFinite(n) ? n : v;
  }

  function difficultyIndex(v) {
    var order = WW.Data.difficultyOrder || [];
    if (typeof v === 'string' && order.indexOf(v) >= 0) return order.indexOf(v);
    return num(v);
  }

  function resolve(name, game, extra) {
    var st = game.state;
    var lv = game.level;
    var parts = String(name).split('.');
    var head = parts[0];
    if (extra && Object.prototype.hasOwnProperty.call(extra, name)) return extra[name];
    switch (head) {
      case 'stats': return st.stats[parts[1]];
      case 'budget': return st.budget;
      case 'ap': return st.ap;
      case 'turn': return st.turn;
      case 'turnsLeft': return lv.contract.turns - st.turn;
      case 'difficulty': return difficultyIndex(st.difficulty);
      case 'phase': return st.phase;
      case 'lieDebt': return st.lieDebt;
      case 'progress': return st.objectives ? st.objectives.progress : 0;
      case 'stage': return st.objectives ? st.objectives.stageIndex : 0;
      case 'result': return st.result || '';
      case 'trend': return parts[1] === 'rank' ? st.trend.rank : undefined;
      case 'faction': {
        var f = st.factions[parts[1]];
        return f ? f.sentiment : undefined;
      }
      case 'opp': {
        var o = st.opponents[parts[1]];
        if (!o) return undefined;
        return parts[2] === 'active' ? o.active : o[parts[2]];
      }
      case 'fact': {
        var fs = st.facts[parts[1]];
        if (!fs) return undefined;
        if (parts[2] === 'isTrue') return !!fs.isTrue;
        return !!fs[parts[2]];
      }
      case 'task': {
        var t = st.objectives && st.objectives.tasks[parts[1]];
        if (!t) return undefined;
        return t.status === parts[2] || (parts[2] === 'active' && t.status === 'active');
      }
      case 'stageDone': {
        var sd = st.objectives && st.objectives.stages.filter(function (s) { return s.id === parts[1]; })[0];
        return sd ? sd.status === 'done' : false;
      }
      case 'itemUses': return st.itemUses[parts[1]] || 0;
      case 'itemUsesTurn': return (st.itemUsesTurn && st.itemUsesTurn[parts[1]]) || 0;
      case 'flags': return st.flags[parts.slice(1).join('.')];
      case 'posts': {
        var vis = st.posts.filter(function (p) { return p.status !== 'deleted'; });
        if (parts[1] === 'negative') return vis.filter(function (p) { return p.stance < 0; }).length;
        if (parts[1] === 'positive') return vis.filter(function (p) { return p.stance > 0; }).length;
        if (parts[1] === 'total') return vis.length;
        if (parts[1] === 'deleted') return st.counters.deleted || 0;
        if (parts[1] === 'shill') return vis.filter(function (p) { return p.isShill; }).length;
        return undefined;
      }
      case 'recent': return st.recent ? st.recent[parts[1]] : undefined;
      case 'counters': return st.counters[parts[1]] || 0;
      default: return undefined;
    }
  }

  function compare(a, op, b) {
    if (op === '==' || op === '!=') {
      var eq = typeof a === 'string' || typeof b === 'string' ? String(a) === String(b) : num(a) === num(b);
      return op === '==' ? eq : !eq;
    }
    a = num(a); b = num(b);
    if (typeof a !== 'number' || typeof b !== 'number') return false;
    switch (op) {
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      default: return false;
    }
  }

  function evaluate(cond, game, extra) {
    if (cond === null || cond === undefined || cond === true) return true;
    if (cond === false) return false;
    if (Array.isArray(cond)) return cond.every(function (c) { return evaluate(c, game, extra); });
    if (!U.isObj(cond)) return true;
    if (cond.all) return cond.all.every(function (c) { return evaluate(c, game, extra); });
    if (cond.any) return cond.any.some(function (c) { return evaluate(c, game, extra); });
    if (cond.not) return !evaluate(cond.not, game, extra);
    if (!cond.var) return true;
    var value = cond.value;
    var actual = resolve(cond.var, game, extra);
    if (cond.var === 'difficulty') value = difficultyIndex(value);
    return compare(actual, cond.op || '>=', value);
  }

  /* ---------- human readable description ---------- */

  function labelFor(v, level) {
    var parts = String(v).split('.');
    var findName = function (arr, id) {
      var hit = (arr || []).filter(function (x) { return x.id === id; })[0];
      return hit ? (hit.name || hit.title || hit.text || id) : id;
    };
    switch (parts[0]) {
      case 'faction': return '阵营「' + findName(level && level.factions, parts[1]) + '」好感';
      case 'opp': {
        var oname = findName(level && level.opponents, parts[1]);
        var field = { morale: '士气', strength: '势力', resources: '资源', active: '在场' }[parts[2]] || parts[2];
        return '对手「' + oname + '」' + field;
      }
      case 'fact': {
        var fname = findName(level && level.facts, parts[1]);
        if (fname.length > 14) fname = fname.slice(0, 14) + '…';
        var ff = { revealed: '已曝光', admitted: '已承认', denied: '被否认', refuted: '被证伪', known: '已查明', fixed: '已整改', isTrue: '属实' }[parts[2]] || parts[2];
        return '“' + fname + '”' + ff;
      }
      case 'task': {
        var tname = parts[1];
        if (level && level.objectives) {
          var all = [];
          (level.objectives.stages || []).forEach(function (s) { all = all.concat(s.tasks || []); });
          all = all.concat(level.objectives.side || []);
          tname = findName(all, parts[1]);
        }
        return '任务「' + tname + '」' + ({ done: '完成', failed: '失败', active: '进行中' }[parts[2]] || parts[2]);
      }
      case 'itemUses': return '「' + itemName(parts[1], level) + '」累计使用次数';
      case 'itemUsesTurn': return '「' + itemName(parts[1], level) + '」本回合使用次数';
      case 'flags': return '标记「' + parts.slice(1).join('.') + '」';
      default: {
        var hit = VARS.filter(function (x) { return x.key === v; })[0];
        return hit ? hit.label : v;
      }
    }
  }

  function itemName(id, level) {
    var custom = level && level.items && (level.items.custom || []).filter(function (x) { return x.id === id; })[0];
    if (custom) return custom.name;
    var over = level && level.items && level.items.overrides && level.items.overrides[id];
    if (over && over.name) return over.name;
    var lib = WW.Data.items && WW.Data.items[id];
    return lib ? lib.name : id;
  }

  function fmtValue(cond) {
    if (cond.value === true) return '是';
    if (cond.value === false) return '否';
    if (cond.var === 'difficulty' && typeof cond.value === 'string') {
      var d = WW.Data.difficulties && WW.Data.difficulties[cond.value];
      return d ? d.name : cond.value;
    }
    return String(cond.value);
  }

  function describe(cond, level) {
    if (cond === null || cond === undefined || cond === true) return '无条件';
    if (Array.isArray(cond)) return describe({ all: cond }, level);
    if (cond.all) return cond.all.map(function (c) { return wrap(c, level); }).join(' 且 ');
    if (cond.any) return cond.any.map(function (c) { return wrap(c, level); }).join(' 或 ');
    if (cond.not) return '并非(' + describe(cond.not, level) + ')';
    if (!cond.var) return '无条件';
    var op = { '<': '<', '<=': '≤', '>': '>', '>=': '≥', '==': '=', '!=': '≠' }[cond.op || '>='];
    if (cond.value === true && (cond.op === '==' || !cond.op)) return labelFor(cond.var, level);
    if (cond.value === false && cond.op === '==') return '未' + labelFor(cond.var, level);
    return labelFor(cond.var, level) + ' ' + op + ' ' + fmtValue(cond);
  }

  function wrap(c, level) {
    var s = describe(c, level);
    return c && (c.all || c.any) ? '(' + s + ')' : s;
  }

  /* ---------- validation (used by schema.validate and the editor) ---------- */

  function validate(cond, level, path, errors) {
    errors = errors || [];
    path = path || 'condition';
    if (cond === null || cond === undefined || cond === true || cond === false) return errors;
    if (Array.isArray(cond)) {
      cond.forEach(function (c, i) { validate(c, level, path + '[' + i + ']', errors); });
      return errors;
    }
    if (!U.isObj(cond)) {
      errors.push({ path: path, msg: '条件必须是对象' });
      return errors;
    }
    if (cond.all || cond.any) {
      var list = cond.all || cond.any;
      if (!Array.isArray(list)) errors.push({ path: path, msg: 'all/any 必须是数组' });
      else list.forEach(function (c, i) { validate(c, level, path + '.' + (cond.all ? 'all' : 'any') + '[' + i + ']', errors); });
      return errors;
    }
    if (cond.not) return validate(cond.not, level, path + '.not', errors);
    if (!cond.var) {
      errors.push({ path: path, msg: '条件缺少 var' });
      return errors;
    }
    if (cond.op && OPS.indexOf(cond.op) < 0) errors.push({ path: path, msg: '不支持的比较符 ' + cond.op });
    var parts = String(cond.var).split('.');
    var refCheck = function (arr, id, what) {
      if (!(arr || []).some(function (x) { return x.id === id; })) errors.push({ path: path, msg: what + ' “' + id + '” 不存在' });
    };
    if (level) {
      if (parts[0] === 'faction') refCheck(level.factions, parts[1], '阵营');
      if (parts[0] === 'opp') refCheck(level.opponents, parts[1], '对手');
      if (parts[0] === 'fact') refCheck(level.facts, parts[1], '事实');
      if (parts[0] === 'task' && level.objectives) {
        var tasks = [];
        (level.objectives.stages || []).forEach(function (s) { tasks = tasks.concat(s.tasks || []); });
        tasks = tasks.concat(level.objectives.side || []);
        refCheck(tasks, parts[1], '子任务');
      }
    }
    return errors;
  }

  WW.Cond = {
    OPS: OPS,
    VARS: VARS,
    evaluate: evaluate,
    resolve: resolve,
    describe: describe,
    validate: validate
  };
})(window.WW);
