/*
 * Default item library (道具库). Levels pick items via level.items.enabled, override any field via
 * level.items.overrides[id], and add their own via level.items.custom (handler "custom_ai").
 * cost: 万元 (some handlers compute the price from params); ap: action points; tier: unlock tier
 * (1 基础 / 2 进阶 / 3 高阶); target: what the player must pick before using it.
 */
(function (WW) {
  'use strict';

  WW.Data.items = {
    statement: {
      id: 'statement', name: '发布公文', icon: '📜', tier: 1, ap: 1, cost: 1,
      handler: 'statement', channel: 'statement', target: 'none', ai: 'statement.judge',
      desc: '撰写并“盖章发布”官方公文。AI 可补全、润色，发布后由 AI 评审打分换算效果。',
      risk: '否认真相会记谎言债；违反客户红线扣满意度；同回合连发效果递减。',
      params: { fatigue: 0.6 }
    },
    shill: {
      id: 'shill', name: '水军', icon: '🦆', tier: 1, ap: 1, cost: 0,
      handler: 'shill', channel: 'shill', target: 'none', ai: 'shill.generate',
      desc: '按你写的“节奏方向”购买水军刷评论，AI 生成样例帖并评估说服力与违和感。',
      risk: '累积暴露度；被扒、被抱团举报封号会大反噬；扒皮党越多越危险。',
      params: {
        tiers: [
          { id: 'zombie', name: '僵尸号', price: 0.6, power: 0.5, detect: 2.2, desc: '便宜量大，一眼假' },
          { id: 'normal', name: '普通水军', price: 1.6, power: 1.0, detect: 1.2, desc: '有头像有动态' },
          { id: 'premium', name: '精品养号', price: 4.5, power: 1.6, detect: 0.5, desc: '真人感强，价格贵' }
        ],
        counts: [100, 300, 1000],
        countFactor: { '100': 1, '300': 2.2, '1000': 4.5 }
      }
    },
    delete: {
      id: 'delete', name: '删帖', icon: '🗑️', tier: 1, ap: 1, cost: 0,
      handler: 'delete', channel: 'deletion', target: 'criterion', ai: 'posts.classify',
      desc: '用一句话描述要删的帖子（如“晒出病历的帖子”），AI 筛选后预览确认，按帖计价。',
      risk: '大V、媒体价格高，官方媒体与外网删不掉；删得越多越容易“删帖反噬”。',
      params: { maxPosts: 12, backfireBase: 0.05, backfirePer: 0.03 }
    },
    control: {
      id: 'control', name: '控评', icon: '🛡️', tier: 1, ap: 1, cost: 3,
      handler: 'control', channel: 'shill', target: 'post', ai: 'control.generate',
      desc: '选中一条热帖，把好评顶上热评、折叠负面评论。也能控自家的官方公文、软文和水军帖，护住它们 2 回合不被抱团举报冲掉。',
      risk: '暴露度上升；评论区太整齐会被嘲“控评”。',
      params: { exposure: 3 }
    },
    trend_remove: {
      id: 'trend_remove', name: '撤热搜', icon: '📉', tier: 2, ap: 1, cost: 15,
      handler: 'trend_remove', channel: 'deletion', target: 'none',
      desc: '花钱让话题从热搜榜上消失，热度立刻大降。',
      risk: '热度很高时撤热搜会被发现，“心虚”反噬，也容易逼对手去外网。',
      params: { heatDrop: 25, exposure: 6, backfireHeat: 70, backfireChance: 0.35 }
    },
    throttle: {
      id: 'throttle', name: '限流降权', icon: '🔇', tier: 2, ap: 1, cost: 0,
      handler: 'throttle', channel: 'deletion', target: 'criterion', ai: 'posts.classify',
      desc: '按条件给帖子限流：不删除，只让更少人看到。比删帖隐蔽，但更贵。',
      risk: '外网内容限不了流；单价是删帖的 1.5 倍。',
      params: { priceMul: 1.5, maxPosts: 15, reachMul: 0.4 }
    },
    distraction: {
      id: 'distraction', name: '买热搜转移话题', icon: '🍉', tier: 2, ap: 1, cost: 12,
      handler: 'distraction', channel: 'distraction', target: 'none', ai: 'distraction.generate',
      desc: '买一个更大的“瓜”顶上热搜，两回合内持续分走热度。',
      risk: '重复使用会被识破：“这瓜出来得也太巧了”。',
      params: { heatNow: 12, heatNext: 8, exposure: 5 }
    },
    kol: {
      id: 'kol', name: 'KOL 软文', icon: '✍️', tier: 2, ap: 1, cost: 0,
      handler: 'kol', channel: 'kol', target: 'none', ai: 'kol.write',
      desc: '写一份 brief，花钱请 KOL 发“理性分析”长文，AI 代写并评估说服力。',
      risk: '恰饭被扒会掉公信力。',
      params: {
        tiers: [
          { id: 'small', name: '腰部 KOL', price: 5, reach: 5, tier: 'kol' },
          { id: 'big', name: '大V', price: 15, reach: 12, tier: 'bigv' },
          { id: 'top', name: '头部大V', price: 40, reach: 25, tier: 'bigv' }
        ]
      }
    },
    legal: {
      id: 'legal', name: '律师函', icon: '⚖️', tier: 2, ap: 1, cost: 3,
      handler: 'legal', channel: 'legal', target: 'postOrOpponent',
      desc: '给指定帖子作者或对手发律师函，震慑大V，压制负面。',
      risk: '路人反感“律师函警告”；发给苦主等于自爆。',
      params: {}
    },
    iron_fist: {
      id: 'iron_fist', name: '召唤铁拳', icon: '👊', tier: 2, ap: 1, cost: 5, cooldown: 2, maxUses: 2,
      handler: 'iron_fist', channel: 'legal', target: 'postOrOpponent', ai: 'report.judge',
      desc: '向“有关部门/平台”举报目标帖或对手。AI 依据真相判定对方是否真的违规（造谣、侵犯隐私、人身攻击）。',
      risk: '举报说真话的人会失败、涨暴露度，还可能“铁拳回旋”——监管反查客户。',
      params: { boomerang: 0.35 }
    },
    expose: {
      id: 'expose', name: '反向扒皮', icon: '🔍', tier: 2, ap: 1, cost: 6, requires: 'monitor',
      handler: 'expose', channel: 'expose', target: 'opponent', ai: 'expose.generate',
      desc: '依托舆情监测的数据，曝光对手的水军、通稿和黑历史。',
      risk: '对手若没有把柄，反被嘲“公关公司急了”。',
      params: {}
    },
    monitor: {
      id: 'monitor', name: '舆情监测', icon: '📡', tier: 2, ap: 1, cost: 10, maxUses: 1, passive: true,
      handler: 'monitor', target: 'none',
      desc: '一次部署，全程生效：显示精确暴露度、阵营明细、对手意图与证据预警。',
      risk: '无。',
      params: {}
    },
    investigate: {
      id: 'investigate', name: '内部摸底调查', icon: '🕵️', tier: 3, ap: 1, cost: 8,
      handler: 'investigate', target: 'fact',
      desc: '核实某条“客户口径”到底是不是真的，并摸清相关证据何时可能曝光。',
      risk: '花钱。',
      params: {}
    },
    settle: {
      id: 'settle', name: '私下和解赔偿', icon: '🤝', tier: 3, ap: 1, cost: 0,
      handler: 'settle', channel: 'compensation', target: 'none',
      desc: '给苦主赔偿换取删帖与谅解，可压制苦主手里的证据。',
      risk: '封口协议可能泄露，“拿钱封口”大反噬。',
      params: {
        scales: [
          { id: 'small', name: '小额补偿', price: 10, power: 15, leak: 0.05 },
          { id: 'medium', name: '足额赔偿', price: 25, power: 30, leak: 0.08 },
          { id: 'large', name: '高额赔偿+保密协议', price: 50, power: 45, leak: 0.12 }
        ]
      }
    },
    coopt: {
      id: 'coopt', name: '招安收编', icon: '💰', tier: 3, ap: 1, cost: 0,
      handler: 'coopt', target: 'opponent',
      desc: '花钱让博主或对手停手，甚至倒戈。价格随对手势力上涨。',
      risk: '受害者群体收买不了；交易泄露会“收钱闭嘴”反噬。',
      params: { pricePerStrength: 0.8, leak: 0.15 }
    },
    scapegoat: {
      id: 'scapegoat', name: '临时工背锅', icon: '🙇', tier: 3, ap: 1, cost: 2,
      handler: 'scapegoat', channel: 'scapegoat', target: 'none',
      desc: '把锅甩给“涉事员工/临时工/供应商”，快速止血。',
      risk: '公信力下降；若真相指向管理层会记谎言债；“又是临时工”梗随时出现。',
      params: {}
    },
    endorse: {
      id: 'endorse', name: '第三方检测背书', icon: '🧪', tier: 3, ap: 1, cost: 15,
      handler: 'endorse', channel: 'statement', target: 'fact',
      desc: '请第三方机构出具报告，证伪某条指控。',
      risk: '如果指控其实是真的，这份报告就是定时炸弹。',
      params: {}
    },
    rectify: {
      id: 'rectify', name: '真诚整改', icon: '🔧', tier: 3, ap: 2, cost: 0,
      handler: 'rectify', channel: 'rectify', target: 'none',
      desc: '召回、停业整顿或全面排查：持续多回合稳定提升好感与公信力，并堵住对手铁拳的把柄。',
      risk: '非常贵，客户会很不爽。',
      params: { costRatio: 0.3, turns: 3 }
    }
  };

  WW.Data.itemOrder = [
    'statement', 'shill', 'delete', 'control',
    'trend_remove', 'throttle', 'distraction', 'kol', 'legal', 'iron_fist', 'expose',
    'monitor', 'investigate', 'settle', 'coopt', 'scapegoat', 'endorse', 'rectify'
  ];

  WW.Data.tierNames = { 1: '基础', 2: '进阶', 3: '高阶' };
})(window.WW);
