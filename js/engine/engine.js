/*
 * Game orchestrator. One Game instance = one run of one level; nothing is shared between runs.
 *   new WW.Engine.Game(level, { difficulty, seed, aiRunner, save })
 *   game.act(itemId, params)      perform an item (async; may call AI)
 *   game.preview(itemId, params)  two-step items (删帖/限流) candidate list
 *   game.endTurn()                opponents -> simulation -> turn start events -> feed generation
 *   game.respondTask(id, accept)  accept / decline an offered side task
 *   game.finishEarly()            close the case once the main quest is complete
 * Events emitted: change, busy, turn, end, message, log, task, mainComplete, aiError.
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;

  function resolveDifficulty(level, id) {
    var base = D.difficulties[id] || D.difficulties.regular;
    var over = level.difficulty.overrides[id];
    return over ? U.deepMerge(base, over) : U.deepClone(base);
  }

  function Game(level, opts) {
    WW.Emitter.call(this);
    opts = opts || {};
    this.level = WW.Schema.normalize(level);
    this.items = WW.Items.resolve(this.level);
    this.itemOrder = WW.Items.order(this.level, this.items);
    this.abilities = WW.Opponents.resolveAbilities(this.level);
    this.aiRunner = opts.aiRunner || null;
    this.busy = false;
    if (opts.save && opts.save.state) {
      this.state = opts.save.state;
      this.diff = resolveDifficulty(this.level, this.state.difficulty);
      this.rng = new U.Rng(0);
      this.rng.s = this.state.rngState >>> 0;
    } else {
      var allowed = this.level.difficulty.allowed;
      var diffId = allowed.indexOf(opts.difficulty) >= 0 ? opts.difficulty : allowed.indexOf('regular') >= 0 ? 'regular' : allowed[0];
      this.diff = resolveDifficulty(this.level, diffId);
      var seed = opts.seed !== undefined ? opts.seed : ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
      this.rng = U.rng(typeof seed === 'number' ? seed >>> 0 : U.hash(seed));
      this._initState(diffId, seed);
    }
  }

  Game.prototype = Object.create(WW.Emitter.prototype);
  Game.prototype.constructor = Game;
  var P = Game.prototype;

  P._initState = function (diffId, seed) {
    var lv = this.level;
    var d = this.diff;
    var st = {
      v: 1, levelId: lv.id, difficulty: diffId, seed: seed, rngState: 0,
      turn: 1, phase: 0, finished: false, result: null, endTitle: '', endText: '', endEpilogue: '', final: null,
      stats: { sentiment: 0, heat: 0, credibility: 0, exposure: 0, satisfaction: 0 },
      budget: 0, budgetInitial: 0, spent: 0, apMax: 1, ap: 1,
      factions: {}, facts: {}, lieDebt: 0, promises: [], posts: [], seq: 0, banned: {},
      trend: { rank: 99, list: [], removedTurn: 0, main: '' },
      items: { unlockedTier: lv.items.startTier, unlocked: {}, locked: {}, vouchers: {}, readyTurn: {} },
      itemUses: {}, itemUsesTurn: {}, monitor: false, modifiers: [], shillBatches: [], risks: [],
      opponents: {}, objectives: null, flags: {},
      counters: {
        deleted: 0, statements: 0, statementsTurn: 0, scoreBonus: 0, collapseTurns: 0, trendRemoved: 0,
        distractions: 0, ironFist: 0, settled: 0, legal: 0, scapegoat: 0, shillExposed: 0, faceSlaps: 0,
        regulated: 0, manipTurn: 0
      },
      recent: { playerContent: 0, deleted: 0, suppressed: 0 },
      log: [], messages: [], history: [], postQueue: [], briefing: null, firedEvents: {},
      turnActions: [], lastTurnActions: [], turnStart: null, lastStatement: null, lastPressure: 0
    };
    this.state = st;
    var shift = d.initialShift || {};
    st.stats.heat = U.clamp(lv.initialStats.heat + (shift.heat || 0), 0, 100);
    st.stats.credibility = lv.initialStats.credibility;
    st.stats.exposure = lv.initialStats.exposure;
    st.stats.satisfaction = lv.initialStats.satisfaction;
    st.budget = st.budgetInitial = U.round(lv.contract.budget * d.budgetMul, 1);
    st.apMax = Math.max(1, lv.contract.actionPoints + (d.apDelta || 0));
    st.ap = st.apMax;

    var total = U.sum(lv.factions, function (f) { return f.size; }) || 1;
    lv.factions.forEach(function (f) {
      st.factions[f.id] = { id: f.id, name: f.name, size: f.size / total, sentiment: f.sentiment, volatility: f.volatility, bias: f.bias, sens: U.deepClone(f.sens) };
    });
    this.recompute();
    var off = lv.initialStats.sentiment + (shift.sentiment || 0) - st.stats.sentiment;
    Object.keys(st.factions).forEach(function (id) {
      var f = st.factions[id];
      f.sentiment = U.clamp(f.sentiment + off, -100, 100);
      f.bias = U.clamp(f.bias + off * 0.5, -100, 100);
    });
    this.recompute();

    lv.facts.forEach(function (f) {
      st.facts[f.id] = {
        id: f.id, text: f.text, clientClaim: f.clientClaim, isTrue: f.isTrue, regulatory: f.regulatory, weight: f.weight,
        keywords: f.keywords.slice(), tags: f.tags.slice(), origin: f.origin, public: f.publicAtStart,
        revealed: false, admitted: false, denied: false, refuted: false, known: false, fixed: false, debt: 0,
        evidence: f.evidence ? U.deepMerge(f.evidence, { delays: 0, suppressed: false }) : null, by: null
      };
    });
    WW.Opponents.init(this);
    WW.Objectives.init(this);

    var self = this;
    var vars = this.textVars();
    lv.seedPosts.forEach(function (p) {
      WW.Feed.create(self, {
        author: p.author, persona: p.persona, tier: p.tier, faction: p.faction, platform: p.platform,
        content: U.tpl(p.content, vars), stance: p.stance, fact: p.fact, likes: p.likes || undefined,
        tags: p.tags, comments: p.comments, opp: p.opp, source: 'seed', turn: 1
      });
    });
    st.trend.main = lv.client.name + lv.incident.keywords[0];
    WW.Sim.updateTrend(this);
    st.phase = WW.Sim.phaseOf(st.stats.heat);
    st.turnStart = this.snapshot();
    st.history.push(this.historyPoint());
    WW.Opponents.planIntents(this);
    this.message('client', lv.client.intro || ('情况你们都看到了，' + lv.client.name + '这次的事必须尽快压下去。预算给你们了，' + lv.contract.turns + ' 个回合内给我结果。'), 'neutral');
    st.briefing = { turn: 1, lines: [], deltas: null, summary: lv.incident.summary, first: true };
    st.rngState = this.rng.s;
  };

  /* ---------------------------------------------------------------- helpers */

  P.textVars = function () {
    var lv = this.level;
    return { client: lv.client.name, contact: lv.client.contact, kw: this.kw(), firm: D.pools.firm };
  };

  P.kw = function () {
    return this.rng.pick(this.level.incident.keywords) || this.level.meta.title;
  };

  P.pool = function (path) {
    var mine = U.get(this.level.offline, path);
    var base = U.get(D.pools, path);
    return [].concat(Array.isArray(mine) ? mine : [], Array.isArray(base) ? base : []);
  };

  P.pick = function (group, key, extra) {
    var list = this.pool(key ? group + '.' + key : group);
    var vars = this.textVars();
    if (extra) Object.keys(extra).forEach(function (k) { vars[k] = extra[k]; });
    return U.tpl(this.rng.pick(list) || '', vars);
  };

  P.recompute = function () {
    var st = this.state;
    var s = 0, w = 0;
    Object.keys(st.factions).forEach(function (id) {
      var f = st.factions[id];
      s += f.size * f.sentiment;
      w += f.size;
    });
    st.stats.sentiment = U.clamp(w ? s / w : 0, -100, 100);
  };

  P.addStat = function (stat, delta, opts) {
    delta = Number(delta) || 0;
    if (!delta) return 0;
    if (stat === 'sentiment') return this.shiftFactions(delta, (opts && opts.channel) || 'event', { uniform: true });
    var st = this.state;
    if (st.stats[stat] === undefined) return 0;
    var before = st.stats[stat];
    st.stats[stat] = U.clamp(before + delta, 0, 100);
    return st.stats[stat] - before;
  };

  P.addExposure = function (d) {
    return this.addStat('exposure', d > 0 ? d * this.diff.exposureMul : d);
  };

  P.markManipulation = function () { this.state.counters.manipTurn += 1; };

  /* Route an impulse through faction sensitivities; part of it persists into each faction's bias. */
  P.shiftFactions = function (impulse, channel, opts) {
    opts = opts || {};
    impulse = Number(impulse) || 0;
    var st = this.state;
    var ch = D.channels[channel] || D.channels.event;
    var persist = opts.persist !== undefined ? opts.persist : ch.persist;
    var before = st.stats.sentiment;
    Object.keys(st.factions).forEach(function (id) {
      if (opts.only && opts.only.indexOf(id) < 0) return;
      var f = st.factions[id];
      var sens = opts.uniform ? 1 : f.sens[channel] !== undefined ? f.sens[channel] : 1;
      var d = impulse * sens;
      f.sentiment = U.clamp(f.sentiment + d, -100, 100);
      f.bias = U.clamp(f.bias + d * persist, -100, 100);
    });
    this.recompute();
    return st.stats.sentiment - before;
  };

  P.shiftFaction = function (id, delta, persist) {
    var f = this.state.factions[id];
    if (!f) return 0;
    f.sentiment = U.clamp(f.sentiment + delta, -100, 100);
    f.bias = U.clamp(f.bias + delta * (persist || 0), -100, 100);
    this.recompute();
    return delta;
  };

  P.spend = function (cost) {
    var st = this.state;
    st.budget = Math.max(0, U.round(st.budget - cost, 1));
    st.spent = U.round(st.spent + cost, 1);
  };

  P.log = function (kind, text, extra) {
    var st = this.state;
    var entry = { turn: st.turn, kind: kind, text: text };
    if (extra) entry.extra = extra;
    st.log.push(entry);
    if (st.log.length > 400) st.log.shift();
    this.emit('log', entry);
  };

  P.message = function (from, text, mood) {
    var st = this.state;
    var m = { turn: st.turn, from: from || 'system', text: String(text || ''), mood: mood || 'neutral' };
    st.messages.push(m);
    if (st.messages.length > 200) st.messages.shift();
    this.emit('message', m);
  };

  P.queuePosts = function (req) { this.state.postQueue.push(req); };

  P.revealFact = function (id, source) { return WW.Truth.reveal(this, id, source); };

  P.addFact = function (def, opts) {
    var st = this.state;
    st.seq += 1;
    var id = def.id && !st.facts[def.id] ? def.id : 'dyn' + st.seq;
    st.facts[id] = {
      id: id, text: String(def.text || ''), clientClaim: def.clientClaim || '', isTrue: !!def.isTrue, regulatory: !!def.regulatory,
      weight: U.clamp(Number(def.weight) || 1, 0.5, 3), keywords: def.keywords || [], tags: def.tags || [],
      origin: def.origin || 'dynamic', public: true, revealed: false, admitted: false, denied: false, refuted: false,
      known: false, fixed: false, debt: 0, evidence: null, by: def.by || null
    };
    if (opts && opts.reveal && def.isTrue) WW.Truth.reveal(this, id, def.source || '曝光');
    return id;
  };

  P.addHeadline = function (text, heat, opts) {
    opts = opts || {};
    var st = this.state;
    st.trend.list.push({ title: String(text).replace(/^#|#$/g, '').slice(0, 30), heat: heat || 50, tag: opts.tag || '', turn: st.turn, distraction: !!opts.distraction });
    if (st.trend.list.length > 14) st.trend.list.shift();
  };

  P.unlockTier = function (n) { this.state.items.unlockedTier = Math.max(this.state.items.unlockedTier, n); };

  P.unlockItems = function (ids) {
    var st = this.state;
    ids.forEach(function (id) { st.items.unlocked[id] = true; });
  };

  P.lockItems = function (ids, turns) {
    var st = this.state;
    var self = this;
    ids.forEach(function (id) {
      if (self.items[id]) st.items.locked[id] = Math.max(st.items.locked[id] || 0, st.turn + turns);
    });
  };

  P.addModifier = function (m) { this.state.modifiers.push(m); };

  P.hasModifier = function (kind) {
    return this.state.modifiers.some(function (m) { return m.kind === kind && m.turns > 0; });
  };

  P.hasTrueFactTag = function (tag) {
    var facts = this.state.facts;
    return Object.keys(facts).some(function (id) { return facts[id].isTrue && facts[id].tags.indexOf(tag) >= 0; });
  };

  P.addLieDebt = function (factId, amount) {
    var st = this.state;
    st.lieDebt = U.round(st.lieDebt + amount, 2);
    if (factId && st.facts[factId]) st.facts[factId].debt += amount;
  };

  P.oppDef = function (id) {
    return this.level.opponents.filter(function (o) { return o.id === id; })[0] || null;
  };

  /* A true, regulatory, unfixed, public fact = something an opponent can report (把柄). */
  P.findHandle = function () {
    var facts = this.state.facts;
    var list = Object.keys(facts).map(function (id) { return facts[id]; }).filter(function (f) {
      return f.isTrue && f.regulatory && !f.fixed && (f.public || f.revealed);
    });
    list.sort(function (a, b) { return (b.revealed ? 1 : 0) - (a.revealed ? 1 : 0); });
    return list[0] || null;
  };

  P.changeMorale = function (o, d) {
    if (!o) return;
    o.morale = U.clamp(o.morale + d, 0, 100);
    if (o.morale <= 0 && o.active) this.retireOpponent(o, '「' + o.name + '」士气归零，偃旗息鼓。');
  };

  P.retireOpponent = function (o, text) {
    if (!o.active) return;
    o.active = false;
    o.retired = true;
    o.intent = null;
    var msg = text || '「' + o.name + '」退场了。';
    this.message('system', msg, 'good');
    this.log('opponent', msg);
  };

  P.snapshot = function () {
    var st = this.state;
    var f = {};
    Object.keys(st.factions).forEach(function (id) { f[id] = st.factions[id].sentiment; });
    return {
      sentiment: st.stats.sentiment, heat: st.stats.heat, credibility: st.stats.credibility, exposure: st.stats.exposure,
      satisfaction: st.stats.satisfaction, budget: st.budget, spent: st.spent, factions: f
    };
  };

  P.diffSnapshot = function (before) {
    var now = this.snapshot();
    var out = {};
    ['sentiment', 'heat', 'credibility', 'exposure', 'satisfaction', 'budget'].forEach(function (k) {
      var d = U.round(now[k] - before[k], 1);
      if (d) out[k] = d;
    });
    return out;
  };

  P.historyPoint = function () {
    var st = this.state;
    return {
      turn: st.turn, sentiment: U.round(st.stats.sentiment, 1), heat: U.round(st.stats.heat, 1), credibility: U.round(st.stats.credibility, 1),
      exposure: U.round(st.stats.exposure, 1), satisfaction: U.round(st.stats.satisfaction, 1), budget: st.budget
    };
  };

  P.turnLabel = function (turn) {
    var c = this.level.contract;
    return U.turnLabel(turn || this.state.turn, c.slotsPerDay, c.turnLabels);
  };

  /* ---------------------------------------------------------------- AI bridge */

  P.runAI = function (task, args, opts) {
    var self = this;
    var runner = this.aiRunner || function (game, t, a) {
      return Promise.resolve({ data: WW.Offline.run(game, t, a), source: 'offline' });
    };
    return Promise.resolve().then(function () { return runner(self, task, args, opts); }).then(function (res) {
      if (res && res.error) self.emit('aiError', { task: task, error: res.error });
      return res;
    }).catch(function (e) {
      self.emit('aiError', { task: task, error: String(e && e.message || e) });
      return { data: WW.Offline.run(self, task, args), source: 'offline', error: String(e) };
    });
  };

  /* ---------------------------------------------------------------- actions */

  P.itemStatus = function (id, params) { return WW.Items.status(this, id, params); };

  P.preview = function (id, params) {
    var self = this;
    var item = this.items[id];
    var h = item && WW.Actions.get(item.handler);
    if (!h || !h.preview) return Promise.resolve(null);
    if (this.busy) return Promise.resolve(null);
    this.busy = true;
    this.emit('busy', true);
    return Promise.resolve().then(function () { return h.preview(self, item, params || {}); }).then(function (r) {
      self.busy = false;
      self.emit('busy', false);
      return r;
    }, function (e) {
      self.busy = false;
      self.emit('busy', false);
      throw e;
    });
  };

  P.act = function (id, params) {
    var self = this;
    var st = this.state;
    params = params || {};
    if (this.busy) return Promise.resolve({ ok: false, reason: '上一个操作还在进行中' });
    var item = this.items[id];
    var status = WW.Items.status(this, id, params);
    if (!status.usable) return Promise.resolve({ ok: false, reason: status.reason });
    var handler = WW.Actions.get(item.handler);
    if (!handler) return Promise.resolve({ ok: false, reason: '未知道具类型：' + item.handler });
    var err = handler.validate ? handler.validate(this, item, params) : '';
    if (err) return Promise.resolve({ ok: false, reason: err });
    var cost = status.cost;
    var useVoucher = status.voucher > 0;
    var before = this.snapshot();
    this.busy = true;
    this.emit('busy', true);
    return Promise.resolve().then(function () {
      return handler.run(self, item, params);
    }).then(function (res) {
      if (!res || res.cancelled) return { ok: false, reason: res ? res.reason : '已取消' };
      if (useVoucher) st.items.vouchers[id] -= 1;
      else self.spend(cost);
      st.ap = Math.max(0, st.ap - (item.ap || 0));
      st.itemUses[id] = (st.itemUses[id] || 0) + 1;
      st.itemUsesTurn[id] = (st.itemUsesTurn[id] || 0) + 1;
      if (item.cooldown) st.items.readyTurn[id] = st.turn + item.cooldown;
      self.recompute();
      var deltas = self.diffSnapshot(before);
      self.log('action', res.text, { item: id, deltas: deltas, cost: useVoucher ? 0 : cost });
      st.turnActions.push({ item: id, name: item.name, text: res.text, deltas: deltas });
      WW.Objectives.check(self, 'action');
      self.checkEnd();
      st.rngState = self.rng.s;
      self.emit('change', { type: 'action', item: id });
      return { ok: true, text: res.text, detail: res.detail || null, deltas: deltas, cost: useVoucher ? 0 : cost };
    }).catch(function (e) {
      if (typeof console !== 'undefined') console.error('[WW] action failed', e);
      return { ok: false, reason: '执行失败：' + (e && e.message || e) };
    }).then(function (r) {
      self.busy = false;
      self.emit('busy', false);
      return r;
    });
  };

  P.respondTask = function (id, accept) {
    var ok = WW.Objectives.respond(this, id, accept);
    if (ok) this.emit('change', { type: 'task' });
    return ok;
  };

  /* ---------------------------------------------------------------- end of game */

  P.endGame = function (result, title, text, epilogue) {
    var st = this.state;
    if (st.finished) return;
    st.finished = true;
    st.result = result;
    st.endTitle = title || (result === 'win' ? '结案' : '失败');
    st.endText = text || '';
    st.endEpilogue = epilogue || '';
    WW.Objectives.check(this, 'end');
    st.final = WW.Scoring.compute(this);
    st.history.push(this.historyPoint());
    this.log('end', st.endTitle + '：' + st.endText);
    this.emit('end', st.final);
  };

  P.checkEnd = function () {
    var st = this.state;
    if (st.finished) return true;
    var defeats = this.level.defeat;
    for (var i = 0; i < defeats.length; i++) {
      var d = defeats[i];
      if (d.condition && WW.Cond.evaluate(d.condition, this)) {
        this.endGame('lose', d.title, U.tpl(d.text, this.textVars()), d.epilogue || d.id);
        return true;
      }
    }
    return false;
  };

  P.finishEarly = function () {
    var st = this.state;
    if (st.finished || !st.objectives.mainComplete) return false;
    st.finishedEarly = true;
    this.endGame('win', '提前结案', '主任务全部完成，客户同意提前结案。', '');
    this.emit('change', { type: 'end' });
    return true;
  };

  P.deadline = function () {
    var win = this.state.objectives.mainComplete || WW.Cond.evaluate(this.level.victory.condition, this);
    if (win) this.endGame('win', '合同到期 · 顺利结案', this.level.victory.text || '合同期满，舆情达到了约定目标。', '');
    else this.endGame('lose', '合同到期 · 未达标', '合同期满，主任务没有完成，客户拒付尾款。', 'expired');
  };

  /* ---------------------------------------------------------------- turn */

  P.endTurn = function () {
    var self = this;
    var st = this.state;
    var lv = this.level;
    if (this.busy || st.finished) return Promise.resolve({ ok: false, reason: st.finished ? '已结案' : '操作进行中' });
    this.busy = true;
    this.emit('busy', true);
    var lines = [];
    var before = this.snapshot();
    var feedDone = Promise.resolve().then(function () {
      WW.Opponents.act(self, lines);
      if (self.checkEnd()) return;
      WW.Sim.step(self, lines);
      if (self.checkEnd()) return;
      if (st.turn >= lv.contract.turns) {
        WW.Objectives.check(self, 'turn', lines);
        self.deadline();
        return;
      }
      st.lastTurnActions = st.turnActions.slice();
      st.turn += 1;
      st.ap = st.apMax;
      st.itemUsesTurn = {};
      st.counters.statementsTurn = 0;
      st.counters.manipTurn = 0;
      st.turnActions = [];
      st.recent = { playerContent: 0, deleted: 0, suppressed: 0 };
      st.turnStart = self.snapshot();
      WW.Events.turnStart(self, lines);
      if (self.checkEnd()) return;
      st.phase = WW.Sim.phaseOf(st.stats.heat);
      WW.Sim.updateTrend(self);
      return self.generateFeed(lines, before);
    });
    return feedDone.then(function () {
      if (!st.finished) {
        WW.Objectives.check(self, 'turn', lines);
        self.checkEnd();
      }
      if (!st.finished) {
        WW.Opponents.planIntents(self);
        st.history.push(self.historyPoint());
        st.turnStart = self.snapshot();
      }
      st.briefing = {
        turn: st.turn, lines: lines, deltas: self.diffSnapshot(before),
        summary: st.briefingSummary || '', headlines: st.trend.list.filter(function (t) { return t.turn === st.turn; }).map(function (t) { return t.title; })
      };
      st.rngState = self.rng.s;
      self.emit('turn', st.briefing);
      self.emit('change', { type: 'turn' });
      return { ok: true, briefing: st.briefing };
    }).catch(function (e) {
      if (typeof console !== 'undefined') console.error('[WW] endTurn failed', e);
      return { ok: false, reason: '回合结算失败：' + (e && e.message || e) };
    }).then(function (r) {
      self.busy = false;
      self.emit('busy', false);
      return r;
    });
  };

  P.generateFeed = function (lines, before) {
    var self = this;
    var st = this.state;
    var slots = WW.Sim.feedPlan(this);
    var dQ = st.stats.satisfaction - before.satisfaction;
    var mood = WW.Sim.clientMood(this, dQ);
    var args = { slots: slots, lines: lines.map(function (l) { return l.text; }), mood: mood, actions: st.lastTurnActions.map(function (a) { return a.text; }) };
    return this.runAI('feed.generate', args).then(function (res) {
      var out = res.data || {};
      var bySlot = {};
      (out.posts || []).forEach(function (p) { if (p && p.slot) bySlot[p.slot] = p; });
      slots.forEach(function (s) {
        var g = bySlot[s.slot];
        if (!g || !g.content) g = WW.Offline.slotPost(self, s);
        WW.Feed.create(self, {
          author: g.author, tier: s.tier, faction: s.faction, platform: s.platform, content: g.content, title: g.title,
          stance: s.stance, fact: s.fact, tags: s.tags, comments: g.comments, opp: s.opp, isScreenshot: s.isScreenshot,
          immune: s.immune, source: s.source, isShill: s.oppShill, oppShill: s.oppShill
        });
      });
      st.postQueue = [];
      (out.headlines || []).slice(0, 4).forEach(function (h) {
        if (h) self.addHeadline(h, Math.round(self.rng.range(35, 80)), { tag: self.rng.chance(0.3) ? '新' : '' });
      });
      if (out.client) self.message('client', out.client, mood);
      st.briefingSummary = out.summary || '';
    });
  };

  /* ---------------------------------------------------------------- persistence */

  P.serialize = function () {
    this.state.rngState = this.rng.s;
    return { v: 1, levelId: this.level.id, savedAt: Date.now(), state: U.deepClone(this.state) };
  };

  WW.Engine = {
    Game: Game,
    resolveDifficulty: resolveDifficulty,
    create: function (level, opts) { return new Game(level, opts); },
    restore: function (level, save, opts) {
      opts = opts || {};
      opts.save = save;
      return new Game(level, opts);
    }
  };
})(window.WW);
