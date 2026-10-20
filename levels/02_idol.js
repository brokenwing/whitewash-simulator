/* 内置关卡 02：顶流人设崩塌。关卡文件只包含纯 JSON 数据，由 WW.Levels.register 注册。 */
WW.Levels.register({
  "id": "idol",
  "meta": {
    "title": "顶流人设崩塌",
    "subtitle": "娱乐圈 · 粉圈大战",
    "difficulty": 3,
    "cover": "🎤",
    "order": 2,
    "description": "顶流小生被前助理万字长文爆料：耍大牌、霸凌、合约恋爱。真真假假混在一起，对家粉丝已经冲进来了。",
    "tags": ["娱乐圈", "饭圈", "真假混杂"]
  },
  "client": {
    "name": "星耀娱乐",
    "contact": "周经纪",
    "persona": "金牌经纪人，冷静精明，最在乎艺人的商业价值和代言",
    "intro": "林屿的商业价值不能掉，代言商已经在问了。粉丝是我们最大的资产，但别让路人觉得我们在控评。恋爱的事，一个字都不许认。",
    "acceptsRectify": false,
    "demands": [
      { "id": "d_romance", "text": "不许承认恋爱", "keywords": ["恋爱", "女朋友", "交往", "合约恋爱属实"], "penalty": 12 }
    ],
    "expectations": [
      { "byTurn": 4, "condition": { "var": "stats.sentiment", "op": ">=", "value": -15 }, "penalty": 8, "text": "代言商要求我们给个说法，好感还没回来？" }
    ]
  },
  "incident": {
    "summary": "顶流小生林屿的前助理“小葵”发布万字长文，爆料林屿耍大牌、长期霸凌助理，还疑似与某女星“合约恋爱”。“林屿塌房”登上热搜第一。",
    "background": "林屿手握六个代言，粉丝号称千万，主演的大剧下个月开播。前助理小葵半年前离职。",
    "keywords": ["林屿", "塌房", "耍大牌", "霸凌", "合约恋爱"],
    "severity": 50
  },
  "facts": [
    {
      "id": "f1", "text": "林屿在片场多次迟到罢演、耍大牌", "clientClaim": "都是剧组排期问题，和林屿无关",
      "isTrue": true, "weight": 1, "keywords": ["耍大牌", "迟到", "罢演", "片场"],
      "evidence": { "turn": 3, "chance": 0.7, "source": "剧组工作人员流出的视频", "suppressBy": ["settle", "delete", "legal"] }
    },
    {
      "id": "f2", "text": "林屿长期霸凌助理", "clientClaim": "从来没有，小葵是违约被辞退后怀恨在心",
      "isTrue": false, "weight": 2, "keywords": ["霸凌", "打骂", "欺负助理", "摔东西"],
      "evidence": { "turn": 5, "chance": 0.6, "source": "完整聊天记录", "suppressBy": [] }
    },
    {
      "id": "f3", "text": "林屿与某女星合约恋爱", "clientClaim": "纯属捏造",
      "isTrue": true, "weight": 1, "keywords": ["恋爱", "女友", "合约恋爱", "交往"],
      "evidence": { "turn": 6, "chance": 0.5, "source": "狗仔拍到两人同进同出", "suppressBy": ["legal", "delete"] }
    }
  ],
  "contract": { "turns": 8, "actionPoints": 3, "budget": 120, "slotsPerDay": 2 },
  "initialStats": { "sentiment": -30, "heat": 85, "credibility": 50, "exposure": 5, "satisfaction": 70 },
  "tuning": { "heatDecay": 0.2 },
  "factions": [
    { "id": "passerby", "name": "路人", "size": 0.30, "sentiment": -30, "volatility": 0.35, "bias": -8, "desc": "不追星的普通网友，讨厌饭圈战斗力" },
    { "id": "fans", "name": "林屿粉丝", "size": 0.25, "sentiment": 60, "volatility": 0.2, "bias": 50, "desc": "号称千万的粉丝团，控评打投一条龙",
      "sens": { "statement": 1.3, "apology": 0.6, "shill": 1, "kol": 0.8, "legal": 0.8, "deletion": 0.3, "compensation": 0.3, "distraction": 0.5, "label": 1.3, "expose": 1.3, "rectify": 0.7, "scapegoat": 0.8, "event": 0.7 } },
    { "id": "victim", "name": "心疼小葵的网友", "size": 0.08, "sentiment": -65, "volatility": 0.3, "bias": -40, "desc": "站在前助理一边的网友" },
    { "id": "sleuth", "name": "娱乐圈扒姐", "size": 0.12, "sentiment": -30, "volatility": 0.3, "bias": -12, "desc": "爱扒细节、爱放截图" },
    { "id": "media", "name": "娱乐营销号", "size": 0.10, "sentiment": -20, "volatility": 0.3, "bias": -8, "desc": "谁热蹭谁" },
    { "id": "rival", "name": "对家粉丝", "size": 0.15, "sentiment": -70, "volatility": 0.15, "bias": -60, "desc": "对家顶流顾言的粉丝，巴不得林屿凉" }
  ],
  "platforms": ["weibo", "douyin", "bilibili", "xiaohongshu", "zhihu", "tieba", "news", "overseas"],
  "personas": [
    { "id": "p_kui", "name": "前助理小葵", "faction": "victim", "tier": "kol", "platform": "weibo", "style": "委屈、长文、细节", "opp": "kui" },
    { "id": "p_fanclub", "name": "林屿全球后援会", "faction": "fans", "tier": "bigv", "platform": "weibo", "style": "控评、反黑、整齐划一的口号" },
    { "id": "p_gossip", "name": "娱乐圈扒姐", "faction": "sleuth", "tier": "bigv", "platform": "weibo", "style": "“扒姐说两句”，半真半假" },
    { "id": "p_rivalclub", "name": "顾言后援会", "faction": "rival", "tier": "bigv", "platform": "weibo", "style": "拉踩、阴阳怪气", "opp": "rival_fans" },
    { "id": "p_paparazzi", "name": "狗仔老卓", "faction": "media", "tier": "media", "platform": "weibo", "style": "“周五见”式预告" },
    { "id": "p_passer", "name": "不追星的打工人", "faction": "passerby", "tier": "normal", "platform": "douyin", "style": "吐槽饭圈" }
  ],
  "seedPosts": [
    { "persona": "p_kui", "platform": "weibo", "stance": -2, "fact": "f2", "likes": 520000, "tags": ["长文", "爆料"], "content": "我是林屿的前助理小葵。这三年，我被骂、被摔东西、凌晨三点被叫去买宵夜……今天我不想再忍了。（万字长文）" },
    { "persona": "p_kui", "platform": "weibo", "stance": -2, "fact": "f1", "likes": 180000, "content": "片场迟到四个小时是常态，导演都得陪着笑脸。这些剧组的人都知道。" },
    { "persona": "p_kui", "platform": "weibo", "stance": -1, "fact": "f3", "likes": 210000, "content": "至于他的“女朋友”，你们去查查那份合同吧。" },
    { "persona": "p_fanclub", "platform": "weibo", "stance": 2, "likes": 160000, "tags": ["控评"], "content": "林屿的人品我们最清楚！造谣者必将付出代价！林屿我们永远在！" },
    { "persona": "p_rivalclub", "platform": "weibo", "stance": -2, "likes": 45000, "opp": "rival_fans", "content": "顶流？人品不行流量再高也没用，心疼小葵。" },
    { "persona": "p_gossip", "platform": "weibo", "stance": -1, "likes": 98000, "content": "扒姐说两句：耍大牌的事圈内早有耳闻，霸凌这条我持保留意见，等等完整聊天记录。" },
    { "persona": "p_passer", "platform": "douyin", "stance": 0, "likes": 12000, "content": "我只想知道下个月的剧还播不播。" },
    { "author": "广告圈观察", "tier": "kol", "faction": "media", "platform": "weibo", "stance": -1, "likes": 8800, "content": "代言商们今晚怕是睡不着了。" }
  ],
  "items": {
    "enabled": ["statement", "shill", "delete", "control", "trend_remove", "throttle", "distraction", "kol", "legal", "iron_fist", "expose", "monitor", "investigate", "settle", "coopt", "scapegoat", "endorse", "rectify"],
    "startTier": 1,
    "overrides": {
      "rectify": { "tier": 2, "name": "公开道歉+停工反省","desc": "工作室公开道歉、林屿暂停商业活动反省：持续提升路人好感与公信力，但经纪公司肉疼。" },
      "settle": { "name": "与前助理私下和解" }
    },
    "custom": [
      {
        "id": "fan_army", "name": "粉丝反黑站", "icon": "💖", "tier": 1, "ap": 1, "cost": 4, "channel": "shill",
        "desc": "动员后援会组织反黑、控评、打投。粉丝真情实感，战斗力爆表，但路人很反感“饭圈战斗力”。",
        "risk": "暴露度上升；路人与扒皮党反感；用多了会被骂“饭圈毒瘤”。",
        "effect": {
          "prompt": "玩家动员林屿的粉丝后援会集体反黑控评。粉丝阵营好感明显上升，路人可能反感；评论区会出现整齐划一的控评文案。效果取决于玩家给的口号方向是否得体，以及当前舆情。",
          "inputLabel": "反黑口号 / 方向",
          "bounds": { "sentiment": [-4, 6], "heat": [0, 6], "exposure": [1, 6] },
          "offlineDeltas": { "sentiment": 3, "heat": 3, "exposure": 3 },
          "posts": 2,
          "stance": 2,
          "effects": [
            { "type": "faction", "faction": "fans", "delta": 6 },
            { "type": "faction", "faction": "passerby", "delta": -2 }
          ]
        }
      }
    ]
  },
  "objectives": {
    "stages": [
      {
        "id": "s1", "title": "稳住基本盘", "desc": "粉丝不能散，热度要降。",
        "rewards": [{ "type": "unlock", "tier": 2 }, { "type": "budget", "delta": 25 }],
        "tasks": [
          { "id": "i1_heat", "title": "热度降到 70 以下，且粉丝好感不低于 40", "required": true, "complete": { "all": [{ "var": "stats.heat", "op": "<=", "value": 70 }, { "var": "faction.fans", "op": ">=", "value": 40 }] } },
          { "id": "i1_fast", "title": "（额外）第 2 回合内发布工作室声明", "required": false, "deadline": 2, "complete": { "var": "itemUses.statement", "op": ">=", "value": 1 }, "rewards": [{ "type": "budget", "delta": 10 }] }
        ]
      },
      {
        "id": "s2", "title": "辩白", "desc": "霸凌是假的——让所有人知道。",
        "rewards": [{ "type": "unlock", "tier": 3 }, { "type": "budget", "delta": 20 }],
        "tasks": [
          { "id": "i2_truth", "title": "让“霸凌助理”的指控被证伪", "required": true, "complete": { "var": "fact.f2.refuted", "op": "==", "value": true } },
          { "id": "i2_sent", "title": "舆论好感回到 -5 以上", "required": true, "complete": { "var": "stats.sentiment", "op": ">=", "value": -5 } }
        ]
      },
      {
        "id": "s3", "title": "保住商业价值", "desc": "让代言商安心。",
        "rewards": [],
        "tasks": [
          { "id": "i3_final", "title": "好感 ≥ 10 且热度 ≤ 45", "required": true, "complete": { "all": [{ "var": "stats.sentiment", "op": ">=", "value": 10 }, { "var": "stats.heat", "op": "<=", "value": 45 }] } }
        ]
      }
    ],
    "side": [
      {
        "id": "side_endorse", "title": "保住代言", "desc": "整单结束时没有任何代言解约", "offer": "start", "at": "end",
        "complete": { "var": "flags.endorsementLost", "op": "!=", "value": true }, "fail": { "var": "flags.endorsementLost", "op": "==", "value": true },
        "rewards": [{ "type": "score", "delta": 6 }]
      },
      {
        "id": "side_kui", "title": "和小葵和解", "desc": "让“心疼小葵的网友”好感回到 -20 以上", "offer": { "var": "turn", "op": ">=", "value": 3 },
        "complete": { "var": "faction.victim", "op": ">=", "value": -20 },
        "rewards": [{ "type": "stat", "stat": "credibility", "delta": 6 }, { "type": "score", "delta": 3 }]
      }
    ]
  },
  "opponents": [
    {
      "id": "rival_fans", "name": "顾言后援会", "avatar": "🦊", "desc": "对家顶流顾言的粉丝，擅长组织、举报和造谣",
      "faction": "rival", "kind": "group", "strength": 60, "morale": 70, "resources": 25, "income": 8, "cooptable": false, "platform": "weibo",
      "abilities": [
        { "use": "mass_report", "weight": 3 },
        { "use": "rumor", "weight": 3 },
        { "use": "iron_fist", "weight": 2, "overrides": { "params": { "requiresHandle": false } } },
        { "use": "black_traffic", "weight": 2 }
      ],
      "rumors": ["林屿偷税漏税被约谈了", "林屿要退圈了", "林屿在片场打了场务"]
    },
    {
      "id": "kui", "name": "前助理小葵", "avatar": "🌻", "desc": "爆料人，手里可能还有料",
      "faction": "victim", "kind": "person", "strength": 50, "morale": 60, "resources": 15, "income": 5, "cooptable": true, "platform": "weibo",
      "abilities": [
        { "use": "dig_past", "weight": 2 },
        { "use": "go_abroad", "weight": 1 }
      ],
      "pastScandals": [
        { "text": "林屿出道前在综艺里说过“粉丝就是韭菜”", "isTrue": true },
        { "text": "林屿曾在机场推搡粉丝", "isTrue": false }
      ],
      "events": [
        {
          "id": "kui_live", "title": "小葵开直播哭诉",
          "trigger": { "all": [{ "var": "turn", "op": ">=", "value": 3 }, { "var": "opp.kui.morale", "op": ">=", "value": 40 }] },
          "effects": [
            { "type": "stat", "stat": "heat", "delta": 8 },
            { "type": "faction", "faction": "victim", "delta": -5 },
            { "type": "posts", "count": 2, "stance": -2, "opp": "kui", "hint": "前助理小葵开直播哭诉三年经历，直播间几十万人" }
          ]
        }
      ]
    },
    {
      "id": "marketing", "name": "营销号矩阵", "avatar": "📢", "desc": "哪里有流量就往哪里钻",
      "faction": "media", "kind": "group", "strength": 45, "morale": 50, "resources": 10, "income": 6, "cooptable": true, "platform": "weibo",
      "abilities": [{ "use": "black_traffic", "weight": 4 }]
    }
  ],
  "events": [
    {
      "id": "e_endorsement", "title": "代言品牌宣布解约",
      "trigger": { "all": [{ "var": "turn", "op": ">=", "value": 4 }, { "var": "stats.sentiment", "op": "<", "value": -25 }] },
      "effects": [
        { "type": "flag", "name": "endorsementLost" },
        { "type": "stat", "stat": "satisfaction", "delta": -15 },
        { "type": "stat", "stat": "heat", "delta": 8 },
        { "type": "posts", "count": 1, "stance": -1, "tier": "media", "hint": "某代言品牌宣布与林屿解约，官方账号已删除相关广告" },
        { "type": "headline", "text": "品牌方与林屿解约", "heat": 90, "tag": "爆" }
      ]
    },
    {
      "id": "e_drama", "title": "新剧定档",
      "trigger": { "var": "turn", "op": ">=", "value": 6 },
      "effects": [
        {
          "type": "if", "cond": { "var": "stats.sentiment", "op": ">=", "value": 0 },
          "then": [{ "type": "stat", "stat": "sentiment", "delta": 5 }, { "type": "headline", "text": "林屿新剧定档", "heat": 70, "tag": "新" }],
          "else": [{ "type": "stat", "stat": "heat", "delta": 5 }, { "type": "posts", "count": 1, "stance": -1, "tier": "media", "hint": "传林屿主演的新剧考虑换角或延期" }]
        }
      ]
    }
  ],
  "victory": {
    "condition": { "all": [{ "var": "stats.sentiment", "op": ">=", "value": 5 }, { "var": "stats.heat", "op": "<=", "value": 45 }] },
    "text": "风波过去，林屿的新剧如期开播，弹幕里偶尔还有人刷“小葵”。"
  },
  "ai": {
    "style": "娱乐圈饭圈语境：控评、反黑、打投、塌房、糊咖、扒姐、“周五见”，围脖为主。",
    "context": "顾言是与林屿同级别的对家顶流（虚构人物）。",
    "extraRules": ""
  },
  "offline": {
    "posts": {
      "-2": ["塌房了塌房了，人设崩得稀碎", "心疼小葵，三年啊", "顶流就可以为所欲为？"],
      "-1": ["等完整聊天记录", "粉丝控评控得我更不信了"],
      "1": ["霸凌这条感觉不太站得住", "先别急着定性，等实锤"],
      "2": ["林屿我们永远在！", "清者自清，等你回来"]
    }
  }
});
