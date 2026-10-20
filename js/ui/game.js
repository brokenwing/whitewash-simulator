/*
 * GameUI: briefing (contract + difficulty) -> war room -> result. Mountable into any container,
 * so the level editor can test-play a level without saving it anywhere.
 *   WW.GameUI.mount(container, level, { onExit, testMode, resume })
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var U = WW.U;
  var D = WW.Data;

  var LINE_ICONS = { opponent: '🎯', event: '📰', random: '🎲', evidence: '💣', task: '✅', stage: '🏁', expose: '🔍', risk: '⚠️', client: '💬', promise: '⏰', modifier: '⏳' };
  var STAT_LABELS = { sentiment: '舆论好感', heat: '热度', credibility: '公信力', exposure: '暴露度', satisfaction: '客户满意', budget: '预算' };
  var UP_GOOD = { sentiment: true, heat: false, credibility: true, exposure: false, satisfaction: true, budget: true };

  function deltaChips(deltas) {
    var keys = Object.keys(deltas || {});
    if (!keys.length) return h('div', { class: 'small muted' }, '数值无明显变化');
    return h('div', { class: 'delta-row' }, keys.map(function (k) {
      var v = deltas[k];
      var good = (v > 0) === !!UP_GOOD[k];
      return h('span', { class: 'delta-chip' }, (STAT_LABELS[k] || k) + ' ', h('b', { class: good ? 'good' : 'bad' }, (v > 0 ? '+' : '') + (k === 'budget' ? U.round(v, 1) + '万' : U.round(v, 1))));
    }));
  }

  function stars(n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); }

  function platformBadge(id) {
    var p = D.platforms[id] || { short: '?', color: '#888', name: id };
    return h('span', { class: 'pf', style: { background: p.color }, title: p.name }, p.short);
  }

  /* ================================================================== controller */

  function GameUI(container, level, opts) {
    this.container = container;
    this.rawLevel = level;
    this.level = WW.Schema.normalize(level);
    this.opts = opts || {};
    this.game = null;
    this.feedTab = 'all';
    this.seen = {};
    this.pane = 'center';
    this.lastAiToast = 0;
    this.unsub = [];
  }

  var P = GameUI.prototype;

  P.destroy = function () {
    this.unsub.forEach(function (fn) { fn(); });
    this.unsub = [];
    WW.DOM.clear(this.container);
    WW.DOM.hideTip();
  };

  P.exit = function () {
    this.destroy();
    if (this.opts.onExit) this.opts.onExit();
  };

  /* ------------------------------------------------------------------ briefing */

  P.showBriefing = function () {
    var self = this;
    var lv = this.level;
    var allowed = lv.difficulty.allowed;
    var chosen = allowed.indexOf('regular') >= 0 ? 'regular' : allowed[0];
    var saved = this.opts.testMode ? null : WW.Store.loadRun(lv.id);
    var seal = h('div', { class: 'big-seal' }, '已签约', h('br'), D.pools.firm);
    var publicFacts = lv.facts.filter(function (f) { return f.publicAtStart; });
    var activeOpps = lv.opponents.filter(function (o) { return o.startActive && !o.enterWhen; });

    var diffCards = h('div', { class: 'diff-pick' }, allowed.map(function (id) {
      var d = D.difficulties[id];
      var rec = WW.Store.record(lv.id, id);
      var card = h('div', { class: 'diff-card' + (id === chosen ? ' on' : ''), tabindex: 0, role: 'radio', 'aria-checked': id === chosen ? 'true' : 'false', dataset: { id: id } },
        h('div', { class: 't' }, d.icon + ' ' + d.name),
        h('div', { class: 'd' }, d.desc),
        rec ? h('div', { class: 'best' }, '最佳：' + rec.grade + ' 级（' + rec.score + ' 分）') : null);
      var pick = function () {
        chosen = id;
        Array.prototype.forEach.call(diffCards.children, function (c) { c.classList.toggle('on', c.dataset.id === id); c.setAttribute('aria-checked', c.dataset.id === id ? 'true' : 'false'); });
      };
      card.addEventListener('click', pick);
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      return card;
    }));

    var doc = h('div', { class: 'briefing-doc' },
      h('div', { class: 'doc-red' }, '危机公关委托书'),
      h('div', { class: 'doc-no' }, D.pools.firm + '〔' + new Date().getFullYear() + '〕第 ' + (100 + (U.hash(lv.id) % 900)) + ' 号'),
      h('div', { class: 'doc-rule' }),
      h('h2', null, lv.meta.cover + ' ' + lv.meta.title),
      h('p', null, h('span', { class: 'label-col' }, '委托方：'), lv.client.name + '（联系人：' + lv.client.contact + '）'),
      h('p', null, h('span', { class: 'label-col' }, '事件经过：'), lv.incident.summary),
      lv.incident.background ? h('p', null, h('span', { class: 'label-col' }, '背景：'), lv.incident.background) : null,
      lv.client.intro ? h('p', null, h('span', { class: 'label-col' }, lv.client.contact + '：'), '“' + lv.client.intro + '”') : null,
      h('div', { class: 'brief-grid' },
        h('div', { class: 'brief-box' }, h('h4', null, '📑 合同条款'), h('ul', null,
          h('li', null, '期限：' + lv.contract.turns + ' 个回合（' + U.turnLabel(1, lv.contract.slotsPerDay, lv.contract.turnLabels) + ' 起）'),
          h('li', null, '预算：' + U.fmtMoney(lv.contract.budget) + '（随难度浮动）'),
          h('li', null, '每回合行动点：' + lv.contract.actionPoints),
          h('li', null, '主任务：' + lv.objectives.stages.map(function (s) { return s.title; }).join(' → ')))),
        publicFacts.length ? h('div', { class: 'brief-box' }, h('h4', null, '🗣 客户口径（未经核实）'), h('ul', null, publicFacts.map(function (f) {
          return h('li', { class: 'claim' }, '网传“' + f.text + '”', f.clientClaim ? [' —— 客户称：', h('b', null, f.clientClaim)] : null);
        }))) : null,
        lv.client.demands.length ? h('div', { class: 'brief-box' }, h('h4', null, '⛔ 客户红线'), h('ul', null, lv.client.demands.map(function (d) { return h('li', null, d.text); }))) : null,
        activeOpps.length ? h('div', { class: 'brief-box' }, h('h4', null, '🎯 已知对手'), h('ul', null, activeOpps.map(function (o) { return h('li', null, o.avatar + ' ' + o.name + (o.desc ? '：' + o.desc : '')); }))) : null),
      h('p', { style: { marginTop: '16px' } }, h('span', { class: 'label-col' }, '选择难度：')),
      diffCards,
      h('div', { class: 'sign-row' },
        h('button', { class: 'btn', style: { color: '#1b1b1a', background: '#fff' }, on: { click: function () { self.exit(); } } }, '返回'),
        saved && saved.state && !saved.state.finished ? h('button', { class: 'btn', style: { color: '#1b1b1a', background: '#fff' }, on: { click: function () { self.resume(saved); } } }, '继续上次（' + D.difficulties[D.difficultyId(saved.state.difficulty)].name + ' · 第 ' + saved.state.turn + ' 回合）') : null,
        h('button', { class: 'btn primary', on: { click: function () {
          seal.classList.add('show');
          setTimeout(function () { self.start(chosen); }, 600);
        } } }, '签约接单')),
      seal);

    WW.DOM.replace(this.container, h('div', { class: 'briefing' }, doc));
    window.scrollTo(0, 0);
  };

  /* ------------------------------------------------------------------ game lifecycle */

  P.attach = function (game) {
    var self = this;
    this.game = game;
    WW.Log.setContext({ levelId: this.level && this.level.id || '' });
    this.unsub.push(game.on('change', function () { self.render(); }));
    /* 'change' fires while the game is still busy, so buttons rendered then are disabled: refresh once it settles */
    this.unsub.push(game.on('busy', function (b) { self.setBusy(b); if (!b) self.render(); }));
    this.unsub.push(game.on('aiError', function (e) {
      var now = Date.now();
      if (now - self.lastAiToast < 8000) return;
      self.lastAiToast = now;
      WW.DOM.toast('AI 调用失败，已改用离线规则：' + e.error, 'warn', 6000);
    }));
    this.unsub.push(game.on('mainComplete', function () {
      WW.DOM.toast('🏁 主任务全部完成！可以随时“结案”，也可以继续经营冲更高评级。', 'good', 6000);
    }));
    this.unsub.push(game.on('end', function () { self.save(); }));
  };

  P.start = function (difficulty) {
    var game = new WW.Engine.Game(this.rawLevel, { difficulty: difficulty, aiRunner: WW.AI.run });
    this.attach(game);
    this.save();
    this.renderRoom();
    this.showTurnBriefing(game.state.briefing);
  };

  P.resume = function (save) {
    var game;
    try {
      game = WW.Engine.restore(this.rawLevel, save, { aiRunner: WW.AI.run });
    } catch (e) {
      WW.DOM.toast('存档损坏，已重新开始：' + e.message, 'bad');
      WW.Store.clearRun(this.level.id);
      return this.showBriefing();
    }
    this.attach(game);
    this.renderRoom();
    WW.DOM.toast('已恢复到第 ' + game.state.turn + ' 回合', 'good');
  };

  P.save = function () {
    if (this.opts.testMode || !this.game) return;
    var st = this.game.state;
    if (st.finished) {
      WW.Store.clearRun(this.level.id);
      WW.Store.saveRecord(this.level.id, st.difficulty, { grade: st.final.grade, score: st.final.score, result: st.result, date: new Date().toLocaleDateString() });
    } else {
      WW.Store.saveRun(this.level.id, this.game.serialize());
    }
  };

  P.act = function (id, params, o) {
    var self = this;
    o = o || {};
    return this.game.act(id, params).then(function (r) {
      if (!r.ok) {
        if (!o.silent) WW.DOM.toast(r.reason, 'warn');
        return r;
      }
      self.save();
      if (id === 'iron_fist' && r.detail && r.detail.success) self.fistFx();
      if (!o.silent) self.showActionResult(id, r);
      if (self.game.state.finished) self.showResult();
      return r;
    });
  };

  P.endTurn = function () {
    var self = this;
    var st = this.game.state;
    var go = function () {
      self.game.endTurn().then(function (r) {
        if (!r.ok) { WW.DOM.toast(r.reason, 'bad'); return; }
        self.save();
        if (self.game.state.finished) { self.showResult(); return; }
        self.showTurnBriefing(r.briefing);
      });
    };
    if (!st.turnActions.length) {
      WW.DOM.confirm('这回合一个行动都没做，确定直接结束回合吗？', { ok: '结束回合' }).then(function (ok) { if (ok) go(); });
    } else go();
  };

  /* Centered, enlarged result of a skill; stays until the player confirms. */
  P.showActionResult = function (id, r) {
    var item = this.game.items[id] || {};
    var d = r.detail || {};
    var bad = d.backfire || d.disaster || d.caught || d.success === false;
    var m = WW.DOM.modal({
      title: (item.icon || '') + ' ' + (item.name || id) + (bad ? ' · 出岔子了' : ' · 执行完毕'),
      maskClose: false,
      body: h('div', { class: 'act-result' + (bad ? ' bad' : ' good') },
        h('div', { class: 'act-result-text' }, r.text),
        deltaChips(r.deltas || {})),
      footer: [h('button', { class: 'btn primary', on: { click: function () { m.close(); } } }, '知道了')]
    });
    m.el.classList.add('act-result-modal');
    setTimeout(function () { var b = m.foot.querySelector('button'); if (b) b.focus(); }, 0);
  };

  P.finishCase = function () {
    var self = this;
    WW.DOM.confirm('主任务已全部完成，现在结案吗？\n提前结案每剩一回合 +3 分（最多 +12）。', { ok: '立即结案' }).then(function (ok) {
      if (ok && self.game.finishEarly()) self.showResult();
    });
  };

  P.fistFx = function () {
    var fx = h('div', { class: 'fist-fx', 'aria-hidden': 'true' }, h('span', null, '👊'));
    document.body.appendChild(fx);
    setTimeout(function () { fx.remove(); }, 900);
  };

  P.setBusy = function (b) {
    if (!this.busyBar) return;
    this.busyBar.classList.toggle('hidden', !b);
    if (this.endBtn) this.endBtn.disabled = b || this.game.state.finished;
  };

  /* ------------------------------------------------------------------ war room */

  P.renderRoom = function () {
    var self = this;
    this.topbar = h('div', { class: 'topbar' });
    this.busyBar = h('div', { class: 'busy-bar hidden', role: 'status' }, h('span', { class: 'spinner' }), WW.AI.enabledFor('feed.generate') ? 'AI 正在推演舆情……' : '舆情推演中……');
    this.left = h('div', { class: 'col-scroll', dataset: { pane: 'left' } });
    this.center = h('div', { class: 'center-col', dataset: { pane: 'center' } });
    this.right = h('div', { class: 'col-scroll', dataset: { pane: 'right' } });
    var tabs = h('div', { class: 'mobile-tabs' }, [['left', '📊 仪表盘'], ['center', '🗞 舆论场'], ['right', '🧰 技能任务']].map(function (t) {
      return h('button', { class: 'btn small' + (self.pane === t[0] ? ' accent' : ''), dataset: { p: t[0] }, on: { click: function () { self.pane = t[0]; self.applyPane(); } } }, t[1]);
    }));
    this.mobileTabs = tabs;
    this.room = h('div', { class: 'room' }, this.left, this.center, this.right);
    this.coachHost = h('div', { class: 'coach-host' });
    this.warroom = h('div', { class: 'warroom' }, this.topbar, this.busyBar, tabs, this.room, this.coachHost);
    WW.DOM.replace(this.container, this.warroom);
    this.applyPane();
    this.render();
  };

  P.applyPane = function () {
    var self = this;
    [this.left, this.center, this.right].forEach(function (el) { el.classList.toggle('active', el.dataset.pane === self.pane); });
    Array.prototype.forEach.call(this.mobileTabs.children, function (b) { b.classList.toggle('accent', b.dataset.p === self.pane); });
  };

  P.render = function () {
    if (!this.game || !this.topbar) return;
    if (this.game.state.finished && this.resultShown) return;
    this.renderTop();
    this.renderLeft();
    this.renderCenter();
    this.renderRight();
    this.renderCoach();
  };

  P.renderTop = function () {
    var self = this;
    var g = this.game;
    var st = g.state;
    var lv = this.level;
    var pips = g.diff.unlimited
      ? h('b', { title: '看不见的大手：技能不耗行动点' }, '∞')
      : h('span', { class: 'ap-pips', title: '行动点 ' + st.ap + '/' + st.apMax });
    if (!g.diff.unlimited) for (var i = 0; i < st.apMax; i++) pips.appendChild(h('i', { class: i < st.ap ? '' : 'used' }));
    var prog = Math.round(st.objectives.progress * 100);
    this.endBtn = h('button', { class: 'btn primary', dataset: { coach: 'end-turn' }, disabled: g.busy || st.finished, on: { click: function () { self.endTurn(); } } }, '结束回合 ▶');
    WW.DOM.replace(this.topbar,
      h('div', { class: 'title' }, h('span', null, lv.meta.cover), lv.meta.title),
      h('span', { class: 'chip' }, D.difficulties[st.difficulty].icon + ' ' + D.difficulties[st.difficulty].name),
      h('div', { class: 'turn' }, g.turnLabel() + ' · 第 ' + st.turn + '/' + lv.contract.turns + ' 回合'),
      h('div', { class: 'top-kpi', dataset: { coach: 'budget' } }, '预算 ', h('b', null, U.fmtMoney(st.budget))),
      h('div', { class: 'top-kpi', dataset: { coach: 'ap' } }, '行动点 ', pips),
      h('div', { class: 'top-kpi', title: '主任务推进度', dataset: { coach: 'progress' } }, '主任务 ', h('div', { class: 'progress' }, h('i', { style: { width: prog + '%' } })), h('b', null, prog + '%')),
      h('div', { class: 'spacer' }),
      st.objectives.mainComplete && !st.finished ? h('button', { class: 'btn accent', dataset: { coach: 'finish' }, on: { click: function () { self.finishCase(); } } }, '🏁 结案') : null,
      h('button', { class: 'btn ghost small', on: { click: function () { self.showLog(); } } }, '日志'),
      h('button', { class: 'btn ghost small', on: { click: function () { WW.SettingsUI.open({ onSave: function () { self.render(); } }); } } }, 'AI 设置'),
      h('button', { class: 'btn ghost small', on: { click: function () { self.showHelp(); } } }, '玩法'),
      WW.LogUI.button('ghost small'),
      h('button', { class: 'btn ghost small', on: { click: function () {
        WW.DOM.confirm(self.opts.testMode ? '退出试玩？' : '退出到选关？进度已自动保存，可以随时继续。', { ok: '退出' }).then(function (ok) { if (ok) self.exit(); });
      } } }, '退出'),
      this.endBtn);
  };

  P.history = function (key) {
    var hist = this.game.state.history.map(function (p) { return p[key]; });
    hist.push(this.game.state.stats[key]);
    return hist;
  };

  P.renderLeft = function () {
    var g = this.game;
    var st = g.state;
    var s = st.stats;
    var ts = st.turnStart || {};
    var mon = st.monitor;
    var tiles = h('div', { class: 'tiles' },
      WW.Charts.statTile({ label: '舆论好感', value: s.sentiment, delta: s.sentiment - (ts.sentiment || 0), upGood: true, history: this.history('sentiment'), kind: 'div', wide: true }),
      WW.Charts.statTile({ label: '事件热度', value: s.heat, delta: s.heat - (ts.heat || 0), upGood: false, history: this.history('heat'), bandStat: 'heat' }),
      WW.Charts.statTile({ label: '公信力', value: s.credibility, delta: s.credibility - (ts.credibility || 0), upGood: true, history: this.history('credibility'), bandStat: 'credibility' }),
      mon ? WW.Charts.statTile({ label: '暴露度', value: s.exposure, delta: s.exposure - (ts.exposure || 0), upGood: false, history: this.history('exposure'), bandStat: 'exposure' })
        : WW.Charts.statTile({ label: '暴露度', hint: '需舆情监测', value: Math.round(s.exposure / 25) * 25, display: WW.Charts.band('exposure', s.exposure).label, bandStat: 'exposure', fuzzy: true }),
      WW.Charts.statTile({ label: '客户满意', value: s.satisfaction, delta: s.satisfaction - (ts.satisfaction || 0), upGood: true, history: this.history('satisfaction'), bandStat: 'satisfaction' }));
    var factions = Object.keys(st.factions).map(function (id) { return st.factions[id]; });
    var levelFactions = {};
    this.level.factions.forEach(function (f) { levelFactions[f.id] = f; });
    factions.forEach(function (f) { f.desc = (levelFactions[f.id] || {}).desc; });

    var trend = this.trending();
    var extra = [];
    if (mon) {
      if (st.lieDebt > 0) extra.push(h('div', { class: 'small', style: { color: 'var(--crit-ink)' } }, '⚠ 未爆的谎言债：' + U.round(st.lieDebt, 1)));
      var pending = st.promises.filter(function (p) { return p.status === 'pending'; });
      pending.forEach(function (p) { extra.push(h('div', { class: 'small' }, '⏰ 承诺“' + p.text + '”须在第 ' + p.due + ' 回合前兑现')); });
    }

    WW.DOM.replace(this.left,
      h('div', { class: 'panel', dataset: { coach: 'dashboard' } }, h('div', { class: 'panel-title' }, '📊 舆情仪表盘', mon ? h('span', { class: 'chip' }, '监测中') : null), tiles, extra.length ? h('div', { class: 'col', style: { marginTop: '8px', gap: '4px' } }, extra) : null),
      h('div', { class: 'panel', dataset: { coach: 'factions' } }, h('div', { class: 'panel-title' }, '👥 受众阵营', mon ? null : h('span', { class: 'muted tiny' }, '数值需舆情监测')), WW.Charts.factionBars(factions, mon)),
      h('div', { class: 'panel', dataset: { coach: 'trend' } }, h('div', { class: 'panel-title' }, '🔥 热搜榜'), trend));
  };

  /* Hot-search board: the main topic sits at its engine rank; values fall monotonically by rank. */
  P.trending = function () {
    var st = this.game.state;
    var rows = [];
    var mainRank = st.trend.rank;
    var mainVal = Math.round(st.stats.heat * 41000 + 120000);
    var top = mainRank <= 10 ? mainVal / Math.pow(0.86, mainRank - 1) : 2600000;
    var seen = {};
    seen[st.trend.main] = true;
    var others = st.trend.list.slice().sort(function (a, b) { return b.heat - a.heat; }).filter(function (t) {
      if (seen[t.title]) return false;
      seen[t.title] = true;
      return true;
    });
    var fillers = D.pools.neutralHeadlines.filter(function (t) { return !seen[t]; });
    var list = [];
    for (var rank = 1; rank <= 10; rank++) {
      if (rank === mainRank) list.push({ title: st.trend.main, main: true, tag: st.stats.heat >= 70 ? '爆' : st.stats.heat >= 45 ? '热' : '' });
      else if (others.length) list.push(others.shift());
      else if (fillers.length) list.push({ title: fillers.shift(), tag: '' });
    }
    list.forEach(function (t, i) {
      var tagCls = t.tag === '爆' ? 'bao' : t.tag === '热' ? 're' : t.tag === '新' ? 'xin' : '';
      rows.push(h('div', { class: 'trend-item' + (t.main ? ' main' : '') },
        h('span', { class: 'rk' + (i < 3 ? ' top' : '') }, String(i + 1)),
        h('span', { class: 'tt' }, '#' + t.title + '#', tagCls ? h('span', { class: 'tag-hot ' + tagCls }, t.tag) : null),
        h('span', { class: 'hv' }, U.fmtNum(Math.round(top * Math.pow(0.86, i))))));
    });
    if (mainRank > 10) rows.push(h('div', { class: 'small muted', style: { marginTop: '4px' } }, '#' + st.trend.main + '# ' + (mainRank >= 99 ? '已跌出热搜' : '排名第 ' + mainRank)));
    return h('div', { class: 'trend-list' }, rows);
  };

  P.renderCenter = function () {
    var self = this;
    var g = this.game;
    var st = g.state;
    var parts = [];
    if (st.objectives.mainComplete && !st.finished) {
      parts.push(h('div', { class: 'banner win' }, h('span', null, '🏁'), h('span', { class: 'grow' }, '主任务已完成！现在结案可拿提前结案加分，也可以继续经营冲击更高评级。'),
        h('button', { class: 'btn small accent', dataset: { coach: 'finish' }, on: { click: function () { if (g.finishEarly()) self.showResult(); } } }, '立即结案')));
    }
    var oppIds = Object.keys(st.opponents);
    if (oppIds.length) parts.push(this.renderOpponents());
    parts.push(this.renderFeed());
    WW.DOM.replace(this.center, parts);
  };

  P.renderOpponents = function () {
    var self = this;
    var g = this.game;
    var st = g.state;
    var mon = st.monitor;
    var cards = Object.keys(st.opponents).map(function (id) {
      var o = st.opponents[id];
      var def = g.oppDef(id);
      var notYet = !o.active && !o.retired;
      var intent;
      if (!o.active) intent = h('div', { class: 'opp-intent' }, o.retired ? (o.coopted ? '💰 已被收编' : '🏳 已退场') : '⌛ 尚未入场');
      else if (o.intent) {
        intent = mon
          ? h('div', { class: 'opp-intent', title: '下回合意图' }, '下回合：', h('b', null, o.intent.icon + ' ' + o.intent.name))
          : h('div', { class: 'opp-intent', title: '部署舆情监测后可看清具体招式' }, '下回合：', h('b', null, o.intent.ability ? '？？？（' + o.intent.category + '）' : '💤 观望'));
      }
      var bar = function (label, v, color) {
        return [h('span', null, label), WW.Charts.meter(v, 100, color), h('span', { class: 'num' }, String(Math.round(v)))];
      };
      var quick = [['legal', '律师函'], ['iron_fist', '铁拳'], ['expose', '扒皮'], ['coopt', '招安']].filter(function (q) { return g.items[q[0]]; });
      return h('div', { class: 'opp-card' + (o.active ? '' : ' out') },
        h('div', { class: 'opp-head' }, h('div', { class: 'opp-avatar' }, o.avatar), h('div', { class: 'grow' }, h('div', { class: 'opp-name' }, o.name), h('div', { class: 'tiny muted' }, def ? def.desc : ''))),
        notYet ? null : h('div', { class: 'opp-bars' }, bar('势力', o.strength, 'var(--accent)'), bar('士气', o.morale, 'var(--accent)'), mon ? bar('资源', Math.min(100, o.resources), 'var(--accent)') : null),
        intent,
        o.lastMove && o.lastMove.turn >= st.turn - 1 && o.active ? h('div', { class: 'opp-last' }, '上回合：' + o.lastMove.icon + ' ' + o.lastMove.name + (o.lastMove.text ? ' —— ' + o.lastMove.text : '')) : null,
        o.active && quick.length ? h('div', { class: 'opp-actions' }, quick.map(function (q) {
          var ok = g.itemStatus(q[0], { oppId: id }).usable;
          return h('button', { class: 'btn small', disabled: !ok || g.busy, on: { click: function () { WW.ItemUI.open(self, q[0], { oppId: id }); } } }, q[1]);
        })) : null);
    });
    return h('div', { class: 'panel', style: { padding: '10px' }, dataset: { coach: 'opponents' } }, h('div', { class: 'panel-title' }, '🎯 对手盘', mon ? null : h('span', { class: 'muted tiny' }, '部署「舆情监测」可看清对手意图')), h('div', { class: 'opp-strip' }, cards));
  };

  P.renderFeed = function () {
    var self = this;
    var g = this.game;
    var st = g.state;
    var prevScroll = this.feedScroll ? this.feedScroll.scrollTop : 0;
    var platforms = ['all'].concat(this.level.platforms);
    var tabs = h('div', { class: 'feed-tabs', role: 'tablist' }, platforms.map(function (p) {
      var name = p === 'all' ? '全部' : D.platforms[p].name;
      return h('button', { class: self.feedTab === p ? 'on' : '', role: 'tab', on: { click: function () { self.feedTab = p; self.feedScroll = null; self.render(); } } }, name);
    }));
    var posts = WW.Feed.ranked(st, this.feedTab).slice(0, 70);
    var list = posts.length ? posts.map(function (p) { return self.renderPost(p); }) : [h('div', { class: 'empty' }, '这个平台暂时没有讨论。')];
    posts.forEach(function (p) { self.seen[p.id] = true; });
    var scroll = h('div', { class: 'feed-scroll' }, list);
    this.feedScroll = scroll;
    var panel = h('div', { class: 'panel feed-panel', dataset: { coach: 'feed' } },
      h('div', { class: 'feed-head' }, h('b', null, '🗞 舆论场'), h('span', { class: 'muted small' }, '悬停帖子可删帖 / 控评 / 举报'), h('div', { class: 'spacer' }), tabs),
      scroll);
    setTimeout(function () { scroll.scrollTop = prevScroll; }, 0);
    return panel;
  };

  P.renderPost = function (p) {
    var self = this;
    var g = this.game;
    var st = g.state;
    var mon = st.monitor;
    if (p.status === 'deleted') {
      return h('div', { class: 'post deleted nostance' }, h('div', { class: 'small' }, '🗑 ' + (p.removedBy === 'platform' ? '该账号已被平台处置，内容不可见' : p.removedBy === 'report' ? '该内容因被大量举报已下架' : '该内容已被删除') + ' · ' + p.author.name));
    }
    var tags = [];
    if (p.isClient) tags.push(h('span', { class: 'ptag good' }, '官方'));
    if (p.controlled) tags.push(h('span', { class: 'ptag' }, '已控评'));
    if (p.throttled) tags.push(h('span', { class: 'ptag' }, '限流中'));
    if (p.exposed) tags.push(h('span', { class: 'ptag bad' }, '疑似水军'));
    if (p.isScreenshot) tags.push(h('span', { class: 'ptag warn' }, '截图'));
    if (p.platform === 'overseas') tags.push(h('span', { class: 'ptag warn' }, '外网'));
    if (p.fact && st.facts[p.fact]) {
      var f = st.facts[p.fact];
      if (f.revealed) tags.push(h('span', { class: 'ptag bad' }, '已实锤'));
      else if (f.refuted) tags.push(h('span', { class: 'ptag good' }, '已证伪'));
      else if (f.known) tags.push(h('span', { class: 'ptag ' + (f.isTrue ? 'bad' : 'good') }, f.isTrue ? '你知道：属实' : '你知道：不实'));
    }
    if (mon && p.isShill && !p.exposed && !p.oppShill) tags.push(h('span', { class: 'ptag' }, '我方水军'));
    if (mon && p.oppShill) tags.push(h('span', { class: 'ptag warn' }, '对家水军'));
    (p.tags || []).forEach(function (t) { if (['官方', '截图'].indexOf(t) < 0) tags.push(h('span', { class: 'ptag' }, t)); });
    var tier = p.author.tier;
    var acts = (p.isClient ? [['control', '控评']] : [['delete', '删帖'], ['throttle', '限流'], ['control', '控评'], ['legal', '律师函'], ['iron_fist', '铁拳']]).filter(function (a) { return g.items[a[0]]; });
    var isNew = p.turn === st.turn && !this.seen[p.id] && st.turn > 1;
    var cls = 'post ' + (mon && !p.isClient ? 's' + p.stance : 'nostance') + (isNew ? ' new' : '');
    return h('article', { class: cls, tabindex: 0, dataset: { post: p.id } },
      h('div', { class: 'post-head' }, platformBadge(p.platform), h('span', { class: 'post-author' }, p.author.name),
        tier !== 'normal' ? h('span', { class: 'tier ' + tier }, (D.tiers[tier] || {}).name) : null,
        p.opp && st.opponents[p.opp] ? h('span', { class: 'tier' }, st.opponents[p.opp].avatar) : null,
        h('span', { class: 'post-time' }, g.turnLabel(p.turn))),
      p.title ? h('div', { class: 'post-title' }, p.title) : null,
      h('div', { class: 'post-body' }, p.content),
      tags.length ? h('div', { class: 'post-tags' }, tags) : null,
      h('div', { class: 'post-stats' }, h('span', null, '❤ ' + U.fmtNum(p.likes)), h('span', null, '↻ ' + U.fmtNum(p.reposts)), h('span', null, '💬 ' + U.fmtNum(p.commentCount))),
      p.comments.length || p.foldedComments ? h('div', { class: 'post-comments' },
        p.comments.slice(0, 3).map(function (c) { return h('div', { class: 'cmt' }, h('b', null, c.author + '：'), c.content, c.shill && mon ? h('span', { class: 'shill-mark' }, ' [控评]') : null); }),
        p.foldedComments ? h('div', { class: 'cmt', style: { color: '#9a9892' } }, '已折叠 ' + U.fmtNum(p.foldedComments) + ' 条评论') : null) : null,
      acts.length ? h('div', { class: 'post-actions' }, acts.map(function (a) {
        var ok = g.itemStatus(a[0], { postId: p.id, ids: [p.id] }).usable;
        return h('button', { disabled: !ok || g.busy, title: ok ? '' : g.itemStatus(a[0], { postId: p.id, ids: [p.id] }).reason, on: { click: function () { WW.ItemUI.open(self, a[0], { postId: p.id }); } } }, a[1]);
      })) : null);
  };

  P.renderRight = function () {
    WW.DOM.replace(this.right, this.renderTasks(), this.renderItems(), this.renderChat());
  };

  P.renderTasks = function () {
    var self = this;
    var g = this.game;
    var st = g.state;
    var ob = st.objectives;
    var lv = this.level;
    var stageEls = lv.objectives.stages.map(function (s, i) {
      var sst = ob.stages[i].status;
      var tasks = s.tasks.filter(function (t) { return !(t.hidden && ob.tasks[t.id].status !== 'done'); }).map(function (t) {
        var ts = ob.tasks[t.id];
        var mark = ts.status === 'done' ? '✔' : ts.status === 'failed' ? '✖' : ts.status === 'expired' ? '–' : t.required ? '○' : '◇';
        var rw = t.rewards.length ? WW.Effects.describeList(t.rewards, lv, { skipFlavor: true }) : '';
        return h('div', { class: 'task ' + ts.status },
          h('span', { class: 'tk' }, mark),
          h('div', null, t.title + (t.deadline ? '（第' + t.deadline + '回合前）' : ''), rw ? h('div', { class: 'rw' }, '奖励：' + rw) : null));
      });
      var srw = s.rewards.length ? WW.Effects.describeList(s.rewards, lv, { skipFlavor: true }) : '';
      return h('div', { class: 'stage ' + sst },
        h('div', { class: 'stage-h' }, sst === 'done' ? '✅' : sst === 'active' ? '▶' : '🔒', '阶段 ' + (i + 1) + '：' + s.title),
        sst === 'locked' ? h('div', { class: 'tiny muted' }, s.desc || '') : tasks,
        srw && sst !== 'done' ? h('div', { class: 'task' }, h('span', { class: 'tk' }, '🎁'), h('span', { class: 'rw' }, '阶段奖励：' + srw)) : null);
    });
    var side = lv.objectives.side.map(function (t) {
      var ts = ob.tasks[t.id];
      if (ts.status === 'hidden' || (t.hidden && ts.status !== 'done')) return null;
      var label = { active: '进行中', done: '已完成', failed: '已失败', offered: '待接受', declined: '已婉拒' }[ts.status] || ts.status;
      var rw = t.rewards.length ? WW.Effects.describeList(t.rewards, lv, { skipFlavor: true }) : '';
      return h('div', { class: 'side-task', dataset: { coach: 'side:' + t.id } },
        h('div', { class: 'st-h' }, ts.status === 'done' ? '✅' : ts.status === 'failed' ? '❌' : '📌', t.title, h('span', { class: 'spacer' }), h('span', { class: 'chip' }, label)),
        t.desc ? h('div', { class: 'sub' }, t.desc) : null,
        rw ? h('div', { class: 'tiny muted' }, '奖励：' + rw) : null,
        t.penalty.length && ts.status !== 'done' ? h('div', { class: 'tiny muted' }, '失败：' + WW.Effects.describeList(t.penalty, lv)) : null,
        ts.status === 'offered' ? h('div', { class: 'row' },
          h('button', { class: 'btn small accent', on: { click: function () { g.respondTask(t.id, true); self.save(); } } }, '接下'),
          h('button', { class: 'btn small', on: { click: function () { g.respondTask(t.id, false); self.save(); } } }, '婉拒')) : null);
    }).filter(Boolean);
    return h('div', { class: 'panel', dataset: { coach: 'tasks' } },
      h('div', { class: 'panel-title' }, '📋 合同任务', h('span', { class: 'spacer' }), h('span', { class: 'chip' }, '推进度 ' + Math.round(ob.progress * 100) + '%')),
      h('div', { class: 'stage-list' }, stageEls),
      side.length ? h('div', { class: 'col', style: { marginTop: '10px', gap: '6px' } }, h('div', { class: 'label' }, '支线 / 额外委托'), side) : null);
  };

  P.renderItems = function () {
    var self = this;
    var g = this.game;
    var buttons = g.itemOrder.map(function (id) {
      var item = g.items[id];
      var status = g.itemStatus(id);
      var targetItem = item.target === 'post' || item.target === 'postOrOpponent' || item.target === 'opponent' || item.target === 'fact' || item.target === 'criterion';
      var usable = status.usable;
      var sub = status.locked ? '🔒 ' + status.reason : usable ? (status.voucher ? '免费券 ×' + status.voucher : (item.handler === 'shill' || item.handler === 'delete' || item.handler === 'throttle' || item.handler === 'kol' || item.handler === 'settle' || item.handler === 'coopt' ? '按方案计价' : U.fmtMoney(status.cost))) + (status.ap ? ' · ' + status.ap + 'AP' : '') : status.reason;
      var btn = h('button', { class: 'item-btn' + (status.locked ? ' locked disabled' : usable ? '' : ' disabled'), dataset: { coach: 'item:' + id }, on: { click: function () {
        if (!usable) { WW.DOM.toast('「' + item.name + '」' + status.reason, 'warn'); return; }
        WW.ItemUI.open(self, id, {});
      } } },
        h('span', { class: 'in' }, h('span', { class: 'ic' }, item.icon), item.name, h('span', { class: 'ic-t' }, D.tierNames[item.tier] || '')),
        h('span', { class: 'ip' }, sub));
      WW.DOM.hoverTip(btn, function () {
        return [h('strong', null, item.icon + ' ' + item.name), '\n' + (item.desc || ''), item.risk ? '\n风险：' + item.risk : '', '\n' + (status.locked ? status.reason : usable ? '可以使用' : '暂不可用：' + status.reason), targetItem ? '\n（需要选择目标）' : ''];
      });
      return btn;
    });
    return h('div', { class: 'panel', dataset: { coach: 'items' } }, h('div', { class: 'panel-title' }, '🧰 技能'), h('div', { class: 'items-grid' }, buttons));
  };

  P.renderChat = function () {
    var g = this.game;
    var st = g.state;
    var contact = this.level.client.contact;
    var msgs = st.messages.slice(-30);
    var chat = h('div', { class: 'chat' }, msgs.map(function (m) {
      if (m.from === 'client') {
        return h('div', { class: 'bubble-row' }, h('div', { class: 'bubble-avatar', title: contact }, contact.slice(0, 1)),
          h('div', null, h('div', { class: 'tiny muted' }, contact + ' · ' + g.turnLabel(m.turn)), h('div', { class: 'bubble ' + (m.mood || '') }, m.text)));
      }
      return h('div', { class: 'sys-note' }, (m.from === 'news' ? '📰 ' : '🛰 ') + m.text);
    }));
    setTimeout(function () { chat.scrollTop = chat.scrollHeight; }, 0);
    return h('div', { class: 'panel', dataset: { coach: 'chat' } }, h('div', { class: 'panel-title' }, '💬 客户群 · ' + this.level.client.name), chat);
  };

  /* ------------------------------------------------------------------ tutorial coach */

  /* Resolves a guide target ("item:statement", "post:fact:f2", "end-turn", ...) to live elements. */
  P.coachTargets = function (target) {
    if (!target || !this.warroom) return [];
    if (target.indexOf('post:') === 0) {
      var p = WW.Guide.findPost(this.game, target.slice(5));
      return p ? Array.prototype.slice.call(this.warroom.querySelectorAll('[data-post="' + p.id + '"]')) : [];
    }
    return Array.prototype.slice.call(this.warroom.querySelectorAll('[data-coach="' + target + '"]'));
  };

  /* Brings a target into view: switches the mobile pane / feed tab, then scrolls to it. */
  P.coachLocate = function (target) {
    var els = this.coachTargets(target);
    if (!els.length && target && target.indexOf('post:') === 0 && this.feedTab !== 'all') {
      this.feedTab = 'all';
      this.render();
      els = this.coachTargets(target);
    }
    var el = els[0];
    if (!el) return;
    var pane = el.closest('[data-pane]');
    if (pane && pane.dataset.pane !== this.pane) { this.pane = pane.dataset.pane; this.applyPane(); }
    if (window.matchMedia('(max-width: 980px)').matches) {
      /* single-column layout scrolls the page and the card covers its bottom: center in the space above it */
      var coach = this.coachHost.querySelector('.coach');
      var r = el.getBoundingClientRect();
      var free = window.innerHeight - (coach ? coach.offsetHeight + 16 : 0);
      window.scrollTo({ top: window.scrollY + r.top - Math.max(60, (free - r.height) / 2), behavior: 'smooth' });
    } else {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  P.coachAction = function (step) {
    var self = this;
    var a = step.action;
    if (a.cmd === 'endTurn') return this.endTurn();
    if (a.cmd === 'finish') return this.finishCase();
    if (a.cmd === 'accept') { this.game.respondTask(a.task, true); this.save(); return; }
    var preset = {};
    Object.keys(a.preset).forEach(function (k) { preset[k] = a.preset[k]; });
    var guide = { hint: preset.hint || '', sample: preset.sample || null };
    delete preset.hint;
    delete preset.sample;
    if (preset.post) {
      var p = WW.Guide.findPost(this.game, preset.post);
      delete preset.post;
      if (p) preset.postId = p.id;
    }
    this.coachLocate(step.target);
    WW.ItemUI.open(self, a.item, preset, guide);
  };

  P.renderCoach = function () {
    var self = this;
    var g = this.game;
    var st = g.state;
    var lv = this.level;
    Array.prototype.forEach.call(this.warroom.querySelectorAll('.coach-hl'), function (el) { el.classList.remove('coach-hl'); });
    if (!lv.guide.some(function (x) { return x.at !== 'result'; }) || st.finished) {
      WW.DOM.clear(this.coachHost);
      this.warroom.classList.remove('has-coach');
      return;
    }
    var info = WW.Guide.sync(g);
    info.justDone.forEach(function (x) { WW.DOM.toast('✅ 教程：' + x.title, 'good', 2600); });
    var tutorial = WW.Guide.isTutorial(lv);
    var label = tutorial ? '📘 教程' : '💡 提示';
    var rerender = function () { self.save(); self.render(); };
    if (info.complete || (!info.current && !info.waiting)) {
      WW.DOM.clear(this.coachHost);
      this.warroom.classList.remove('has-coach');
      return;
    }
    if (info.hidden) {
      this.warroom.classList.remove('has-coach');
      WW.DOM.replace(this.coachHost, h('button', { class: 'coach-pill', on: { click: function () { WW.Guide.setHidden(g, false); rerender(); } } },
        label + (tutorial ? ' · ' + info.index + '/' + info.total : ''), h('span', { class: 'muted' }, ' 展开')));
      return;
    }
    var step = info.current;
    var target = step ? step.target : 'end-turn';
    var outOfAp = step && step.done && st.ap === 0;
    if (outOfAp) target = 'end-turn';
    var body = [];
    if (step) {
      if (step.title) body.push(h('div', { class: 'coach-title' }, step.title));
      body.push(h('div', { class: 'coach-text' }, step.text));
      info.notes.forEach(function (n) { body.push(h('div', { class: 'coach-note' }, n)); });
      if (outOfAp) body.push(h('div', { class: 'coach-note' }, '这回合的行动点用完了：点右上角「结束回合 ▶」，下回合再继续这一步。'));
    } else {
      body.push(h('div', { class: 'coach-title' }, '本回合的教学完成了'));
      body.push(h('div', { class: 'coach-text' }, g.diff.unlimited
        ? '技能不限次数，想继续出手就继续；不想用了就点右上角「结束回合 ▶」进入下一回合。'
        : st.ap > 0
        ? '还有 ' + st.ap + ' 个行动点，可以自由使用技能；不想用也没关系，点右上角「结束回合 ▶」进入下一回合。'
        : '行动点用完了。点右上角「结束回合 ▶」进入下一回合，看看晨报里发生了什么。'));
    }
    var buttons = [];
    if (step && step.action && !outOfAp) {
      var a = step.action;
      var item = a.item ? g.items[a.item] : null;
      var status = item ? g.itemStatus(a.item) : null;
      var usable = !item || status.usable;
      var actLabel = a.label || (item ? '使用「' + item.name + '」' : { finish: '立即结案', accept: '接下', endTurn: '结束回合' }[a.cmd]);
      buttons.push(h('button', { class: 'btn small primary', disabled: !usable || g.busy, title: usable ? '' : status.reason, on: { click: function () { self.coachAction(step); } } }, actLabel));
      if (!usable) body.push(h('div', { class: 'coach-note' }, '「' + item.name + '」暂时用不了：' + status.reason));
    }
    if (!step || outOfAp) {
      buttons.push(h('button', { class: 'btn small primary', disabled: g.busy, on: { click: function () { self.endTurn(); } } }, '结束回合 ▶'));
    }
    if (target && this.coachTargets(target).length) {
      buttons.push(h('button', { class: 'btn small', on: { click: function () { self.coachLocate(target); } } }, '在哪里？'));
    }
    if (step && !step.done) {
      buttons.push(h('button', { class: 'btn small accent', on: { click: function () { WW.Guide.mark(g, step.id, 'ack'); rerender(); } } }, tutorial ? '下一步' : '知道了'));
    } else if (step && step.optional) {
      buttons.push(h('button', { class: 'btn small ghost', on: { click: function () { WW.Guide.mark(g, step.id, 'skip'); rerender(); } } }, '跳过这一步'));
    }
    var card = h('div', { class: 'coach', role: 'region', 'aria-label': '教程', 'aria-live': 'polite' },
      h('div', { class: 'coach-head' },
        h('span', { class: 'coach-tag' }, label),
        tutorial ? h('span', { class: 'tiny muted' }, '第 ' + info.index + ' / ' + info.total + ' 步') : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'x-btn', title: '收起教程', 'aria-label': '收起教程', on: { click: function () { WW.Guide.setHidden(g, true); rerender(); } } }, '–')),
      tutorial ? h('div', { class: 'coach-bar' }, h('i', { style: { width: Math.round(info.finished / info.total * 100) + '%' } })) : null,
      body,
      h('div', { class: 'coach-actions' }, buttons));
    WW.DOM.replace(this.coachHost, card);
    this.warroom.classList.add('has-coach');
    this.coachTargets(target).forEach(function (el) { el.classList.add('coach-hl'); });
  };

  /* ------------------------------------------------------------------ dialogs */

  P.showTurnBriefing = function (b) {
    var self = this;
    var g = this.game;
    var st = g.state;
    if (!b) return;
    var lastClient = st.messages.filter(function (m) { return m.from === 'client' && m.turn === st.turn; }).slice(-1)[0];
    var next = WW.Guide.sync(g).current;
    var turnSteps = WW.Guide.forTurn(g);
    var tips = turnSteps.filter(function (x) { return !x.done && !x.title; });
    var steps = turnSteps.filter(function (x) { return x.title; });
    if (!steps.length && next && next.title) steps = [next];
    var guideBox = tips.length || steps.length ? h('div', { class: 'banner guide' }, h('span', null, steps.length ? '📘' : '💡'), h('div', { class: 'col', style: { gap: '4px', flex: '1 1 0', minWidth: '0' } },
      tips.map(function (x) { return h('span', null, x.text); }),
      steps.length ? h('span', null, h('b', null, '本回合教程：'), steps.map(function (x) { return x.title; }).join(' → ')) : null,
      steps.length ? h('span', { class: 'tiny muted' }, '左下角的教程卡片会一步步带你做。') : null)) : null;
    var body = h('div', { class: 'col', style: { gap: '12px' } },
      b.first ? h('div', { class: 'report-box' }, this.level.incident.summary) : null,
      b.summary && !b.first ? h('div', { class: 'report-box' }, '🛰 舆情简报：' + b.summary) : null,
      b.deltas ? deltaChips(b.deltas) : null,
      b.lines && b.lines.length ? h('div', { class: 'turn-lines' }, b.lines.map(function (l) { return h('div', { class: 'turn-line' }, h('span', { class: 'ic' }, LINE_ICONS[l.kind] || '•'), h('span', null, l.text)); })) : (b.first ? null : h('div', { class: 'small muted' }, '这一夜风平浪静。')),
      b.headlines && b.headlines.length ? h('div', { class: 'row wrap' }, h('span', { class: 'small muted' }, '新热搜：'), b.headlines.map(function (t) { return h('span', { class: 'chip' }, '#' + t + '#'); })) : null,
      lastClient ? h('div', { class: 'bubble-row' }, h('div', { class: 'bubble-avatar' }, this.level.client.contact.slice(0, 1)), h('div', { class: 'bubble ' + (lastClient.mood || '') }, lastClient.text)) : null,
      guideBox);
    var m = WW.DOM.modal({
      title: (b.first ? '接单 · ' : '晨报 · ') + g.turnLabel() + '（第 ' + st.turn + '/' + this.level.contract.turns + ' 回合）',
      wide: true, body: body,
      footer: [h('button', { class: 'btn primary', on: { click: function () { m.close(); } } }, '开始行动')],
      onClose: function () {
        /* plain tips were read here; tutorial steps stay on the coach card */
        tips.forEach(function (x) { WW.Guide.mark(g, x.id, 'ack'); });
        self.save();
        self.render();
      }
    });
  };

  P.showLog = function () {
    var st = this.game.state;
    var g = this.game;
    var rows = st.log.slice().reverse().map(function (l) {
      return h('div', { class: 'turn-line' }, h('span', { class: 'ic' }, LINE_ICONS[l.kind] || (l.kind === 'action' ? '🧰' : l.kind === 'truth' ? '💣' : '•')),
        h('span', null, h('span', { class: 'muted small' }, g.turnLabel(l.turn) + ' '), l.text, l.extra && l.extra.deltas ? h('span', { class: 'muted small' }, ' ' + Object.keys(l.extra.deltas).map(function (k) { return (STAT_LABELS[k] || k) + (l.extra.deltas[k] > 0 ? '+' : '') + l.extra.deltas[k]; }).join(' ')) : null));
    });
    WW.DOM.modal({ title: '操作日志', wide: true, body: h('div', { class: 'turn-lines' }, rows.length ? rows : h('div', { class: 'empty' }, '还没有记录')) });
  };

  P.showHelp = function () { WW.GameUI.help(); };

  /* ------------------------------------------------------------------ result */

  P.showResult = function () {
    var self = this;
    var g = this.game;
    var st = g.state;
    if (this.resultShown) return;
    this.resultShown = true;
    this.save();
    var f = st.final;
    var hist = st.history.slice();
    var labels = hist.map(function (p) { return String(p.turn); });
    var charts = [['sentiment', '舆论好感', -100, 100, [-100, 0, 100]], ['heat', '事件热度', 0, 100], ['credibility', '公信力', 0, 100], ['exposure', '暴露度', 0, 100], ['satisfaction', '客户满意', 0, 100]].map(function (c) {
      var vals = hist.map(function (p) { return p[c[0]]; });
      return h('div', { class: 'sm-card' }, h('div', { class: 'sm-t' }, h('span', null, c[1]), h('span', { class: 'num' }, String(Math.round(vals[vals.length - 1])))),
        WW.Charts.lineChart(vals, { min: c[2], max: c[3], ticks: c[4], label: c[1], labels: labels }));
    });
    var table = h('table', { class: 'data-table hidden' },
      h('thead', null, h('tr', null, h('th', null, '回合'), h('th', null, '好感'), h('th', null, '热度'), h('th', null, '公信力'), h('th', null, '暴露度'), h('th', null, '满意度'), h('th', null, '预算'))),
      h('tbody', null, hist.map(function (p) { return h('tr', null, h('td', null, String(p.turn)), h('td', null, String(p.sentiment)), h('td', null, String(p.heat)), h('td', null, String(p.credibility)), h('td', null, String(p.exposure)), h('td', null, String(p.satisfaction)), h('td', null, String(p.budget))); })));
    var report = h('div', { class: 'report-box' }, h('span', { class: 'spinner' }), ' 正在撰写结案报告……');
    var epi = h('div', { class: 'report-box', style: { fontStyle: 'italic' } }, '');
    var sides = this.level.objectives.side.map(function (t) {
      var ts = st.objectives.tasks[t.id];
      if (ts.status === 'hidden' || ts.status === 'declined') return null;
      return h('div', { class: 'small' }, (ts.status === 'done' ? '✅ ' : '❌ ') + t.title);
    }).filter(Boolean);
    var lessons = WW.Guide.resultNotes(g);

    var view = h('div', { class: 'result' },
      h('div', { class: 'result-head' },
        h('div', { class: 'grade ' + f.grade, 'aria-label': '评级 ' + f.grade }, f.grade),
        h('div', { class: 'col', style: { gap: '4px' } },
          h('h2', { style: { margin: 0 } }, (st.result === 'win' ? '✅ ' : '❌ ') + st.endTitle),
          h('div', { class: 'result-sub' }, st.endText),
          h('div', { class: 'result-sub' }, '得分 ' + f.score + ' · 基础 ' + f.base + (f.progressMul < 1 ? ' × 主任务推进 ' + f.progressMul : '') + (f.bonus ? ' + 加分 ' + f.bonus : '') + ' · ' + D.difficulties[st.difficulty].name + '难度'))),
      lessons.map(function (x) {
        return h('div', { class: 'banner guide', style: { marginTop: '16px', alignItems: 'flex-start' } }, h('span', null, '📘'),
          h('div', { class: 'col', style: { gap: '4px' } }, x.title ? h('b', null, x.title) : null, h('span', { style: { whiteSpace: 'pre-line' } }, x.text)));
      }),
      h('div', { class: 'section-title' }, '评分构成'),
      h('div', { class: 'score-parts' }, f.parts.map(function (p) {
        return h('div', { class: 'tile' }, h('div', { class: 't-label' }, p.label + ' · 权重 ' + Math.round(p.weight * 100) + '%'), h('div', { class: 't-value' }, String(Math.round(p.value))), WW.Charts.meter(p.value, 100));
      })),
      h('div', { class: 'section-title' }, '舆情走势', h('button', { class: 'btn small ghost', on: { click: function () { table.classList.toggle('hidden'); } } }, '数据表')),
      h('div', { class: 'small-multiples' }, charts),
      table,
      h('div', { class: 'section-title' }, '结案报告'),
      report,
      epi,
      sides.length ? h('div', { class: 'section-title' }, '支线') : null,
      sides.length ? h('div', { class: 'col', style: { gap: '4px' } }, sides) : null,
      h('div', { class: 'row wrap', style: { marginTop: '24px', justifyContent: 'flex-end' } },
        h('button', { class: 'btn', on: { click: function () { self.showLog(); } } }, '查看完整日志'),
        h('button', { class: 'btn', on: { click: function () { var lvl = self.rawLevel; var o = self.opts; var c = self.container; self.destroy(); WW.GameUI.mount(c, lvl, o); } } }, '再来一局'),
        h('button', { class: 'btn primary', on: { click: function () { self.exit(); } } }, self.opts.testMode ? '结束试玩' : '返回选关')));

    this.unsub.forEach(function (fn) { fn(); });
    this.unsub = [];
    WW.DOM.replace(this.container, view);
    window.scrollTo(0, 0);
    g.runAI('ending.report', {}).then(function (res) {
      var d = res.data || {};
      WW.DOM.replace(report, d.report || '');
      WW.DOM.replace(epi, d.epilogue || '');
    });
  };

  /* ================================================================== static */

  function help() {
    var sec = function (t, lines) { return h('div', null, h('h4', { style: { margin: '10px 0 4px' } }, t), h('ul', { style: { margin: 0, paddingLeft: '18px' } }, lines.map(function (l) { return h('li', { class: 'small' }, l); }))); };
    WW.DOM.modal({
      title: '玩法说明', wide: true,
      body: h('div', null,
        h('div', { class: 'small sub' }, '你经营一家危机公关公司。每一关是一单委托：在合同期内用预算和行动点操控舆论，完成主任务即可结案。完整机制见 docs/Gameplay.md。'),
        sec('回合', ['每回合有若干行动点，技能消耗行动点和预算。', '点「结束回合」后：对手按意图出招 → 舆论演化 → 回合间事件与证据曝光 → AI 生成新的网评、热搜与客户巨信。']),
        sec('五个数值', ['舆论好感：核心 KPI，由各阵营好感按人口加权。', '热度：会自然衰减；越热，负面越容易发酵、水军越难起效。', '公信力：公文效果的乘数；撒谎被打脸会暴跌。', '暴露度：网友对“有人操控”的怀疑；满 100 直接翻车。', '客户满意度：归零会被解约。']),
        sec('真相与风险', ['客户口径不一定是真的；「内部摸底调查」可以核实。', '在公文里否认真相会记“谎言债”，证据曝光时会被打脸；否认谣言则会在真相大白时得到印证。', '水军、删帖、控评、撤热搜都会累积暴露度，可能被扒。', '「召唤铁拳」只砸真违规：举报说真话的人会失败，甚至引来监管反查。']),
        sec('主任务与对手', ['主任务分阶段，每阶段由子任务组成；完成阶段会解锁更高级技能、追加预算。', '支线是额外委托，有额外奖励，也可能有惩罚。', '对手有自己的经典招式：抱团举报、告洋状、吃黑流量、召唤铁拳……部署「舆情监测」后能提前看到对手下回合的意图。']),
        sec('AI', ['在「AI 设置」里配置接口后，公文补全、评审、筛帖、水军内容、网评、结案报告都由 AI 生成；数值始终由游戏引擎计算。', '没有配置也能完整游玩，所有 AI 功能都有离线规则兜底。'])),
      footer: false
    });
  }

  WW.GameUI = {
    mount: function (container, level, opts) {
      var ui = new GameUI(container, level, opts);
      if (opts && opts.resume) ui.resume(opts.resume);
      else ui.showBriefing();
      return ui;
    },
    deltaChips: deltaChips,
    help: help,
    stars: stars
  };
})(window.WW);
