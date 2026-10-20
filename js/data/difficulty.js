/*
 * Difficulty presets (难度). Levels may override fields per preset via level.difficulty.overrides
 * or hide presets via level.difficulty.allowed.
 *  budgetMul    starting budget multiplier
 *  apDelta      action points per turn delta
 *  exposureMul  exposure gained from manipulation
 *  detectMul    chance multiplier for every "被扒/泄露/反噬" roll
 *  oppMul       opponent effect strength and resource income
 *  oppSmart     probability that an opponent picks its best move instead of a weighted random one
 *  patienceMul  client patience (satisfaction losses are divided by it)
 *  passWeight   weight of the "do nothing" option in opponent move selection
 *  savvy        how sharp netizens are; injected into AI prompts
 *  powerMul     multiplier on favourable impulses routed through game.shiftFactions (all-faction
 *               impulses: skills, events, refutes...); single-faction shifts are not scaled (default 1)
 *  cushion      share (0-1) of the harm a player's own action does that is absorbed (default 0)
 *  exposureRelief share of exposure that fades every turn, even while manipulating (default 0)
 *  unlimited    every skill is unlocked from the start, costs no action points and ignores
 *               cooldowns, use limits and prerequisites (budget still applies)
 */
(function (WW) {
  'use strict';

  WW.Data.difficulties = {
    intern: {
      id: 'intern', name: '看不见的大手', icon: '🫳', unlimited: true,
      desc: '你就是舆论场背后那只手，对局面的掌控力强到离谱：全部技能开局即用，不耗行动点、没有冷却和次数限制，只看预算够不够。',
      budgetMul: 2, apDelta: 1, exposureMul: 0.2, detectMul: 0.2, oppMul: 0.6, oppSmart: 0, patienceMul: 1.4,
      powerMul: 2.5, cushion: 0.7, exposureRelief: 0.3,
      passWeight: 3, initialShift: { sentiment: 8, heat: -5 },
      savvy: '网友比较好糊弄，容易被带节奏，很少深究细节。'
    },
    regular: {
      id: 'regular', name: '正式工', icon: '💼', desc: '标准体验。',
      budgetMul: 1, apDelta: 0, exposureMul: 1, detectMul: 1, oppMul: 1, oppSmart: 0.3, patienceMul: 1,
      passWeight: 1.5, initialShift: {},
      savvy: '网友正常水平，会质疑明显的套话。'
    },
    gold: {
      id: 'gold', name: '金牌公关', icon: '🏅', desc: '预算更紧、网友爱较真、对手更凶。',
      budgetMul: 0.85, apDelta: 0, exposureMul: 1.25, detectMul: 1.3, oppMul: 1.3, oppSmart: 0.6, patienceMul: 0.8,
      passWeight: 0.8, initialShift: { sentiment: -3 },
      savvy: '网友爱较真，会对照时间线、翻旧帖、抓措辞漏洞。'
    }
  };

  WW.Data.difficultyOrder = ['intern', 'regular', 'gold'];

  /* Removed presets map to their closest survivor so old saves still load. */
  var RETIRED = { hell: 'gold' };
  WW.Data.difficultyId = function (id) {
    return WW.Data.difficulties[id] ? id : RETIRED[id] || 'regular';
  };
})(window.WW);
