/*
 * Turn-start events (晨报): evidence reveals, broken promises, scripted level events, opponent
 * entries and signature events, and at most one random event per turn.
 */
(function (WW) {
  'use strict';

  function scripted(game, lines) {
    var st = game.state;
    game.level.events.forEach(function (e) {
      if (e.once && st.firedEvents[e.id]) return;
      if (!WW.Cond.evaluate(e.trigger, game)) return;
      if (!game.rng.chance(e.chance)) return;
      st.firedEvents[e.id] = st.turn;
      WW.Effects.apply(game, e.effects, { id: e.id, title: e.title });
      var text = e.title + (e.text ? '：' + WW.U.tpl(e.text, game.textVars()) : '');
      game.log('event', text);
      lines.push({ kind: 'event', text: text });
    });
  }

  function random(game, lines) {
    var st = game.state;
    if (!game.rng.chance(game.level.tuning.randomEventChance)) return;
    var pool = game.level.randomEvents.filter(function (e) {
      if (e.once && st.firedEvents[e.id]) return false;
      return WW.Cond.evaluate(e.condition, game);
    });
    var e = game.rng.weighted(pool, function (x) { return x.weight; });
    if (!e) return;
    st.firedEvents[e.id] = st.turn;
    WW.Effects.apply(game, e.effects, { id: e.id, title: e.title });
    game.log('event', '随机事件：' + e.title);
    lines.push({ kind: 'random', text: '随机事件：' + e.title });
  }

  function turnStart(game, lines) {
    WW.Truth.checkEvidence(game, lines);
    WW.Truth.checkPromises(game, lines);
    if (game.state.finished) return;
    scripted(game, lines);
    WW.Opponents.checkEntries(game, lines);
    WW.Opponents.signatureEvents(game, lines);
    random(game, lines);
  }

  WW.Events = { turnStart: turnStart, scripted: scripted, random: random };
})(window.WW);
