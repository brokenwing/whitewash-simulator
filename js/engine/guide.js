/*
 * Tutorial guide (教程引导). level.guide is an ordered list of steps:
 *   { id, turn, until, title, text, target, when, done, skip, optional, notes[], action, at }
 * - turn / when: the step becomes available from that turn and while `when` holds.
 * - done: a condition; the step completes by itself once it holds. Steps without `done` are tips
 *   the player acknowledges ("下一步"); a tip without `when` expires after its turn (legacy format).
 * - skip: the step is dropped once this holds. optional: the player may skip it.
 * - notes: [{ when, text }] extra lines shown while their condition holds.
 * - at: 'result' steps are shown on the result screen instead of during play.
 * The current step is the first unfinished step that is available; progress lives in
 * state.guide so it survives save/resume.
 */
(function (WW) {
  'use strict';

  function store(game) {
    var st = game.state;
    if (!st.guide) st.guide = { marks: {}, current: null, hidden: false };
    return st.guide;
  }

  function playSteps(level) { return level.guide.filter(function (g) { return g.at !== 'result'; }); }

  function isTutorial(level) { return playSteps(level).some(function (g) { return !!g.done; }); }

  function available(game, g) {
    return game.state.turn >= g.turn && WW.Cond.evaluate(g.when, game);
  }

  /* Marks finished steps and picks the current one. Returns justDone: steps that were current and
   * completed by themselves since the last sync (for a "done" toast). */
  function sync(game) {
    var st = game.state;
    var gs = store(game);
    var steps = playSteps(game.level);
    var justDone = [];
    steps.forEach(function (g) {
      if (gs.marks[g.id]) return;
      if (g.skip && WW.Cond.evaluate(g.skip, game)) gs.marks[g.id] = 'skip';
      else if (g.until && st.turn > g.until) gs.marks[g.id] = 'expired';
      else if (g.done && WW.Cond.evaluate(g.done, game)) {
        gs.marks[g.id] = 'done';
        if (gs.current === g.id) justDone.push(g);
      }
    });
    var current = null;
    for (var i = 0; i < steps.length; i++) {
      if (!gs.marks[steps[i].id] && available(game, steps[i])) { current = steps[i]; break; }
    }
    gs.current = current ? current.id : null;
    var finished = steps.filter(function (g) { return gs.marks[g.id]; }).length;
    return {
      current: current,
      notes: current ? current.notes.filter(function (n) { return WW.Cond.evaluate(n.when, game); }).map(function (n) { return n.text; }) : [],
      index: current ? steps.indexOf(current) + 1 : finished,
      total: steps.length,
      finished: finished,
      waiting: !current && finished < steps.length,
      complete: finished >= steps.length,
      justDone: justDone,
      hidden: gs.hidden
    };
  }

  function mark(game, id, how) {
    store(game).marks[id] = how || 'ack';
  }

  function setHidden(game, hidden) { store(game).hidden = !!hidden; }

  /* Steps of this turn the briefing should mention: legacy tips in full, tutorial steps by title. */
  function forTurn(game) {
    var gs = store(game);
    return playSteps(game.level).filter(function (g) {
      return !gs.marks[g.id] && g.turn === game.state.turn && available(game, g);
    });
  }

  function resultNotes(game) {
    return game.level.guide.filter(function (g) { return g.at === 'result' && WW.Cond.evaluate(g.when, game); });
  }

  /* Post selectors used by targets and action presets:
   *   fact:<id>  hottest visible post spreading that claim
   *   negative   hottest visible negative post not yet controlled
   *   official   the client's hottest official post */
  function findPost(game, sel) {
    var parts = String(sel || '').split(':');
    var posts = WW.Feed.ranked(game.state, 'all').filter(function (p) { return p.status !== 'deleted'; });
    var hit = posts.filter(function (p) {
      if (parts[0] === 'fact') return !p.isClient && p.fact === parts[1];
      if (parts[0] === 'negative') return !p.isClient && p.stance < 0 && !p.controlled;
      if (parts[0] === 'official') return p.isClient;
      return false;
    })[0];
    return hit || null;
  }

  WW.Guide = {
    playSteps: playSteps,
    isTutorial: isTutorial,
    sync: sync,
    mark: mark,
    setHidden: setHidden,
    forTurn: forTurn,
    resultNotes: resultNotes,
    findPost: findPost
  };
})(window.WW);
