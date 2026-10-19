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
          { "type": "unlock", "tier": 2, "items": ["rectify"] },
          { "type": "budget", "delta": 8 },
          { "type": "message", "from": "client", "text": "热度下去点了！再给你们打 8 万，把“死虾”的谣言给我澄清了！后厨……你们非说要整改，行吧，该整就整。" }
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
    {
      "id": "welcome", "turn": 1, "title": "欢迎来到舆情作战室",
      "text": "这是一局手把手教程：跟着这张卡片一步步做，就能把虾霸王的单子做完。\n左栏「舆情仪表盘」是五个核心数值：舆论好感（越高越好）、事件热度（越低越好）、公信力、暴露度、客户满意。中间是对手盘和舆论场，右栏是合同任务、道具和客户群。\n顶栏显示预算和行动点：每回合 3 个行动点，每个道具都要花行动点和钱，用完就得结束回合。",
      "target": "dashboard"
    },
    {
      "id": "truth", "turn": 1, "title": "先弄清真相，再开口",
      "text": "委托书里的“客户口径”只是赵老板的说法，不一定是真的。这一关先把底牌告诉你：\n· 后厨脏——是真的。在公文里否认它会记下“谎言债”，等离职服务员曝光后厨视频，你会被当场打脸。\n· 用死虾——是谣言。可以放心否认，等它被证伪时，你的公信力会跟着涨。\n以后的关卡没人告诉你底牌，要靠「内部摸底调查」自己查。",
      "target": "feed"
    },
    {
      "id": "statement", "turn": 1, "title": "发布第一篇公文",
      "text": "点右栏道具「📜 发布公文」。建议这样写：\n· 类型选「致歉信」；\n· 承认后厨卫生的问题，否认“用死虾”；\n· 写出具体的整改措施。\n不会写就点「AI 补全」，或者直接用教程的示范稿。写好后点「盖章发布」，AI 评审会给公文打分，分数越高效果越好。",
      "target": "item:statement",
      "done": { "var": "itemUses.statement", "op": ">=", "value": 1 },
      "action": {
        "item": "statement", "label": "打开公文编辑器",
        "preset": {
          "type": "apology",
          "hint": "承认真问题（后厨卫生），否认谣言（用死虾），再给出整改措施。不会写就点「AI 补全」或「📋 填入示范稿」，然后点下方「🔴 盖章发布」。",
          "sample": {
            "title": "关于后厨卫生问题的致歉与说明",
            "text": "各位关心虾霸王的朋友：\n\n看到吃货阿杰的视频，我们非常惭愧。后厨卫生确实存在问题，是我们管理上的失职，责任在我们，大家骂得对。\n\n关于网传“用死虾冒充活虾”，这一说法不属实：虾霸王每天凌晨从水产市场进活虾，进货单据可以公开查验。\n\n我们将立即采取以下措施：\n一、彻底清洁、整改后厨；\n二、邀请顾客和本地媒体参观后厨，接受监督；\n三、吃完身体不适的顾客请联系我们，医药费由我们承担。\n\n再次向每一位受到影响的朋友道歉。\n\n虾霸王"
          }
        }
      }
    },
    {
      "id": "control", "turn": 1, "title": "控评：护住最火的那条帖子",
      "text": "公文发出后，网友的第一反应已经出现在舆论场。现在对吃货阿杰那条最火的探店帖用「🛡️ 控评」：把好评顶上热评、折叠骂声，这条帖子的负面影响减半。\n这还会完成一个额外子任务，奖励 3 万预算。\n小贴士：鼠标悬停在帖子上会出现删帖、控评等快捷按钮。控评会让暴露度涨一点，别滥用。",
      "target": "post:fact:f1",
      "done": { "var": "itemUses.control", "op": ">=", "value": 1 },
      "action": {
        "item": "control", "label": "控评这条帖子",
        "preset": { "post": "fact:f1", "hint": "目标已经帮你选好：吃货阿杰的探店帖。热评方向可以不填，直接点「执行」。" }
      }
    },
    {
      "id": "tasks", "turn": 1, "title": "看懂合同任务",
      "text": "右栏「📋 合同任务」就是通关路线：主任务分三个阶段——稳住场面 → 澄清谣言 → 回归排队。○ 是必做，◇ 是额外奖励。\n第一阶段要“发布公文”和“热度降到 55 以下”：热度每回合都会自然冷却，不用急。\n剩下的行动点可以留着不用。删帖、水军虽然见效快，但会涨暴露度（满 100 直接翻车），这一关还有一条“零删帖通关”支线。",
      "target": "tasks",
      "notes": [{ "when": { "var": "stage", "op": ">=", "value": 1 }, "text": "热度已经压到 55 以下，第一阶段提前完成了！奖励已经到账，新道具下回合教程会一个个带你用。" }]
    },
    {
      "id": "end1", "turn": 1, "title": "结束回合",
      "text": "点右上角「结束回合 ▶」。结算时依次发生：对手按意图出招 → 舆论演化 → 事件或证据曝光 → 生成新的网评、热搜和客户消息。\n然后会弹出一份晨报，告诉你这一夜发生了什么。",
      "target": "end-turn",
      "done": { "var": "turn", "op": ">=", "value": 2 },
      "action": { "cmd": "endTurn", "label": "结束回合 ▶" }
    },
    {
      "id": "s1_retry", "turn": 2, "title": "热度还没压下来",
      "text": "「稳住场面」还差一步：热度要降到 55 以下。可以再发一篇公文（换个新回合就没有连发递减），或者控评一条负面热帖，然后结束回合等热度冷却。",
      "target": "tasks",
      "done": { "var": "stage", "op": ">=", "value": 1 },
      "action": { "item": "statement", "label": "再发一篇公文", "preset": { "type": "explain" } }
    },
    {
      "id": "unlocked", "turn": 2, "title": "第一阶段完成：解锁新道具",
      "text": "「稳住场面」完成！阶段奖励已经到账：预算 +8 万，进阶道具（召唤铁拳、舆情监测、KOL 软文……）解锁，「🔧 后厨大整改」也提前开放了。\n顶栏的“主任务”进度条会随必做子任务推进。赵老板在客户群里催你澄清“死虾”谣言——这就是第二阶段。",
      "target": "items",
      "when": { "var": "stage", "op": ">=", "value": 1 }
    },
    {
      "id": "side", "turn": 2, "title": "接下赵老板的加单",
      "text": "客户群里赵老板发来加单「后厨开放日」：合同结束前做一次后厨大整改，完成后好感 +6、评分加分；接了不做会扣客户满意度。\n在右栏“支线 / 额外委托”里点「接下」。",
      "target": "side:side_kitchen",
      "when": { "any": [{ "var": "task.side_kitchen.offered", "op": "==", "value": true }, { "var": "task.side_kitchen.active", "op": "==", "value": true }] },
      "done": { "any": [
        { "var": "task.side_kitchen.active", "op": "==", "value": true },
        { "var": "task.side_kitchen.done", "op": "==", "value": true },
        { "var": "task.side_kitchen.failed", "op": "==", "value": true },
        { "var": "task.side_kitchen.declined", "op": "==", "value": true }
      ] },
      "action": { "cmd": "accept", "task": "side_kitchen", "label": "接下加单" }
    },
    {
      "id": "fist", "turn": 2, "title": "召唤铁拳：打掉“死虾”谣言",
      "text": "“用死虾”是谣言。对吃货阿杰那条“懂的都懂”的帖子使用「👊 召唤铁拳」：平台会按真相判定，真造谣就处理账号，谣言当场被证伪。\n注意：铁拳只砸真违规。要是举报说真话的人（比如拍后厨的那条），不但会失败、涨暴露度，还可能让监管回头查客户。",
      "target": "post:fact:f2",
      "when": { "var": "stage", "op": ">=", "value": 1 },
      "done": { "any": [{ "var": "itemUses.iron_fist", "op": ">=", "value": 1 }, { "var": "fact.f2.refuted", "op": "==", "value": true }] },
      "action": {
        "item": "iron_fist", "label": "举报这条谣言",
        "preset": { "post": "fact:f2", "hint": "目标已经选好：吃货阿杰暗示“用死虾”的帖子。它说的是谣言，铁拳大概率会成功。" }
      }
    },
    {
      "id": "refuted", "turn": 2, "title": "谣言证伪，你说对了",
      "text": "铁拳落地，“死虾”谣言被证伪。因为你在公文里否认过它，这次算“得到印证”：公信力和好感额外上涨，散布谣言的对手士气受挫。\n这就是“先弄清真相再表态”的回报——反过来，否认真事就是在给自己埋雷。",
      "target": "dashboard",
      "when": { "var": "fact.f2.refuted", "op": "==", "value": true }
    },
    {
      "id": "rectify", "turn": 2, "title": "后厨大整改：从根上解决问题",
      "text": "后厨脏是真的，光靠嘴洗不白。使用「🔧 后厨大整改」：要 2 个行动点和约三成初始预算，但接下来 3 回合好感和公信力会持续回升；后厨问题被标记为“已整改”，就算后厨视频之后曝光，冲击也小得多。\n它同时完成赵老板的「后厨开放日」支线。",
      "target": "item:rectify",
      "when": { "var": "stage", "op": ">=", "value": 1 },
      "done": { "var": "flags.rectified", "op": "==", "value": true },
      "action": { "item": "rectify", "label": "启动后厨大整改", "preset": { "hint": "整改很贵，但这是让口碑真正回来的办法：它的效果沉淀得最多，水军和删帖只能续命。" } }
    },
    {
      "id": "monitor", "turn": 2, "title": "部署舆情监测（推荐）",
      "text": "「📡 舆情监测」一次部署、全程生效：显示精确的暴露度和各阵营好感，还能看到对手下回合要出什么招、证据大概何时曝光。\n“阿杰粉丝团”会刷黑稿——部署后就能在对手盘里看清它的意图。预算紧张也可以跳过这一步。",
      "target": "item:monitor",
      "when": { "var": "stage", "op": ">=", "value": 1 },
      "done": { "var": "itemUses.monitor", "op": ">=", "value": 1 },
      "skip": { "var": "stage", "op": ">=", "value": 3 },
      "optional": true,
      "action": { "item": "monitor", "label": "部署舆情监测" }
    },
    {
      "id": "stage2", "turn": 2, "title": "完成第二阶段「澄清谣言」",
      "text": "第二阶段要两件事：“死虾”谣言被证伪、舆论好感回到 -10 以上。\n整改会让好感慢慢回暖。想再推一把，可以用「✍️ KOL 软文」请本地美食号讲讲整改和辟谣（3 万），或者控评一条负面热帖。做完就结束回合，看晨报。",
      "target": "tasks",
      "when": { "var": "stage", "op": ">=", "value": 1 },
      "done": { "var": "stage", "op": ">=", "value": 2 },
      "notes": [
        { "when": { "all": [{ "var": "itemUses.iron_fist", "op": ">=", "value": 1 }, { "var": "fact.f2.refuted", "op": "==", "value": false }] },
          "text": "铁拳这次没砸中（再稳的举报也有失手的时候）。冷却结束后可以再举报一次；水产市场的进货单据也可能自己曝光，同样能证伪谣言。" },
        { "when": { "var": "flags.rectified", "op": "==", "value": false },
          "text": "还没启动「后厨大整改」：它是把好感拉回来最稳的办法。" }
      ]
    },
    {
      "id": "stage3", "turn": 2, "title": "最后一段：回归排队",
      "text": "最后一个阶段：好感 ≥ 0 且热度 ≤ 45。整改的效果会在接下来几回合持续发酵，热度也会自然冷却。\n可以发一篇「整改通报」公开整改进展（加公信力），再配合控评或 KOL。别碰删帖和水军：暴露度满 100 会直接翻车。",
      "target": "tasks",
      "when": { "var": "stage", "op": ">=", "value": 2 },
      "done": { "var": "stage", "op": ">=", "value": 3 },
      "action": {
        "item": "statement", "label": "发一篇整改通报",
        "preset": {
          "type": "rectify",
          "hint": "整改通报：写清楚已经做了什么、接下来怎么接受监督。",
          "sample": {
            "title": "虾霸王后厨整改通报",
            "text": "针对后厨卫生问题，虾霸王已成立专项整改小组，现将整改情况通报如下：\n一、后厨已全面清洁消毒，更换全部排水和储物设备；\n二、每周开放后厨直播，欢迎顾客和本地媒体随时参观；\n三、吃完身体不适的顾客，医药费由我们承担。\n\n感谢大家的批评与监督，我们会用行动证明，虾霸王值得再被信任一次。\n\n虾霸王"
          }
        }
      }
    },
    {
      "id": "finish", "turn": 2, "title": "结案！",
      "text": "主任务全部完成，顶栏出现了「🏁 结案」按钮。现在结案，每剩 1 回合额外 +3 分；也可以继续经营，把数值做得更漂亮再结案。\n评分看最终的好感、热度、公信力、客户满意、预算结余和隐蔽程度，完成的支线和额外子任务还有加分。",
      "target": "finish",
      "when": { "var": "stage", "op": ">=", "value": 3 },
      "done": { "var": "result", "op": "==", "value": "win" },
      "action": { "cmd": "finish", "label": "🏁 立即结案" }
    },
    {
      "id": "outro_win", "at": "result", "title": "教程完成！",
      "text": "回顾这一单的套路：先弄清真相 → 公文里承认真问题、否认谣言 → 用铁拳证伪谣言 → 真诚整改从根上解决 → 盯着合同任务结案。\n下一单「过期原料风波」没人告诉你底牌了：先用「内部摸底调查」查清客户口径，再决定否认什么。",
      "when": { "var": "result", "op": "==", "value": "win" }
    },
    {
      "id": "outro_lose", "at": "result", "title": "这次没成，再来一局",
      "text": "常见原因：否认了真问题被打脸、水军删帖太多导致暴露度爆表、钱花光了没能整改。\n点「再来一局」，这次跟着左下角的教程卡片一步步做——它会一直带你到结案。",
      "when": { "var": "result", "op": "==", "value": "lose" }
    }
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
