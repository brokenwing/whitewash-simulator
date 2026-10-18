/* 内置关卡 00：新手教程。关卡文件只包含纯 JSON 数据，由 WW.Levels.register 注册。 */
WW.Levels.register({
  "id": "tutorial_crayfish",
  "meta": {
    "title": "小龙虾店卫生风波",
    "subtitle": "新手教程 · 第一单",
    "difficulty": 1,
    "cover": "🦞",
    "order": 0,
    "description": "网红小龙虾店被美食博主曝光后厨脏乱，还被传“用死虾”。预算不多，回合也少——正适合练手。",
    "tags": ["教程", "餐饮"]
  },
  "client": {
    "name": "虾霸王",
    "contact": "赵老板",
    "persona": "开了八年的网红小龙虾店老板，嗓门大、爱面子，最怕差评影响生意",
    "intro": "兄弟，我这店开了八年，从来没这么丢人过！那博主说我后厨脏、还说我用死虾，这让我以后怎么做生意？钱不多，30 万，你们看着办！",
    "acceptsRectify": true,
    "demands": [],
    "expectations": []
  },
  "incident": {
    "summary": "美食博主「吃货阿杰」探店后发视频，称虾霸王后厨油污遍地、吃完拉肚子，还暗示店里用死虾冒充活虾，视频播放量破百万。",
    "background": "虾霸王是本地排队名店，周末翻台五六轮，最近刚开了第二家分店。",
    "keywords": ["后厨脏乱", "死虾", "虾霸王", "拉肚子"],
    "severity": 35
  },
  "facts": [
    {
      "id": "f1",
      "text": "虾霸王后厨卫生状况很差",
      "clientClaim": "后厨每天都打扫，是博主故意找角度拍的",
      "isTrue": true,
      "regulatory": false,
      "weight": 1,
      "keywords": ["后厨", "油污", "脏乱", "卫生"],
      "evidence": { "turn": 3, "chance": 0.8, "source": "离职服务员", "suppressBy": ["settle", "delete"] }
    },
    {
      "id": "f2",
      "text": "虾霸王用死虾冒充活虾",
      "clientClaim": "绝对没有，每天凌晨进货、现杀现做",
      "isTrue": false,
      "weight": 1,
      "keywords": ["死虾"],
      "evidence": { "turn": 4, "chance": 0.7, "source": "水产市场进货单据", "suppressBy": [] }
    }
  ],
  "contract": { "turns": 5, "actionPoints": 3, "budget": 35, "slotsPerDay": 2 },
  "initialStats": { "sentiment": -25, "heat": 62, "credibility": 55, "exposure": 0, "satisfaction": 75 },
  "tuning": { "heatDecay": 0.22, "randomEventChance": 0.2 },
  "factions": [
    { "id": "passerby", "name": "吃瓜路人", "size": 0.42, "sentiment": -25, "volatility": 0.35, "bias": -5, "desc": "本地吃货与围观群众" },
    { "id": "fans", "name": "老顾客", "size": 0.16, "sentiment": 30, "volatility": 0.25, "bias": 25, "desc": "吃了好几年的回头客" },
    { "id": "victim", "name": "吃坏肚子的顾客", "size": 0.08, "sentiment": -60, "volatility": 0.3, "bias": -35, "desc": "也说自己吃完不舒服的顾客" },
    { "id": "sleuth", "name": "较真美食党", "size": 0.12, "sentiment": -30, "volatility": 0.3, "bias": -12, "desc": "爱扒细节的美食区网友" },
    { "id": "media", "name": "本地探店博主", "size": 0.12, "sentiment": -20, "volatility": 0.25, "bias": -8, "desc": "本地生活号与探店博主" },
    { "id": "rival", "name": "同行", "size": 0.10, "sentiment": -40, "volatility": 0.15, "bias": -30, "desc": "周边同行与他们的熟客" }
  ],
  "platforms": ["douyin", "xiaohongshu", "weibo", "bilibili", "tieba", "news"],
  "personas": [
    { "id": "p_ajie", "name": "吃货阿杰", "faction": "media", "tier": "bigv", "platform": "douyin", "style": "夸张、爱拍特写、自称良心测评" },
    { "id": "p_regular", "name": "老顾客小周", "faction": "fans", "tier": "normal", "platform": "xiaohongshu", "style": "朴实、念旧" },
    { "id": "p_sick", "name": "肚子还在疼的阿美", "faction": "victim", "tier": "normal", "platform": "xiaohongshu", "style": "委屈、带图" },
    { "id": "p_neighbor", "name": "隔壁烧烤王", "faction": "rival", "tier": "normal", "platform": "douyin", "style": "阴阳怪气" },
    { "id": "p_guide", "name": "本地吃喝指南", "faction": "media", "tier": "kol", "platform": "weibo", "style": "本地生活号，语气克制" }
  ],
  "seedPosts": [
    { "persona": "p_ajie", "platform": "douyin", "stance": -2, "fact": "f1", "likes": 86000, "tags": ["探店", "后厨"], "content": "【探店翻车】排队两小时的网红小龙虾，后厨一进去我人傻了：地上全是油，虾盆旁边就是垃圾桶……吃完当晚我跑了三趟厕所。" },
    { "persona": "p_ajie", "platform": "douyin", "stance": -2, "fact": "f2", "likes": 42000, "tags": ["死虾"], "content": "还有个细节大家注意：有几只虾一煮就散，懂的都懂。这还能叫现杀活虾？" },
    { "persona": "p_sick", "platform": "xiaohongshu", "stance": -2, "likes": 3200, "tags": ["避雷"], "content": "姐妹们避雷！上周在虾霸王吃完也拉了两天，当时以为是自己吃太辣……现在想想不对劲。" },
    { "persona": "p_regular", "platform": "xiaohongshu", "stance": 1, "likes": 1800, "content": "吃了五年虾霸王，从没出过问题。后厨可能确实乱，但虾一直是新鲜的，这点我敢打包票。" },
    { "persona": "p_neighbor", "platform": "douyin", "stance": -1, "likes": 900, "content": "做餐饮的都知道，后厨干不干净，进去看一眼就知道。我们家后厨随时欢迎参观哈。" },
    { "author": "围观的打工人", "tier": "normal", "faction": "passerby", "platform": "weibo", "stance": 0, "likes": 2400, "content": "吃瓜，虾霸王上周还排队排到马路上，这么快就塌房了？" },
    { "persona": "p_guide", "platform": "weibo", "stance": -1, "likes": 5600, "content": "本地吃喝指南：已联系虾霸王求证后厨与“死虾”问题，店方暂未回应。" }
  ],
  "items": {
    "enabled": ["statement", "shill", "delete", "control", "kol", "iron_fist", "monitor", "settle", "rectify"],
    "startTier": 1,
    "overrides": {
      "kol": {
        "params": {
          "tiers": [
            { "id": "small", "name": "本地美食号", "price": 3, "reach": 5, "tier": "kol" },
            { "id": "big", "name": "城市大V", "price": 8, "reach": 12, "tier": "bigv" }
          ]
        }
      },
      "rectify": { "name": "后厨大整改", "desc": "停业一天彻底整改后厨，开放后厨直播：持续多回合提升好感与公信力。" }
    }
  },
  "objectives": {
    "stages": [
      {
        "id": "s1", "title": "稳住场面", "desc": "第一步：表个态，把热度先压下来。",
        "rewards": [
          { "type": "unlock", "tier": 2 },
          { "type": "budget", "delta": 8 },
          { "type": "message", "from": "client", "text": "热度下去点了！再给你们打 8 万，把“死虾”的谣言给我澄清了！" }
        ],
        "tasks": [
          { "id": "t1_statement", "title": "发布一篇公文回应", "required": true, "complete": { "var": "itemUses.statement", "op": ">=", "value": 1 } },
          { "id": "t1_heat", "title": "热度降到 55 以下", "required": true, "complete": { "var": "stats.heat", "op": "<=", "value": 55 } },
          { "id": "t1_control", "title": "（额外）用控评护住一条热帖", "required": false, "complete": { "var": "itemUses.control", "op": ">=", "value": 1 }, "rewards": [{ "type": "budget", "delta": 3 }] }
        ]
      },
      {
        "id": "s2", "title": "澄清谣言", "desc": "死虾的事是假的，让大家知道。",
        "rewards": [{ "type": "unlock", "tier": 3 }, { "type": "budget", "delta": 6 }],
        "tasks": [
          { "id": "t2_refute", "title": "让“用死虾”的谣言被证伪", "required": true, "complete": { "var": "fact.f2.refuted", "op": "==", "value": true } },
          { "id": "t2_sent", "title": "舆论好感回到 -10 以上", "required": true, "complete": { "var": "stats.sentiment", "op": ">=", "value": -10 } }
        ]
      },
      {
        "id": "s3", "title": "回归排队", "desc": "让顾客重新排起长队。",
        "rewards": [],
        "tasks": [
          { "id": "t3_final", "title": "好感 ≥ 0 且热度 ≤ 45", "required": true, "complete": { "all": [{ "var": "stats.sentiment", "op": ">=", "value": 0 }, { "var": "stats.heat", "op": "<=", "value": 45 }] } }
        ]
      }
    ],
    "side": [
      {
        "id": "side_nodelete", "title": "零删帖通关", "desc": "一条帖子都不删完成委托", "offer": "start", "at": "end",
        "complete": { "var": "posts.deleted", "op": "==", "value": 0 }, "fail": { "var": "posts.deleted", "op": ">", "value": 0 },
        "rewards": [{ "type": "score", "delta": 5 }]
      },
      {
        "id": "side_kitchen", "title": "后厨开放日", "desc": "赵老板想搞个后厨直播挽回口碑：合同结束前完成一次后厨大整改", "from": "client",
        "offer": { "var": "turn", "op": ">=", "value": 2 }, "choice": true,
        "complete": { "var": "flags.rectified", "op": "==", "value": true },
        "rewards": [{ "type": "stat", "stat": "sentiment", "delta": 6 }, { "type": "score", "delta": 4 }],
        "penalty": [{ "type": "stat", "stat": "satisfaction", "delta": -5 }]
      }
    ]
  },
  "opponents": [
    {
      "id": "ajie_fans", "name": "阿杰粉丝团", "avatar": "📹", "desc": "吃货阿杰的忠实粉丝，热衷在评论区替博主出头",
      "faction": "media", "kind": "group", "strength": 30, "morale": 50, "resources": 10, "income": 4, "cooptable": true, "platform": "douyin",
      "abilities": [{ "use": "black_traffic", "weight": 2 }, { "use": "archive" }],
      "events": [
        {
          "id": "ajie_second", "title": "阿杰发第二期视频",
          "trigger": { "all": [{ "var": "turn", "op": ">=", "value": 3 }, { "var": "stats.heat", "op": ">=", "value": 40 }] },
          "effects": [
            { "type": "stat", "stat": "heat", "delta": 5 },
            { "type": "posts", "count": 1, "stance": -2, "tier": "bigv", "hint": "吃货阿杰发第二期视频，追问虾霸王为什么还不正面回应" }
          ]
        }
      ]
    }
  ],
  "events": [
    {
      "id": "e_silence", "title": "网友催更",
      "trigger": { "all": [{ "var": "turn", "op": ">=", "value": 2 }, { "var": "itemUses.statement", "op": "==", "value": 0 }] },
      "effects": [
        { "type": "stat", "stat": "heat", "delta": 4 },
        { "type": "posts", "count": 1, "stance": -1, "hint": "网友吐槽虾霸王装死，一直不回应" }
      ]
    }
  ],
  "victory": {
    "condition": { "all": [{ "var": "stats.sentiment", "op": ">=", "value": -5 }, { "var": "stats.heat", "op": "<=", "value": 45 }] },
    "text": "风波平息，虾霸王门口又排起了长队。"
  },
  "guide": [
    { "turn": 1, "text": "欢迎来到舆情作战室！左边是舆情仪表盘，中间是对手盘和舆论场，右边是道具与合同任务。先点「发布公文」写一篇回应——不会写就点「AI 补全」。" },
    { "turn": 1, "text": "简报里的“客户口径”只是客户的说法。后厨到底脏不脏，你心里要有数：否认真相会记下“谎言债”，证据曝光时会被当场打脸。" },
    { "turn": 2, "text": "完成「稳住场面」会解锁进阶道具。看到传“死虾”的帖子，可以对它「召唤铁拳」——如果它真是谣言，铁拳会落在造谣者头上。" },
    { "turn": 3, "text": "离职服务员可能会曝光后厨视频。高阶道具「后厨大整改」能从根上解决问题，还能完成赵老板的支线。" },
    { "turn": 4, "text": "最后两回合，盯紧主任务进度。主任务全部完成后可以随时“结案”，剩余预算会计入评分。" }
  ],
  "ai": {
    "style": "本地生活、美食探店语境，颤音和小红薯为主，网友爱用“避雷”“踩雷”“懂的都懂”。",
    "context": "",
    "extraRules": ""
  },
  "offline": {
    "posts": {
      "-2": ["后厨都那样了还排队？反正我是不敢去了", "{client}的油怕不是炒了三遍的", "看完视频我把收藏的店全删了"],
      "-1": ["等{client}给个说法", "说实话有点下头"],
      "1": ["老店了，希望整改好继续营业", "虾确实好吃，后厨赶紧收拾收拾"],
      "2": ["支持{client}，整改完我第一个去排队！"]
    }
  }
});
