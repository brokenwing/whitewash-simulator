/*
 * shill.generate: one situation x three tiers x good / bad direction.
 * monotone: within a group, awkwardness should fall zombie > normal > premium, and a direction that
 * contradicts already-proven facts ("bad") should be less persuasive than a sensible one ("good").
 */
'use strict';

const TIER = { zombie: '僵尸号', normal: '普通水军', premium: '精品养号' };
const SAMPLES = { 100: 4, 300: 5, 1000: 6 };

const S = (level, tier, dir, direction, setup, ref) => ({
  id: level + '.shill.' + tier + '_' + dir, task: 'shill.generate', level, ref: !!ref, setup,
  group: level + '.shill', tier, dir,
  args: { tier, tierName: TIER[tier], count: 300, direction, platform: '', samples: SAMPLES[300] }
});

const MILK_GOOD = '就事论事：个别门店出问题就该重罚，但别把所有门店一棍子打死，等排查结果';
const MILK_BAD = '甜心茶事从来没用过过期原料，那些图全是P的，都是对家水军！';
const MILK_SETUP = { turn: 4, reveal: ['f1'] };

const CAR_GOOD = '先别急着下结论，等第三方鉴定结果出来再说，数据会说话';
const CAR_BAD = '智驾系统根本没问题，就是车主自己不会开，想讹钱';
const CAR_SETUP = { turn: 6, reveal: ['f1', 'f2'] };

module.exports = [
  S('milktea', 'zombie', 'good', MILK_GOOD, MILK_SETUP, true),
  S('milktea', 'normal', 'good', MILK_GOOD, MILK_SETUP),
  S('milktea', 'premium', 'good', MILK_GOOD, MILK_SETUP, true),
  S('milktea', 'premium', 'bad', MILK_BAD, MILK_SETUP, true),
  S('autobrake', 'zombie', 'good', CAR_GOOD, CAR_SETUP),
  S('autobrake', 'normal', 'good', CAR_GOOD, CAR_SETUP),
  S('autobrake', 'premium', 'good', CAR_GOOD, CAR_SETUP),
  S('autobrake', 'premium', 'bad', CAR_BAD, CAR_SETUP)
];
