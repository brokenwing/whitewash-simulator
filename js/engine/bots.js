/*
 * Offline players: the fixed strategies used by the balance report, the tutorial follower, and
 * parametric policies for the editor's 通关测试 sweep. Games run without an aiRunner, so every AI
 * task (statement review, post filters, iron fist...) falls back to the offline rules.
 *
 *   WW.Bots.playBot(level, 'smart' | policyFn, seed, difficulty, gameOpts, onTurn) -> finished Game
 *   WW.Bots.policy(genome) -> strategy function; WW.Bots.describe(genome) -> 中文描述
 */
(function (WW) {
  'use strict';

  var U = WW.U;

  function vals(o) { return Object.keys(o).map(function (k) { return o[k]; }); }

  /* ------------------------------------------------------------------ helpers */

  async function tryAct(game, id, params) {
    if (!game.items[id] || game.state.finished) return null;
    var st = game.itemStatus(id, params || {});
    if (!st.usable) return null;
    var r = await game.act(id, params || {});
    return r && r.ok ? r : null;
  }

  /* A careful player never types the client's red-line keywords. */
  function careful(game, text) {
    game.level.client.demands.forEach(function (d) { d.keywords.forEach(function (k) { text = text.split(k).join('此事'); }); });
    return text;
  }

  function statementText(game, type, sincere, admit) {
    return careful(game, WW.Offline.tasks['statement.complete'](game, { type: type, tone: { sincere: sincere, admit: admit } }).text);
  }

  /* What a skilled player writes once they know the truth: refute rumors, own the rest, give measures. */
  function smartStatement(game) {
    var st = game.state;
    var lines = ['各位关心' + game.level.client.name + '的朋友：', '我们理解大家的愤怒与失望，每一条留言我们都认真看了，大家骂得对。'];
    vals(st.facts).filter(function (f) { return !f.isTrue && f.public && !f.refuted && !f.denied; }).forEach(function (f) {
      lines.push('关于网传“' + (f.keywords[0] || f.text) + '”的说法，经核查不属实，相关证据我们已提交第三方。');
    });
    lines.push('对于大家关心的问题，我们已成立专项小组全面排查，责任在我们，绝不推卸。');
    lines.push('一、全面排查所有环节；二、设立专项赔付通道；三、邀请第三方机构进驻监督。');
    if (!st.promises.some(function (p) { return p.status === 'pending'; })) lines.push('我们将在3日内公布调查结果。');
    return careful(game, lines.join('\n'));
  }

  function topNegative(game, filter) {
    return WW.Feed.ranked(game.state, 'all').filter(function (p) { return p.status !== 'deleted' && !p.isClient && p.stance < 0 && (!filter || filter(p)); });
  }

  async function deleteSome(game, criterion, max, id) {
    id = id || 'delete';
    if (!game.items[id]) return null;
    var prev = await game.preview(id, { criterion: criterion });
    if (!prev) return null;
    var ids = prev.candidates.filter(function (c) { return !c.immune && c.cost !== null && c.post.stance < 0; }).slice(0, max).map(function (c) { return c.id; });
    if (!ids.length) return null;
    return tryAct(game, id, { criterion: criterion, ids: ids });
  }

  /* Parameters for using skill `id` the plain way, built from the item's handler and target, so any
   * skill a level enables (custom ones included) can be used without a bot knowing it by name.
   * pick chooses from a candidate list: the first (most relevant) by default, rng.pick for `random`.
   * null when the skill needs a target and there is none. */
  async function paramsFor(game, id, pick) {
    var st = game.state;
    var item = game.items[id];
    if (!item) return null;
    pick = pick || function (xs) { return xs[0]; };
    var params = {};
    var visible = WW.Feed.visible(st).filter(function (p) { return !p.isClient; });
    var posts = topNegative(game, function (p) { return !p.controlled; }).concat(visible.filter(function (p) { return p.stance >= 0; }));
    var opps = vals(st.opponents).filter(function (o) { return o.active; });
    opps = opps.filter(function (o) { return game.oppDef(o.id).kind !== 'victims'; }).concat(opps.filter(function (o) { return game.oppDef(o.id).kind === 'victims'; }));
    var facts = vals(st.facts).filter(function (f) { return (f.public || f.revealed) && !f.refuted; });
    facts = facts.filter(function (f) { return !f.known; }).concat(facts.filter(function (f) { return f.known; }));
    if (item.handler === 'statement') Object.assign(params, { type: 'explain', channel: 'weibo', text: statementText(game, 'explain', 1, 0) });
    if (item.handler === 'shill') Object.assign(params, { tier: 'normal', count: 300, direction: '大家理性看待，事情还在调查中，别被带节奏' });
    if (item.handler === 'kol') Object.assign(params, { tier: 'small', brief: '理性分析事件来龙去脉' });
    if (item.handler === 'settle') params.scale = 'medium';
    if (item.handler === 'custom_ai') params.instruction = (item.effect && item.effect.inputLabel) || item.name;
    if (item.target === 'post') { if (!posts.length) return null; params.postId = pick(posts).id; }
    if (item.target === 'postOrOpponent') {
      if (posts.length) params.postId = pick(posts).id;
      else if (opps.length) params.oppId = pick(opps).id;
      else return null;
    }
    if (item.target === 'opponent') { if (!opps.length) return null; params.oppId = pick(opps).id; }
    if (item.target === 'fact') { if (!facts.length) return null; params.factId = pick(facts).id; }
    if (item.target === 'criterion') {
      var prev = await game.preview(id, { criterion: '负面帖子' });
      params.criterion = '负面帖子';
      params.ids = prev ? prev.candidates.filter(function (c) { return !c.immune && c.cost !== null; }).slice(0, 3).map(function (c) { return c.id; }) : [];
      if (!params.ids.length) return null;
    }
    return params;
  }

  async function useSkill(game, id) {
    if (!game.items[id] || !game.itemStatus(id).usable) return null;
    var params = await paramsFor(game, id);
    return params ? tryAct(game, id, params) : null;
  }

  /* Somebody a settlement would calm down: the default 苦主 faction, a victims' group among the
   * opponents, or evidence of a true fact a settlement can hold back. Read from the level's own
   * structure, since a level may define its own factions. */
  function victimPressure(game) {
    var st = game.state;
    if (st.factions.victim && st.factions.victim.sentiment < -50) return true;
    if (vals(st.opponents).some(function (o) { return o.active && game.oppDef(o.id).kind === 'victims'; })) return true;
    return game.level.facts.some(function (f) {
      var s = st.facts[f.id];
      return s && s.isTrue && !s.revealed && f.evidence && (f.evidence.suppressBy || []).indexOf('settle') >= 0;
    });
  }

  /* Actions taken this turn; a strategy loop stops when nothing more happened or, under the
   * 看不见的大手 preset (skills cost no AP), after a regular turn's worth of actions plus a few. */
  function acted(game) { return game.state.turnActions.length; }
  function stuck(game, before) { return acted(game) === before || acted(game) >= game.state.apMax + 3; }

  /* Runs `step` until it does nothing more this turn. */
  async function loop(game, step) {
    var st = game.state;
    while (st.ap > 0 && !st.finished) {
      var before = acted(game);
      await step();
      if (stuck(game, before)) break;
    }
  }

  /* ------------------------------------------------------------------ fixed strategies */

  var STRATEGIES = {
    idle: async function () {},

    shill: async function (game) {
      await loop(game, async function () {
        (await tryAct(game, 'trend_remove')) ||
          (await tryAct(game, 'shill', { tier: 'normal', count: 300, direction: '大家理性看待，事情还在调查中，别被带节奏' })) ||
          (await deleteSome(game, '骂客户的负面帖子', 4)) ||
          (topNegative(game)[0] && (await tryAct(game, 'control', { postId: topNegative(game)[0].id }))) ||
          (await tryAct(game, 'distraction'));
      });
    },

    honest: async function (game) {
      var st = game.state;
      if (st.turn === 1) await tryAct(game, 'statement', { type: 'apology', channel: 'weibo', text: statementText(game, 'apology', 1, 1) });
      await loop(game, async function () {
        var pending = st.promises.some(function (p) { return p.status === 'pending'; });
        (!st.flags.rectified && (await tryAct(game, 'rectify'))) ||
          (!st.counters.settled && (await tryAct(game, 'settle', { scale: 'medium' }))) ||
          (pending && (await tryAct(game, 'statement', { type: 'rectify', channel: 'weibo', text: statementText(game, 'rectify', 1, 1) }))) ||
          (await tryAct(game, 'monitor')) ||
          (await tryAct(game, 'kol', { tier: 'small', brief: '梳理时间线和整改措施，理性看待' })) ||
          (st.counters.statementsTurn === 0 && (await tryAct(game, 'statement', { type: 'explain', channel: 'weibo', text: statementText(game, 'explain', 1, 1) })));
      });
    },

    balanced: async function (game) {
      var st = game.state;
      if (st.turn === 1) await tryAct(game, 'statement', { type: 'explain', channel: 'weibo', text: statementText(game, 'explain', 1, 0) });
      await loop(game, async function () {
        var facts = vals(st.facts);
        var unknown = facts.find(function (f) { return !f.known && f.public && !f.revealed && !f.refuted; });
        var knownFalse = facts.find(function (f) { return f.known && !f.isTrue && !f.refuted; });
        var rumorPost = knownFalse && WW.Feed.visible(st).find(function (p) { return p.fact === knownFalse.id && !p.isClient; });
        var handle = game.findHandle();
        var knownHandle = handle && handle.known;
        var bigNeg = topNegative(game, function (p) { return p.author.tier !== 'normal'; })[0];
        (await tryAct(game, 'monitor')) ||
          (unknown && (await tryAct(game, 'investigate', { factId: unknown.id }))) ||
          (rumorPost && (await tryAct(game, 'iron_fist', { postId: rumorPost.id }))) ||
          (knownFalse && !knownFalse.denied && (await tryAct(game, 'endorse', { factId: knownFalse.id }))) ||
          (knownHandle && !st.flags.rectified && (await tryAct(game, 'rectify'))) ||
          (st.stats.heat > 55 && (await tryAct(game, 'trend_remove'))) ||
          (await tryAct(game, 'kol', { tier: 'big', brief: '用时间线和数据说话，事情正在整改，理性看待' })) ||
          (bigNeg && (await tryAct(game, 'control', { postId: topNegative(game, function (p) { return p.author.tier !== 'normal'; })[0].id }))) ||
          (st.counters.statementsTurn === 0 && (await tryAct(game, 'statement', { type: 'explain', channel: 'weibo', text: statementText(game, 'explain', 1, 1) }))) ||
          (await tryAct(game, 'shill', { tier: 'premium', count: 100, direction: '其实整改措施已经公布了，大家可以看看原始信息' }));
      });
    },

    /* Knows the hidden truth: an upper bound for a skilled player who investigates and reads carefully. */
    smart: async function (game) {
      var st = game.state;
      var pending = st.promises.some(function (p) { return p.status === 'pending'; });
      if (st.turn === 1 || (pending && st.counters.statementsTurn === 0)) {
        await tryAct(game, 'statement', { type: pending ? 'rectify' : 'explain', channel: 'weibo', text: smartStatement(game) });
      }
      await loop(game, async function () {
        var rumorPost = WW.Feed.visible(st).find(function (p) { return p.fact && st.facts[p.fact] && !st.facts[p.fact].isTrue && !st.facts[p.fact].refuted && !p.isClient; });
        var handle = game.findHandle();
        var dirty = vals(st.opponents).find(function (o) { return o.active && (o.flags.usedShill || o.flags.spreadRumor || (game.oppDef(o.id).dirt || []).length); });
        var bigNeg = topNegative(game, function (p) { return p.author.tier !== 'normal' && !p.controlled; })[0];
        (rumorPost && (await tryAct(game, 'iron_fist', { postId: rumorPost.id }))) ||
          (await tryAct(game, 'monitor')) ||
          (st.stats.heat > 58 && st.stats.exposure < 50 && (await deleteSome(game, '负面帖子', 3))) ||
          (handle && !st.flags.rectified && st.stats.satisfaction > 35 && (await tryAct(game, 'rectify'))) ||
          (dirty && st.monitor && (await tryAct(game, 'expose', { oppId: dirty.id }))) ||
          (st.stats.heat > 62 && (await tryAct(game, 'trend_remove'))) ||
          (victimPressure(game) && !st.counters.settled && (await tryAct(game, 'settle', { scale: 'medium' }))) ||
          (await tryAct(game, 'kol', { tier: 'big', brief: '用时间线和数据说话：问题正在整改，谣言部分已经澄清，理性看待' })) ||
          (bigNeg && (await tryAct(game, 'control', { postId: bigNeg.id }))) ||
          (st.counters.statementsTurn === 0 && st.turn % 2 === 0 && (await tryAct(game, 'statement', { type: 'explain', channel: 'weibo', text: smartStatement(game) }))) ||
          (st.stats.heat > 50 && (await tryAct(game, 'distraction'))) ||
          (await tryAct(game, 'kol', { tier: 'small', brief: '整改进展与第三方监督情况' }));
      });
    },

    random: async function (game) {
      var st = game.state;
      var guard = 0;
      var pick = function (xs) { return game.rng.pick(xs); };
      while (st.ap > 0 && !st.finished && guard++ < 6) {
        var ids = game.itemOrder.filter(function (id) { return game.itemStatus(id).usable || game.items[id].target === 'criterion'; });
        if (!ids.length) break;
        var id = game.rng.pick(ids);
        var item = game.items[id];
        var params = (await paramsFor(game, id, pick)) || {};
        if (item.handler === 'statement') Object.assign(params, { type: game.rng.pick(WW.Data.statementTypes).id, text: statementText(game, 'explain', game.rng.range(-1, 1), game.rng.range(-1, 1)) });
        if (item.handler === 'shill') Object.assign(params, { tier: game.rng.pick(['zombie', 'normal', 'premium']), count: game.rng.pick([100, 300, 1000]), direction: '支持一下，别被带节奏了' });
        if (item.handler === 'settle') params.scale = 'small';
        await game.act(id, params);
      }
    }
  };

  /* ------------------------------------------------------------------ parametric policies */

  /* Genome axes. `intel` is what the player knows about the facts: `probe` and `blind` only use what
   * a player can see (facts investigated or out in the open); `oracle` reads every public fact right,
   * the way a player who guesses well would (the fixed `smart` strategy also peeks). */
  var AXES = {
    intel: { oracle: '看透真相', probe: '先查证', blind: '不查证' },
    stance: { admit: '认错', refute: '只辟谣', deny: '全盘否认', blame: '甩锅' },
    fix: { early: '尽早整改', forced: '被逼才整改', never: '不整改' },
    suppress: { none: '不压制', light: '轻压制', heavy: '重压制' },
    shill: { none: '不用水军', light: '少量精品水军', heavy: '大量水军' }
  };
  /* tasks / explore: skills picked from the level itself (what the task conditions ask for, every
   * enabled skill once); picky: turns down the client's add-on jobs; blunt: ignores the red lines. */
  var TACTICS = {
    kol: '腰部 KOL 补刀', endorse: '权威背书', settle: '和解', expose: '扒皮', coopt: '招安', iron: '铁拳打谣言',
    tasks: '照任务清单做', explore: '什么技能都试试', picky: '拒接加单', blunt: '不避红线'
  };

  function describe(g) {
    if (g.base) return { idle: '摆烂（什么都不做）', shill: '纯水军洗地', honest: '真诚道歉整改', balanced: '查证后平衡处理', smart: '开天眼的高手（知道全部真相）', random: '随机乱点', guide: '照着教程卡片做' }[g.base] || g.base;
    var parts = [AXES.intel[g.intel], AXES.stance[g.stance], AXES.fix[g.fix], AXES.suppress[g.suppress], AXES.shill[g.shill]];
    if (g.tactics && g.tactics.length) parts.push(g.tactics.map(function (t) { return TACTICS[t]; }).join('、'));
    return parts.join(' · ');
  }

  /* facts the player can talk about, split by what the player knows about them */
  function factView(st, oracle) {
    var out = { knownTrue: [], knownFalse: [], unknown: [] };
    vals(st.facts).forEach(function (f) {
      if (!(f.public || f.revealed)) return;
      if (oracle || f.known || f.revealed) (f.isTrue ? out.knownTrue : out.knownFalse).push(f);
      else out.unknown.push(f);
    });
    return out;
  }

  function policyStatement(game, g) {
    var st = game.state;
    var v = factView(st, g.intel === 'oracle');
    var name = game.level.client.name;
    var kw = function (f) { return f.keywords[0] || f.text; };
    var lines = [];
    var type;
    var finish = (g.tactics || []).indexOf('blunt') >= 0 ? function (t) { return t; } : function (t) { return careful(game, t); };
    if (g.stance === 'blame') {
      /* 员工处理通报: own the problems but pin them on staff, refute the rumors */
      type = 'staff';
      lines.push('关于近日网络上反映的' + name + '相关问题，经公司调查，现通报如下：');
      v.knownTrue.filter(function (f) { return !f.admitted; }).forEach(function (f) {
        lines.push('“' + kw(f) + '”系个别涉事员工违反公司规定、擅自操作所致，公司已与其解除劳动合同。');
      });
      v.knownFalse.filter(function (f) { return !f.denied && !f.refuted; }).forEach(function (f) {
        lines.push('关于网传“' + kw(f) + '”，经核查不属实。');
      });
      lines.push('公司将加强员工管理和培训，感谢大家的监督。');
    } else if (g.stance === 'deny') {
      type = 'stern';
      lines.push('近日网络上出现大量关于' + name + '的不实信息。');
      v.knownTrue.concat(v.knownFalse, v.unknown).filter(function (f) { return !f.denied && !f.refuted && !f.admitted; }).forEach(function (f) {
        lines.push('关于“' + kw(f) + '”的说法纯属捏造，并不存在。');
      });
      lines.push('我们保留追究法律责任的权利，请大家不信谣、不传谣。');
    } else {
      var pending = st.promises.some(function (p) { return p.status === 'pending'; });
      type = g.stance === 'admit' ? (st.turn === 1 ? 'apology' : pending || st.flags.rectified ? 'rectify' : 'explain') : 'refute';
      lines.push('各位关心' + name + '的朋友：', '我们理解大家的关切，每一条留言都认真看了。');
      v.knownFalse.filter(function (f) { return !f.denied && !f.refuted; }).forEach(function (f) {
        lines.push('关于网传“' + kw(f) + '”，经核查不属实，相关证据已提交第三方。');
      });
      if (g.stance === 'admit') {
        v.knownTrue.filter(function (f) { return !f.admitted; }).forEach(function (f) {
          lines.push('关于“' + kw(f) + '”的问题确实存在，责任在我们，绝不推卸。');
        });
        if (v.unknown.length) lines.push('其余问题我们已成立专项小组全面排查，查实一项整改一项。');
        lines.push('一、全面排查所有环节；二、设立专项赔付通道；三、邀请第三方机构进驻监督。');
        if (!pending) lines.push('我们将在3日内公布调查结果。');
      } else {
        lines.push('一、开通客服专线；二、邀请第三方机构进驻监督；三、持续公开进展。');
      }
      lines.push('感谢大家的监督。');
    }
    return { type: type, channel: 'weibo', text: finish(lines.join('\n')) };
  }

  /* When to speak, on the same rhythm as `smart`: turn 1, a promise to keep (admit), and every other
   * turn when there is something to address. */
  function statementDue(game, g) {
    var st = game.state;
    if (st.counters.statementsTurn) return false;
    if (st.turn === 1) return true;
    if (g.stance === 'admit' && st.promises.some(function (p) { return p.status === 'pending'; })) return true;
    if (st.turn % 2) return false;
    var v = factView(st, g.intel === 'oracle');
    var open = g.stance === 'deny' ? v.knownTrue.concat(v.knownFalse, v.unknown).filter(function (f) { return !f.denied && !f.refuted && !f.admitted; })
      : v.knownFalse.filter(function (f) { return !f.denied && !f.refuted; }).concat(g.stance === 'admit' || g.stance === 'blame' ? v.knownTrue.filter(function (f) { return !f.admitted; }) : []);
    return open.length > 0 || g.stance === 'admit';
  }

  /* Handlers the general tactics (tasks / explore) may use for genome g: they add the skills the
   * fixed routine does not name, but never step outside the genome's own axes, so a 不整改 player
   * never rectifies and a 不压制 one never deletes. Statements stay with the stance rhythm. */
  var SUPPRESS = ['delete', 'throttle', 'trend_remove', 'control', 'distraction', 'legal'];
  function allowedBy(g) {
    return function (game, id) {
      var h = game.items[id].handler;
      if (h === 'statement') return false;
      if (h === 'rectify') return g.fix === 'early';
      if (h === 'shill') return g.shill !== 'none';
      if (h === 'scapegoat') return g.stance === 'blame';
      if (h === 'investigate') return g.intel !== 'blind';
      if (SUPPRESS.indexOf(h) >= 0) return g.suppress !== 'none';
      return true;
    };
  }

  /* One skill a running task's condition asks for (itemUses / engine flags), not yet used this turn. */
  /* Skills that push one faction a task wants raised: custom skills whose effects target it, then
   * skills on a channel it answers clearly harder (sens >= 1.3). A player reading "拉到 35" reaches
   * for these again and again. */
  function factionSkills(game, cond) {
    var st = game.state, out = [];
    var leaves = [];
    (function collect(c) {
      if (!c) return;
      if (typeof c.var === 'string') leaves.push(c);
      else if (Array.isArray(c.all)) c.all.forEach(collect);
    })(cond);
    leaves.forEach(function (l) {
      var p = String(l.var).split('.');
      if (p[0] !== 'faction' || (l.op !== '>=' && l.op !== '>') || !st.factions[p[1]] || st.factions[p[1]].sentiment >= Number(l.value)) return;
      var f = game.level.factions.filter(function (x) { return x.id === p[1]; })[0];
      game.itemOrder.forEach(function (id) {
        var it = game.items[id];
        var hits = false;
        (function look(x) {
          if (Array.isArray(x)) x.forEach(look);
          else if (U.isObj(x)) {
            if (x.type === 'faction' && x.faction === p[1] && Number(x.delta) > 0) hits = true;
            Object.keys(x).forEach(function (k) { look(x[k]); });
          }
        })(it.handler === 'custom_ai' && it.effect ? it.effect.effects : null);
        if (hits) out.unshift(id);
        else if (f && it.channel && it.handler !== 'statement' && (f.sens[it.channel] || 0) >= 1.3) out.push(id);
      });
    });
    return out.filter(function (id, i) { return out.indexOf(id) === i; });
  }

  /* Part of every routine: a level's own skill made for one faction (a custom skill whose effects
   * target it), used once a turn while a running task still wants that faction raised. Any player
   * reading "拉到 35" next to a "动员 X" skill uses it. */
  async function rallyFactions(game, ok) {
    var st = game.state;
    var defs = game.level.objectives.stages.reduce(function (a, s) { return a.concat(s.tasks); }, []).concat(game.level.objectives.side);
    for (var i = 0; i < defs.length; i++) {
      var t = st.objectives.tasks[defs[i].id];
      if (!t || t.status !== 'active') continue;
      var ids = factionSkills(game, defs[i].complete).filter(function (id) { return game.items[id].handler === 'custom_ai'; });
      for (var j = 0; j < ids.length; j++) {
        if (st.itemUsesTurn[ids[j]] || !ok(game, ids[j])) continue;
        var r = await useSkill(game, ids[j]);
        if (r) return r;
      }
    }
    return null;
  }

  async function chaseTasks(game, ok) {
    var st = game.state;
    var defs = game.level.objectives.stages.reduce(function (a, s) { return a.concat(s.tasks); }, []).concat(game.level.objectives.side);
    for (var i = 0; i < defs.length; i++) {
      var t = st.objectives.tasks[defs[i].id];
      if (!t || t.status !== 'active') continue;
      var ids = WW.Schema.condSkills(defs[i].complete).concat(factionSkills(game, defs[i].complete));
      for (var j = 0; j < ids.length; j++) {
        if (st.itemUsesTurn[ids[j]] || !game.items[ids[j]] || !ok(game, ids[j])) continue;
        var r = await useSkill(game, ids[j]);
        if (r) return r;
      }
    }
    return null;
  }

  /* The first enabled skill this game has not used yet, going round the item order from `start`:
   * AP and budget run out long before the list does, so each genome starts somewhere else and the
   * sweep as a whole reaches the skills at the end of the list too. */
  async function exploreSkills(game, start, ok) {
    var st = game.state;
    var order = game.itemOrder, n = order.length;
    for (var i = 0; i < n; i++) {
      var id = order[(start + i) % n];
      if (st.itemUses[id] || !ok(game, id)) continue;
      var r = await useSkill(game, id);
      if (r) return r;
    }
    return null;
  }

  /* The `smart` routine with its hidden-truth peeking taken out and every manipulation step behind a
   * genome switch: the core (monitor, big KOL, a measured statement rhythm) is what any competent
   * player does, the axes decide what is added on top. */
  function policy(g) {
    var has = function (t) { return (g.tactics || []).indexOf(t) >= 0; };
    var say = function (game) { return tryAct(game, 'statement', policyStatement(game, g)); };
    var start = parseInt(String(g.id || '').replace(/\D/g, ''), 10) || 0;
    var ok = allowedBy(g);
    var run = async function (game) {
      var st = game.state;
      var probed = false;
      if (statementDue(game, g)) await say(game);
      await loop(game, async function () {
        var v = factView(st, g.intel === 'oracle');
        var forced = vals(st.facts).some(function (f) { return f.isTrue && f.revealed; }) || st.flags.regulated || st.stats.heat > 75;
        var wantFix = !st.flags.rectified && st.stats.satisfaction > 35 && (g.fix === 'early' || (g.fix === 'forced' && forced));
        var rumor = v.knownFalse.filter(function (f) { return !f.refuted; })[0];
        var rumorPost = rumor && WW.Feed.visible(st).find(function (p) { return p.fact === rumor.id && !p.isClient; });
        var bigNeg = topNegative(game, function (p) { return p.author.tier !== 'normal' && !p.controlled; })[0];
        var anyNeg = topNegative(game, function (p) { return !p.controlled; })[0];
        var dirty = vals(st.opponents).find(function (o) { return o.active && (o.flags.usedShill || o.flags.spreadRumor || (game.oppDef(o.id).dirt || []).length); });
        var coopt = vals(st.opponents).find(function (o) { return o.active && game.oppDef(o.id).cooptable !== false && game.oppDef(o.id).kind !== 'victims'; });
        var victimBad = victimPressure(game);
        var probe = g.intel === 'probe' && !probed && v.unknown[0];
        (has('iron') && rumorPost && (await tryAct(game, 'iron_fist', { postId: rumorPost.id }))) ||
          (await tryAct(game, 'monitor')) ||
          (probe && (probed = !!(await tryAct(game, 'investigate', { factId: v.unknown[0].id })))) ||
          (await rallyFactions(game, ok)) ||
          (has('tasks') && (await chaseTasks(game, ok))) ||
          (has('explore') && (await exploreSkills(game, start, ok))) ||
          (g.stance === 'blame' && !st.itemUses.scapegoat && (await tryAct(game, 'scapegoat'))) ||
          (g.suppress === 'heavy' && st.stats.heat > 58 && st.stats.exposure < 50 && (await deleteSome(game, '负面帖子', 3))) ||
          (wantFix && (await tryAct(game, 'rectify'))) ||
          (has('expose') && dirty && st.monitor && (await tryAct(game, 'expose', { oppId: dirty.id }))) ||
          (g.suppress !== 'none' && st.stats.heat > 62 && (await tryAct(game, 'trend_remove'))) ||
          (has('settle') && victimBad && !st.counters.settled && (await tryAct(game, 'settle', { scale: 'medium' }))) ||
          (await tryAct(game, 'kol', { tier: 'big', brief: '用时间线和数据说话，理性看待' })) ||
          (g.suppress !== 'none' && bigNeg && (await tryAct(game, 'control', { postId: bigNeg.id }))) ||
          (statementDue(game, g) && (await say(game))) ||
          (g.shill === 'light' && st.stats.heat > 50 && (await tryAct(game, 'shill', { tier: 'premium', count: 100, direction: '其实官方说明已经发了，大家可以看看原始信息' }))) ||
          (g.shill === 'heavy' && (await tryAct(game, 'shill', { tier: 'normal', count: 1000, direction: '大家理性看待，事情还在调查中，别被带节奏' }))) ||
          (g.suppress === 'heavy' && (await deleteSome(game, '负面帖子', 6, 'throttle'))) ||
          (g.suppress === 'heavy' && anyNeg && st.stats.exposure < 50 && (await tryAct(game, 'legal', { postId: anyNeg.id }))) ||
          (g.suppress !== 'none' && st.stats.heat > 50 && (await tryAct(game, 'distraction'))) ||
          (has('endorse') && rumor && !rumor.denied && (await tryAct(game, 'endorse', { factId: rumor.id }))) ||
          (has('coopt') && coopt && (await tryAct(game, 'coopt', { oppId: coopt.id }))) ||
          (has('kol') && (await tryAct(game, 'kol', { tier: 'small', brief: '整改进展与第三方监督情况' })));
      });
    };
    run.declineOffers = has('picky');
    return run;
  }

  /* `count` genomes, deterministic for a seed: the stance x fix x suppress x shill grid first (in
   * an order that spreads it out), intel cycling through its three values, play tactics drawn at
   * random. Then `explorers` extra genomes with `tasks` and `explore` on: using what the task
   * conditions name and trying every skill is how the sweep reaches all of a level's skills, but
   * both spend AP and budget away from the routine, so they are kept out of the style draws.
   * Otherwise a grid cell whose one variant drew them plays worse, and a verdict about that cell
   * turns on the draw. Explorers are marked `explorer: true`. */
  var COVERAGE_TACTICS = ['tasks', 'explore'];
  /* The fixed `smart` routine written as a genome (it plays about as well on the built-in levels).
     The sweep always includes it, so its neighbours (the same play with 先查证 / 不查证) answer
     "can the expert win without peeking" whatever the random draws were. */
  var EXPERT = { intel: 'oracle', stance: 'admit', fix: 'early', suppress: 'heavy', shill: 'none', tactics: ['iron', 'expose', 'settle', 'kol'] };
  var PLAY_TACTICS = Object.keys(TACTICS).filter(function (t) { return COVERAGE_TACTICS.indexOf(t) < 0; });
  function genomes(count, seed, explorers) {
    var rng = U.rng(seed || 1);
    var grid = [];
    Object.keys(AXES.stance).forEach(function (stance) {
      Object.keys(AXES.fix).forEach(function (fix) {
        Object.keys(AXES.suppress).forEach(function (suppress) {
          Object.keys(AXES.shill).forEach(function (shill) { grid.push({ stance: stance, fix: fix, suppress: suppress, shill: shill }); });
        });
      });
    });
    grid = rng.shuffle(grid);
    var out = [];
    for (var i = 0; i < count; i++) {
      var g = Object.assign({}, grid[i % grid.length]);
      g.intel = ['oracle', 'probe', 'blind'][i % 3];
      g.tactics = PLAY_TACTICS.filter(function () { return rng.chance(0.5); });
      g.id = 'p' + (i + 1);
      out.push(g);
    }
    for (var j = 0; j < (explorers || 0); j++) {
      var x = Object.assign({}, grid[(count + j * 5) % grid.length]);
      x.intel = ['oracle', 'probe', 'blind'][j % 3];
      x.tactics = PLAY_TACTICS.filter(function () { return rng.chance(0.5); }).concat(COVERAGE_TACTICS);
      x.explorer = true;
      x.id = 'p' + (count + j + 1);
      out.push(x);
    }
    return out;
  }

  /* ------------------------------------------------------------------ runners */

  /* strategy: a STRATEGIES key or a strategy function; onTurn(game) after every finished turn */
  async function playBot(level, strategy, seed, difficulty, gameOpts, onTurn) {
    var game = new WW.Engine.Game(level, Object.assign({ seed: seed, difficulty: difficulty }, gameOpts || {}));
    var run = typeof strategy === 'function' ? strategy : STRATEGIES[strategy];
    var guard = 0;
    while (!game.state.finished && guard++ < 40) {
      await run(game);
      if (game.state.finished) break;
      vals(game.state.objectives.tasks).filter(function (t) { return t.status === 'offered'; }).forEach(function (t) { game.respondTask(t.id, !run.declineOffers); });
      if (game.state.objectives.mainComplete) { game.finishEarly(); break; }
      var r = await game.endTurn();
      if (!r.ok && !game.state.finished) throw new Error('endTurn failed: ' + r.reason);
      if (onTurn) onTurn(game);
    }
    return game;
  }

  /* A newcomer who does exactly what the tutorial card says: reads tips, presses the card's action
   * button (using the sample draft when one is offered) and ends the turn when the card has nothing
   * to press. Returns the finished game. */
  async function playGuide(level, seed, difficulty, onTurn) {
    var game = new WW.Engine.Game(level, { seed: seed, difficulty: difficulty });
    var st = game.state;
    var guard = 0;
    while (!st.finished && guard++ < 40) {
      var steps = 0;
      while (!st.finished && steps++ < 20) {
        var step = WW.Guide.sync(game).current;
        if (!step) break;
        if (!step.done) { WW.Guide.mark(game, step.id, 'ack'); continue; }
        var a = step.action;
        if (!a || a.cmd === 'endTurn') break;
        if (a.cmd === 'finish') { game.finishEarly(); break; }
        if (a.cmd === 'accept') { game.respondTask(a.task, true); continue; }
        var params = Object.assign({}, a.preset);
        var sample = params.sample;
        delete params.hint;
        delete params.sample;
        if (params.post) {
          var p = WW.Guide.findPost(game, params.post);
          delete params.post;
          if (p) params.postId = p.id;
        }
        if (game.items[a.item].handler === 'statement') {
          params.channel = 'weibo';
          params.text = sample ? sample.text : statementText(game, params.type || 'explain', 0.5, 0);
        }
        var r = await tryAct(game, a.item, params);
        if (!r) {
          if (step.optional) { WW.Guide.mark(game, step.id, 'skip'); continue; }
          break;
        }
      }
      if (st.finished) break;
      var res = await game.endTurn();
      if (!res.ok && !st.finished) throw new Error('endTurn failed: ' + res.reason);
      if (onTurn) onTurn(game);
    }
    return game;
  }

  WW.Bots = {
    STRATEGIES: STRATEGIES, AXES: AXES, TACTICS: TACTICS, PLAY_TACTICS: PLAY_TACTICS, COVERAGE_TACTICS: COVERAGE_TACTICS, EXPERT: EXPERT,
    tryAct: tryAct, careful: careful, statementText: statementText, smartStatement: smartStatement,
    topNegative: topNegative, deleteSome: deleteSome, paramsFor: paramsFor, useSkill: useSkill, victimPressure: victimPressure,
    policy: policy, genomes: genomes, describe: describe,
    playBot: playBot, playGuide: playGuide
  };
})(window.WW);
