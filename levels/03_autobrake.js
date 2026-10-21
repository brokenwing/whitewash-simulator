/* 内置关卡 03：智驾刹车门（高难）。关卡文件只包含纯 JSON 数据，由 WW.Levels.register 注册。 */
WW.Levels.register({
  "id": "autobrake",
  "meta": {
    "title": "智驾刹车门",
    "subtitle": "新能源汽车 · 安全事故（高难）",
    "difficulty": 4,
    "cover": "🚗",
    "order": 3,
    "description": "高速上开着智驾，前方空无一车，车子却一脚急刹，后车直接追尾。行车记录仪视频全网疯传。客户咬定“用户操作不当”，可技术党已经在逐帧分析了。",
    "tags": ["安全事故", "技术党", "高难"]
  },
  "client": {
    "name": "极昼汽车",
    "contact": "陈总监",
    "persona": "公关总监，技术出身，说话爱用术语，坚信“软件没问题，是用户不会用”",
    "intro": "我们的智驾系统经过一千万公里测试。这件事必须定性为用户操作不当。召回？想都别想，那是几十亿的事。预算 300 万，10 个回合。",
    "acceptsRectify": false,
    "demands": [
      { "id": "d_recall", "text": "不许在公文里提“召回”", "keywords": ["召回"], "penalty": 12 },
      { "id": "d_defect", "text": "不许承认“系统缺陷”", "keywords": ["缺陷", "系统问题", "软件故障", "系统存在问题"], "penalty": 15 }
    ],
    "expectations": [
      { "byTurn": 4, "condition": { "var": "stats.heat", "op": "<=", "value": 65 }, "penalty": 8, "text": "热度怎么还这么高？董事会天天在问我。" }
    ]
  },
  "incident": {
    "summary": "一位极昼汽车车主在高速上开启智能驾驶时，车辆在前方无车的情况下突然急刹，被后车追尾，两车多人受伤。前后两车的行车记录仪视频全网疯传，“极昼汽车幽灵刹车”登顶热搜。",
    "background": "极昼汽车主打“智驾安全”，当月交付量刚创新高，下个月要发布新车型。",
    "keywords": ["幽灵刹车", "智驾", "高速追尾", "极昼汽车"],
    "severity": 75
  },
  "facts": [
    {
      "id": "f1", "text": "特定批次车辆的智驾软件存在误识别缺陷，会把路面阴影当成障碍物急刹", "clientClaim": "系统没有问题，是车主操作不当",
      "isTrue": true, "regulatory": true, "weight": 3, "keywords": ["刹车", "缺陷", "软件", "急刹", "操作不当", "识别"],
      "evidence": { "turn": 5, "chance": 0.6, "source": "车主群汇总的同款故障视频", "suppressBy": ["settle"] }
    },
    {
      "id": "f2", "text": "已经发生过多起类似事故", "clientClaim": "这是个例",
      "isTrue": true, "weight": 2, "keywords": ["多起", "类似事故", "不止一起", "个例"],
      "evidence": { "turn": 4, "chance": 0.7, "source": "汽车博主整理的投诉数据", "suppressBy": ["delete", "settle"] }
    },
    {
      "id": "f3", "text": "极昼汽车篡改了车主的行车数据", "clientClaim": "数据真实完整，随时可以第三方鉴定",
      "isTrue": false, "weight": 2, "keywords": ["篡改", "删改", "修改数据", "行车数据"],
      "evidence": { "turn": 7, "chance": 0.7, "source": "第三方鉴定机构报告", "suppressBy": [] }
    }
  ],
  "contract": { "turns": 10, "actionPoints": 3, "budget": 300, "slotsPerDay": 2 },
  "initialStats": { "sentiment": -50, "heat": 88, "credibility": 50, "exposure": 0, "satisfaction": 65 },
  "tuning": { "heatDecay": 0.17 },
  "factions": [
    { "id": "passerby", "name": "路人", "size": 0.36, "sentiment": -30, "volatility": 0.35, "bias": -8, "desc": "关心安全的普通人" },
    { "id": "fans", "name": "极昼车主与粉丝", "size": 0.14, "sentiment": 25, "volatility": 0.25, "bias": 20, "desc": "已经买了车的人，最怕车不值钱" },
    { "id": "victim", "name": "受害车主", "size": 0.08, "sentiment": -75, "volatility": 0.3, "bias": -45, "desc": "遇到过同款问题的车主" },
    { "id": "sleuth", "name": "汽车论坛技术党", "size": 0.18, "sentiment": -45, "volatility": 0.3, "bias": -25, "desc": "逐帧分析、看代码、查数据，对水军零容忍" },
    { "id": "media", "name": "汽车媒体", "size": 0.14, "sentiment": -30, "volatility": 0.25, "bias": -12, "desc": "要数据、要说法" },
    { "id": "rival", "name": "竞品粉丝", "size": 0.10, "sentiment": -50, "volatility": 0.15, "bias": -40, "desc": "竞品车企的拥趸" }
  ],
  "platforms": ["weibo", "douyin", "bilibili", "zhihu", "tieba", "news", "xiaohongshu", "overseas"],
  "personas": [
    { "id": "p_owner", "name": "高速被追尾的车主阿凯", "faction": "victim", "tier": "kol", "platform": "weibo", "style": "愤怒、坚定、不怕事", "opp": "owners" },
    { "id": "p_tech", "name": "老司机测评", "faction": "sleuth", "tier": "bigv", "platform": "bilibili", "style": "技术流、逐帧分析、讲数据" },
    { "id": "p_forum", "name": "论坛技术宅", "faction": "sleuth", "tier": "normal", "platform": "tieba", "style": "贴日志、贴代码" },
    { "id": "p_media", "name": "汽车之声", "faction": "media", "tier": "media", "platform": "news", "style": "行业媒体，追问细节" },
    { "id": "p_ownerfan", "name": "极昼车主老王", "faction": "fans", "tier": "normal", "platform": "douyin", "style": "护车、但心里打鼓" },
    { "id": "p_rival", "name": "北辰汽车官方", "faction": "rival", "tier": "bigv", "platform": "weibo", "style": "一本正经地拉踩", "opp": "rival_car" }
  ],
  "seedPosts": [
    { "persona": "p_owner", "platform": "weibo", "stance": -2, "fact": "f1", "likes": 680000, "tags": ["维权", "视频"], "content": "我根本没踩刹车！高速上开着智驾，前面一辆车都没有，它突然一脚急刹从 110 降到 30，后车根本躲不开。视频在这，极昼汽车给我一个说法！" },
    { "persona": "p_tech", "platform": "bilibili", "stance": -2, "fact": "f1", "likes": 230000, "tags": ["逐帧分析"], "content": "逐帧分析行车记录仪：急刹前 3 秒前方 200 米内没有任何车辆和障碍物，刹车踏板信号一直是零。这不像操作问题。" },
    { "persona": "p_forum", "platform": "tieba", "stance": -1, "fact": "f2", "likes": 18000, "content": "楼主同款车型也遇到过一次智驾无故急刹，当时以为是自己的问题，有人一起吗？" },
    { "persona": "p_media", "platform": "news", "stance": -1, "likes": 150000, "content": "车主称智驾无故急刹导致追尾，极昼汽车回应称“将配合调查”。业内人士呼吁尽快公开完整行车数据。" },
    { "persona": "p_ownerfan", "platform": "douyin", "stance": 1, "likes": 21000, "content": "开了两年极昼，智驾一直很稳。真相出来之前别急着站队。" },
    { "persona": "p_rival", "platform": "weibo", "stance": -1, "likes": 36000, "tags": ["蹭热度"], "opp": "rival_car", "content": "安全是汽车的底线。北辰的 AEB 系统每一次升级都会公开测试报告。" },
    { "author": "吃瓜情报局", "tier": "bigv", "faction": "media", "platform": "weibo", "stance": -2, "fact": "f3", "likes": 90000, "tags": ["网传"], "content": "网传极昼汽车连夜修改了车主的行车数据？？" },
    { "author": "被判全责的后车司机", "tier": "normal", "faction": "passerby", "platform": "weibo", "stance": -2, "likes": 44000, "content": "追尾算我全责，我认。可前面那车在高速上好端端一脚急刹，换谁能躲得开？" }
  ],
  "items": {
    "enabled": ["statement", "shill", "delete", "control", "trend_remove", "throttle", "distraction", "kol", "legal", "iron_fist", "expose", "monitor", "investigate", "settle", "coopt", "scapegoat", "endorse", "rectify"],
    "startTier": 1,
    "overrides": {
      "settle": {
        "params": {
          "scales": [
            { "id": "small", "name": "个案补偿", "price": 30, "power": 15, "leak": 0.05 },
            { "id": "medium", "name": "足额赔偿+免费检修", "price": 75, "power": 30, "leak": 0.08 },
            { "id": "large", "name": "高额赔偿+保密协议", "price": 150, "power": 45, "leak": 0.12 }
          ]
        }
      },
      "rectify": { "tier": 2, "name": "主动召回","desc": "宣布召回问题批次、免费 OTA 升级并公开测试数据：持续提升好感与公信力，堵死对手举报的把柄。客户会气疯。", "params": { "costRatio": 0.35, "turns": 3 } }
    }
  },
  "objectives": {
    "stages": [
      {
        "id": "s1", "title": "降温", "desc": "先把热度从榜首拉下来。",
        "rewards": [{ "type": "unlock", "tier": 2 }, { "type": "budget", "delta": 60 }],
        "tasks": [
          { "id": "a1_heat", "title": "热度降到 70 以下", "required": true, "complete": { "var": "stats.heat", "op": "<=", "value": 70 } },
          { "id": "a1_resp", "title": "发布首次回应", "required": true, "complete": { "var": "itemUses.statement", "op": ">=", "value": 1 } }
        ]
      },
      {
        "id": "s2", "title": "回应关切", "desc": "公众要的是说法和数据。",
        "rewards": [{ "type": "unlock", "tier": 3 }, { "type": "budget", "delta": 50 }],
        "tasks": [
          { "id": "a2_cred", "title": "公信力回到 55 以上", "required": true, "complete": { "var": "stats.credibility", "op": ">=", "value": 55 } },
          { "id": "a2_sent", "title": "舆论好感回到 -15 以上", "required": true, "complete": { "var": "stats.sentiment", "op": ">=", "value": -15 } },
          { "id": "a2_data", "title": "（额外）证伪“篡改行车数据”", "required": false, "complete": { "var": "fact.f3.refuted", "op": "==", "value": true }, "rewards": [{ "type": "stat", "stat": "credibility", "delta": 6 }, { "type": "score", "delta": 3 }] }
        ]
      },
      {
        "id": "s3", "title": "重建信任", "desc": "让人重新敢开智驾。",
        "rewards": [],
        "tasks": [
          { "id": "a3_final", "title": "好感 ≥ 5 且热度 ≤ 40", "required": true, "complete": { "all": [{ "var": "stats.sentiment", "op": ">=", "value": 5 }, { "var": "stats.heat", "op": "<=", "value": 40 }] } }
        ]
      }
    ],
    "side": [
      {
        "id": "side_abroad", "title": "不让外网发酵", "desc": "整单没有被捅到外网", "offer": "start", "at": "end",
        "complete": { "var": "flags.abroad", "op": "!=", "value": true }, "fail": { "var": "flags.abroad", "op": "==", "value": true },
        "rewards": [{ "type": "score", "delta": 5 }]
      },
      {
        "id": "side_data", "title": "先查清楚再说话", "desc": "第 5 回合结束前完成内部调查，并发布至少两篇公文", "offer": "start", "deadline": 5,
        "complete": { "all": [{ "var": "itemUses.investigate", "op": ">=", "value": 1 }, { "var": "itemUses.statement", "op": ">=", "value": 2 }] },
        "rewards": [{ "type": "stat", "stat": "credibility", "delta": 5 }]
      },
      {
        "id": "side_noshill", "title": "零水军通关", "desc": "技术党的地盘，一条水军都别买", "offer": "start", "at": "end",
        "complete": { "var": "itemUses.shill", "op": "==", "value": 0 }, "fail": { "var": "itemUses.shill", "op": ">", "value": 0 },
        "rewards": [{ "type": "score", "delta": 5 }]
      }
    ]
  },
  "opponents": [
    {
      "id": "owners", "name": "维权车主联盟", "avatar": "🚘", "desc": "遇到同款问题的车主组成的联盟，人数还在增加",
      "faction": "victim", "kind": "victims", "strength": 60, "morale": 75, "resources": 25, "income": 8, "cooptable": false, "platform": "weibo",
      "abilities": [
        { "use": "mass_report", "weight": 3 },
        { "use": "go_abroad", "weight": 2 },
        { "use": "iron_fist", "weight": 4 }
      ],
      "events": [
        {
          "id": "owners_join", "title": "更多车主加入联盟",
          "trigger": { "var": "fact.f2.revealed", "op": "==", "value": true },
          "effects": [
            { "type": "opponent", "opp": "owners", "strength": 15 },
            { "type": "stat", "stat": "heat", "delta": 6 },
            { "type": "posts", "count": 2, "stance": -2, "opp": "owners", "hint": "更多同款车主站出来讲述自己在高速上被无故急刹的经历" }
          ]
        }
      ]
    },
    {
      "id": "rival_car", "name": "北辰汽车", "avatar": "🏎️", "desc": "竞品车企，趁机营销拉踩",
      "faction": "rival", "kind": "brand", "strength": 55, "morale": 55, "resources": 30, "income": 8, "cooptable": true, "platform": "weibo",
      "abilities": [
        { "use": "counter_shill", "weight": 3 },
        { "use": "dig_past", "weight": 2 },
        { "use": "black_traffic", "weight": 1 }
      ],
      "pastScandals": [{ "text": "极昼汽车去年就有车主投诉过车机黑屏、倒车影像失灵", "isTrue": true }],
      "dirt": ["雇营销号写拉踩通稿"]
    },
    {
      "id": "car_blogger", "name": "汽车博主矩阵", "avatar": "🎙️", "desc": "流量为王的汽车自媒体",
      "faction": "media", "kind": "group", "strength": 45, "morale": 55, "resources": 15, "income": 6, "cooptable": true, "platform": "bilibili",
      "startActive": false, "enterWhen": { "var": "turn", "op": ">=", "value": 2 },
      "abilities": [
        { "use": "black_traffic", "weight": 4 },
        { "use": "rumor", "weight": 1 }
      ],
      "rumors": ["极昼汽车高管已经在抛售股票"]
    }
  ],
  "events": [
    {
      "id": "e_state", "title": "官媒评论", "text": "智能驾驶不能拿用户当“小白鼠”。",
      "trigger": { "all": [{ "var": "turn", "op": ">=", "value": 3 }, { "var": "stats.heat", "op": ">=", "value": 60 }] },
      "effects": [
        { "type": "stat", "stat": "heat", "delta": 10 },
        { "type": "stat", "stat": "credibility", "delta": -6 },
        { "type": "posts", "count": 1, "stance": -2, "tier": "state", "platform": "news", "hint": "官媒评论：智能驾驶不能拿用户当小白鼠" },
        { "type": "headline", "text": "官媒评智驾安全", "heat": 90, "tag": "热" }
      ]
    },
    {
      "id": "e_consumer", "title": "消协介入",
      "trigger": { "all": [{ "var": "turn", "op": ">=", "value": 6 }, { "var": "flags.rectified", "op": "!=", "value": true }] },
      "effects": [
        { "type": "stat", "stat": "credibility", "delta": -5 },
        { "type": "stat", "stat": "satisfaction", "delta": -5 },
        { "type": "stat", "stat": "heat", "delta": 6 },
        { "type": "posts", "count": 1, "stance": -1, "tier": "media", "hint": "消费者协会约谈极昼汽车，要求说明智驾安全情况" }
      ]
    },
    {
      "id": "e_sales", "title": "月度交付数据公布",
      "trigger": { "var": "turn", "op": ">=", "value": 8 },
      "effects": [
        {
          "type": "if", "cond": { "var": "stats.sentiment", "op": ">=", "value": 0 },
          "then": [{ "type": "stat", "stat": "sentiment", "delta": 4 }, { "type": "stat", "stat": "satisfaction", "delta": 8 }, { "type": "headline", "text": "极昼汽车交付回暖", "heat": 60 }],
          "else": [{ "type": "stat", "stat": "satisfaction", "delta": -10 }, { "type": "stat", "stat": "heat", "delta": 4 }, { "type": "posts", "count": 1, "stance": -1, "hint": "极昼汽车订单出现退订潮" }]
        }
      ]
    }
  ],
  "victory": {
    "condition": { "all": [{ "var": "stats.sentiment", "op": ">=", "value": 0 }, { "var": "stats.heat", "op": "<=", "value": 45 }] },
    "text": "新车型如期发布，发布会上第一页 PPT 写着“安全”。"
  },
  "ai": {
    "style": "汽车与科技圈语境：逐帧分析、技术党、车主群、AEB、OTA、制动灯、日志。",
    "context": "北辰汽车是虚构的竞品车企。",
    "extraRules": ""
  },
  "offline": {
    "posts": {
      "-2": ["拿用户当小白鼠？", "智驾平白无故急刹，这谁敢开", "技术党都逐帧分析了，还说操作不当？"],
      "-1": ["等完整行车数据", "{client}的回应全是术语，就是不说人话"],
      "1": ["开了两年没出过问题，等调查结果吧", "先别带节奏，等数据"],
      "2": ["{client}加油，相信会给车主一个交代"]
    }
  }
});
