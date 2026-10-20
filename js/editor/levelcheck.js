/*
 * 通关测试: sweep many offline play styles over a level and judge whether it is reasonable.
 * No DOM; the editor dialog and `node tests/run.js --check` both use it. Every game runs on the
 * offline rules (no aiRunner), so it never calls a model.
 *
 *   WW.LevelCheck.run(level, { diffs, depth, shouldStop }, onProgress) -> results
 *   WW.LevelCheck.analyze(level, results, intent) -> { verdicts, byDiff, entries, tasks, endings }
 *   WW.LevelCheck.trace(level, results, entryId, diff, seed) -> { history, log, result, endTitle }
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var B = WW.Bots;

  /* policies: generated play styles; seeds: first-round games per style and difficulty;
     refine: games the leaders (top 10 per difficulty, best per stance) are topped up to */
  var DEPTHS = {
    quick: { label: '快速', policies: 30, seeds: 3, refine: 8 },
    standard: { label: '标准', policies: 80, seeds: 3, refine: 10 },
    deep: { label: '深入', policies: 160, seeds: 4, refine: 16 }
  };
  var BASELINES = ['idle', 'shill', 'honest', 'balanced', 'smart'];
  var INTENTS = { any: '认错、掩盖都可以', admit: '认错才能过', cover: '掩盖也能过' };
  var DIFF_ORDER = ['intern', 'regular', 'gold'];

  function vals(o) { return Object.keys(o).map(function (k) { return o[k]; }); }

  function entriesFor(level, depth) {
    var list = BASELINES.map(function (id) { return { id: id, kind: 'base', label: B.describe({ base: id }), genome: { base: id } }; });
    if (level.guide && level.guide.length) list.push({ id: 'guide', kind: 'base', label: B.describe({ base: 'guide' }), genome: { base: 'guide' } });
    B.genomes(DEPTHS[depth].policies, 7).forEach(function (g) { list.push({ id: g.id, kind: 'policy', label: B.describe(g), genome: g }); });
    list.forEach(function (e) { e.games = {}; });
    return list;
  }

  function play(level, entry, diff, seed) {
    var g = entry.genome;
    if (g.base === 'guide') return B.playGuide(level, seed, diff);
    return B.playBot(level, g.base ? g.base : B.policy(g), seed, diff);
  }

  /* what one finished game says, kept small: thousands of these are held in memory */
  function summarize(game, seed) {
    var st = game.state;
    var tasks = {};
    vals(st.objectives.tasks).forEach(function (t) { tasks[t.id] = t.status; });
    return {
      seed: seed, win: st.result === 'win', score: st.final ? st.final.score : 0, grade: st.final ? st.final.grade : '',
      end: st.endTitle, turns: st.turn,
      route: vals(st.facts).some(function (f) { return f.admitted; }) || st.flags.rectified ? 'admit' : 'cover',
      tasks: tasks
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
    var entries = entriesFor(level, depth);
    var plan = entries.length * diffs.length * cfg.seeds;
    var estimate = plan + Math.min(12, entries.length) * diffs.length * (cfg.refine - cfg.seeds);
    var done = 0, stopped = false, last = Date.now(), started = Date.now();

    var one = async function (entry, diff, seed) {
      var game = await play(level, entry, diff, seed);
      (entry.games[diff] = entry.games[diff] || []).push(summarize(game, seed));
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
      /* round two: top up the leaders of each difficulty and the best of each stance */
      for (var k = 0; k < diffs.length && !stopped; k++) {
        var diff = diffs[k];
        var ranked = entries.slice().sort(function (a, b) { return rate(b.games[diff]) - rate(a.games[diff]); });
        var pick = ranked.slice(0, 10);
        ['admit', 'refute', 'deny'].forEach(function (stance) {
          var best = ranked.filter(function (e) { return e.genome.stance === stance; })[0];
          if (best && pick.indexOf(best) < 0) pick.push(best);
        });
        for (var j = 0; j < pick.length && !stopped; j++) {
          for (var seed = cfg.seeds + 1; seed <= cfg.refine && !stopped; seed++) await one(pick[j], diff, seed);
        }
      }
      if (onProgress) onProgress({ done: done, total: done, ms: Date.now() - started });
      return { level: level, depth: depth, diffs: diffs, entries: entries, games: done, ms: Date.now() - started, stopped: stopped };
    })();
  }

  /* ------------------------------------------------------------------ analysis */

  var DIFF_NAME = function (d) { return (WW.Data.difficulties[d] || {}).name || d; };

  function taskIndex(lv) {
    var out = {};
    lv.objectives.stages.forEach(function (s, i) {
      s.tasks.forEach(function (t, j) { out[t.id] = { id: t.id, title: t.title, side: false, stage: i, stageTitle: s.title, required: t.required, path: 'objectives.stages[' + i + '].tasks[' + j + ']' }; });
    });
    lv.objectives.side.forEach(function (t, i) { out[t.id] = { id: t.id, title: t.title, side: true, required: false, path: 'objectives.side[' + i + ']' }; });
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
    var V = function (lvl, title, detail, path) { verdicts.push({ level: lvl, title: title, detail: detail || '', path: path || '' }); };
    var pct = function (x) { return Math.round(x * 100) + '%'; };
    var byDiff = {};

    res.diffs.forEach(function (d) {
      var rows = res.entries.filter(function (e) { return e.games[d] && e.games[d].length; });
      var best = null, bestBlind = null, routeBest = { admit: null, cover: null }, wins = [];
      rows.forEach(function (e) {
        var r = rate(e.games[d]);
        var row = { entry: e, rate: r, n: e.games[d].length };
        if (!best || r > best.rate) best = row;
        var blind = e.kind === 'policy' ? e.genome.intel !== 'oracle' : e.id !== 'smart';
        if (blind && (!bestBlind || r > bestBlind.rate)) bestBlind = row;
        /* an entry's route is what its games actually did: admitted / rectified, or never */
        var admits = e.games[d].filter(function (x) { return x.route === 'admit'; }).length;
        var route = admits * 2 >= e.games[d].length ? 'admit' : 'cover';
        if (!routeBest[route] || r > routeBest[route].rate) routeBest[route] = row;
        e.games[d].forEach(function (x) { if (x.win) wins.push(x.turns); });
      });
      var ends = {};
      rows.forEach(function (e) { e.games[d].forEach(function (x) { if (!x.win) ends[x.end] = (ends[x.end] || 0) + 1; }); });
      byDiff[d] = {
        best: best, bestBlind: bestBlind, admitBest: routeBest.admit, coverBest: routeBest.cover,
        median: median(rows.filter(function (e) { return e.kind === 'policy'; }).map(function (e) { return rate(e.games[d]); })),
        share: rows.length ? rows.filter(function (e) { return rate(e.games[d]) >= 0.5; }).length / rows.length : 0,
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
      var dirty = res.entries.filter(function (e) { return e.kind === 'policy' && e.genome.shill === 'heavy' && e.genome.suppress === 'heavy' && e.genome.fix === 'never' && rate(e.games[main]) >= 0.3; })[0];
      if (dirty) V('yellow', '重压制 + 大量水军、不整改的打法能赢 ' + pct(rate(dirty.games[main])), '「' + dirty.label + '」', 'tuning');

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
    tasks.forEach(function (t) {
      var x = t.byDiff[main];
      if (!x || !x.games) return;
      var where = DIFF_NAME(main) + '档';
      if (!t.side && t.required && x.reached && !x.done) V('red', '必做子任务「' + t.title + '」在' + where + '从来没有完成', '出现了 ' + x.reached + ' 局，一局都没完成，后面的阶段因此都打不开。', t.path);
      else if (t.side && !x.reached) V('yellow', '支线「' + t.title + '」在' + where + '从来没有发放', '检查 offer 条件。', t.path);
      else if (t.side && !x.done) V('yellow', '支线「' + t.title + '」在' + where + '从来没有完成', '发放了 ' + x.reached + ' 局。', t.path);
    });

    /* static checks that make part of the level never work (see Schema.validate) */
    WW.Schema.validate(level).warnings.filter(function (w) { return w.blocking; }).forEach(function (w) { V('yellow', '静态检查：' + w.msg, '', w.path); });

    if (!verdicts.some(function (v) { return v.level === 'red' || v.level === 'yellow'; })) V('green', '没有发现明显问题', '能通关、不至于太容易，任务都有人完成。');
    var rank = { red: 0, yellow: 1, info: 2, green: 3 };
    verdicts.sort(function (a, b) { return rank[a.level] - rank[b.level]; });
    return { verdicts: verdicts, byDiff: byDiff, main: main, entries: res.entries, tasks: tasks, intent: intent };
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
