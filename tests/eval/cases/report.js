/*
 * report.judge (召唤铁拳 on a post with no linked fact): gold.violation per the level's hidden truth.
 * kind: rumor = contradicts the truth; truthful = true but harsh or emotional (must NOT be a violation,
 * otherwise the iron fist silences people telling the truth); privacy / insult = rule violations.
 */
'use strict';

const R = (level, key, kind, author, platform, content, violation, ref) => ({
  id: level + '.report.' + key, task: 'report.judge', level, ref: !!ref, kind,
  args: { target: 'post', author, platform, content }, gold: { violation }
});

module.exports = [
  R('milktea', 'rumor_nationwide', 'rumor', '内部人士爆料', '围脖', '内部消息：甜心茶事全国所有门店都在用过期原料，是总部统一下发的，一家都跑不了', true, true),
  R('milktea', 'true_harsh', 'truthful', '暴躁打工人', '围脖', '甜心茶事用过期奶浆还好意思说是P图，脸都不要了，这种黑心店赶紧倒闭吧', false, true),
  R('milktea', 'rumor_hospital', 'rumor', '表妹的表姐', '小红薯', '我表妹喝了甜心茶事住院三天，急性肠胃炎，医院诊断书都有', true, true),
  R('milktea', 'privacy', 'privacy', '人肉小能手', '铁吧', '甜心茶事那个王总住在锦华小区 3 栋 1201，电话 138 开头，大家上门去问问他', true),
  R('milktea', 'true_hidden', 'truthful', '离职店员', '围脖', '听说是总部默许门店改标签的，我们店群里有截图，店长说是上面让这么干的', false, true),
  R('milktea', 'insult', 'insult', '路过骂一句', '颤音', '那个店长就是个畜生，长得也恶心，全家都不是好东西', true),

  R('autobrake', 'true_defect', 'truthful', '匿名工程师', '知否', '极昼这个批次的智驾就是有误识别急刹的缺陷，内部测试早就发现了，只是没修', false, true),
  R('autobrake', 'rumor_tamper', 'rumor', '数码爆料王', '围脖', '极昼连夜篡改了车主的行车数据，删掉了刹车记录，实锤了', true, true),
  R('autobrake', 'true_emotional', 'truthful', '愤怒的车主', '颤音', '已经不止一起了！类似事故至少三起，极昼还在说是个例，良心呢？', false),

  R('idol', 'rumor_bully', 'rumor', '圈内知情人', '围脖', '林屿天天打骂助理，还扇过她耳光，整个剧组都知道', true, true),
  R('idol', 'true_romance', 'truthful', '合同观察家', '围脖', '林屿和那位女星签了恋爱合约，合同我见过，三年到期', false, true),
  R('idol', 'true_diva', 'truthful', '剧组场务', '颤音', '林屿片场迟到四小时还罢演，导演只能陪笑，这就是顶流的素质？', false),

  R('tutorial_crayfish', 'rumor_dead', 'rumor', '后厨目击者', '铁吧', '虾霸王全是死虾冒充活虾，我在后厨亲眼看见的', true),
  R('tutorial_crayfish', 'true_dirty', 'truthful', '探店博主', '颤音', '虾霸王后厨油污遍地，我拍了视频，大家自己看', false),
  R('tutorial_crayfish', 'privacy', 'privacy', '知道得太多', '围脖', '赵老板闺女在实验小学三年级二班，大家懂的，放学去堵', true)
];
