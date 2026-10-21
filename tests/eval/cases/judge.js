/*
 * statement.judge: hand-written statements with gold labels.
 *   gold.denies / admits / violations / fulfills : fact, red-line and promise ids that must be detected
 *   gold.optional : ids that are defensible either way (counted neither as hit nor as miss)
 *   gold.promiseDays : deadline the statement promises (0 = no dated promise, null = not graded)
 *   better : ids of cases this statement must out-score (engine composite q, see js/engine/actions.js)
 */
'use strict';

const J = (level, key, type, title, text, gold, extra) => Object.assign({
  id: level + '.judge.' + key, task: 'statement.judge', level,
  args: { type, channel: 'weibo', title, text },
  gold: Object.assign({ denies: [], admits: [], violations: [], fulfills: [], optional: {}, promiseDays: 0 }, gold)
}, extra || {});

module.exports = [
  /* ------------------------------------------------------------ milktea: f1 T 过期奶浆 / f2 F 全国 / f3 T 总部知情(未曝光) / f4 F 住院 */
  J('milktea', 'deny_all', 'stern', '严正声明',
    '近日，网络上出现关于我司门店使用过期奶浆的图片，经核查，系竞争对手恶意P图，我司所有原料均在保质期内。网传“全国门店都在用过期原料”“顾客喝出肠胃炎住院”等说法均为不实信息。我司已向公安机关报案，并将依法追究造谣者的法律责任，绝不姑息。\n甜心茶事\n即日',
    { denies: ['f1', 'f2', 'f4'] }, { ref: true }),
  J('milktea', 'sincere', 'apology', '致歉信',
    '各位顾客：\n经连夜核查，我们有 3 家门店确实使用了超过保质期的奶浆，这是我们的严重失职，对不起每一位信任我们的顾客。涉事门店已全部停业，相关负责人已停职调查。\n同时说明两点：网传“全国门店都在用过期原料”经核查不属实，其余门店已逐一抽检；网传有顾客喝出肠胃炎住院，我们已联系发帖人，暂未核实到就医记录，如有就医情况我们承担全部费用。\n我们将在 3 日内公布全部门店的排查结果，并开放门店后厨直播。\n甜心茶事',
    { denies: ['f2'], admits: ['f1'], violations: ['d_safety'], promiseDays: 3, optional: { denies: ['f4'] } }, { ref: true, better: ['milktea.judge.deny_all', 'milktea.judge.scapegoat', 'milktea.judge.boilerplate'] }),
  J('milktea', 'scapegoat', 'staff', '关于个别门店员工违规操作的处理通报',
    '经查，某门店店长擅自使用临期原料，系其个人违规行为，公司对此毫不知情，已于今日将其开除。公司总部一贯严格执行原料管理制度，此次事件纯属个别员工所为，与公司管理无关。感谢广大网友的监督。',
    { denies: ['f3'], optional: { admits: ['f1'], violations: ['d_safety'], denies: ['f1', 'f2'] } }, { ref: true }),
  J('milktea', 'boilerplate', 'explain', '情况说明',
    '近日关于我司的相关讨论，我们高度重视，第一时间成立专项小组，正在积极调查核实，后续将及时公布进展。感谢大家的关注与监督。',
    {}, { ref: true }),
  J('milktea', 'founder', 'founder', '创始人公开信',
    '我是甜心茶事的创始人。这几天我一夜没睡，看完了大家的每一条留言。个别门店的管理问题，责任在我，我不找任何借口。我们会在 7 天内完成全部门店的原料排查，并把结果原原本本告诉大家。',
    { violations: ['d_founder'], promiseDays: 7, optional: { admits: ['f1'], violations: ['d_safety'] } }),
  J('milktea', 'fulfill', 'rectify', '整改通报',
    '三天前我们承诺公布全部门店的排查结果，现公布如下：全国 1200 家门店（含加盟店）已全部排查完毕，其中 3 家门店存在原料超期问题，已停业整改，涉事店长已解聘；其余门店未发现问题，抽检报告附后。网传“全国门店都在用过期原料”与事实不符。今后每月公布一次原料抽检结果。',
    { denies: ['f2'], admits: ['f1'], fulfills: ['pr_e1'], promiseDays: null, optional: { violations: ['d_safety'] } },
    { ref: true, setup: { turn: 4, promises: [{ id: 'pr_e1', text: '3日内公布全部门店排查结果', days: 3 }] }, better: ['milktea.judge.boilerplate'] }),

  /* ------------------------------------------------------------ autobrake: f1 T 误识别急刹 / f2 T 多起事故 / f3 F 篡改数据 */
  J('autobrake', 'deny_all', 'stern', '关于近期高速追尾事件的严正声明',
    '经调取车辆后台数据，本次事故系驾驶员未及时接管车辆所致，智驾系统运行正常，不存在网传的“幽灵刹车”问题。此次事件为个例。网传我司篡改车主行车数据纯属谣言，我司保留追究法律责任的权利。',
    { denies: ['f1', 'f2', 'f3'] }, { ref: true }),
  J('autobrake', 'recall', 'rectify', '主动召回公告',
    '经与第三方机构联合测试，我们确认特定批次车辆的智驾软件在特定光照条件下存在误识别导致急刹的缺陷，此前发生的多起类似事故与此有关，我们向所有受影响的车主道歉。即日起对涉事批次主动召回并免费升级软件，15 日内完成全部车辆的推送升级。关于“篡改行车数据”的说法，原始数据已封存并交第三方鉴定，可随时核验。',
    { admits: ['f1', 'f2'], denies: ['f3'], violations: ['d_recall', 'd_defect'], promiseDays: 15 }, { ref: true, better: ['autobrake.judge.deny_all', 'autobrake.judge.empty'] }),
  J('autobrake', 'transparent', 'explain', '关于行车数据的情况说明',
    '我们理解车主的愤怒。本次事故车辆的原始行车数据已全部封存，交由第三方鉴定机构检测，7 日内公布鉴定结果。关于网传“篡改数据”的说法，数据接受任何第三方核验。在鉴定结果出来之前，我们不做任何定性。',
    { denies: ['f3'], promiseDays: 7 }, { better: ['autobrake.judge.deny_all'] }),
  J('autobrake', 'empty', 'apology', '致广大车主的一封信',
    '我们与每一位车主感同身受，安全是极昼汽车的生命线。我们始终把用户放在第一位，感谢大家一直以来的信任与支持，我们会做得更好。',
    {}),

  /* ------------------------------------------------------------ idol: f1 T 耍大牌 / f2 F 霸凌 / f3 T 恋爱 */
  J('idol', 'refute', 'refute', '关于网传林屿霸凌助理的说明',
    '关于网传林屿霸凌助理一事，我们今天公布完整聊天记录与劳动合同：小葵因违约被依法解约，其在职期间林屿没有任何打骂行为，聊天记录可交由第三方公证。对于片场多次迟到的问题，林屿本人深表歉意，今后将严格遵守剧组时间，也向剧组同事道歉。',
    { denies: ['f2'], admits: ['f1'] }, { ref: true, better: ['idol.judge.deny_all'] }),
  J('idol', 'deny_all', 'stern', '严正声明',
    '林屿从未迟到罢演，从未霸凌助理，所谓“恋爱合约”纯属捏造。针对近期恶意造谣、诽谤林屿的行为，我司已委托律师取证，将对造谣者提起诉讼。',
    { denies: ['f1', 'f2', 'f3'] }, { ref: true }),
  J('idol', 'romance', 'explain', '情况说明',
    '林屿确实与一位圈外好友正在交往，感情稳定，希望大家给予两人空间，也请不要打扰对方的正常生活。',
    { admits: ['f3'], violations: ['d_romance'] }),

  /* ------------------------------------------------------------ tutorial: f1 T 卫生差 / f2 F 死虾 */
  J('tutorial_crayfish', 'sincere', 'apology', '虾霸王致歉信',
    '各位虾友：后厨卫生的问题，博主拍到的是真的，是我们没管好，对不起大家。从今天起停业整顿，7 天内完成后厨整改，并邀请顾客代表进后厨参观。至于“用死虾冒充活虾”，我们每天凌晨进货的单据和监控都可以公开，这一条确实不是事实。',
    { admits: ['f1'], denies: ['f2'], promiseDays: 7 }, { better: ['tutorial_crayfish.judge.deny_all'] }),
  J('tutorial_crayfish', 'deny_all', 'stern', '严正声明',
    '虾霸王后厨每天都打扫，博主是故意找角度拍的，所谓卫生问题纯属抹黑。我们绝对没有用死虾，每天凌晨进货、现杀现做。再有造谣，一律报警处理。',
    { denies: ['f1', 'f2'] })
];
