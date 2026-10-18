/* 内置关卡 01：过期原料风波。关卡文件只包含纯 JSON 数据，由 WW.Levels.register 注册。 */
WW.Levels.register({
  "id": "milktea",
  "meta": {
    "title": "过期原料风波",
    "subtitle": "新式茶饮 · 食品安全危机",
    "difficulty": 2,
    "cover": "🧋",
    "order": 1,
    "description": "冲刺上市的奶茶品牌被曝用过期原料。客户坚持“对手 P 图”，还不许你承认食品安全问题——可证据正在路上。",
    "tags": ["食品安全", "客户红线"]
  },
  "client": {
    "name": "甜心茶事",
    "contact": "王总",
    "persona": "新茶饮品牌创始人，正在筹备上市，极度爱面子，坚决不承认食品安全问题",
    "intro": "我们是要冲刺上市的品牌，绝对不能和“食品安全”四个字挂钩！对外就说是对手 P 图。80 万预算，8 个回合，把热搜给我按下去。",
    "acceptsRectify": false,
    "demands": [
      { "id": "d_safety", "text": "不许在公文里承认“食品安全问题”或“过期原料”", "keywords": ["食品安全问题", "过期原料", "使用了过期", "过期的奶浆"], "penalty": 15 },
      { "id": "d_founder", "text": "不许在公文里提创始人", "keywords": ["王总", "创始人"], "penalty": 10 }
    ],
    "expectations": [
      { "byTurn": 3, "condition": { "var": "trend.rank", "op": ">", "value": 5 }, "penalty": 8, "text": "都第 3 回合了，热搜怎么还在前五？" }
    ]
  },
  "incident": {
    "summary": "一位顾客在小红薯晒出甜心茶事门店的奶浆包装，生产日期显示已过期三天，配文“喝完胃里翻江倒海”。帖子很快破十万赞，“甜心茶事过期原料”冲上热搜。",
    "background": "甜心茶事全国有 1200 家门店，主打“新鲜现做”，正在筹备上市；加盟商占七成。",
    "keywords": ["过期原料", "奶浆", "甜心茶事", "生产日期"],
    "severity": 60
  },
  "facts": [
    {
      "id": "f1", "text": "部分门店使用了过期三天的奶浆", "clientClaim": "是对手 P 图，我们的原料都在保质期内",
      "isTrue": true, "regulatory": true, "weight": 2, "keywords": ["过期", "奶浆", "保质期", "生产日期", "P图"],
      "evidence": { "turn": 3, "chance": 0.6, "source": "门店店员匿名爆料", "suppressBy": ["settle", "delete"] }
    },
    {
      "id": "f2", "text": "全国门店都在用过期原料", "clientClaim": "只有极个别门店的问题",
      "isTrue": false, "weight": 1, "keywords": ["全国", "所有门店", "都在用"],
      "evidence": { "turn": 6, "chance": 0.6, "source": "第三方抽检结果", "suppressBy": [] }
    },
    {
      "id": "f3", "text": "总部知情并默许门店改标签", "clientClaim": "总部完全不知情",
      "isTrue": true, "regulatory": true, "weight": 2, "keywords": ["总部", "默许", "改标签", "知情"], "tags": ["management"],
      "publicAtStart": false,
      "evidence": { "turn": 5, "chance": 0.8, "source": "前区域经理", "suppressBy": ["settle"] }
    },
    {
      "id": "f4", "text": "顾客喝出急性肠胃炎住院", "clientClaim": "没有任何就医记录",
      "isTrue": false, "weight": 1, "keywords": ["住院", "肠胃炎", "急诊"],
      "evidence": { "turn": 4, "chance": 0.5, "source": "当事人后续澄清", "suppressBy": [] }
    }
  ],
  "contract": { "turns": 8, "actionPoints": 3, "budget": 80, "slotsPerDay": 2 },
  "initialStats": { "sentiment": -42, "heat": 78, "credibility": 55, "exposure": 0, "satisfaction": 70 },
  "tuning": { "heatDecay": 0.2 },
  "factions": [
    { "id": "passerby", "name": "吃瓜路人", "size": 0.42, "sentiment": -25, "volatility": 0.35, "bias": -5, "desc": "人数最多，容易被带节奏" },
    { "id": "fans", "name": "奶茶爱好者", "size": 0.16, "sentiment": 30, "volatility": 0.25, "bias": 25, "desc": "一天一杯的忠实顾客" },
    { "id": "victim", "name": "中招顾客", "size": 0.08, "sentiment": -70, "volatility": 0.3, "bias": -40, "desc": "喝出问题的顾客，只认赔偿与道歉" },
    { "id": "sleuth", "name": "扒皮党", "size": 0.12, "sentiment": -35, "volatility": 0.3, "bias": -15, "desc": "爱整理时间线，对水军和删帖极其敏感" },
    { "id": "media", "name": "媒体与美食博主", "size": 0.12, "sentiment": -25, "volatility": 0.25, "bias": -10, "desc": "要信息、要立场" },
    { "id": "rival", "name": "竞品粉丝", "size": 0.10, "sentiment": -45, "volatility": 0.15, "bias": -35, "desc": "竞品与对家粉丝" }
  ],
  "platforms": ["xiaohongshu", "weibo", "douyin", "zhihu", "bilibili", "tieba", "news", "overseas"],
  "personas": [
    { "id": "p_victim", "name": "胃疼的小鹿", "faction": "victim", "tier": "kol", "platform": "xiaohongshu", "style": "委屈、晒图、细节多" },
    { "id": "p_reporter", "name": "财经记者老林", "faction": "media", "tier": "media", "platform": "news", "style": "克制、追问、要数据" },
    { "id": "p_sleuth", "name": "时间线整理员", "faction": "sleuth", "tier": "kol", "platform": "weibo", "style": "列时间线、对比图" },
    { "id": "p_fan", "name": "一天三杯甜心", "faction": "fans", "tier": "normal", "platform": "xiaohongshu", "style": "护品牌、但也会动摇" },
    { "id": "p_staff", "name": "匿名店员小A", "faction": "sleuth", "tier": "normal", "platform": "tieba", "style": "半吞半吐的内部人" },
    { "id": "p_rival", "name": "沏刻茶研官方", "faction": "rival", "tier": "bigv", "platform": "weibo", "style": "阴阳怪气地蹭热度", "opp": "rival_brand" },
    { "id": "p_mkt", "name": "吃瓜情报局", "faction": "media", "tier": "bigv", "platform": "weibo", "style": "震惊体营销号" }
  ],
  "seedPosts": [
    { "persona": "p_victim", "platform": "xiaohongshu", "stance": -2, "fact": "f1", "likes": 108000, "tags": ["避雷", "晒图"], "content": "姐妹们避雷！甜心茶事的奶浆生产日期是三天前过期的（图1图2），喝完胃里翻江倒海，我真的会谢。" },
    { "persona": "p_victim", "platform": "xiaohongshu", "stance": -2, "fact": "f4", "likes": 46000, "content": "今天去医院挂了急诊，医生说是急性肠胃炎，可能要住院观察……" },
    { "persona": "p_mkt", "platform": "weibo", "stance": -2, "fact": "f2", "likes": 38000, "tags": ["网传"], "content": "网传甜心茶事全国门店都在用过期原料，你还敢喝吗？" },
    { "persona": "p_fan", "platform": "xiaohongshu", "stance": 1, "likes": 2600, "content": "喝了三年甜心了，个别门店的问题吧，别一棒子打死。" },
    { "persona": "p_reporter", "platform": "news", "stance": -1, "likes": 52000, "content": "记者联系甜心茶事总部，客服表示“已收到反馈，正在核实”。截至发稿，品牌官方账号未发布声明。" },
    { "persona": "p_rival", "platform": "weibo", "stance": -1, "likes": 15000, "tags": ["蹭热度"], "opp": "rival_brand", "content": "沏刻茶研的每一包原料都可追溯，欢迎大家随时监督～" },
    { "author": "等通报的打工人", "tier": "normal", "faction": "passerby", "platform": "weibo", "stance": 0, "likes": 5300, "content": "坐等甜心茶事回应，看看这次是不是又是临时工。" },
    { "persona": "p_sleuth", "platform": "weibo", "stance": -1, "likes": 21000, "content": "整理了一下时间线：这已经是甜心茶事今年第二次被投诉原料问题了。" }
  ],
  "items": {
    "enabled": ["statement", "shill", "delete", "control", "trend_remove", "throttle", "distraction", "kol", "legal", "iron_fist", "expose", "monitor", "investigate", "settle", "coopt", "scapegoat", "endorse", "rectify"],
    "startTier": 1,
    "unlocks": { "investigate": { "var": "turn", "op": ">=", "value": 1 } },
    "overrides": {
      "rectify": { "tier": 2, "name": "全面整改", "desc":"全国门店停业自查、原料溯源公开、第三方进驻：持续多回合提升好感与公信力，堵住对手举报的把柄。" }
    }
  },
  "objectives": {
    "stages": [
      {
        "id": "s1", "title": "止血", "desc": "先把热搜按下去，给出官方回应。",
        "rewards": [
          { "type": "unlock", "tier": 2 },
          { "type": "budget", "delta": 20 },
          { "type": "message", "from": "client", "text": "热搜总算下去点了。再给你们 20 万，务必把口碑拉回来。" }
        ],
        "tasks": [
          { "id": "m1_heat", "title": "热度降到 60 以下", "required": true, "complete": { "var": "stats.heat", "op": "<=", "value": 60 } },
          { "id": "m1_respond", "title": "发布官方回应", "required": true, "complete": { "var": "itemUses.statement", "op": ">=", "value": 1 } },
          { "id": "m1_rank", "title": "（额外）让话题跌出热搜前五", "required": false, "complete": { "var": "trend.rank", "op": ">", "value": 5 }, "rewards": [{ "type": "budget", "delta": 8 }] }
        ]
      },
      {
        "id": "s2", "title": "扭转", "desc": "把口碑拉回来，别让公信力崩掉。",
        "rewards": [{ "type": "unlock", "tier": 3 }, { "type": "budget", "delta": 15 }],
        "tasks": [
          { "id": "m2_sent", "title": "舆论好感回到 -5 以上", "required": true, "complete": { "var": "stats.sentiment", "op": ">=", "value": -5 } },
          { "id": "m2_cred", "title": "公信力不低于 50", "required": true, "complete": { "var": "stats.credibility", "op": ">=", "value": 50 } },
          { "id": "m2_rumor", "title": "（额外）证伪“全国门店都在用”", "required": false, "complete": { "var": "fact.f2.refuted", "op": "==", "value": true }, "rewards": [{ "type": "stat", "stat": "credibility", "delta": 5 }, { "type": "score", "delta": 3 }] }
        ]
      },
      {
        "id": "s3", "title": "善后", "desc": "稳住局面，体面结案。",
        "rewards": [],
        "tasks": [
          { "id": "m3_final", "title": "好感 ≥ 10 且热度 ≤ 40", "required": true, "complete": { "all": [{ "var": "stats.sentiment", "op": ">=", "value": 10 }, { "var": "stats.heat", "op": "<=", "value": 40 }] } }
        ]
      }
    ],
    "side": [
      {
        "id": "side_redline", "title": "守住客户红线", "desc": "整单不违反任何客户红线", "offer": "start", "at": "end",
        "complete": { "var": "counters.violations", "op": "==", "value": 0 }, "fail": { "var": "counters.violations", "op": ">", "value": 0 },
        "rewards": [{ "type": "score", "delta": 5 }]
      },
      {
        "id": "side_rival", "title": "让对家现原形", "desc": "用“反向扒皮”曝光沏刻茶研", "offer": "start",
        "complete": { "var": "counters.exposeSuccess", "op": ">=", "value": 1 },
        "rewards": [{ "type": "budget", "delta": 10 }, { "type": "opponent", "opp": "rival_brand", "morale": -20 }]
      },
      {
        "id": "side_product", "title": "新品造势", "desc": "王总想趁机推新品“清白奶绿”：第 6 回合结束前让舆论好感 ≥ 15", "from": "client",
        "offer": { "var": "turn", "op": ">=", "value": 4 }, "choice": true, "deadline": 6,
        "complete": { "var": "stats.sentiment", "op": ">=", "value": 15 },
        "rewards": [{ "type": "budget", "delta": 25 }, { "type": "stat", "stat": "satisfaction", "delta": 10 }],
        "penalty": [{ "type": "stat", "stat": "satisfaction", "delta": -10 }]
      }
    ]
  },
  "opponents": [
    {
      "id": "rival_brand", "name": "沏刻茶研", "avatar": "🍵", "desc": "竞品新茶饮品牌，最会蹭热度，也最想看甜心茶事上不了市",
      "faction": "rival", "kind": "brand", "strength": 55, "morale": 60, "resources": 25, "income": 7, "cooptable": true, "platform": "weibo",
      "abilities": [
        { "use": "counter_shill", "weight": 3 },
        { "use": "iron_fist", "weight": 4 },
        { "use": "black_traffic", "weight": 2 },
        { "use": "dig_past", "weight": 2 }
      ],
      "pastScandals": [{ "text": "甜心茶事两年前就因“隔夜茶底”被罚过款", "isTrue": true }],
      "dirt": ["给营销号打钱写拉踩通稿"]
    },
    {
      "id": "consumers", "name": "维权消费者群", "avatar": "📣", "desc": "中招顾客自发组建的维权群，越压越团结",
      "faction": "victim", "kind": "victims", "strength": 45, "morale": 70, "resources": 15, "income": 5, "cooptable": false, "platform": "xiaohongshu",
      "abilities": [
        { "use": "mass_report", "weight": 3 },
        { "use": "archive" },
        { "use": "rumor", "weight": 1 }
      ],
      "rumors": ["甜心茶事的奶浆是用工业原料兑出来的"],
      "events": [
        {
          "id": "oe_lawsuit", "title": "维权群宣布集体诉讼",
          "trigger": { "all": [{ "var": "turn", "op": ">=", "value": 5 }, { "var": "faction.victim", "op": "<", "value": -30 }] },
          "effects": [
            { "type": "stat", "stat": "heat", "delta": 8 },
            { "type": "stat", "stat": "credibility", "delta": -4 },
            { "type": "posts", "count": 2, "stance": -2, "hint": "维权群宣布集体起诉甜心茶事，征集更多受害者" }
          ]
        }
      ]
    }
  ],
  "events": [
    {
      "id": "e_official", "title": "官媒评论员发声", "text": "新茶饮不能只顾扩张不顾安全。",
      "trigger": { "all": [{ "var": "turn", "op": ">=", "value": 4 }, { "var": "stats.heat", "op": ">=", "value": 55 }] },
      "effects": [
        { "type": "stat", "stat": "heat", "delta": 10 },
        { "type": "stat", "stat": "credibility", "delta": -5 },
        { "type": "posts", "count": 1, "stance": -2, "tier": "state", "platform": "news", "hint": "官媒评论：新茶饮不能只顾扩张不顾食品安全" },
        { "type": "headline", "text": "官媒评甜心茶事", "heat": 88, "tag": "热" }
      ]
    },
    {
      "id": "e_franchise", "title": "加盟商集体讨说法",
      "trigger": { "all": [{ "var": "turn", "op": ">=", "value": 5 }, { "var": "stats.sentiment", "op": "<", "value": -20 }] },
      "effects": [
        { "type": "stat", "stat": "satisfaction", "delta": -8 },
        { "type": "message", "from": "client", "text": "加盟商都把电话打到我这了！营业额掉了一半！" }
      ]
    }
  ],
  "victory": {
    "condition": { "all": [{ "var": "stats.sentiment", "op": ">=", "value": 5 }, { "var": "stats.heat", "op": "<=", "value": 45 }] },
    "text": "风波渐渐平息，甜心茶事的上市计划“暂缓”而非“取消”。"
  },
  "guide": [
    { "turn": 1, "text": "这一单客户口径和真相可能不一致。「内部摸底调查」从第 1 回合就能用——先查清楚，再决定否认什么。" }
  ],
  "ai": {
    "style": "新茶饮、小红薯避雷帖、打工人口吻；网友爱说“姐妹们”“避雷”“我真的会谢”。",
    "context": "",
    "extraRules": ""
  },
  "offline": {
    "posts": {
      "-2": ["过期三天还敢卖，{client}你是真不怕啊", "以后喝奶茶先看生产日期", "上市？先把奶浆的日期看清楚吧"],
      "-1": ["说是对手P图，那原图呢？", "回应里一个字都没提奶浆"],
      "1": ["个别门店的问题，处理了就行", "希望{client}这次真的整改"],
      "2": ["{client}加油，整改完我继续喝！"]
    },
    "rumors": ["{client}的奶浆是工业原料兑的", "{client}要被收购了"]
  }
});
