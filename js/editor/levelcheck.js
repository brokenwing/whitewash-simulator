/*
 * 通关测试: sweep many offline play styles over a level and judge whether it is reasonable.
 * No DOM; the editor dialog and `node tests/run.js --check` both use it. Every game runs on the
 * offline rules (no aiRunner), so it never calls a model.
 *
 *   WW.LevelCheck.run(level, { diffs, depth, genomeSeed, shouldStop }, onProgress) -> results
 *   WW.LevelCheck.analyze(level, results, intent) -> { verdicts, byDiff, entries, tasks, endings }
 *   WW.LevelCheck.trace(level, results, entryId, diff, seed) -> { history, log, result, endTitle }
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var B = WW.Bots;

  /* policies: generated play styles (standard covers the stance x fix x suppress x shill grid of
     4 x 3 x 3 x 3 = 108 once); explorers: extra styles that try every skill once, for coverage
     (see Bots.genomes); parents: leaders per group whose neighbours round 1b tries (see
     neighbourhood); seeds: first-round games per style and difficulty;
     refine: games every entry a verdict may quote is topped up to (see contenders) */
  var DEPTHS = {
    quick: { label: '快速', policies: 36, explorers: 12, parents: 1, seeds: 3, refine: 8 },
    standard: { label: '标准', policies: 108, explorers: 24, parents: 1, seeds: 3, refine: 10 },
    deep: { label: '深入', policies: 216, explorers: 48, parents: 2, seeds: 4, refine: 16 }
  };
  var BASELINES = ['idle', 'shill', 'honest', 'balanced', 'smart'];
  var INTENTS = { any: '认错、掩盖都可以', admit: '认错才能过', cover: '掩盖也能过' };
  var DIFF_ORDER = ['intern', 'regular', 'gold'];

  function vals(o) { return Object.keys(o).map(function (k) { return o[k]; }); }

  function entriesFor(level, depth, genomeSeed) {
    var list = BASELINES.map(function (id) { return { id: id, kind: 'base', label: B.describe({ base: id }), genome: { base: id } }; });
    if (level.guide && level.guide.length) list.push({ id: 'guide', kind: 'base', label: B.describe({ base: 'guide' }), genome: { base: 'guide' } });
    var expert = Object.assign({ id: 'p0', anchor: true }, B.EXPERT);
    [expert].concat(B.genomes(DEPTHS[depth].policies, genomeSeed || 7, DEPTHS[depth].explorers)).forEach(function (g) { list.push({ id: g.id, kind: 'policy', label: B.describe(g), genome: g }); });
    list.forEach(function (e) { e.games = {}; });
    return list;
  }

  /* ------------------------------------------------------------------ closest approach */

  /* the numeric comparisons a task's condition must all meet (top level and nested all), with paths */
  function leavesOf(cond, path) {
    if (!cond) return [];
    if (typeof cond.var === 'string') return ['<', '<=', '>', '>='].indexOf(cond.op) >= 0 && !isNaN(Number(cond.value)) ? [{ leaf: cond, path: path }] : [];
    if (Array.isArray(cond.all)) return cond.all.reduce(function (a, c, i) { return a.concat(leavesOf(c, path + '.all[' + i + ']')); }, []);
    return [];
  }

  function watchesFor(lv) {
    var out = [];
    vals(taskIndex(lv)).forEach(function (t) {
      var leaves = leavesOf(t.def.complete, t.path + '.complete');
      if (leaves.length) out.push({ id: t.def.id, leaves: leaves });
    });
    return out;
  }

  /* For each watched comparison in one game, while its task is live: the best value it reached and
     the value when the task was first seen live ({ v, from }), so "never moved" can be told apart. */
  function tracker(watches) {
    var best = {};
    return {
      best: best,
      see: function (game) {
        var tasks = game.state.objectives.tasks;
        watches.forEach(function (w) {
          if (!tasks[w.id] || tasks[w.id].status !== 'active') return;
          var row = best[w.id] = best[w.id] || [];
          w.leaves.forEach(function (x, i) {
            var v = Number(WW.Cond.resolve(x.leaf.var, game));
            if (isNaN(v)) return;
            var up = x.leaf.op === '>' || x.leaf.op === '>=';
            if (!row[i]) row[i] = { v: v, from: v };
            else if (up ? v > row[i].v : v < row[i].v) row[i].v = v;
          });
        });
      }
    };
  }

  function play(level, entry, diff, seed, track) {
    var g = entry.genome;
    var onTurn = track ? track.see : undefined;
    if (g.base === 'guide') return B.playGuide(level, seed, diff, onTurn);
    return B.playBot(level, g.base ? g.base : B.policy(g), seed, diff, {}, onTurn);
  }

  /* what one finished game says, kept small: thousands of these are held in memory */
  function summarize(game, seed, track) {
    var st = game.state;
    var tasks = {};
    vals(st.objectives.tasks).forEach(function (t) { tasks[t.id] = t.status; });
    if (track) track.see(game);
    var near = {};
    var r1 = function (v) { return Math.round(v * 10) / 10; };
    if (track) Object.keys(track.best).forEach(function (id) {
      if (tasks[id] !== 'done') near[id] = track.best[id].map(function (x) { return x ? [r1(x.v), r1(x.from)] : null; });
    });
    return {
      seed: seed, win: st.result === 'win', score: st.final ? st.final.score : 0, grade: st.final ? st.final.grade : '',
      end: st.endTitle, turns: st.turn,
      route: vals(st.facts).some(function (f) { return f.admitted; }) || st.flags.rectified ? 'admit' : 'cover',
      tasks: tasks, uses: Object.keys(st.itemUses), near: near,
      unlocked: game.itemOrder.filter(function (id) { return WW.Items.isUnlocked(game, id); })
    };
  }

  function rate(games) { return games && games.length ? games.filter(function (x) { return x.win; }).length / games.length : 0; }

  function yieldNow() { return new Promise(function (r) { setTimeout(r, 0); }); }

  function run(level, opts, onProgress) {
    opts = opts || {};
    level = WW.Schema.normalize(level);
    var depth = DEPTHS[opts.depth] ? opts.depth : 'standard';
    var cfg = DEPTHS[depth];
    var diffs = (opts.diffs || DIFF_ORDER).filter(function (d) { return level.difficulty.allowed.indexOf(d) >= 0; });
    var entries = entriesFor(level, depth, opts.genomeSeed);
    var plan = entries.length * diffs.length * cfg.seeds;
    var estimate = plan + 4 * cfg.parents * 12 * diffs.length * cfg.seeds + 25 * diffs.length * (cfg.refine - cfg.seeds);
    var done = 0, stopped = false, last = Date.now(), started = Date.now();

    var watches = watchesFor(level);
    var one = async function (entry, diff, seed) {
      var track = tracker(watches);
      var game = await play(level, entry, diff, seed, track);
      (entry.games[diff] = entry.games[diff] || []).push(summarize(game, seed, track));
      done++;
      if (Date.now() - last > 40) {
        last = Date.now();
        if (onProgress) onProgress({ done: done, total: Math.max(estimate, done), ms: Date.now() - started });
        await yieldNow();
      }
      if (opts.shouldStop && opts.shouldStop()) stopped = true;
    };

    return (async function () {
      for (var s = 1; s <= cfg.seeds && !stopped; s++) {
        for (var i = 0; i < entries.length && !stopped; i++) {
          for (var d = 0; d < diffs.length && !stopped; d++) await one(entries[i], diffs[d], s);
        }
      }
      /* round 1b: try the neighbours of each group's leader (see neighbourhood) */
      var extra = neighbourhood(entries, diffs.indexOf('regular') >= 0 ? 'regular' : diffs[0], cfg.parents);
      entries.push.apply(entries, extra);
      for (var s2 = 1; s2 <= cfg.seeds && !stopped; s2++) {
        for (var i2 = 0; i2 < extra.length && !stopped; i2++) {
          for (var d2 = 0; d2 < diffs.length && !stopped; d2++) await one(extra[i2], diffs[d2], s2);
        }
      }
      /* round two: top up every entry a verdict may quote (see contenders) */
      for (var k = 0; k < diffs.length && !stopped; k++) {
        var diff = diffs[k];
        var pick = contenders(entries, diff);
        for (var j = 0; j < pick.length && !stopped; j++) {
          for (var seed = cfg.seeds + 1; seed <= cfg.refine && !stopped; seed++) await one(pick[j], diff, seed);
        }
        /* topping up reorders the field: whoever leads a group now and still has a short sample is
           topped up too, until every group's leader stands on a full sample */
        for (var round = 0; round < 6 && !stopped; round++) {
          var short = leaders(entries, diff).filter(function (e) { return e.games[diff].length < cfg.refine; });
          if (!short.length) break;
          for (var q = 0; q < short.length && !stopped; q++) {
            for (var sd = short[q].games[diff].length + 1; sd <= cfg.refine && !stopped; sd++) await one(short[q], diff, sd);
          }
        }
      }
      if (onProgress) onProgress({ done: done, total: done, ms: Date.now() - started });
      return { level: level, depth: depth, diffs: diffs, entries: entries, refine: cfg.refine, games: done, ms: Date.now() - started, stopped: stopped };
    })();
  }

  function genomeKey(g) { return [g.intel, g.stance, g.fix, g.suppress, g.shill].concat((g.tactics || []).slice().sort()).join('|'); }

  /* Each grid cell gets one intel value and one random tactic draw, so whether the best blind / cover
     / dirty player of a level shows up at all used to depend on the draw (a cell that wins with
     扒皮 + 招安 drawn as 看透真相, or without 扒皮, says nothing about blind players). Round 1b takes
     the leaders of each group on the main difficulty (best overall, best blind, best cover route,
     best dirty play; `parents` of each, only ones that won at least once) and adds their neighbours:
     the other two intel values, and each play tactic switched on or off. */
  function neighbourhood(entries, d, parents) {
    var policies = entries.filter(function (e) { return e.kind === 'policy' && e.games[d] && e.games[d].length; });
    var ranked = policies.slice().sort(function (a, b) { return rate(b.games[d]) - rate(a.games[d]); }).filter(function (e) { return rate(e.games[d]) > 0; });
    var groups = [
      ranked,
      ranked.filter(isBlind),
      ranked.filter(function (e) { return routeOf(e.games[d]) === 'cover'; }),
      ranked.filter(isDirty)
    ];
    var seen = {};
    entries.forEach(function (e) { if (e.kind === 'policy') seen[genomeKey(e.genome)] = true; });
    var out = [], done = [];
    groups.forEach(function (list) {
      list.slice(0, parents || 1).forEach(function (p) {
        if (done.indexOf(p) >= 0) return;
        done.push(p);
        var g = p.genome, n = 0;
        var near = Object.keys(B.AXES.intel).filter(function (v) { return v !== g.intel; }).map(function (v) { return { intel: v }; })
          .concat(B.PLAY_TACTICS.map(function (t) {
            return { tactics: g.tactics.indexOf(t) >= 0 ? g.tactics.filter(function (x) { return x !== t; }) : g.tactics.concat([t]) };
          }));
        near.forEach(function (change) {
          var x = Object.assign({}, g, change);
          /* the leader's own play with less information: what 只有看透真相才能赢 asks about */
          x.peekless = !!change.intel && change.intel !== 'oracle';
          var key = genomeKey(x);
          if (seen[key]) return;
          seen[key] = true;
          x.id = g.id + 'n' + (++n);
          x.explorer = !!g.explorer;
          x.neighbour = true;
          delete x.anchor;
          out.push({ id: x.id, kind: 'policy', label: B.describe(x), genome: x, games: {} });
        });
      });
    });
    return out;
  }

  /* what kind of player an entry is, as the verdicts group them */
  function isBlind(e) { return e.kind === 'policy' ? e.genome.intel !== 'oracle' : e.id !== 'smart'; }
  function isDirty(e) { return e.kind === 'policy' && e.genome.shill === 'heavy' && e.genome.suppress === 'heavy' && e.genome.fix === 'never'; }
  /* an entry's route is what its games actually did: admitted / rectified, or never */
  function routeOf(games) {
    var admits = games.filter(function (x) { return x.route === 'admit'; }).length;
    return admits * 2 >= games.length ? 'admit' : 'cover';
  }

  /* the groups a verdict quotes the best of */
  var GROUPS = [
    function () { return true; }, isBlind, isDirty,
    function (e, d) { return routeOf(e.games[d]) === 'admit'; },
    function (e, d) { return routeOf(e.games[d]) === 'cover'; }
  ];

  /* the current best entry of each group on difficulty d */
  function leaders(entries, d) {
    var out = [];
    GROUPS.forEach(function (keep) {
      var b = null;
      entries.forEach(function (e) {
        if (!e.games[d] || !e.games[d].length || !keep(e, d)) return;
        if (!b || rate(e.games[d]) > rate(b.games[d])) b = e;
      });
      if (b && out.indexOf(b) < 0) out.push(b);
    });
    return out;
  }

  /* Entries a verdict may quote on difficulty d: the overall leaders, the best blind players, the
     best of each route and stance, every dirty-play entry that won at all, and the leaders' own play
     with less information (see neighbourhood). Round two tops these
     up and analyze() only takes maxima over topped-up entries: a maximum over 3-game samples picks
     whoever got lucky (2 wins out of 3 reads as 67%). */
  function contenders(entries, d) {
    var rows = entries.filter(function (e) { return e.games[d] && e.games[d].length; });
    var ranked = rows.slice().sort(function (a, b) { return rate(b.games[d]) - rate(a.games[d]); });
    var pick = ranked.slice(0, 10);
    var add = function (e) { if (e && pick.indexOf(e) < 0) pick.push(e); };
    ranked.filter(isBlind).slice(0, 3).forEach(add);
    ['admit', 'cover'].forEach(function (r) { ranked.filter(function (e) { return routeOf(e.games[d]) === r; }).slice(0, 3).forEach(add); });
    Object.keys(B.AXES.stance).forEach(function (s) { add(ranked.filter(function (e) { return e.genome.stance === s; })[0]); });
    rows.filter(function (e) { return isDirty(e) && rate(e.games[d]) > 0; }).forEach(add);
    /* always: a true rate of 20% reads 0 out of 3 about half the time */
    rows.filter(function (e) { return e.genome.peekless; }).forEach(add);
    return pick;
  }

  /* ------------------------------------------------------------------ analysis */

  var DIFF_NAME = function (d) { return (WW.Data.difficulties[d] || {}).name || d; };

  function taskIndex(lv) {
    var out = {};
    lv.objectives.stages.forEach(function (s, i) {
      s.tasks.forEach(function (t, j) { out[t.id] = { id: t.id, title: t.title, side: false, stage: i, stageTitle: s.title, required: t.required, path: 'objectives.stages[' + i + '].tasks[' + j + ']', def: t }; });
    });
    lv.objectives.side.forEach(function (t, i) { out[t.id] = { id: t.id, title: t.title, side: true, required: false, path: 'objectives.side[' + i + ']', def: t }; });
    return out;
  }

  function median(xs) {
    if (!xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    return s[Math.floor(s.length / 2)];
  }

  function analyze(level, res, intent) {
    var lv = WW.Schema.normalize(level);
    intent = INTENTS[intent] ? intent : 'any';
    var verdicts = [];
    var V = function (lvl, title, detail, path, fixes) {
      var v = { level: lvl, title: title, detail: detail || '', path: path || '' };
      if (fixes && fixes.length) v.fixes = fixes;
      verdicts.push(v);
    };
    var pct = function (x) { return Math.round(x * 100) + '%'; };
    var byDiff = {};

    res.diffs.forEach(function (d) {
      var rows = res.entries.filter(function (e) { return e.games[d] && e.games[d].length; });
      /* how many styles win: explorers (coverage), neighbours (near copies of the leaders) and the
         expert anchor are not styles of the sample and would skew it */
      var styles = rows.filter(function (e) { return !e.genome.explorer && !e.genome.neighbour && !e.genome.anchor; });
      /* each group's maximum only over its topped-up entries (all of the group's entries when none
         is, e.g. the run was stopped before round two) */
      var full = function (e) { return e.games[d].length >= (res.refine || 0); };
      var top = function (keep) {
        var group = rows.filter(keep);
        var pool = group.filter(full).length ? group.filter(full) : group;
        var b = null;
        pool.forEach(function (e) { var r = rate(e.games[d]); if (!b || r > b.rate) b = { entry: e, rate: r, n: e.games[d].length }; });
        return b;
      };
      var any = function () { return true; };
      var best = top(any), bestBlind = top(isBlind), dirty = top(isDirty), wins = [];
      var routeBest = {
        admit: top(function (e) { return routeOf(e.games[d]) === 'admit'; }),
        cover: top(function (e) { return routeOf(e.games[d]) === 'cover'; })
      };
      rows.forEach(function (e) { e.games[d].forEach(function (x) { if (x.win) wins.push(x.turns); }); });
      var ends = {};
      rows.forEach(function (e) { e.games[d].forEach(function (x) { if (!x.win) ends[x.end] = (ends[x.end] || 0) + 1; }); });
      byDiff[d] = {
        best: best, bestBlind: bestBlind, admitBest: routeBest.admit, coverBest: routeBest.cover, dirty: dirty,
        median: median(styles.filter(function (e) { return e.kind === 'policy'; }).map(function (e) { return rate(e.games[d]); })),
        share: styles.length ? styles.filter(function (e) { return rate(e.games[d]) >= 0.5; }).length / styles.length : 0,
        idle: rate((res.entries.filter(function (e) { return e.id === 'idle'; })[0] || { games: {} }).games[d]),
        shill: rate((res.entries.filter(function (e) { return e.id === 'shill'; })[0] || { games: {} }).games[d]),
        winTurns: wins.length ? U.sum(wins, function (x) { return x; }) / wins.length : 0,
        ends: ends
      };
    });

    /* the main difficulty the verdicts speak about */
    var main = res.diffs.indexOf('regular') >= 0 ? 'regular' : res.diffs[0];
    var m = byDiff[main];
    var turns = lv.contract.turns;
    if (m) {
      var name = DIFF_NAME(main);
      if (!m.best || m.best.rate === 0) V('red', name + '档没有任何打法能通关', '扫了 ' + res.entries.length + ' 种打法都输。看看下面的“未完成的必做任务”和主要失败原因。', 'objectives');
      else if (m.best.rate < 0.3) V('yellow', name + '档最好的打法胜率只有 ' + pct(m.best.rate), '最好的是「' + m.best.entry.label + '」。普通玩家大概率过不去。', 'objectives');
      var blindRate = m.bestBlind ? m.bestBlind.rate : 0;
      if (m.best && m.best.rate >= 0.3 && blindRate < 0.2 && blindRate < m.best.rate / 2) {
        V('yellow', '只有看透真相才能赢', '知道全部真相的打法胜率 ' + pct(m.best.rate) + '，只凭可见信息的最好只有 ' + pct(m.bestBlind ? m.bestBlind.rate : 0) +
          '。玩家分不清谣言：考虑让「内部摸底调查」更早解锁，或在委托书、帖子里给出更明显的线索。', 'facts');
      }
      if (m.idle > 0) V('red', '什么都不做也能赢（' + name + '档 ' + pct(m.idle) + '）', '胜利条件或任务目标太宽松，初始数值可能已经接近达标。', 'initialStats');
      else if (m.share > 0.7) V('yellow', '太容易：' + pct(m.share) + ' 的打法都能赢', '目标阈值可以收紧，或者加强对手。', 'objectives');
      if (m.winTurns && m.winTurns <= Math.max(2.5, turns * 0.35)) V('yellow', '赢得太快：获胜局平均第 ' + m.winTurns.toFixed(1) + ' 回合就结案', '合同共 ' + turns + ' 回合，后半段的内容玩家看不到。', 'objectives');
      if (m.shill > 0) V('yellow', '纯水军洗地也能赢（' + name + '档 ' + pct(m.shill) + '）', '操控没有足够的风险。', 'tuning');
      if (m.dirty && m.dirty.rate >= 0.3) V('yellow', '重压制 + 大量水军、不整改的打法能赢 ' + pct(m.dirty.rate), '「' + m.dirty.entry.label + '」（' + m.dirty.n + ' 局）', 'tuning');

      var admitR = m.admitBest ? m.admitBest.rate : 0, coverR = m.coverBest ? m.coverBest.rate : 0;
      if (intent === 'admit' && coverR >= 0.4) V('yellow', '掩盖路线也能过（' + pct(coverR) + '），和“认错才能过”的意图不符', '最好的掩盖打法：「' + m.coverBest.entry.label + '」。可以让真相的证据更早或更确定地曝光（facts[].evidence），或给主任务加上承认 / 整改的要求。', 'facts');
      if (intent === 'admit' && admitR < 0.3) V('yellow', '认错路线自己也很难赢（' + pct(admitR) + '）', '', 'objectives');
      if (intent === 'cover' && coverR < 0.2) V('yellow', '掩盖路线几乎赢不了（' + pct(coverR) + '），和“掩盖也能过”的意图不符', '证据曝光可能太早或太确定，或者主任务要求了承认 / 整改。', 'facts');
      if (intent === 'any' && m.best && m.best.rate >= 0.5) {
        if (coverR < 0.1 && admitR >= 0.5) V('info', '实际上只有认错路线能过', '认错最好 ' + pct(admitR) + '，掩盖最好 ' + pct(coverR) + '。如果这正是设计意图，可以在上方把意图设为“认错才能过”。');
        if (admitR < 0.1 && coverR >= 0.5) V('info', '实际上只有掩盖路线能过', '认错最好 ' + pct(admitR) + '，掩盖最好 ' + pct(coverR) + '。');
      }
      var endList = Object.keys(m.ends).map(function (k) { return [k, m.ends[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
      var lost = U.sum(endList, function (x) { return x[1]; });
      if (endList.length && endList[0][1] / lost >= 0.8 && lost >= 10) V('info', name + '档失败局里 ' + pct(endList[0][1] / lost) + ' 是「' + endList[0][0] + '」', '这是这关的主要死因。');
    }

    /* difficulty gradient */
    var order = DIFF_ORDER.filter(function (d) { return byDiff[d] && byDiff[d].best; });
    for (var i = 1; i < order.length; i++) {
      var easier = byDiff[order[i - 1]].best.rate, harder = byDiff[order[i]].best.rate;
      if (harder > easier + 0.15) V('yellow', DIFF_NAME(order[i]) + '档反而比' + DIFF_NAME(order[i - 1]) + '档好打', pct(harder) + ' 对 ' + pct(easier) + '。检查 difficulty.overrides。', 'difficulty');
    }
    if (byDiff.intern && byDiff.intern.best && byDiff.intern.best.rate < 0.8) V('yellow', '「看不见的大手」档最好也只有 ' + pct(byDiff.intern.best.rate), '爽局档应该很容易赢；可能是有任务在任何打法下都完成不了。', 'objectives');
    if (byDiff.gold && byDiff.gold.best && byDiff.gold.best.rate === 0 && m && m.best && m.best.rate > 0) V('info', '金牌档机器人一局都赢不了', '可能是留给精打细算的真人玩家的，也可能是太难了。');

    /* tasks per difficulty; the verdicts look at the main one (the 大手 preset ignores skill tiers) */
    var idx = taskIndex(lv);
    var tally = {};
    Object.keys(idx).forEach(function (id) {
      tally[id] = {};
      res.diffs.forEach(function (d) { tally[id][d] = { reached: 0, done: 0, games: 0 }; });
    });
    res.entries.forEach(function (e) {
      Object.keys(e.games).forEach(function (d) {
        e.games[d].forEach(function (x) {
          Object.keys(x.tasks).forEach(function (id) {
            var t = tally[id] && tally[id][d];
            if (!t) return;
            t.games++;
            if (x.tasks[id] !== 'locked') t.reached++;
            if (x.tasks[id] === 'done') t.done++;
          });
        });
      });
    });
    var tasks = Object.keys(idx).map(function (id) { return Object.assign({}, idx[id], { byDiff: tally[id] }); });

    /* coverage: the skills the sweep actually used on the main difficulty. A skill some game unlocked
       but none used is a blind spot of the sweep: a task that needs it says nothing about the level.
       A skill no game ever unlocked is the level's business (its stages never got that far). */
    var used = {}, opened = {};
    res.entries.forEach(function (e) {
      (e.games[main] || []).forEach(function (x) {
        (x.uses || []).forEach(function (id) { used[id] = true; });
        (x.unlocked || []).forEach(function (id) { opened[id] = true; });
      });
    });
    var skills = lv.items.enabled.concat(lv.items.custom.map(function (c) { return c.id; }));
    var skillName = function (id) { var c = lv.items.custom.filter(function (x) { return x.id === id; })[0]; return (c || WW.Data.items[id] || {}).name || id; };
    var coverage = {
      used: skills.filter(function (id) { return used[id]; }),
      unused: skills.filter(function (id) { return !used[id] && opened[id]; }),
      locked: skills.filter(function (id) { return !used[id] && !opened[id]; })
    };
    var untried = function (cond) { return WW.Schema.condSkills(cond).filter(function (id) { return coverage.unused.indexOf(id) >= 0; }).map(skillName); };
    if (coverage.unused.length && m) {
      V('info', '扫参从未用过：' + coverage.unused.map(skillName).join('、'), '这些技能解锁了，但没有任何打法用过；依赖它们的结论不可靠。用过 ' + coverage.used.length + ' / ' + skills.length + ' 个技能。', 'items');
    }

    var mainGames = [];
    res.entries.forEach(function (e) { (e.games[main] || []).forEach(function (x) { mainGames.push(x); }); });
    /* the author's own objectives are there to patch (not the defaults normalize filled in) */
    var rawTasks = !!(level && U.isObj(level.objectives) && (Array.isArray(level.objectives.stages) || Array.isArray(level.objectives.side)));
    tasks.forEach(function (t) {
      var x = t.byDiff[main];
      if (!x || !x.games) return;
      var where = DIFF_NAME(main) + '档';
      var def = t.def;
      var gap = untried(def && def.complete);
      var gapNote = gap.length ? '扫参没用过「' + gap.join('」「') + '」，可能是测试没覆盖到，而不是关卡问题。' : '';
      var shut = WW.Schema.condSkills(def && def.complete).filter(function (id) { return coverage.locked.indexOf(id) >= 0; }).map(skillName);
      if (shut.length) gapNote += '要用的「' + shut.join('」「') + '」在这一档从未解锁（解锁它的阶段没推进到）。';
      var why = x.reached && !x.done ? shortfall(t, mainGames, lv, rawTasks) : { text: '', fixes: [] };
      t.nearest = why.nearest || null;
      if (!t.side && t.required && x.reached && !x.done) V(gap.length ? 'yellow' : 'red', '必做子任务「' + t.title + '」在' + where + '从来没有完成', gapNote || '出现了 ' + x.reached + ' 局，一局都没完成，后面的阶段因此都打不开。' + why.text, t.path, why.fixes);
      else if (t.side && !x.reached) {
        var offerGap = untried(def && def.offer);
        V('yellow', '支线「' + t.title + '」在' + where + '从来没有发放', offerGap.length ? '扫参没用过「' + offerGap.join('」「') + '」，可能是测试没覆盖到。' : '检查 offer 条件。', t.path);
      } else if (t.side && !x.done) V('yellow', '支线「' + t.title + '」在' + where + '从来没有完成', '发放了 ' + x.reached + ' 局。' + gapNote + why.text, t.path, why.fixes);
    });

    /* stages no game on the main difficulty ever reached: their tasks were never tested at all */
    var stageTasks = lv.objectives.stages.map(function (s, i) { return tasks.filter(function (t) { return !t.side && t.stage === i; }); });
    var firstUnseen = -1;
    stageTasks.forEach(function (list, i) {
      if (firstUnseen < 0 && i > 0 && list.length && list.every(function (t) { return !t.byDiff[main] || !t.byDiff[main].reached; })) firstUnseen = i;
    });
    if (firstUnseen > 0) {
      var unseen = U.sum(stageTasks.slice(firstUnseen), function (l) { return l.length; });
      var stuck = stageTasks[firstUnseen - 1].filter(function (t) { return t.required && t.byDiff[main] && t.byDiff[main].reached && !t.byDiff[main].done; })[0];
      V('info', '第 ' + (firstUnseen + 1) + (firstUnseen + 1 < stageTasks.length ? '~' + stageTasks.length : '') + ' 阶段在' + DIFF_NAME(main) + '档从未解锁，' + unseen + ' 个子任务没被测到',
        (stuck ? '卡在第 ' + firstUnseen + ' 阶段的「' + stuck.title + '」。' : '') + '先让前面的阶段能完成，再看这些任务的测试结果。', stuck ? stuck.path : 'objectives');
    }

    /* static checks that make part of the level never work (see Schema.validate) */
    WW.Schema.validate(level).warnings.filter(function (w) { return w.blocking; }).forEach(function (w) { V('yellow', '静态检查：' + w.msg, '', w.path); });

    if (!verdicts.some(function (v) { return v.level === 'red' || v.level === 'yellow'; })) V('green', '没有发现明显问题', '能通关、不至于太容易，任务都有人完成。');
    var rank = { red: 0, yellow: 1, info: 2, green: 3 };
    verdicts.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
    return { verdicts: verdicts, byDiff: byDiff, main: main, entries: res.entries, tasks: tasks, intent: intent, coverage: coverage };
  }

  /* Why a task that was offered never got done: how close each comparison came (best value over all
     games, while the task was live), how those games ended, and a fix that sets the threshold to what
     the sweep reached (only when the author wrote the objectives, so the path is theirs). */
  var TUNABLE = /^(stats|faction|opp|trend|posts|counters)\./;
  function shortfall(t, games, lv, rawTasks) {
    var leaves = leavesOf(t.def.complete, t.path + '.complete');
    var live = games.filter(function (x) { return x.tasks[t.id] && ['locked', 'hidden', 'done'].indexOf(x.tasks[t.id]) < 0; });
    var nearest = leaves.map(function (l, i) {
      var up = l.leaf.op === '>' || l.leaf.op === '>=', best, from, moved = false;
      live.forEach(function (x) {
        var p = x.near && x.near[t.id] ? x.near[t.id][i] : null;
        if (!p) return;
        if (up ? p[0] - p[1] >= 1 : p[1] - p[0] >= 1) moved = true;
        if (best === undefined || (up ? p[0] > best : p[0] < best)) { best = p[0]; from = p[1]; }
      });
      return { var: l.leaf.var, op: l.leaf.op, value: Number(l.leaf.value), best: best, from: from, moved: moved, path: l.path, up: up };
    });
    var met = function (n) { return n.up ? (n.op === '>' ? n.best > n.value : n.best >= n.value) : (n.op === '<' ? n.best < n.value : n.best <= n.value); };
    var short = nearest.filter(function (n) { return n.best !== undefined && !met(n); });
    var say = function (n) { return WW.Cond.describe({ var: n.var, op: n.op, value: n.value }, lv); };
    var text = short.length ? ' 最接近的一局：' + short.map(function (n) {
      if (!n.moved) return say(n) + '，但它在所有局里都没往目标方向动过（一直在 ' + n.best + ' 左右）：缺的是能影响它的手段，不是门槛高低';
      return say(n) + '，最好只到 ' + n.best + '（差 ' + Math.round(Math.abs(n.value - n.best) * 10) / 10 + '）';
    }).join('；') + '。' : '';
    var ends = {};
    live.forEach(function (x) { if (!x.win) ends[x.end] = (ends[x.end] || 0) + 1; });
    var top = Object.keys(ends).sort(function (a, b) { return ends[b] - ends[a]; })[0];
    if (top && live.length >= 10 && ends[top] / live.length >= 0.6) text += ' 这些局里 ' + Math.round(ends[top] / live.length * 100) + '% 以「' + top + '」告终。';
    /* the sweep's best, rounded to 5 on the reachable side; only when it actually moved toward the
       target and the new threshold still asks for that move (not one the task starts out meeting) */
    var fixes = !rawTasks ? [] : short.filter(function (n) { return TUNABLE.test(n.var) && n.moved; }).map(function (n) {
      var to = n.up ? Math.floor(n.best / 5) * 5 : Math.ceil(n.best / 5) * 5;
      if (n.up ? to <= n.from : to >= n.from) to = n.best;
      if (n.up ? to <= n.from : to >= n.from) return null;
      return { label: '门槛改成 ' + n.op + ' ' + to, desc: '扫参里「' + say(n) + '」最好只到 ' + n.best + '，把门槛从 ' + n.value + ' 改成 ' + to + '（再跑一次测试确认难度合适）。会修改 ' + n.path + '.value',
        patch: [{ path: n.path + '.value', value: to }] };
    }).filter(Boolean);
    return { text: text, fixes: fixes, nearest: nearest };
  }

  /* replays one game of the sweep (deterministic for its seed) with everything kept */
  async function trace(level, res, entryId, diff, seed) {
    var entry = res.entries.filter(function (e) { return e.id === entryId; })[0];
    var game = await play(level, entry, diff, seed);
    var st = game.state;
    return { history: st.history, log: st.log, result: st.result, endTitle: st.endTitle, final: st.final };
  }

  WW.LevelCheck = { DEPTHS: DEPTHS, INTENTS: INTENTS, run: run, analyze: analyze, trace: trace, rate: rate };
})(window.WW);
