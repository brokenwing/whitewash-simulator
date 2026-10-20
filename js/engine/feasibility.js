/*
 * Task feasibility (任务可完成性): main-quest tasks and side tasks a level's own data makes impossible
 * or unreachable. Called by WW.Schema.validate on the normalized level; every finding goes through
 * its W(path, msg, blocking, fixes) like the other checks.
 *
 *   A  the condition can never hold: a value outside its range, a fact state that contradicts the
 *      hidden truth, an opponent that never shows up, a task that never fails / never finishes
 *   B  not in time / not enough: a skill unlocked after the deadline, deadline vs offer vs at:"end",
 *      more uses than the skill allows, a text that says "at the end" without at:"end", budget
 *   C  no lever: a faction target nothing moves that faction for, an opponent-morale target with no
 *      way to hurt that opponent. These come with fixes: data patches the editor can apply.
 *
 * fixes: [{ label, desc, patch: [{ path, value }] }], paths written like warning paths
 * ("factions[3].sens.shill") and applied to the raw (not normalized) level.
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;

  /* ------------------------------------------------------------------ helpers */

  function walk(x, fn) {
    if (Array.isArray(x)) x.forEach(function (v) { walk(v, fn); });
    else if (U.isObj(x)) {
      fn(x);
      Object.keys(x).forEach(function (k) { walk(x[k], fn); });
    }
  }

  function num(v) {
    if (v === true) return 1;
    if (v === false || v === null || v === undefined || v === '') return 0;
    var n = Number(v);
    return isNaN(n) ? NaN : n;
  }

  function cmp(a, op, b) {
    switch (op) {
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      case '==': return a === b;
      case '!=': return a !== b;
      default: return true;
    }
  }

  /* what a boolean leaf asks for: true, false, or either */
  function wants(leaf) {
    var v = num(leaf.value);
    var t = cmp(1, leaf.op, v), f = cmp(0, leaf.op, v);
    return t && !f ? true : f && !t ? false : null;
  }

  function tasksOf(lv) {
    var out = [];
    lv.objectives.stages.forEach(function (s, i) {
      s.tasks.forEach(function (t, j) {
        out.push({ def: t, stage: i, kind: t.required ? 'required' : 'optional', path: 'objectives.stages[' + i + '].tasks[' + j + ']' });
      });
    });
    lv.objectives.side.forEach(function (t, i) { out.push({ def: t, stage: -1, kind: 'side', path: 'objectives.side[' + i + ']' }); });
    return out;
  }

  function kindName(x) { return x.kind === 'side' ? '支线' : x.kind === 'required' ? '必做子任务' : '可选子任务'; }

  /* leaves of the "must all hold" part of a condition (top level and nested all) */
  function conjuncts(cond) {
    if (!cond) return [];
    if (typeof cond.var === 'string') return [cond];
    if (Array.isArray(cond.all)) return cond.all.reduce(function (a, c) { return a.concat(conjuncts(c)); }, []);
    return [];
  }

  function itemsOf(lv) {
    var map = WW.Items && WW.Items.resolve ? WW.Items.resolve(lv) : {};
    if (!WW.Items) lv.items.enabled.forEach(function (id) { if (D.items[id]) map[id] = D.items[id]; });
    lv.items.custom.forEach(function (c) { if (!map[c.id]) map[c.id] = c; });
    return map;
  }

  /* channels the player can push factions through in this level */
  function playerChannels(lv, items) {
    var out = {};
    Object.keys(items).forEach(function (id) {
      var it = items[id];
      if (it.handler === 'statement') (D.statementTypes || []).forEach(function (t) { out[t.channel] = true; });
      else if (it.channel) out[it.channel] = true;
    });
    return Object.keys(out).filter(function (c) { return D.channels[c] && c !== 'event'; });
  }

  /* ------------------------------------------------------------------ A: conditions that can never hold */

  function rangeOf(name, lv, turnMax) {
    var p = name.split('.');
    switch (p[0]) {
      case 'stats': return p[1] === 'sentiment' ? [-100, 100] : [0, 100];
      case 'faction': return [-100, 100];
      case 'turn': return [1, turnMax];
      case 'turnsLeft': return [0, Math.max(0, lv.contract.turns - 1)];
      case 'progress': return [0, 1];
      case 'stage': return [0, lv.objectives.stages.length];
      case 'phase': return [0, 3];
      case 'trend': return p[1] === 'rank' ? [1, 99] : null;
      case 'opp': return p[2] === 'morale' || p[2] === 'strength' ? [0, 100] : null;
      default: return null;
    }
  }

  function inRange(leaf, r) {
    var v = num(leaf.value);
    if (isNaN(v)) return true;
    var probes = [r[0], r[1], v, v - 1e-6, v + 1e-6, v - 1, v + 1].filter(function (x) { return x >= r[0] && x <= r[1]; });
    return probes.some(function (x) { return cmp(x, leaf.op, v); });
  }

  /* how many times skill `it` can be used in `turns` turns (cooldown / maxUses / passive); Infinity: no cap */
  function useCap(it, turns, perTurn) {
    var cap = Infinity;
    if (it.passive) cap = 1;
    if (it.maxUses) cap = Math.min(cap, it.maxUses);
    if (it.cooldown) cap = Math.min(cap, perTurn ? 1 : Math.ceil(turns / it.cooldown));
    return cap;
  }

  function Ctx(lv) {
    var self = this;
    this.lv = lv;
    this.items = itemsOf(lv);
    this.tasks = tasksOf(lv);
    this.taskById = {};
    this.tasks.forEach(function (x) { self.taskById[x.def.id] = x; });
    this.factById = {};
    lv.facts.forEach(function (f) { self.factById[f.id] = f; });
    this.oppIndex = {};
    lv.opponents.forEach(function (o, i) { self.oppIndex[o.id] = i; });
    this.activates = {};
    walk([lv.events, lv.opponents, lv.objectives, lv.items.custom, lv.abilities, lv.randomEvents], function (o) {
      if (o.type === 'opponent' && o.opp && o.active === true) self.activates[o.opp] = true;
    });
  }

  /* why one leaf can never hold, or '' */
  function leafReason(leaf, ctx, turnMax, depth) {
    var lv = ctx.lv;
    var name = String(leaf.var);
    var p = name.split('.');
    var r = rangeOf(name, lv, turnMax);
    if (r && !inRange(leaf, r)) {
      return '「' + name + '」的取值范围是 ' + r[0] + '~' + r[1] + (p[0] === 'turn' && turnMax < lv.contract.turns ? '（期限第 ' + turnMax + ' 回合）' : '') +
        '，条件 ' + name + ' ' + leaf.op + ' ' + leaf.value + ' 永远不成立';
    }
    if (p[0] === 'fact' && ctx.factById[p[1]]) {
      var f = ctx.factById[p[1]], w = wants(leaf);
      if (w === true) {
        if (p[2] === 'refuted' && f.isTrue) return '事实「' + f.text.slice(0, 20) + '」是真的，真事永远不会被证伪';
        if (p[2] === 'revealed' && !f.isTrue) return '事实「' + f.text.slice(0, 20) + '」是谣言，谣言曝光会变成“被证伪”，revealed 永远不会为真（改用 refuted）';
        if (p[2] === 'fixed' && !f.isTrue) return '事实「' + f.text.slice(0, 20) + '」是谣言，只有真事能被整改';
        if (p[2] === 'fixed' && !ctx.items.rectify) return '只有「真诚整改」会把事实标为已整改，但本关没有启用它';
      }
      if (p[2] === 'isTrue' && w !== null && w !== !!f.isTrue) return '事实「' + f.text.slice(0, 20) + '」的真相是' + (f.isTrue ? '属实' : '谣言') + '，这个条件永远不成立';
    }
    if (p[0] === 'opp' && ctx.oppIndex[p[1]] !== undefined && p[2] === 'active' && wants(leaf) === true) {
      var o = lv.opponents[ctx.oppIndex[p[1]]];
      if (!o.startActive && !o.enterWhen && !ctx.activates[o.id]) return '对手「' + o.name + '」开局不在场，也没有入场条件或让它入场的效果，永远不会出现';
    }
    if (p[0] === 'task' && ctx.taskById[p[1]] && depth < 4) {
      var x = ctx.taskById[p[1]], wt = wants(leaf);
      if (p[2] === 'failed' && wt === true && x.kind === 'required') return '「' + x.def.title + '」是必做子任务，必做任务不会失败';
      if (p[2] === 'done' && wt === true) {
        var why = condReasons(x.def.complete, ctx, x.def.deadline || lv.contract.turns, depth + 1);
        if (why.length) return '依赖的「' + x.def.title + '」本身完不成（' + why[0] + '）';
      }
    }
    if ((p[0] === 'itemUses' || p[0] === 'itemUsesTurn') && ctx.items[p[1]]) {
      var it = ctx.items[p[1]], perTurn = p[0] === 'itemUsesTurn';
      var cap = useCap(it, turnMax, perTurn);
      var v = num(leaf.value);
      var need = leaf.op === '>=' ? v : leaf.op === '>' ? Math.floor(v) + 1 : leaf.op === '==' ? v : 0;
      if (need > cap) {
        var why2 = it.passive ? '只能部署一次' : it.maxUses && cap === it.maxUses ? '整局最多用 ' + it.maxUses + ' 次' : '冷却 ' + it.cooldown + ' 回合，' + (perTurn ? '每回合最多 1 次' : turnMax + ' 回合内最多 ' + cap + ' 次');
        return '技能「' + it.name + '」' + why2 + '，要求用 ' + need + ' 次做不到（“看不见的大手”除外）';
      }
    }
    return '';
  }

  /* reasons the whole condition can never hold ([] = it can) */
  function condReasons(cond, ctx, turnMax, depth) {
    depth = depth || 0;
    if (!cond) return [];
    if (typeof cond.var === 'string') { var r = leafReason(cond, ctx, turnMax, depth); return r ? [r] : []; }
    if (Array.isArray(cond.all)) return cond.all.reduce(function (a, c) { return a.concat(condReasons(c, ctx, turnMax, depth)); }, []);
    if (Array.isArray(cond.any)) {
      var each = cond.any.map(function (c) { return condReasons(c, ctx, turnMax, depth); });
      return each.length && each.every(function (x) { return x.length; }) ? [each.map(function (x) { return x[0]; }).join('；而且')] : [];
    }
    return [];
  }

  function checkImpossible(ctx, W) {
    ctx.tasks.forEach(function (x) {
      var t = x.def;
      var turnMax = t.deadline && t.deadline < ctx.lv.contract.turns ? t.deadline : ctx.lv.contract.turns;
      condReasons(t.complete, ctx, turnMax).forEach(function (why) {
        W(x.path + '.complete', kindName(x) + '「' + t.title + '」完不成：' + why, true);
      });
      if (x.kind === 'side' && t.offer && t.offer !== 'start') {
        condReasons(t.offer, ctx, ctx.lv.contract.turns).forEach(function (why) {
          W(x.path + '.offer', '支线「' + t.title + '」永远不会发放：' + why, true);
        });
      }
    });
  }

  /* A4: finishing a required task forces another task's fail condition (counters only go up) */
  var MONOTONE = /^(itemUses\.|counters\.|posts\.deleted$)/;
  function checkConflicts(ctx, W) {
    var req = ctx.tasks.filter(function (x) { return x.kind === 'required'; });
    ctx.tasks.filter(function (x) { return x.kind !== 'required' && x.def.fail; }).forEach(function (y) {
      conjuncts(y.def.fail).filter(function (f) { return MONOTONE.test(f.var); }).forEach(function (f) {
        req.forEach(function (x) {
          conjuncts(x.def.complete).filter(function (l) { return l.var === f.var; }).forEach(function (l) {
            var lv = num(l.value), fv = num(f.value), top = Math.max(lv, fv) + 3, sat = [], forced = true;
            for (var n = 0; n <= top; n++) if (cmp(n, l.op, lv)) sat.push(n);
            sat.forEach(function (n) { if (!cmp(n, f.op, fv)) forced = false; });
            if (sat.length && forced) {
              W(y.path + '.fail', kindName(y) + '「' + y.def.title + '」和必做子任务「' + x.def.title + '」冲突：完成后者（' + l.var + ' ' + l.op + ' ' + l.value + '）必然让前者失败。如果是有意的二选一可以忽略');
            }
          });
        });
      });
    });
  }

  /* ------------------------------------------------------------------ B: time and resources */

  /* "合同结束前…" is a deadline, not "judged at the end" */
  var END_WORDS = /合同(结束|到期)(时|那一刻|后)|结案时|结算时|全程|整局|始终|一直保持|自始至终/;

  function offerTurn(offer) {
    var n = 0;
    conjuncts(offer).forEach(function (l) {
      if (l.var !== 'turn') return;
      var v = num(l.value);
      if (l.op === '>=' || l.op === '==') n = Math.max(n, v);
      if (l.op === '>') n = Math.max(n, v + 1);
    });
    return n;
  }

  function checkTiming(ctx, W) {
    var turns = ctx.lv.contract.turns;
    ctx.tasks.forEach(function (x) {
      var t = x.def;
      var title = kindName(x) + '「' + t.title + '」';
      if (t.deadline) {
        if (x.kind === 'required') W(x.path + '.deadline', title + '写了期限，但必做任务过期不会失败，期限不起作用');
        else if (t.deadline >= turns && t.at !== 'end') W(x.path + '.deadline', title + '的期限第 ' + t.deadline + ' 回合不早于合同结束（第 ' + turns + ' 回合），等于没有期限');
        if (t.at === 'end' && t.deadline < turns && x.kind !== 'required') W(x.path + '.deadline', title + '写了 at:"end"（合同结束才判定），又写了期限第 ' + t.deadline + ' 回合：期限一到就判失败，永远等不到结算。删掉其中一个', true);
        if (x.kind === 'side' && t.offer && t.offer !== 'start') {
          var from = offerTurn(t.offer);
          if (from && from > t.deadline) W(x.path + '.deadline', title + '最早第 ' + from + ' 回合才发放，期限却是第 ' + t.deadline + ' 回合，发放时就已经过期', true);
        }
      }
      var text = (t.title || '') + ' ' + (t.desc || '');
      if (t.at !== 'end' && END_WORDS.test(text)) {
        W(x.path + '.at', title + '的描述说的是“' + text.match(END_WORDS)[0] + '”，但没有写 at:"end"：条件一满足就会当场完成，不会等到结算。要在结算时判定，请加 at:"end"' + (x.kind === 'required' ? '（必做任务改成可选或支线）' : '并用 fail 写违规条件'));
      }
    });
  }

  /* B1: optional and side tasks that need a skill only a later stage unlocks */
  function checkTiers(ctx, W, flagsSet) {
    var lv = ctx.lv;
    var tierOf = function (id) { var it = ctx.items[id] || D.items[id]; return (it && it.tier) || 1; };
    var elsewhere = {}, elsewhereTier = 0;
    walk([lv.events, lv.opponents, lv.objectives.side, lv.objectives.stages.map(function (s) { return s.tasks; })], function (o) {
      if (o.type !== 'unlock') return;
      if (o.tier) elsewhereTier = Math.max(elsewhereTier, Number(o.tier) || 0);
      [].concat(o.items || []).forEach(function (id) { elsewhere[id] = true; });
    });
    /* after[k]: tier and skills unlocked once the first k stages are done */
    var after = [{ tier: lv.items.startTier || 1, items: {} }];
    lv.objectives.stages.forEach(function (s, i) {
      var prev = after[i], next = { tier: prev.tier, items: U.deepClone(prev.items) };
      walk(s.rewards, function (o) {
        if (o.type !== 'unlock') return;
        if (o.tier) next.tier = Math.max(next.tier, Number(o.tier) || 0);
        [].concat(o.items || []).forEach(function (id) { next.items[id] = true; });
      });
      after.push(next);
    });
    var stagesFor = function (id) {
      if (lv.items.unlocks[id] || elsewhere[id] || tierOf(id) <= elsewhereTier) return 0;
      for (var k = 0; k < after.length; k++) if (after[k].tier >= tierOf(id) || after[k].items[id]) return k;
      return -1;
    };
    ctx.tasks.forEach(function (x) {
      if (x.kind === 'required') return;   /* Schema.stageSkills */
      var t = x.def;
      WW.Schema.condSkills(t.complete, flagsSet).forEach(function (id) {
        if (!ctx.items[id]) return;
        var k = stagesFor(id), name = '「' + ctx.items[id].name + '」（第 ' + tierOf(id) + ' 级）';
        if (k < 0) {
          W(x.path + '.complete', kindName(x) + '「' + t.title + '」要用技能' + name + '，但整局都没有途径解锁它', true);
        } else if (x.kind === 'optional' && k > x.stage) {
          W(x.path + '.complete', '可选子任务「' + t.title + '」要用技能' + name + '，要等第 ' + k + ' 阶段完成才解锁；而本阶段一完成，没做完的可选任务就过期了，除“看不见的大手”外都做不到。请在前面阶段的奖励里解锁它', true);
        } else if (x.kind === 'side' && k > 0 && t.deadline) {
          W(x.path + '.complete', '支线「' + t.title + '」要用技能' + name + '，要等前 ' + k + ' 个阶段完成才解锁，期限却是第 ' + t.deadline + ' 回合：玩家得在期限前推完 ' + k +
            ' 个阶段，几乎做不到。可以用 items.unlocks 提前解锁它、放宽期限，或者把它放进第一阶段的奖励');
        }
      });
    });
  }

  /* B5: the skills the required tasks name cost more than the whole budget */
  function minCost(it) {
    var c = it.cost || 0;
    var ps = it.params || {};
    var list = ps.tiers || ps.scales;
    if (list && list.length) c += Math.min.apply(null, list.map(function (x) { return x.price || 0; }));
    return c;
  }
  function checkBudget(ctx, W) {
    var lv = ctx.lv;
    var income = lv.contract.budget;
    walk([lv.objectives, lv.events], function (o) { if (o.type === 'budget' && num(o.delta) > 0) income += num(o.delta); });
    var need = 0, names = [];
    ctx.tasks.filter(function (x) { return x.kind === 'required'; }).forEach(function (x) {
      WW.Schema.condSkills(x.def.complete).forEach(function (id) {
        var it = ctx.items[id];
        if (!it || names.indexOf(it.name) >= 0) return;
        need += minCost(it);
        names.push(it.name);
      });
    });
    if (need > income) W('contract.budget', '必做任务要用的技能（' + names.join('、') + '）最低也要 ' + need + ' 万，超过整局能拿到的预算 ' + income + ' 万');
  }

  /* ------------------------------------------------------------------ C: no lever */

  var TEMPLATE_WORDS = [
    ['fans', /粉|饭圈|支持者|信徒|拥趸|铁杆|追随|跟风|热情/], ['victim', /苦主|受害|家属|维权|消费者|老人/], ['sleuth', /扒皮|较真|科普|理性|专业|技术|学者/],
    ['media', /媒体|记者|大V|博主|自媒体/], ['rival', /对家|竞品|对手|同行/], ['passerby', /路人|吃瓜|大众|普通|网友/]
  ];
  var CHANNEL_WORDS = [
    ['shill', /跟风|转发|起哄|带节奏|刷屏/], ['label', /强硬|爱国|热血|立场|对抗|愤怒/], ['apology', /情绪|感动|同情|共情|心软/],
    ['statement', /理性|较真|科普|证据|事实/], ['kol', /博主|意见领袖|大V/], ['compensation', /受害|家属|赔偿|维权/], ['distraction', /吃瓜|娱乐|八卦/]
  ];

  function pickTemplate(f) {
    var text = (f.name || '') + ' ' + (f.desc || '');
    var hit = TEMPLATE_WORDS.filter(function (x) { return x[1].test(text); })[0];
    return hit ? hit[0] : 'passerby';
  }

  function pickChannel(f, channels) {
    var text = (f.name || '') + ' ' + (f.desc || '');
    var hit = CHANNEL_WORDS.filter(function (x) { return channels.indexOf(x[0]) >= 0 && x[1].test(text); })[0];
    if (hit) return hit[0];
    return ['statement', 'shill', 'kol'].filter(function (c) { return channels.indexOf(c) >= 0; })[0] || channels[0];
  }

  /* Effects that move one faction / hurt one opponent, with where they come from: a custom skill
     (repeatable: a real lever), or a one-off source (event, stage reward, task reward 'task:<id>'). */
  function effectLevers(lv) {
    var out = { faction: {}, opp: {} };
    var add = function (src) {
      return function (o) {
        if (o.type === 'faction' && o.faction && num(o.delta)) (out.faction[o.faction] = out.faction[o.faction] || []).push({ delta: num(o.delta), src: src });
        if (o.type === 'opponent' && o.opp && (num(o.morale) < 0 || num(o.strength) < 0 || o.active === false)) (out.opp[o.opp] = out.opp[o.opp] || []).push({ src: src });
      };
    };
    lv.items.custom.forEach(function (c) { walk(c.effect, add('item')); });
    walk([lv.events, lv.randomEvents, lv.opponents.map(function (o) { return o.events; })], add('event'));
    lv.objectives.stages.forEach(function (s) {
      walk(s.rewards, add('stage'));
      s.tasks.forEach(function (t) { walk(t.rewards, add('task:' + t.id)); });
    });
    lv.objectives.side.forEach(function (t) { walk([t.rewards, t.penalty], add('task:' + t.id)); });
    return out;
  }

  /* tasks whose own condition targets this faction: their rewards only come after the target is met */
  function factionTargeters(ctx, fid) {
    var out = {};
    ctx.tasks.forEach(function (x) {
      conjuncts(x.def.complete).forEach(function (l) { if (String(l.var) === 'faction.' + fid) out['task:' + x.def.id] = true; });
    });
    return out;
  }

  /* A faction's real opening sentiment: the engine shifts every faction so that their weighted mean
     equals initialStats.sentiment (engine.js, new Game). */
  function startSentiment(lv, f) {
    var total = U.sum(lv.factions, function (g) { return g.size; }) || 1;
    var mean = U.sum(lv.factions, function (g) { return g.sentiment * g.size / total; });
    return U.clamp(f.sentiment + lv.initialStats.sentiment - mean, -100, 100);
  }

  function checkFactionLevers(ctx, W, levers) {
    var lv = ctx.lv;
    var channels = playerChannels(lv, ctx.items);
    var seen = {};
    ctx.tasks.forEach(function (x) {
      conjuncts(x.def.complete).concat(x.kind === 'side' && x.def.offer !== 'start' ? conjuncts(x.def.offer) : []).forEach(function (l) {
        var p = String(l.var).split('.');
        if (p[0] !== 'faction') return;
        var fi = -1;
        lv.factions.forEach(function (f, i) { if (f.id === p[1]) fi = i; });
        if (fi < 0 || lv.factions.length < 2) return;
        var f = lv.factions[fi], v = num(l.value), start = startSentiment(lv, f);
        var up = l.op === '>=' || l.op === '>', down = l.op === '<=' || l.op === '<';
        if (!(up && v > start + 5) && !(down && v < start - 5)) return;
        /* a lever: an enabled channel this faction answers clearly harder than baseline 1 and than the
           others (or, to push it down, one it resents), or an effect on it */
        var others = lv.factions.filter(function (g) { return g.id !== f.id; });
        var lever = channels.filter(function (c) {
          var mean = U.sum(others, function (g) { return g.sens[c]; }) / others.length;
          return up ? f.sens[c] >= Math.max(1.3, mean + 0.3) : f.sens[c] <= Math.min(-0.3, mean - 0.3);
        });
        var circular = factionTargeters(ctx, f.id);
        var fx = (levers.faction[f.id] || []).filter(function (e) { return (up ? e.delta > 0 : e.delta < 0) && !circular[e.src]; });
        var gap = Math.abs(v - start);
        if (lever.length || fx.some(function (e) { return e.src === 'item'; }) || U.sum(fx, function (e) { return Math.abs(e.delta); }) >= gap) return;
        var key = x.def.id + '|' + f.id;
        if (seen[key]) return;
        seen[key] = true;
        var tpl = pickTemplate(f), base = (D.defaultFactions || []).filter(function (g) { return g.id === tpl; })[0];
        var ch = pickChannel(f, channels);
        var fp = 'factions[' + fi + ']';
        var fixes = [];
        if (!ctx.rawHas('factions')) { /* default factions: nothing of the author's to patch */ }
        else if (base) fixes.push({ label: '套用「' + base.name + '」的性格', desc: '把「' + f.name + '」的敏感系数和波动性改成默认阵营「' + base.name + '」的数值，让它和其他阵营有区别。会修改 ' + fp + '.sens、' + fp + '.volatility',
          patch: [{ path: fp + '.sens', value: U.deepClone(base.sens) }, { path: fp + '.volatility', value: base.volatility }] });
        if (ch && up && ctx.rawHas('factions')) fixes.push({ label: '让它对「' + D.channels[ch].name + '」特别敏感', desc: '把「' + f.name + '」对「' + D.channels[ch].name + '」的敏感系数设为 2：用这类手段时，它的好感涨得是别人的两倍。会修改 ' + fp + '.sens.' + ch,
          patch: [{ path: fp + '.sens.' + ch, value: 2 }] });
        if (up) {
          var cid = 'rally_' + f.id, n = 1;
          while (ctx.items[cid]) cid = 'rally_' + f.id + (++n);
          /* about a third of the gap per use: three uses close it, before the opening pressure's drag */
          var step = U.clamp(Math.ceil(gap / 3), 6, 15);
          var item = { id: cid, name: '动员' + f.name, icon: '📣', tier: 1, ap: 1, cost: 6, cooldown: 1, channel: ch || 'statement',
            desc: '针对「' + f.name + '」定向投放内容，专门拉高这个阵营的好感。', risk: '定向投放有痕迹，会小幅涨暴露度。',
            effect: { prompt: '玩家针对「' + f.name + '」群体定向投放内容。', inputLabel: '投放的内容方向', bounds: { exposure: [0, 3] }, offlineDeltas: { exposure: 1 },
              posts: 1, stance: 1, effects: [{ type: 'faction', faction: f.id, delta: step }] } };
          fixes.push({ label: '加一个专属技能「' + item.name + '」', desc: '新增 1 级自定义技能：每次让「' + f.name + '」好感 +' + step + '、暴露度 +0~3，冷却 1 回合。会修改 items.custom',
            patch: [{ path: 'items.custom', value: (ctx.rawCustom || []).concat([item]) }] });
        }
        W(x.path + '.complete', kindName(x) + '「' + x.def.title + '」要把「' + f.name + '」好感从开局的 ' + Math.round(start) + (Math.round(start) !== Math.round(f.sentiment) ? '（填的是 ' + f.sentiment + '，开局时所有阵营会整体平移到 initialStats.sentiment）' : '') + ' ' + (up ? '拉到' : '压到') + ' ' + l.op + ' ' + v +
          '，但没有能单独影响它的手段：它对各类手段的敏感系数和其他阵营一样（自定义阵营没写敏感系数时一律为 1），关卡里也没有专门作用于它的效果。开局压力还会把所有阵营一起往下拉，这类目标通常做不到', false, fixes);
      });
    });
  }

  function checkOpponentLevers(ctx, W, levers) {
    var lv = ctx.lv;
    var it = ctx.items;
    ctx.tasks.forEach(function (x) {
      conjuncts(x.def.complete).forEach(function (l) {
        var p = String(l.var).split('.');
        if (p[0] !== 'opp' || ctx.oppIndex[p[1]] === undefined) return;
        if (p[2] !== 'morale' && p[2] !== 'strength') return;
        var oi = ctx.oppIndex[p[1]], o = lv.opponents[oi], v = num(l.value);
        if (!((l.op === '<=' || l.op === '<') && v < o[p[2]])) return;
        var abil = o.abilities.map(function (a) { return a.use; });
        var lies = abil.indexOf('rumor') >= 0 || o.rumors.length > 0 || (abil.indexOf('dig_past') >= 0 && o.pastScandals.some(function (s) { return s && s.isTrue === false; }));
        var dirty = o.dirt.length > 0 || abil.indexOf('counter_shill') >= 0 || abil.indexOf('rumor') >= 0;
        var ways = [];
        if (it.expose && it.monitor && dirty) ways.push('反向扒皮');
        if (it.legal) ways.push('律师函');
        if (it.iron_fist && lies) ways.push('举报它的谣言');
        if ((levers.opp[o.id] || []).some(function (e) { return e.src !== 'task:' + x.def.id; })) ways.push('关卡效果');
        if (ways.length) return;
        var op = 'opponents[' + oi + ']';
        var enabled = lv.items.enabled;
        var fixes = [];
        if (!ctx.rawHas('opponents')) fixes = null;
        var withExpose = enabled.concat(['expose', 'monitor'].filter(function (id) { return enabled.indexOf(id) < 0; }));
        if (fixes) fixes.push({ label: '启用「反向扒皮」' + (dirty ? '' : '并给它加把柄'), desc: '启用反向扒皮（需要舆情监测，会一并启用）' + (dirty ? '' : '，并给「' + o.name + '」加一条把柄，扒皮才能成功') + '。扒皮成功一次士气 -30。会修改 items.enabled' + (dirty ? '' : '、' + op + '.dirt'),
          patch: [{ path: 'items.enabled', value: withExpose }].concat(dirty ? [] : [{ path: op + '.dirt', value: o.dirt.concat(['收钱带节奏的聊天记录']) }]) });
        if (fixes && !it.legal) fixes.push({ label: '启用「律师函」', desc: '启用律师函：对它发律师函士气 -15，对它的帖子发 -8。会修改 items.enabled',
          patch: [{ path: 'items.enabled', value: enabled.concat(['legal']) }] });
        W(x.path + '.complete', kindName(x) + '「' + x.def.title + '」要把对手「' + o.name + '」的' + (p[2] === 'morale' ? '士气' : '势力') + '从 ' + o[p[2]] + ' 压到 ' + l.op + ' ' + v +
          '，但玩家没有打击它的手段：' + (it.expose ? (dirty ? '' : '它没有把柄，扒皮打不动；') : '反向扒皮没启用；') + (it.legal ? '' : '律师函没启用；') + (lies ? '' : '它不造谣，铁拳也打不动；') +
          '只剩热度很低、好感转正时士气才会自然下滑', false, fixes || []);
      });
    });
  }

  /* ------------------------------------------------------------------ entry */

  /* lv: normalized level; raw: what the author wrote (fix patches are built on it) */
  function check(lv, W, raw) {
    var ctx = new Ctx(lv);
    ctx.rawCustom = raw && raw.items && Array.isArray(raw.items.custom) ? raw.items.custom : [];
    ctx.rawHas = function (k) { return !!raw && Array.isArray(raw[k]) && raw[k].length > 0; };
    var flagsSet = {};
    walk(lv, function (o) { if (o.type === 'flag' && o.name) flagsSet[o.name] = true; });
    var levers = effectLevers(lv);
    checkImpossible(ctx, W);
    checkConflicts(ctx, W);
    checkTiming(ctx, W);
    checkTiers(ctx, W, flagsSet);
    checkBudget(ctx, W);
    checkFactionLevers(ctx, W, levers);
    checkOpponentLevers(ctx, W, levers);
  }

  /* applies a fix's patch to a raw level (editor); returns the changed paths */
  function applyFix(raw, fix) {
    (fix.patch || []).forEach(function (pt) {
      U.set(raw, String(pt.path).replace(/\[(\d+)\]/g, '.$1'), U.deepClone(pt.value));
    });
    return (fix.patch || []).map(function (pt) { return pt.path; });
  }

  WW.Feasibility = { check: check, applyFix: applyFix, condReasons: condReasons, startSentiment: startSentiment };
})(window.WW);
