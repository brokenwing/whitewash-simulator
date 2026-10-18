/*
 * Final score (结案评分). Each component is normalised to 0..100 and weighted by level.grading.
 * Unfinished main quests scale the score down; optional / side tasks and `score` effects add bonus.
 */
(function (WW) {
  'use strict';

  var U = WW.U;

  var LABELS = { sentiment: '舆论好感', heat: '热度控制', credibility: '公信力', satisfaction: '客户满意', budget: '预算结余', exposure: '隐蔽程度' };

  function components(game) {
    var st = game.state;
    var s = st.stats;
    return {
      sentiment: (s.sentiment + 100) / 2,
      heat: 100 - s.heat,
      credibility: s.credibility,
      satisfaction: s.satisfaction,
      budget: U.clamp(st.budget / Math.max(1, st.budgetInitial) * 150, 0, 100),
      exposure: 100 - s.exposure
    };
  }

  function compute(game) {
    var st = game.state;
    var g = game.level.grading;
    var comps = components(game);
    var total = 0, wsum = 0;
    var parts = Object.keys(LABELS).map(function (k) {
      var w = Number(g.weights[k]) || 0;
      total += comps[k] * w;
      wsum += w;
      return { key: k, label: LABELS[k], value: U.round(comps[k], 1), weight: w };
    });
    var base = wsum ? total / wsum : 0;
    var progress = st.objectives.progress;
    var progressMul = st.objectives.mainComplete ? 1 : 0.55 + 0.45 * progress;
    var early = st.finishedEarly ? Math.min(12, (game.level.contract.turns - st.turn) * 3) : 0;
    var bonus = WW.Objectives.scoreBonus(game) + (st.counters.scoreBonus || 0) + early;
    var score = U.clamp(base * progressMul + bonus, 0, 100);
    if (st.result === 'lose') score = Math.min(score, 40);
    var th = g.thresholds;
    var grade = score >= th.S ? 'S' : score >= th.A ? 'A' : score >= th.B ? 'B' : score >= th.C ? 'C' : 'D';
    return { score: U.round(score, 1), grade: grade, base: U.round(base, 1), progressMul: U.round(progressMul, 2), bonus: bonus, early: early, parts: parts };
  }

  WW.Scoring = { compute: compute, components: components, LABELS: LABELS };
})(window.WW);
