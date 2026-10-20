/*
 * Main quest & sub-tasks (主任务 / 子任务).
 * Stages run in order; a stage completes when all of its required tasks are done, then its rewards
 * fire and the next stage activates. Optional tasks pay extra rewards. Side tasks live outside the
 * stage chain and may be offered at start, by condition, or by an `offerTask` effect.
 * Task fields: complete, fail, deadline (must finish by end of that turn), at:'end' (judged at the
 * end of the level), hidden (revealed when done), rewards, penalty.
 */
(function (WW) {
  'use strict';

  function init(game) {
    var lv = game.level;
    var ob = { stageIndex: 0, progress: 0, mainComplete: false, stages: [], tasks: {}, sideOrder: [] };
    lv.objectives.stages.forEach(function (s, i) {
      ob.stages.push({ id: s.id, status: i === 0 ? 'active' : 'locked' });
      s.tasks.forEach(function (t) {
        ob.tasks[t.id] = { id: t.id, stageId: s.id, side: false, status: i === 0 ? 'active' : 'locked', since: i === 0 ? 1 : 0 };
      });
    });
    lv.objectives.side.forEach(function (t) {
      ob.sideOrder.push(t.id);
      var status = 'hidden';
      if (t.offer === 'start') status = t.choice ? 'offered' : 'active';
      ob.tasks[t.id] = { id: t.id, stageId: null, side: true, status: status, since: status === 'active' ? 1 : 0 };
    });
    game.state.objectives = ob;
    updateProgress(game);
  }

  function def(game, id) {
    var lv = game.level;
    for (var i = 0; i < lv.objectives.stages.length; i++) {
      var hit = lv.objectives.stages[i].tasks.filter(function (t) { return t.id === id; })[0];
      if (hit) return hit;
    }
    return lv.objectives.side.filter(function (t) { return t.id === id; })[0] || null;
  }

  function updateProgress(game) {
    var ob = game.state.objectives;
    var total = 0, done = 0;
    game.level.objectives.stages.forEach(function (s) {
      s.tasks.forEach(function (t) {
        if (!t.required) return;
        total += 1;
        if (ob.tasks[t.id].status === 'done') done += 1;
      });
    });
    ob.progress = total ? done / total : 1;
  }

  function rewardText(game, list) {
    var s = WW.Effects.describeList(list, game.level, { skipFlavor: true });
    return s ? '（' + s + '）' : '';
  }

  function complete(game, t, st, lines) {
    st.status = 'done';
    st.doneTurn = game.state.turn;
    WW.Effects.apply(game, t.rewards, { id: t.id, title: t.title });
    var text = (st.side ? '支线完成：' : t.required ? '子任务完成：' : '额外子任务完成：') + t.title + rewardText(game, t.rewards);
    game.log('task', text);
    if (lines) lines.push({ kind: 'task', text: text });
    game.emit('task', { id: t.id, status: 'done', text: text });
  }

  function failTask(game, t, st, lines) {
    st.status = 'failed';
    WW.Effects.apply(game, t.penalty, { id: t.id, title: t.title });
    var text = '子任务失败：' + t.title + (t.penalty.length ? rewardText(game, t.penalty) : '');
    game.log('task', text);
    if (lines) lines.push({ kind: 'task', text: text });
    game.emit('task', { id: t.id, status: 'failed', text: text });
  }

  /* phase: 'action' | 'turn' | 'end' */
  function checkTask(game, t, phase, lines) {
    var gst = game.state;
    var st = gst.objectives.tasks[t.id];
    if (!st || st.status !== 'active') return;
    if (t.fail && WW.Cond.evaluate(t.fail, game) && !(t.required && !st.side)) { failTask(game, t, st, lines); return; }
    if (t.at === 'end') {
      if (phase === 'end') {
        if (WW.Cond.evaluate(t.complete, game)) complete(game, t, st, lines);
        else failTask(game, t, st, lines);
      }
      return;
    }
    if (WW.Cond.evaluate(t.complete, game)) { complete(game, t, st, lines); return; }
    if (t.deadline && (phase === 'turn' ? gst.turn > t.deadline : phase === 'end' && gst.turn >= t.deadline)) {
      if (!t.required || st.side) failTask(game, t, st, lines);
    }
  }

  function check(game, phase, lines) {
    var gst = game.state;
    if (gst.finished && phase !== 'end') return;
    var ob = gst.objectives;
    var lv = game.level;
    var guard = 0;
    while (ob.stageIndex < lv.objectives.stages.length && guard++ < 20) {
      var stage = lv.objectives.stages[ob.stageIndex];
      stage.tasks.forEach(function (t) { checkTask(game, t, phase, lines); });
      var allDone = stage.tasks.every(function (t) { return !t.required || ob.tasks[t.id].status === 'done'; });
      if (!allDone) break;
      ob.stages[ob.stageIndex].status = 'done';
      WW.Effects.apply(game, stage.rewards, { id: stage.id, title: stage.title });
      var text = '主任务阶段完成：「' + stage.title + '」' + rewardText(game, stage.rewards);
      game.log('task', text);
      if (lines) lines.push({ kind: 'stage', text: text });
      game.emit('task', { id: stage.id, status: 'stage', text: text });
      stage.tasks.forEach(function (t) {
        var s = ob.tasks[t.id];
        if (s.status === 'active' && !t.required && t.at !== 'end') s.status = 'expired';
      });
      ob.stageIndex += 1;
      if (ob.stageIndex < lv.objectives.stages.length) {
        ob.stages[ob.stageIndex].status = 'active';
        lv.objectives.stages[ob.stageIndex].tasks.forEach(function (t) {
          ob.tasks[t.id].status = 'active';
          ob.tasks[t.id].since = gst.turn;
        });
      }
    }
    if (ob.stageIndex >= lv.objectives.stages.length && !ob.mainComplete) {
      ob.mainComplete = true;
      game.log('task', '主任务全部完成，可以随时结案。');
      game.emit('mainComplete', {});
    }
    lv.objectives.side.forEach(function (t) {
      var s = ob.tasks[t.id];
      if (s.status === 'hidden' && t.offer !== 'start' && WW.Cond.evaluate(t.offer, game)) offer(game, t.id, lines);
      checkTask(game, t, phase, lines);
    });
    if (phase === 'end') {
      lv.objectives.stages.forEach(function (stg) {
        stg.tasks.forEach(function (t) { if (t.at === 'end' && !t.required) checkTask(game, t, 'end', lines); });
      });
    }
    updateProgress(game);
  }

  function offer(game, id, lines) {
    var t = def(game, id);
    var s = game.state.objectives.tasks[id];
    if (!t || !s || (s.status !== 'hidden' && s.status !== 'locked')) return;
    s.status = t.choice ? 'offered' : 'active';
    s.since = game.state.turn;
    var who = t.from === 'client' ? 'client' : 'system';
    game.message(who, (t.choice ? '新的加单请求：' : '新支线：') + t.title + (t.desc ? '——' + t.desc : '') + rewardText(game, t.rewards), 'neutral');
    if (lines) lines.push({ kind: 'task', text: '新支线：' + t.title });
    game.emit('task', { id: id, status: s.status });
  }

  function respond(game, id, accept) {
    var s = game.state.objectives.tasks[id];
    if (!s || s.status !== 'offered') return false;
    s.status = accept ? 'active' : 'declined';
    s.since = game.state.turn;
    var t = def(game, id);
    game.log('task', (accept ? '接下支线：' : '婉拒支线：') + (t ? t.title : id));
    if (!accept && t && t.from === 'client') game.addStat('satisfaction', -2);
    check(game, 'action');
    return true;
  }

  function scoreBonus(game) {
    var bonus = 0;
    var ob = game.state.objectives;
    Object.keys(ob.tasks).forEach(function (id) {
      var s = ob.tasks[id];
      var t = def(game, id);
      if (!t) return;
      if (s.status === 'done' && (!t.required || s.side)) bonus += 3;
    });
    return bonus;
  }

  /* Tasks that are live on turn 1 (first-stage tasks, side tasks offered at start) whose `complete`
   * already holds on a fresh game: they finish immediately. Usually a "keep X all game" goal that
   * is missing at:'end'. Returns [{path, msg}] warnings. */
  function lintStart(level) {
    var game = new WW.Engine.Game(level, { seed: 1 });
    var lv = game.level;
    var out = [];
    var check = function (t, path) {
      if (t.at === 'end' || !t.complete) return;
      var hit = false;
      try { hit = WW.Cond.evaluate(t.complete, game); } catch (e) { WW.Log.info('engine', '开局检查时子任务「' + t.title + '」的完成条件无法求值：' + e.message); return; }
      if (hit) out.push({ path: path + '.complete', msg: '子任务「' + t.title + '」开局时就已满足完成条件，会立刻完成。“全程保持 / 零 X 通关”类目标请加 at:"end"，并用 fail 写违规条件' });
    };
    if (lv.objectives.stages[0]) lv.objectives.stages[0].tasks.forEach(function (t, j) { check(t, 'objectives.stages[0].tasks[' + j + ']'); });
    lv.objectives.side.forEach(function (t, i) { if (t.offer === 'start') check(t, 'objectives.side[' + i + ']'); });
    return out;
  }

  WW.Objectives = {
    init: init,
    lintStart: lintStart,
    def: def,
    check: check,
    offer: offer,
    respond: respond,
    updateProgress: updateProgress,
    scoreBonus: scoreBonus
  };
})(window.WW);
