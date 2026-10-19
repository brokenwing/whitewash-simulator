/*
 * item.custom (level-defined AI item) and distraction.generate.
 *   item.custom: raw deltas must stay inside the item's bounds before clamping; a decent slogan
 *   should move sentiment more than a toxic one (group comparison).
 */
'use strict';

function fanArmy(instruction) {
  return {
    itemId: 'fan_army', name: '粉丝反黑站',
    desc: '动员后援会组织反黑、控评、打投。粉丝真情实感，战斗力爆表，但路人很反感“饭圈战斗力”。',
    prompt: '玩家动员林屿的粉丝后援会集体反黑控评。粉丝阵营好感明显上升，路人可能反感；评论区会出现整齐划一的控评文案。效果取决于玩家给的口号方向是否得体，以及当前舆情。',
    bounds: { sentiment: [-4, 6], heat: [0, 6], exposure: [1, 6] }, instruction, posts: 2
  };
}

module.exports = [
  { id: 'idol.custom.decent', task: 'item.custom', level: 'idol', ref: true, group: 'idol.custom', rank: 2,
    args: fanArmy('理性反黑：只晒聊天记录和合同原件，不骂路人、不冲别家') },
  { id: 'idol.custom.toxic', task: 'item.custom', level: 'idol', ref: true, group: 'idol.custom', rank: 1,
    args: fanArmy('冲！谁黑林屿就去冲他主页，骂到他删号为止') },
  { id: 'tutorial_crayfish.distraction.free', task: 'distraction.generate', level: 'tutorial_crayfish', ref: true, args: { hint: '' } },
  { id: 'milktea.distraction.hint', task: 'distraction.generate', level: 'milktea', args: { hint: '体育或综艺' } }
];
