/*
 * 自动调优: patches a level until its objectives can be done, using only the fixes the checks already
 * offer (no model). No DOM; the 通关测试 dialog and `node tests/run.js --tune` both use it.
 *
 *   WW.LevelTune.run(raw, { minWin, minTask, maxRounds, genomeSeed, shouldStop }, onProgress)
 *     -> { level, changes, rounds, met, left, before, after, stopped }
 *
 * Done means: on the main difficulty the best play style wins >= minWin, and every required task is
 * reached and finished in >= minTask of the games it shows up in. Each round, every stuck task (a
 * required task under minTask, or a side task never finished) gets its next fix, lightest first: the
 * static check's levers (Feasibility: a dedicated skill, a sensitive channel, a template; expose,
 * legal), and only when none is left, a looser threshold (the value about minTask x 1.5 of the games
 * reached). A quick sweep on the main difficulty, always on the same sample, then says per task
 * whether the fix helped; the ones that did not are undone and the next one is tried next round.
 * Tasks on the same faction / opponent take turns, so an effect is not credited to the wrong fix.
 * The input level is never touched; the caller decides whether to adopt the result.
 */
(function (WW) {
  'use strict';

  var U = WW.U;

  var DEFAULTS = { minWin: 0.3, minTask: 0.1, maxRounds: 10, genomeSeed: 7, intent: 'any' };
  /* lever fixes, most effective first (on moon_hoax: a dedicated skill 20/217, a sensitive channel 3/217) */
  var PREFER = [/专属技能/, /反向扒皮/, /特别敏感/, /律师函/, /性格/];
  var THRESHOLD_TRIES = 3;

  function rankOf(label) {
    for (var i = 0; i < PREFER.length; i++) if (PREFER[i].test(label)) return i;
    return PREFER.length;
  }

  function mainOf(diffs) { return diffs.indexOf('regular') >= 0 ? 'regular' : diffs[0]; }

  async function sweep(level, o, depth, diffs, onGame) {
    var res = await WW.LevelCheck.run(level, { depth: depth, diffs: diffs, genomeSeed: o.genomeSeed, shouldStop: o.shouldStop }, onGame);
    return { res: res, a: WW.LevelCheck.analyze(level, res, o.intent), games: gamesOf(res, mainOf(res.diffs)) };
  }

  function gamesOf(res, d) {
    var out = [];
    res.entries.forEach(function (e) { (e.games[d] || []).forEach(function (x) { out.push(x); }); });
    return out;
  }

  /* per task on the main difficulty: reached / done / rate and how far the closest game stayed */
  function snapOf(s) {
    var main = s.a.main, m = s.a.byDiff[main];
    var tasks = {};
    s.a.tasks.forEach(function (t) {
      var x = t.byDiff[main] || { reached: 0, done: 0, games: 0 };
      var gap = 0;
      (t.nearest || []).forEach(function (n) {
        if (n.best === undefined) return;
        var miss = n.up ? n.value - n.best : n.best - n.value;
        if (miss > 0) gap += miss;
      });
      tasks[t.id] = { id: t.id, title: t.title, path: t.path, def: t.def, side: t.side, required: t.required, stage: t.stage,
        reached: x.reached, done: x.done, rate: x.reached ? x.done / x.reached : 0, gap: gap };
    });
    return { main: main, best: m && m.best ? m.best.rate : 0, tasks: tasks };
  }

  function met(snap, o) {
    if (snap.best < o.minWin) return false;
    return Object.keys(snap.tasks).every(function (id) {
      var t = snap.tasks[id];
      return t.side || !t.required || (t.reached > 0 && t.rate >= o.minTask);
    });
  }

  function stuckOf(snap, o) {
    var list = Object.keys(snap.tasks).map(function (id) { return snap.tasks[id]; }).filter(function (t) {
      if (!t.reached) return false;
      if (t.side) return t.done === 0;
      return t.required && t.rate < o.minTask;
    });
    /* required tasks first, in stage order: the later stages only show up once these are fixed */
    return list.sort(function (a, b) { return (a.side ? 1 : 0) - (b.side ? 1 : 0) || (a.stage || 0) - (b.stage || 0); });
  }

  /* the faction / opponent a task's condition is about: tasks on the same one take turns */
  function groupOf(t) {
    var g = null;
    (function walk(c) {
      if (!c || g) return;
      if (typeof c.var === 'string') {
        var p = c.var.split('.');
        if ((p[0] === 'faction' || p[0] === 'opp') && p[1]) g = p[0] + '.' + p[1];
        return;
      }
      (c.all || c.any || []).forEach(walk);
      if (c.not) walk(c.not);
    })(t.def && t.def.complete);
    return g || 'task:' + t.id;
  }

  /* the static check's fixes on this task (warnings under its path), most effective first */
  function leverFixes(level, t) {
    var out = [];
    WW.Schema.validate(level).warnings.forEach(function (w) {
      if (w.fixes && w.path.indexOf(t.path + '.') === 0) w.fixes.forEach(function (f) { out.push(f); });
    });
    return out.sort(function (a, b) { return rankOf(a.label) - rankOf(b.label); });
  }

  /* A looser threshold for each comparison too few games met: the value about minTask x 1.5 of the
     games where the task was live reached (finished games count as meeting it), rounded toward the
     easy side. Never one the task starts out meeting, and never for a value no game moved. */
  function thresholdFix(t, games, o, lv) {
    var leaves = WW.LevelCheck.leavesOf(t.def && t.def.complete, t.path + '.complete');
    var live = games.filter(function (x) { return x.tasks[t.id] && ['locked', 'hidden'].indexOf(x.tasks[t.id]) < 0; });
    if (!leaves.length || live.length < 5) return null;
    var want = Math.min(1, o.minTask * 1.5);
    var patch = [], parts = [];
    leaves.forEach(function (l, i) {
      if (!WW.LevelCheck.TUNABLE.test(l.leaf.var)) return;
      var up = l.leaf.op === '>' || l.leaf.op === '>=', value = Number(l.leaf.value);
      var vals = [], froms = [], moved = false;
      live.forEach(function (x) {
        if (x.tasks[t.id] === 'done') { vals.push(up ? Infinity : -Infinity); return; }
        var p = x.near && x.near[t.id] ? x.near[t.id][i] : null;
        if (!p) return;
        vals.push(p[0]);
        froms.push(p[1]);
        if (up ? p[0] - p[1] >= 1 : p[1] - p[0] >= 1) moved = true;
      });
      if (!moved || !froms.length) return;
      var hit = function (v) { return up ? (l.leaf.op === '>' ? v > value : v >= value) : (l.leaf.op === '<' ? v < value : v <= value); };
      if (vals.filter(hit).length / live.length >= want) return;
      vals.sort(function (a, b) { return up ? b - a : a - b; });
      var at = vals[Math.min(vals.length - 1, Math.max(0, Math.ceil(want * live.length) - 1))];
      var step = Math.abs(value) >= 20 ? 5 : 1;
      var to = up ? Math.floor(at / step) * step : Math.ceil(at / step) * step;
      /* still asks for progress from where the task starts */
      var start = up ? Math.max.apply(null, froms) : Math.min.apply(null, froms);
      if (up ? to <= start : to >= start) to = up ? Math.floor(start) + 1 : Math.ceil(start) - 1;
      if (up ? to >= value : to <= value) return;
      patch.push({ path: l.path + '.value', value: to });
      parts.push(WW.Cond.describe({ var: l.leaf.var, op: l.leaf.op, value: value }, lv) + ' 改成 ' + l.leaf.op + ' ' + to);
    });
    if (!patch.length) return null;
    return { label: '放宽门槛：' + parts.join('，'), desc: '扫参里约 ' + Math.round(want * 100) + '% 的局能达到新门槛。会修改 ' + patch.map(function (p) { return p.path; }).join('、'), patch: patch };
  }

  /* did this task get closer: finished more often, or (still never) the closest game came nearer */
  function better(before, after) {
    if (!before || !after || !after.reached) return false;
    if (after.rate > before.rate + 0.001) return true;
    return before.done === 0 && after.done === 0 && after.gap < before.gap - 0.5;
  }

  function pctText(t) { return t ? (t.reached ? Math.round(t.rate * 100) + '%（' + t.done + '/' + t.reached + '）' : '未出现') : '—'; }

  /* the round's level with only the kept fixes: lever fixes are rebuilt on the state they land on
     (their patches replace whole lists like items.custom), threshold patches are plain values */
  function replay(base, kept) {
    var level = U.deepClone(base);
    return { level: level, kept: kept.filter(function (x) {
      var fix = x.kind === 'threshold' ? x.fix : leverFixes(level, x.task).filter(function (f) { return f.label === x.fix.label; })[0];
      if (!fix) return false;
      WW.Feasibility.applyFix(level, fix);
      return true;
    }) };
  }

  /* what a sweep says, small enough to show before / after */
  function brief(s) {
    var byDiff = {};
    s.res.diffs.forEach(function (d) { var b = s.a.byDiff[d]; byDiff[d] = b && b.best ? b.best.rate : 0; });
    return { games: s.res.games, diffs: s.res.diffs, main: s.a.main, best: byDiff,
      tasks: s.a.tasks.map(function (t) { return { id: t.id, title: t.title, side: t.side, required: t.required, byDiff: t.byDiff }; }),
      verdicts: s.a.verdicts.map(function (v) { return { level: v.level, title: v.title }; }) };
  }

  async function run(raw, opts, onProgress) {
    var o = Object.assign({}, DEFAULTS, opts || {});
    var say = function (ev) { if (onProgress) onProgress(ev); };
    var level = U.deepClone(raw);
    var out = { level: level, changes: [], rounds: [], met: false, left: [], before: null, after: null, stopped: false, options: o };
    var errors = WW.Schema.validate(level).errors;
    if (errors.length) { out.left.push({ title: '关卡还有 ' + errors.length + ' 个错误', why: '先修复错误才能测试。' }); return out; }
    var lv = WW.Schema.normalize(level);
    var diffs = WW.LevelCheck.DIFF_ORDER.filter(function (d) { return lv.difficulty.allowed.indexOf(d) >= 0; });
    var main = mainOf(diffs);
    var stopped = function () { return !!(o.shouldStop && o.shouldStop()); };
    var progress = function (phase, round) { return function (p) { say({ type: 'games', phase: phase, round: round, done: p.done, total: p.total }); }; };

    var cur = await sweep(level, o, 'quick', [main], progress('start', 0));
    var snap = snapOf(cur);
    var tried = {};
    for (var round = 1; ; round++) {
      if (stopped()) { out.stopped = true; break; }
      var wasMet = met(snap, o);
      var stuck = stuckOf(snap, o);
      /* once done, only side tasks are left to try */
      if (wasMet && !stuck.length) break;
      if (round > o.maxRounds) break;
      var base = U.deepClone(level), cand = U.deepClone(level), busy = {}, applied = [];
      stuck.forEach(function (t) {
        var g = groupOf(t);
        if (busy[g]) return;
        var tr = tried[t.id] = tried[t.id] || { labels: {}, thresholds: 0, n: 0 };
        var fix = leverFixes(cand, t).filter(function (f) { return !tr.labels[f.label]; })[0], kind = 'lever';
        if (!fix && tr.thresholds < THRESHOLD_TRIES) { fix = thresholdFix(t, cur.games, o, lv); kind = 'threshold'; }
        if (!fix) return;
        var keep = U.deepClone(cand);
        WW.Feasibility.applyFix(cand, fix);
        if (WW.Schema.validate(cand).errors.length) { cand = keep; tr.labels[fix.label] = true; return; }
        if (kind === 'lever') tr.labels[fix.label] = true; else tr.thresholds++;
        tr.n++;
        busy[g] = true;
        applied.push({ task: t, fix: fix, kind: kind });
      });
      if (!applied.length) break;
      say({ type: 'try', round: round, tries: applied.map(function (x) { return { task: x.task.title, label: x.fix.label, kind: x.kind }; }) });
      var next = await sweep(cand, o, 'quick', [main], progress('round', round));
      if (next.res.stopped) { out.stopped = true; break; }
      var ns = snapOf(next);
      var kept = applied.filter(function (x) { return better(snap.tasks[x.task.id], ns.tasks[x.task.id]); });
      /* a side task's fix never costs a level that was already done */
      if (wasMet && !met(ns, o)) kept = [];
      var row = { round: round, best: ns.best, tries: applied.map(function (x) {
        return { task: x.task.title, label: x.fix.label, kind: x.kind, kept: kept.indexOf(x) >= 0, from: pctText(snap.tasks[x.task.id]), to: pctText(ns.tasks[x.task.id]) };
      }) };
      if (kept.length === applied.length) { level = cand; cur = next; snap = ns; }
      else if (kept.length) {
        var r = replay(base, kept);
        level = r.level;
        kept = r.kept;
        cur = await sweep(level, o, 'quick', [main], progress('round', round));
        snap = snapOf(cur);
      }
      kept.forEach(function (x) {
        out.changes.push({ round: round, task: x.task.title, path: x.task.path, kind: x.kind, label: x.fix.label, desc: x.fix.desc,
          from: row.tries[applied.indexOf(x)].from, to: row.tries[applied.indexOf(x)].to });
      });
      row.best = snap.best;
      out.rounds.push(row);
      say({ type: 'round', row: row });
    }

    out.level = level;
    out.end = snap;
    out.met = met(snap, o);
    stuckOf(snap, o).forEach(function (t) {
      var v = cur.a.verdicts.filter(function (x) { return x.path === t.path; })[0];
      out.left.push({ title: (t.side ? '支线' : '必做') + '「' + t.title + '」完成率 ' + pctText(t), path: t.path,
        why: (v && v.detail ? v.detail + ' ' : '') + (tried[t.id] && tried[t.id].n ? '能自动做的修复都试过了' : '没有能自动做的修复') + '，需要手动调整。' });
    });
    if (snap.best < o.minWin && !stuckOf(snap, o).some(function (t) { return !t.side; }) && !out.stopped) {
      var ends = cur.a.byDiff[main] ? cur.a.byDiff[main].ends : {};
      var top = Object.keys(ends).sort(function (a, b) { return ends[b] - ends[a]; })[0];
      out.left.push({ title: '最好的打法胜率只有 ' + Math.round(snap.best * 100) + '%', path: 'objectives',
        why: '任务都有人完成，输在别处' + (top ? '：失败局多是「' + top + '」' : '') + '。失败条件或结案门槛需要手动调整。' });
    }

    /* before / after on the full standard sweep, every difficulty */
    if (out.changes.length && !out.stopped) {
      say({ type: 'final' });
      var before = await sweep(raw, o, 'standard', diffs, progress('before', 0));
      var after = await sweep(level, o, 'standard', diffs, progress('after', 0));
      out.before = brief(before);
      out.after = brief(after);
    }
    return out;
  }

  WW.LevelTune = { DEFAULTS: DEFAULTS, run: run };
})(window.WW);
