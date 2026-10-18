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
 */
(function (WW) {
  'use strict';

  WW.Data.difficulties = {
    intern: {
      id: 'intern', name: '实习生', icon: '🐣', desc: '预算宽裕，网友好糊弄，对手也不太上心。适合熟悉玩法。',
      budgetMul: 1.3, apDelta: 1, exposureMul: 0.7, detectMul: 0.6, oppMul: 0.6, oppSmart: 0, patienceMul: 1.4,
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
    },
    hell: {
      id: 'hell', name: '地狱', icon: '🔥', desc: '人均福尔摩斯，对手招招致命，客户耐心极差。',
      budgetMul: 0.75, apDelta: 0, exposureMul: 1.4, detectMul: 1.5, oppMul: 1.5, oppSmart: 1, patienceMul: 0.7,
      passWeight: 0.3, initialShift: { sentiment: -6, heat: 5 },
      savvy: '人均福尔摩斯：任何破绽、措辞、时间差都会被扒出来并做成梗。'
    }
  };

  WW.Data.difficultyOrder = ['intern', 'regular', 'gold', 'hell'];
})(window.WW);
