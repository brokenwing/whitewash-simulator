/*
 * End-of-turn simulation (回合演化). Numbers only — content is generated afterwards from the
 * plan returned by feedPlan(), so the AI always writes text that matches the numbers.
 *   target_f = bias_f + pressureWeight·Π + credibilityWeight·(C-50) - severity·severityWeight·H/100
 *   s_f     += volatility_f · driftRate · (target_f - s_f)
 *   H        = H·(1-decay) + max(0,-Π)·spreadWeight·(0.4 + H/100)
 */
(function (WW) {
  'use strict';

  var U = WW.U;

  function tickModifiers(game, lines) {
    var st = game.state;
    var keep = [];
    st.modifiers.forEach(function (m) {
      if (m.kind === 'stat' && m.stat) {
        if (m.stat === 'sentiment') game.shiftFactions(m.delta, 'event', { uniform: true });
        else game.addStat(m.stat, m.delta);
      } else if (m.kind === 'rectify') {
        game.shiftFactions(5, 'rectify');
        game.addStat('credibility', 3);
        game.addStat('heat', -4);
      }
      m.turns -= 1;
      if (m.turns > 0) keep.push(m);
      else if (m.label) lines.push({ kind: 'modifier', text: m.label + '结束' });
    });
    st.modifiers = keep;
  }

  function driftFactions(game, P) {
    var st = game.state;
    var T = game.level.tuning;
    var C = st.stats.credibility;
    var H = st.stats.heat;
    var sev = game.level.incident.severity;
    Object.keys(st.factions).forEach(function (id) {
      var f = st.factions[id];
      var target = f.bias + T.pressureWeight * P + T.credibilityWeight * (C - 50) - sev * T.severityWeight * H / 100;
      f.sentiment = U.clamp(f.sentiment + f.volatility * T.driftRate * (target - f.sentiment), -100, 100);
    });
    game.recompute();
  }

  function detectShills(game, lines) {
    var st = game.state;
    var T = game.level.tuning;
    var sleuth = st.factions.sleuth ? st.factions.sleuth.size : 0.1;
    var sleuthFactor = 0.6 + 4 * sleuth;
    st.shillBatches.forEach(function (b) {
      if (b.exposed || st.turn - b.turn > 5) return;
      var p = T.detectBase * b.detect * (0.25 + st.stats.exposure / 100) * game.diff.detectMul * sleuthFactor * 0.35;
      if (!game.rng.chance(Math.min(0.85, p))) return;
      b.exposed = true;
      game.shiftFactions(-b.impulse * 1.6, 'event');
      game.addStat('credibility', -5);
      game.addStat('heat', 8);
      game.addExposure(12);
      game.shiftFaction('sleuth', -6, 0.5);
      st.posts.forEach(function (post) {
        if (post.shillBatch === b.id && post.status !== 'deleted') {
          post.exposed = true;
          post.stance = -1;
          if (post.tags.indexOf('疑似水军') < 0) post.tags.push('疑似水军');
        }
      });
      st.counters.shillExposed += 1;
      game.queuePosts({ kind: 'expose', count: 2, stance: -2, tier: 'kol', faction: 'sleuth', pool: 'expose', hint: '网友扒出' + game.level.client.name + '的水军：' + b.count + ' 条“' + b.direction + '”', tags: ['扒水军'] });
      game.addHeadline(game.level.client.name + '水军', 85, { tag: '热' });
      lines.push({ kind: 'expose', text: '水军被扒：“' + b.direction + '”那批 ' + b.count + ' 条被网友起底' });
    });
  }

  var RISKS = {
    kol: function (game, r) {
      game.shiftFactions(-(r.data.impulse || 4) * 1.2, 'event');
      game.addStat('credibility', -5);
      game.addExposure(6, true);
      var p = WW.Feed.find(game.state, r.data.postId);
      if (p && p.tags.indexOf('恰饭') < 0) p.tags.push('恰饭');
      game.queuePosts({ kind: 'expose', count: 1, stance: -2, tier: 'kol', faction: 'sleuth', hint: '网友扒出那篇“理性分析”软文是收钱发的，恰饭实锤', tags: ['恰饭'] });
      return 'KOL 恰饭被扒';
    },
    settle: function (game) {
      game.shiftFactions(-15, 'event');
      game.addStat('credibility', -12);
      game.addStat('heat', 15);
      game.addExposure(10, true);
      game.queuePosts({ kind: 'expose', count: 2, stance: -2, pool: 'settleLeak', hint: '和解封口协议流出：' + game.level.client.name + '花钱让受害者删帖', tags: ['封口'] });
      return '封口协议泄露';
    },
    coopt: function (game, r) {
      game.shiftFactions(-12, 'event');
      game.addStat('credibility', -10);
      game.addExposure(12, true);
      game.queuePosts({ kind: 'expose', count: 1, stance: -2, pool: 'cooptLeak', vars: { opp: r.data.name }, hint: '“' + r.data.name + '”收钱闭嘴的转账记录流出', tags: ['收买'] });
      var o = game.state.opponents[r.data.opp];
      if (o && game.rng.chance(0.5)) {
        o.active = true;
        o.retired = false;
        o.morale = 60;
        game.message('system', '「' + o.name + '」拿了钱又反咬一口，重新入场！', 'bad');
      }
      return '收买交易泄露';
    },
    endorse: function (game, r) {
      game.addStat('credibility', -10);
      game.addExposure(10, true);
      game.shiftFactions(-8, 'event');
      WW.Truth.reveal(game, r.data.fact, '检测机构被扒');
      return '“第三方报告”造假被扒';
    },
    wrongful: function (game, r) {
      game.shiftFactions(-10, 'event');
      game.addExposure(10, true);
      game.addStat('heat', 8);
      game.queuePosts({ kind: 'backfire', count: 1, stance: -2, hint: '被封号的“' + r.data.name + '”换号复出，控诉自己说真话却被举报', tags: ['冤案'] });
      return '被冤枉的“' + r.data.name + '”复出控诉';
    }
  };

  function rollRisks(game, lines) {
    var st = game.state;
    var keep = [];
    st.risks.forEach(function (r) {
      if (r.turn === st.turn) { keep.push(r); return; }
      if (st.turn - r.turn > 6) return;
      var fn = RISKS[r.type];
      if (fn && game.rng.chance(Math.min(0.9, r.chance * game.diff.detectMul))) {
        var text = fn(game, r);
        lines.push({ kind: 'risk', text: '旧账爆雷：' + text });
      } else keep.push(r);
    });
    st.risks = keep;
  }

  function updateClient(game, lines, before) {
    var st = game.state;
    var dS = st.stats.sentiment - before.sentiment;
    var dH = st.stats.heat - before.heat;
    var dQ = 0.25 * dS - Math.max(0, dH) * 0.25 - (st.stats.heat >= 70 ? 2 : 0);
    var spentTurn = st.spent - before.spent;
    if (spentTurn > st.budgetInitial * 0.4) {
      dQ -= 4;
      game.message('client', game.pick('client', 'spend'), 'bad');
    }
    if (dQ < 0) dQ /= game.diff.patienceMul;
    game.addStat('satisfaction', dQ);
    game.level.client.expectations.forEach(function (x) {
      if (x.byTurn !== st.turn) return;
      if (!WW.Cond.evaluate(x.condition, game)) {
        game.addStat('satisfaction', -x.penalty / game.diff.patienceMul);
        game.message('client', x.text || '说好的进度呢？', 'angry');
        lines.push({ kind: 'client', text: '未达成客户期望：' + (x.text || WW.Cond.describe(x.condition, game.level)) });
      }
    });
    return dQ;
  }

  function phaseOf(heat) {
    return heat >= 70 ? 3 : heat >= 40 ? 2 : heat >= 15 ? 1 : 0;
  }

  function updateTrend(game) {
    var st = game.state;
    var H = st.stats.heat;
    var rank = H >= 85 ? 1 : H >= 72 ? 2 : H >= 62 ? 3 : H >= 52 ? 5 : H >= 42 ? 8 : H >= 30 ? 15 : H >= 18 ? 30 : 99;
    var distractions = st.trend.list.filter(function (t) { return t.distraction && st.turn - t.turn <= 1; }).length;
    if (rank < 99) rank += distractions * 2;
    if (st.trend.removedTurn === st.turn) rank = 99;
    st.trend.rank = rank;
    st.trend.list = st.trend.list.filter(function (t) { return st.turn - t.turn <= 2; });
  }

  function step(game, lines) {
    var st = game.state;
    var T = game.level.tuning;
    var before = { sentiment: st.turnStart.sentiment, heat: st.turnStart.heat, spent: st.turnStart.spent };
    tickModifiers(game, lines);
    var P = WW.Feed.pressure(game);
    st.lastPressure = U.round(P, 3);
    driftFactions(game, P);
    var H = st.stats.heat;
    var spread = Math.max(0, -P) * T.spreadWeight * (H / 100);
    st.stats.heat = U.clamp(H * (1 - T.heatDecay) + spread, 0, 100);
    if (!st.counters.manipTurn) game.addStat('exposure', -T.exposureCooldown);
    /* difficulty exposureRelief: suspicion fades by this share every turn, even while manipulating */
    if (game.diff.exposureRelief) game.addStat('exposure', -st.stats.exposure * game.diff.exposureRelief);
    detectShills(game, lines);
    rollRisks(game, lines);
    updateClient(game, lines, before);
    st.counters.collapseTurns = st.stats.sentiment <= -85 ? st.counters.collapseTurns + 1 : 0;
    WW.Feed.tick(game);
    game.recompute();
  }

  /* Gaussian-ish noise from 3 uniforms. */
  function noise(rng) { return (rng.next() + rng.next() + rng.next() - 1.5) / 0.5; }

  function stanceFor(sentiment, rng) {
    var s = sentiment + noise(rng) * 22;
    return s < -45 ? -2 : s < -12 ? -1 : s < 12 ? 0 : s < 45 ? 1 : 2;
  }

  var VOCAL = { victim: 1.6, sleuth: 1.4, rival: 1.2, media: 0.8, fans: 1, passerby: 1 };

  /* Slots for this turn's content: organic chatter sampled from factions + queued requests. */
  function feedPlan(game) {
    var st = game.state;
    var rng = game.rng;
    var T = game.level.tuning;
    var H = st.stats.heat;
    var n = Math.round(2 + T.organicPosts * (0.25 + H / 100 * 0.9));
    var chill = game.hasModifier('chill');
    var factions = Object.keys(st.factions).map(function (id) { return st.factions[id]; });
    var slots = [];
    for (var i = 0; i < n; i++) {
      var f = rng.weighted(factions, function (x) { return x.size * (VOCAL[x.id] || 1); });
      if (!f) break;
      var stance = stanceFor(f.sentiment, rng);
      if (chill && stance < 0 && rng.chance(0.3)) stance += 1;
      var r = rng.next();
      var tier = r < 0.74 ? 'normal' : r < 0.9 ? 'kol' : r < 0.98 ? 'bigv' : 'media';
      if (tier === 'media' && stance > 0) tier = 'kol';
      slots.push({ kind: 'organic', faction: f.id, stance: stance, tier: tier, platform: WW.Feed.pickPlatform(game) });
    }
    st.postQueue.forEach(function (req, ri) {
      var c = Math.max(1, Math.min(4, req.count || 1));
      for (var k = 0; k < c; k++) {
        slots.push({
          kind: 'request', ref: ri, faction: req.faction || (req.opp ? (game.oppDef(req.opp) || {}).faction : null) || (req.stance >= 0 ? 'passerby' : 'passerby'),
          stance: U.clamp(req.stance === undefined ? -1 : req.stance, -2, 2), tier: req.tier || 'normal',
          platform: req.platform || (req.opp ? (game.oppDef(req.opp) || {}).platform : null) || WW.Feed.pickPlatform(game),
          hint: req.hint || '', pool: req.pool || null, vars: req.vars || null, fact: req.fact || null, opp: req.opp || null,
          tags: req.tags || [], source: req.source || req.kind || 'event', isScreenshot: !!req.isScreenshot, immune: !!req.immune,
          oppShill: !!req.oppShill
        });
      }
    });
    slots.forEach(function (s, idx) { s.slot = idx + 1; });
    return slots;
  }

  function clientMood(game, dQ) {
    var st = game.state;
    if (dQ >= 4 || st.stats.satisfaction >= 85) return 'great';
    if (dQ >= 1) return 'good';
    if (dQ > -2) return 'neutral';
    if (dQ > -6 && st.stats.satisfaction > 30) return 'bad';
    return 'angry';
  }

  WW.Sim = {
    step: step,
    feedPlan: feedPlan,
    phaseOf: phaseOf,
    updateTrend: updateTrend,
    clientMood: clientMood,
    stanceFor: stanceFor
  };
})(window.WW);
