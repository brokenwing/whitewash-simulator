/*
 * Official statement types (公文类型). `channel` routes the effect through faction sensitivities;
 * `heat` is the base attention a release attracts. `skeleton` is the offline completion template.
 */
(function (WW) {
  'use strict';

  WW.Data.statementTypes = [
    {
      id: 'apology', name: '致歉信', channel: 'apology', heat: 3,
      desc: '认错道歉，安抚苦主与路人；客户若有“不许道歉”红线会不满',
      title: '关于{kw}的致歉声明',
      skeleton: [
        '尊敬的广大用户：',
        '近日，有关“{kw}”的问题引发社会广泛关注。对此，{client}深表歉意。',
        '{fact}',
        '我们将立即采取以下措施：\n一、{m1}\n二、{m2}\n三、{m3}',
        '{tone}',
        '再次向每一位受到影响的朋友致以诚挚的歉意。我们将以此为戒，接受社会各界监督。'
      ]
    },
    {
      id: 'explain', name: '情况说明', channel: 'statement', heat: 2,
      desc: '说明经过与原因，信息越具体越可信；可用于兑现“公布调查结果”类承诺',
      title: '关于{kw}的情况说明',
      fulfills: true,
      skeleton: [
        '各位关心{client}的朋友：',
        '针对近日网络上关于“{kw}”的讨论，现将有关情况说明如下：',
        '{fact}',
        '{tone}',
        '后续进展我们将第一时间公布，感谢大家的监督。'
      ]
    },
    {
      id: 'refute', name: '辟谣声明', channel: 'statement', heat: 3,
      desc: '否认不实信息——否认的若是真事，会记一笔谎言债',
      title: '关于网传不实信息的声明',
      skeleton: [
        '近日，网络上出现大量关于{client}“{kw}”的不实信息，严重误导公众。',
        '{fact}',
        '{tone}',
        '请广大网友不信谣、不传谣，一切以{client}官方发布为准。'
      ]
    },
    {
      id: 'stern', name: '严正声明', channel: 'label', heat: 5,
      desc: '强硬表态、追责造谣者：粉丝爱看，路人和扒皮党反感',
      title: '严正声明',
      skeleton: [
        '近期，有个别账号恶意捏造、散布关于{client}“{kw}”的虚假信息，对我司声誉造成严重损害。',
        '{fact}',
        '对此，{client}已委托律师事务所进行取证，对相关侵权行为依法追究法律责任，绝不姑息。',
        '{tone}'
      ]
    },
    {
      id: 'rectify', name: '整改通报', channel: 'apology', heat: 1,
      desc: '公布整改措施与时间表，能兑现之前的承诺',
      title: '关于{kw}问题的整改通报',
      fulfills: true,
      skeleton: [
        '针对“{kw}”问题，{client}已成立专项整改小组，现将整改情况通报如下：',
        '一、{m1}\n二、{m2}\n三、{m3}',
        '{fact}',
        '{tone}',
        '整改进展将每周公布，欢迎社会各界监督。'
      ]
    },
    {
      id: 'founder', name: '创始人公开信', channel: 'apology', heat: 6,
      desc: '老板亲自出面打感情牌，写得好效果翻倍，写砸了全网玩梗',
      title: '{contact}致大家的一封信',
      skeleton: [
        '这几天，我几乎没有合眼。',
        '创业这么多年，我一直告诉团队“用户是我们的衣食父母”。这一次，是我们辜负了大家。',
        '{fact}',
        '{tone}',
        '路还很长，我会用行动证明，{client}值得被再信任一次。'
      ]
    },
    {
      id: 'staff', name: '员工处理通报', channel: 'scapegoat', heat: 4,
      desc: '处理涉事员工快速止血，“临时工”梗随时可能出现',
      title: '关于涉事员工的处理通报',
      skeleton: [
        '经公司调查，“{kw}”系涉事员工违反公司规定、擅自操作所致。',
        '公司已对相关员工作出解除劳动合同处理，并对所在门店负责人进行通报批评。',
        '{fact}',
        '{tone}'
      ]
    }
  ];

  /* Tone sliders: sincere(-1..1: 强硬..诚恳) and admit(-1..1: 甩锅..认错) pick these phrases offline. */
  WW.Data.statementTones = {
    sincere: [
      '我们完全理解大家的愤怒与失望，这些批评我们照单全收。',
      '每一条留言我们都认真看了，大家骂得对。'
    ],
    tough: [
      '对于恶意造谣、断章取义者，我司将保留追究法律责任的权利。',
      '我们不接受任何别有用心的抹黑。'
    ],
    admit: [
      '这是我们管理上的失职，责任在公司，不在任何一名一线员工。',
      '问题的根源在于我们的内部管理，我们不会推卸责任。'
    ],
    shift: [
      '经初步调查，该问题系个别门店员工违规操作所致。',
      '目前不排除第三方供应商环节出现问题的可能，我们已要求其限期说明。'
    ],
    measures: ['全面排查所有门店与供应链', '邀请第三方机构进驻监督', '设立专项赔付通道', '公开整改进度，接受社会监督', '对相关负责人严肃问责']
  };

  WW.Data.statementTypeMap = {};
  WW.Data.statementTypes.forEach(function (t) { WW.Data.statementTypeMap[t.id] = t; });
})(window.WW);
