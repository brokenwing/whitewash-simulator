/*
 * Opponent board (对手盘). Opponents act after the player ends a turn. Each picks a move from its
 * eligible abilities (cooldown ready, resources enough, condition true, situation fits) by
 *   utility = weight × situational multiplier
 * — weighted-random, or the best move with probability `oppSmart` (difficulty). The move chosen for
 * the next turn is published as an intent (意图); with 舆情监测 the player sees exactly what it is.
 * Effects scale with power = strength/50 × difficulty.oppMul. AI only writes the resulting posts.
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;

  function init(game) {
    var st = game.state;
    st.opponents = {};
    game.level.opponents.forEach(function (o) {
      st.opponents[o.id] = {
        id: o.id, name: o.name, avatar: o.avatar, strength: o.strength, morale: o.morale,
        resources: o.resources, income: o.income, active: o.startActive && !o.enterWhen, retired: false,
        coopted: false, cooldowns: {}, intent: null, flags: { spreadRumor: false, usedShill: false },
        history: [], usedRumors: 0, usedScandals: 0, firedEvents: {}
      };
    });
  }

  function resolveAbilities(level) {
    var map = {};
    Object.keys(D.abilities).forEach(function (id) { map[id] = U.deepClone(D.abilities[id]); });
    level.abilities.forEach(function (a) { map[a.id] = U.deepClone(a); });
    return map;
  }

  function abilityFor(game, ref) {
    var base = game.abilities[ref.use];
    if (!base) return null;
    var a = U.deepMerge(base, ref.overrides || {});
    if (ref.weight !== null && ref.weight !== undefined) a.weight = ref.weight;
    if (ref.cooldown !== null && ref.cooldown !== undefined) a.cooldown = ref.cooldown;
    a.condition = ref.condition || a.condition || null;
    a.params = a.params || {};
    return a;
  }

  function power(game, o) { return (o.strength / 50) * game.diff.oppMul; }

  function playerContent(game) {
    var st = game.state;
    return st.posts.filter(function (p) {
      return p.status !== 'deleted' && st.turn - p.turn <= 1 && (p.isClient || p.isShill || p.source === 'kol') && p.protectedUntil < st.turn && !p.oppShill;
    });
  }

  /* Situational multiplier; 0 = not eligible. */
  var SITUATION = {
    mass_report: function (game) {
      var n = playerContent(game).length;
      return n ? 1 + n * 0.4 : 0;
    },
    go_abroad: function (game, o, a) {
      var st = game.state;
      if (game.level.platforms.indexOf('overseas') < 0) return 0;
      if (st.stats.heat < (a.params.minHeat || 45)) return 0;
      var pushed = st.flags.suppressed || st.recent.deleted > 0 || st.counters.deleted > 4;
      return (pushed ? 2.5 : 0.6) * st.stats.heat / 60;
    },
    black_traffic: function (game, o, a) {
      var h = game.state.stats.heat;
      return h >= (a.params.minHeat || 40) ? h / 50 : 0;
    },
    /* a real report needs proof: the handle must already be revealed; reckless opponents report anyway */
    iron_fist: function (game, o, a) {
      var handle = game.findHandle();
      var proven = handle && handle.revealed;
      if (a.params.requiresHandle !== false && !proven) return 0;
      return proven ? 2 : 1;
    },
    dig_past: function (game, o, a) {
      var st = game.state;
      if (st.turn < (a.params.minTurn || 3)) return 0;
      var def = game.oppDef(o.id);
      var left = (def.pastScandals || []).length - o.usedScandals;
      return left > 0 || o.usedScandals < 1 ? 0.5 + st.turn / game.level.contract.turns : 0;
    },
    rumor: function (game, o) {
      return o.usedRumors < 3 ? 1 : 0.3;
    },
    archive: function (game) {
      var d = game.state.recent.deleted;
      return d > 0 ? 1 + d * 0.5 : 0;
    },
    counter_shill: function (game) {
      var st = game.state;
      return st.stats.sentiment > st.turnStart.sentiment ? 1.5 : 1;
    },
    generic: function () { return 1; }
  };

  /* reactive abilities (e.g. 截图存档) are not planned; they fire as a reaction in act() */
  function candidates(game, o, reactive) {
    var st = game.state;
    var def = game.oppDef(o.id);
    var out = [];
    def.abilities.forEach(function (ref) {
      var a = abilityFor(game, ref);
      if (!a) return;
      if (!!a.reactive !== !!reactive) return;
      if ((o.cooldowns[a.id] || 0) > st.turn) return;
      if (o.resources < (a.cost || 0)) return;
      if (a.condition && !WW.Cond.evaluate(a.condition, game)) return;
      var sit = (SITUATION[a.handler] || SITUATION.generic)(game, o, a);
      if (sit <= 0) return;
      out.push({ ability: a, utility: (a.weight || 1) * sit });
    });
    return out;
  }

  function choose(game, o) {
    var list = candidates(game, o);
    if (!list.length) return null;
    var rng = game.rng;
    if (rng.chance(game.diff.oppSmart)) {
      list.sort(function (a, b) { return b.utility - a.utility; });
      return list[0].ability;
    }
    var pass = { pass: true, utility: game.diff.passWeight * (o.resources < 10 ? 2 : 1) };
    var pick = rng.weighted(list.concat([pass]), function (x) { return x.utility; });
    return pick && !pick.pass ? pick.ability : null;
  }

  function intentOf(a) {
    return a ? { ability: a.id, name: a.name, icon: a.icon, category: a.category } : { ability: null, name: '观望', icon: '💤', category: '观望' };
  }

  function planIntents(game) {
    var st = game.state;
    Object.keys(st.opponents).forEach(function (id) {
      var o = st.opponents[id];
      o.intent = o.active ? intentOf(choose(game, o)) : null;
    });
  }

  function morale(game, o) {
    var st = game.state;
    var d = 0;
    if (st.stats.heat > 60) d += 3;
    if (st.stats.sentiment < -40) d += 2;
    if (st.stats.heat < 25) d -= 6;
    if (st.stats.sentiment > 10) d -= 3;
    if (d) game.changeMorale(o, d);
  }

  /* ---------- ability handlers: return a summary line ---------- */

  var HANDLERS = {
    mass_report: function (game, o, a, pw) {
      var st = game.state;
      var targets = playerContent(game);
      var td = a.params.takedown || {};
      var removed = 0, banned = 0;
      targets.forEach(function (p) {
        var base = p.isShill ? td.shill || 0.6 : p.source === 'kol' ? td.kol || 0.35 : td.client || 0.15;
        if (!game.rng.chance(Math.min(0.95, base * Math.min(1.5, pw)))) return;
        p.status = 'deleted';
        p.deletedTurn = st.turn;
        p.removedBy = 'report';
        removed += 1;
        if (p.isShill) {
          banned += 1;
          var b = st.shillBatches[p.shillBatch];
          if (b) b.detect *= 1.2;
        }
      });
      if (banned) game.addExposure((a.params.exposurePerBan || 3) * banned);
      if (!targets.length) game.addModifier({ kind: 'mute', turns: 1, label: '官方号被限流' });
      game.queuePosts({ kind: 'opponent', opp: o.id, count: 1, stance: -1, pool: 'opponent.mass_report', hint: '「' + o.name + '」号召大家集体举报' + game.level.client.name + '的洗地内容' });
      return removed ? '集体举报下架了你的 ' + removed + ' 条内容' + (banned ? '，封了 ' + banned + ' 批水军号' : '') : '集体举报客户官方号，官方号被限流一回合';
    },
    go_abroad: function (game, o, a, pw) {
      var st = game.state;
      st.flags.abroad = true;
      game.addStat('heat', (a.params.heat || 10) * Math.sqrt(pw));
      game.addStat('credibility', -(a.params.cred || 6) * pw);
      game.shiftFactions(-4 * pw, 'event');
      game.shiftFaction('fans', 3, 0.3);
      o.strength = U.clamp(o.strength - (a.params.strengthLoss || 8), 0, 100);
      game.queuePosts({ kind: 'opponent', opp: o.id, count: 2, stance: -2, platform: 'overseas', immune: true, pool: 'opponent.go_abroad', hint: '「' + o.name + '」把' + game.level.client.name + '的事发到外网，海外平台和媒体开始转载' });
      game.queuePosts({ kind: 'opponent', count: 1, stance: 1, faction: 'fans', hint: '部分网友反感“' + o.name + '”跑去外网告状' });
      game.addHeadline('外网热议' + game.kw(), 80, { tag: '热' });
      return '把事情捅到了外网：外网帖删不掉，但它在国内也丢了些支持';
    },
    black_traffic: function (game, o, a, pw) {
      var st = game.state;
      game.addStat('heat', (a.params.heat || 4) * pw);
      o.resources += st.stats.heat / 10;
      game.queuePosts({ kind: 'opponent', opp: o.id, count: a.params.posts || 2, stance: -2, tier: 'bigv', faction: 'media', pool: 'opponent.black_traffic', hint: '营销号蹭' + game.level.client.name + '热度批量产出标题党黑稿' });
      return '营销号批量产出黑稿蹭流量';
    },
    iron_fist: function (game, o, a, pw) {
      var handle = game.findHandle();
      if (handle && handle.revealed) {
        var p = (a.params.success || 0.75) * Math.min(1.25, pw);
        if (game.rng.chance(Math.min(0.95, p))) {
          WW.Truth.regulatorStrike(game, o.name + '实名举报');
          game.changeMorale(o, 10);
          return '实名举报成功：有关部门约谈客户，营销手段被暂停';
        }
        game.queuePosts({ kind: 'opponent', opp: o.id, count: 1, stance: -1, hint: '「' + o.name + '」晒出举报回执，表示会继续跟进' });
        return '实名举报了客户，暂时没有下文';
      }
      game.changeMorale(o, -25);
      o.strength = U.clamp(o.strength - 10, 0, 100);
      game.addStat('credibility', 4);
      game.shiftFactions(3, 'event');
      game.queuePosts({ kind: 'news', count: 1, stance: 1, tier: 'media', pool: 'ironFistFalse', vars: { opp: o.name }, hint: '「' + o.name + '」举报' + game.level.client.name + '的内容经核查不实，诬告翻车' });
      return '举报内容不实，诬告翻车反噬自身';
    },
    dig_past: function (game, o, a, pw) {
      var def = game.oppDef(o.id);
      var list = def.pastScandals || [];
      var item = list[o.usedScandals];
      o.usedScandals += 1;
      var text, isTrue = true;
      if (item) {
        text = typeof item === 'string' ? item : item.text;
        isTrue = typeof item === 'string' ? true : item.isTrue !== false;
      } else {
        text = U.tpl(game.rng.pick(D.pools.pastScandals), game.textVars());
      }
      var fid = game.addFact({ text: text, isTrue: isTrue, weight: 1, origin: 'past', by: o.id, keywords: [] }, { reveal: false });
      game.queuePosts({ kind: 'opponent', opp: o.id, count: 2, stance: -2, fact: fid, hint: '「' + o.name + '」翻出旧账：' + text });
      if (isTrue) WW.Truth.reveal(game, fid, o.name + '翻旧账');
      else {
        game.shiftFactions(-3 * pw, 'event');
        game.addStat('heat', 4);
      }
      return '翻出旧账：“' + text + '”';
    },
    rumor: function (game, o, a, pw) {
      var def = game.oppDef(o.id);
      var text = def.rumors[o.usedRumors] || U.tpl(game.rng.pick(D.pools.rumors), game.textVars());
      o.usedRumors += 1;
      var fid = game.addFact({ text: text, isTrue: false, weight: 1, origin: 'rumor', by: o.id, keywords: [] }, { reveal: false });
      game.shiftFactions(-5 * pw, 'event');
      game.addStat('heat', 6);
      o.flags.spreadRumor = true;
      game.queuePosts({ kind: 'opponent', opp: o.id, count: 2, stance: -2, fact: fid, pool: 'opponent.rumor', vars: { rumor: text }, hint: '散布谣言：' + text });
      return '散布谣言：“' + text + '”';
    },
    archive: function (game, o, a, pw) {
      var st = game.state;
      var deleted = st.posts.filter(function (p) { return p.status === 'deleted' && p.deletedTurn >= st.turn - 1 && !p.isClient && p.removedBy !== 'platform'; });
      var picks = game.rng.sample(deleted, Math.min(2, deleted.length));
      picks.forEach(function (p) {
        WW.Feed.create(game, {
          authorObj: { name: o.name, tier: 'kol', faction: game.oppDef(o.id).faction, persona: null, opp: o.id },
          content: '【截图存档】' + p.author.name + '：' + p.content.slice(0, 160), stance: Math.min(p.stance, -1),
          fact: p.fact, isScreenshot: true, opp: o.id, tags: ['截图'], source: 'opponent:' + o.id
        });
      });
      game.addExposure(6 * pw);
      game.addStat('heat', 4);
      return picks.length ? '把你删掉的 ' + picks.length + ' 条帖子做成截图重新流传' : '到处喊“删帖了”，暴露度上升';
    },
    counter_shill: function (game, o, a, pw) {
      game.shiftFactions(-(a.params.power || 4) * pw, 'event');
      o.flags.usedShill = true;
      game.queuePosts({ kind: 'opponent', opp: o.id, count: a.params.posts || 3, stance: -2, pool: 'opponent.counter_shill', oppShill: true, hint: '一批新注册账号集中抹黑' + game.level.client.name + '（其实是对家买的水军）', tags: [] });
      return '买了一批水军抹黑客户（这也是它的把柄）';
    },
    generic: function (game, o, a) {
      WW.Effects.apply(game, a.effects, { id: a.id, title: a.name });
      if (a.posts > 0) game.queuePosts({ kind: 'opponent', opp: o.id, count: a.posts, stance: a.stance, hint: a.aiHint || ('「' + o.name + '」使出“' + a.name + '”') });
      return a.desc || ('使出“' + a.name + '”');
    }
  };

  function execute(game, o, a, lines) {
    var st = game.state;
    var pw = power(game, o);
    var fn = HANDLERS[a.handler] || HANDLERS.generic;
    var text = fn(game, o, a, pw);
    o.resources = Math.max(0, o.resources - (a.cost || 0));
    o.cooldowns[a.id] = st.turn + 1 + (a.cooldown || 0);
    o.history.push({ turn: st.turn, ability: a.id, text: text });
    o.lastMove = { turn: st.turn, ability: a.id, name: a.name, icon: a.icon, text: text };
    game.log('opponent', '「' + o.name + '」' + a.icon + a.name + '：' + text);
    lines.push({ kind: 'opponent', opp: o.id, text: '「' + o.name + '」' + a.name + '：' + text });
  }

  function act(game, lines) {
    var st = game.state;
    Object.keys(st.opponents).forEach(function (id) {
      var o = st.opponents[id];
      if (!o.active) return;
      o.resources += o.income * (0.5 + st.stats.heat / 100) * game.diff.oppMul;
      morale(game, o);
      if (!o.active) return;
      candidates(game, o, true).forEach(function (c) { execute(game, o, c.ability, lines); });
      var a = null;
      if (o.intent && o.intent.ability) {
        var ref = game.oppDef(o.id).abilities.filter(function (r) { return r.use === o.intent.ability; })[0];
        var planned = ref ? abilityFor(game, ref) : null;
        var still = planned && candidates(game, o).some(function (c) { return c.ability.id === planned.id; });
        a = still ? planned : choose(game, o);
      } else if (!o.intent) {
        a = choose(game, o);
      }
      if (a) execute(game, o, a, lines);
      else o.lastMove = { turn: st.turn, ability: null, name: '观望', icon: '💤', text: '按兵不动' };
    });
  }

  function checkEntries(game, lines) {
    var st = game.state;
    game.level.opponents.forEach(function (def) {
      var o = st.opponents[def.id];
      if (!o || o.active || o.retired || o.entered || !def.enterWhen) return;
      if (WW.Cond.evaluate(def.enterWhen, game)) {
        o.active = true;
        o.entered = true;
        game.message('system', '新对手入场：「' + o.name + '」' + (def.desc ? '——' + def.desc : ''), 'bad');
        lines.push({ kind: 'opponent', opp: o.id, text: '新对手入场：「' + o.name + '」' });
      }
    });
  }

  function signatureEvents(game, lines) {
    var st = game.state;
    game.level.opponents.forEach(function (def) {
      var o = st.opponents[def.id];
      if (!o || !o.active) return;
      def.events.forEach(function (e) {
        if (e.once && o.firedEvents[e.id]) return;
        if (!WW.Cond.evaluate(e.trigger, game)) return;
        if (!game.rng.chance(e.chance)) return;
        o.firedEvents[e.id] = st.turn;
        WW.Effects.apply(game, e.effects, { id: e.id, title: e.title });
        game.log('opponent', '「' + o.name + '」专属事件：' + e.title);
        lines.push({ kind: 'opponent', opp: o.id, text: '「' + o.name + '」' + e.title });
      });
    });
  }

  WW.Opponents = {
    init: init,
    resolveAbilities: resolveAbilities,
    abilityFor: abilityFor,
    candidates: candidates,
    choose: choose,
    planIntents: planIntents,
    act: act,
    checkEntries: checkEntries,
    signatureEvents: signatureEvents,
    HANDLERS: HANDLERS
  };
})(window.WW);
