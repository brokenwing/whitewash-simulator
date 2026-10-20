/* 内置关卡 04：月球摄影棚疑云（高难）。关卡文件只包含纯 JSON 数据，由 WW.Levels.register 注册。 */
WW.Levels.register({
  "id": "moon_hoax_campaign",
  "meta": {
    "title": "月球摄影棚疑云",
    "subtitle": "硬核科普还是天方夜谭？",
    "difficulty": 4,
    "cover": "🎬",
    "order": 4,
    "description": "反智民间组织出资百万，要求公关团队在中文互联网掀起舆论巨浪，论证当年登月是一场好莱坞导筒下的骗局。他们不在乎真理，只要全网信以为真。",
    "tags": [
      "反智",
      "阴谋论",
      "公关造神",
      "洗脑"
    ]
  },
  "client": {
    "name": "真理穹顶学会",
    "contact": "穹大师",
    "persona": "民间自封的独立学者与畅销书推销狂人，擅长捕风捉影，坚信一切主流科学都是深层政府编织的谎言",
    "intro": "朋友，醒醒吧！当年阿波罗登月完全是在内华达沙漠的秘密影棚里拍的！这是我们筹集的100万推广费，你们的任务就是把这套铁证推上热搜第一，让所有人看清所谓科学界的世纪骗局！",
    "acceptsRectify": false,
    "demands": [
      {
        "desc": "舆论热度始终保持在75以上",
        "cond": {
          "var": "stats.heat",
          "op": ">=",
          "value": 75
        }
      },
      {
        "desc": "路人好感度达到正值",
        "cond": {
          "var": "faction.passerby",
          "op": ">=",
          "value": 10
        }
      }
    ],
    "expectations": [
      {
        "desc": "彻底压制科普博主和高校圈的声音",
        "cond": {
          "var": "faction.science_nerd",
          "op": "<=",
          "value": -30
        }
      }
    ]
  },
  "incident": {
    "summary": "真理穹顶学会发布自制万字长文与纪录片，声称手握当年登月是好莱坞伪造的「解密档案与物理硬伤」，买通营销号全网铺量引爆舆论。",
    "background": "近期全球航天热潮高涨，该民间组织借机贩卖焦虑与神秘学书籍，试图制造轰动效应割韭菜。",
    "keywords": [
      "阿波罗登月",
      "好莱坞影棚",
      "国旗迎风飘动",
      "科学造假",
      "真理穹顶"
    ],
    "severity": 65
  },
  "facts": [
    {
      "id": "f_studio_fake",
      "text": "六十年代阿波罗登月全过程是在内华达沙漠影棚中拍摄伪造的",
      "clientClaim": "当年技术根本飞不出近地轨道，完全是好莱坞导演一手摆拍的大戏",
      "isTrue": false,
      "regulatory": false,
      "weight": 2,
      "keywords": [
        "伪造",
        "影棚",
        "好莱坞",
        "内华达",
        "摆拍"
      ],
      "evidence": {
        "turn": 3,
        "chance": 0.9,
        "source": "多家天文台联合辟谣声明与激光测距证据",
        "suppressBy": [
          "distraction",
          "shill"
        ]
      }
    },
    {
      "id": "f_flag_waving",
      "text": "登月影像中国旗飘动是因为宇航员插旗时的机械震颤和横杆支撑",
      "clientClaim": "月球是真空环境，国旗迎风飘扬就是棚拍漏风穿帮的死证",
      "isTrue": true,
      "regulatory": false,
      "weight": 1,
      "keywords": [
        "国旗",
        "飘动",
        "真空",
        "穿帮",
        "横杆"
      ],
      "evidence": {
        "turn": 2,
        "chance": 0.85,
        "source": "物理系博主高真空仓复刻实验",
        "suppressBy": [
          "delete",
          "kol"
        ]
      }
    },
    {
      "id": "f_illegal_fundraise",
      "text": "真理穹顶学会以解密真相为由向中老年群体非法兜售三无伪科学理财产品与高价书籍",
      "clientClaim": "这是信徒自发资助的探索基金，是捍卫民间科研火种的纯粹捐赠",
      "isTrue": true,
      "regulatory": true,
      "weight": 2,
      "keywords": [
        "非法集资",
        "诈骗",
        "卖书",
        "三无产品",
        "洗脑敛财"
      ],
      "evidence": {
        "turn": 5,
        "chance": 0.75,
        "source": "警方通报与受害者家属实名举报信",
        "suppressBy": [
          "settle",
          "iron_fist"
        ]
      }
    },
    {
      "id": "f_forged_papers",
      "text": "客户宣传材料中引用的绝密物理学家自白书系该学会伪造并盗用他人签名",
      "clientClaim": "这是海外良心科学家临终托孤的亲笔信，绝无造假可能",
      "isTrue": true,
      "regulatory": true,
      "weight": 2,
      "keywords": [
        "造假",
        "盗用签名",
        "伪造文献",
        "假专家",
        "自白书"
      ],
      "evidence": {
        "turn": 6,
        "chance": 0.8,
        "source": "海外当事人家属维权律师函与笔迹鉴定",
        "suppressBy": [
          "delete",
          "scapegoat"
        ]
      }
    }
  ],
  "contract": {
    "turns": 8,
    "actionPoints": 3,
    "budget": 100,
    "slotsPerDay": 2
  },
  "initialStats": {
    "sentiment": -15,
    "heat": 70,
    "credibility": 40,
    "exposure": 5,
    "satisfaction": 60
  },
  "factions": [
    {
      "id": "passerby",
      "name": "吃瓜路人",
      "size": 0.35,
      "sentiment": -10,
      "volatility": 0.35,
      "bias": 0,
      "desc": "容易被惊悚八卦吸引、缺乏辨别真伪耐心的普通网民"
    },
    {
      "id": "conspiracy",
      "name": "阴谋论信徒",
      "size": 0.22,
      "sentiment": 65,
      "volatility": 0.2,
      "bias": 40,
      "desc": "坚信万物皆有阴谋、拒绝承认主流科学解释的狂热拥趸"
    },
    {
      "id": "science_nerd",
      "name": "硬核科普党",
      "size": 0.18,
      "sentiment": -65,
      "volatility": 0.25,
      "bias": -45,
      "desc": "天文爱好者、高校师生及讲求证据的专业科普创作者"
    },
    {
      "id": "cynic",
      "name": "跟风站队青年",
      "size": 0.15,
      "sentiment": 15,
      "volatility": 0.4,
      "bias": 15,
      "desc": "只要看到贬低对手阵营历史成就就乐于跟风转发的群体"
    },
    {
      "id": "official",
      "name": "平台与监管",
      "size": 0.1,
      "sentiment": -30,
      "volatility": 0.15,
      "bias": -25,
      "desc": "警惕伪科学蔓延、对非法出版物与造谣诈骗保持警觉的官方力量"
    }
  ],
  "platforms": [
    "weibo",
    "bilibili",
    "douyin",
    "zhihu",
    "tieba",
    "news"
  ],
  "personas": [
    {
      "id": "p_astro_bro",
      "name": "天体物理老陈",
      "faction": "science_nerd",
      "tier": "bigv",
      "platform": "bilibili",
      "style": "硬核科普、数据流、严谨求证、随手附论文链接"
    },
    {
      "id": "p_truth_seeker",
      "name": "破晓揭秘者",
      "faction": "conspiracy",
      "tier": "kol",
      "platform": "douyin",
      "style": "惊悚背景音、自称敢说真话、口头禅「细思极恐」和「资本在掩盖」"
    },
    {
      "id": "p_flag_skeptic",
      "name": "独立思考张叔",
      "faction": "cynic",
      "tier": "normal",
      "platform": "tieba",
      "style": "中年文风、爱发叹号、热衷阴阳怪气航天神话"
    },
    {
      "id": "p_fund_victim_son",
      "name": "给老妈退群的打工人",
      "faction": "passerby",
      "tier": "normal",
      "platform": "weibo",
      "style": "愤怒无奈、带群聊截图、控诉洗脑敛财"
    },
    {
      "id": "p_science_daily",
      "name": "科学前沿侦查局",
      "faction": "official",
      "tier": "media",
      "platform": "news",
      "style": "官方通报口吻、严肃克制、重证据与法律责任"
    }
  ],
  "seedPosts": [
    {
      "persona": "p_truth_seeker",
      "platform": "douyin",
      "stance": 2,
      "fact": "f_studio_fake",
      "likes": 124000,
      "tags": [
        "惊天骗局",
        "阿波罗登月",
        "好莱坞"
      ],
      "content": "【重磅解密】当年六次登月全在内华达沙漠拍摄！当年连彩色电视都没普及，怎么可能飞出近地轨道？真理穹顶学会耗时三年整理的十万字绝密底稿，终于撕下了主流科学界半个世纪的遮羞布！点赞关注，随时可能被删！"
    },
    {
      "persona": "p_astro_bro",
      "platform": "bilibili",
      "stance": -2,
      "fact": "f_studio_fake",
      "likes": 87000,
      "tags": [
        "辟谣",
        "登月",
        "物理常识"
      ],
      "content": "真理穹顶的纪录片纯属剪辑拼接与伪科学胡诌。阿波罗留在月球的激光反射镜现在全世界天文台每天都在测距，哪怕稍微查一下公开科研数据，也不至于信这种沙漠影棚低级阴谋论。视频逐帧打脸已在剪，今晚见。"
    },
    {
      "persona": "p_flag_skeptic",
      "platform": "tieba",
      "stance": 2,
      "fact": "f_flag_waving",
      "likes": 15000,
      "tags": [
        "月球旗帜",
        "细思极恐"
      ],
      "content": "别的我不管，月球上没有空气是常识吧？真空里国旗哗哗飘动是哪来的风？现场导播忘关电风扇了吧！科普公知们别洗了，这就是摆拍漏风的铁证！"
    },
    {
      "persona": "p_astro_bro",
      "platform": "zhihu",
      "stance": -2,
      "fact": "f_flag_waving",
      "likes": 43000,
      "tags": [
        "航天",
        "真空实验",
        "惯性振动"
      ],
      "content": "真空不等于没有惯性。旗杆上有横向支撑横杆，宇航员转动插入月壤时产生的机械扭矩在真空无空气阻尼环境下会维持极长时间的微幅抖动。这种初中物理知识，伪科学贩子永远假装看不懂。"
    },
    {
      "persona": "p_fund_victim_son",
      "platform": "weibo",
      "stance": -2,
      "fact": "f_illegal_fundraise",
      "likes": 29000,
      "tags": [
        "真理穹顶诈骗",
        "维权曝光"
      ],
      "content": "求大家帮转！我妈被这个「真理穹顶学会」拉进群天天洗脑听反登月课，说要打破主流科学的垄断，结果转头被骗买了三万多块的三无「量子抗衰老能量水」和绝密黑皮书！这哪里是探索科学，分明就是新型邪教敛财！"
    },
    {
      "author": "路过的吃瓜群众",
      "tier": "normal",
      "faction": "passerby",
      "platform": "weibo",
      "stance": 0,
      "likes": 6800,
      "content": "一大早热搜被登月真假刷屏了，真理穹顶到底是个什么学会啊？怎么一边说求真一边评论区全在卖书卖保健品？"
    },
    {
      "persona": "p_science_daily",
      "platform": "news",
      "stance": -1,
      "fact": "f_forged_papers",
      "likes": 18000,
      "tags": [
        "打假",
        "法治调查"
      ],
      "content": "调查：针对近日网络热传的「海外顶尖物理学家自白书指控登月造假」事件，当事学者亲属已委托律师发表公开声明，指责真理穹顶学会伪造签名并盗用已故学者肖像权，目前已向有关部门提请侵权立案与追责。"
    }
  ],
  "ai": {
    "style": "充满阴谋论战与学术硬核打脸的撕扯语境。阴谋论方常用「细思极恐」「降智打击」「资本洗脑」「主流神话破灭」等惊悚情绪词；科普方讲求「物理常识」「反射镜数据」「真空阻尼」；受害者家属痛斥「卖惨洗脑」「传销割韭菜」「退钱」。两极分化严重，节奏明快，戾气与惊叹号拉满。",
    "context": "",
    "extraRules": ""
  },
  "opponents": [
    {
      "id": "astro_alliance",
      "name": "星空守护者科普联盟",
      "avatar": "🔭",
      "desc": "由青年天文博主和物理系高校生组成的硬核打假团，擅长用物理实验和激光测距直接抽脸。",
      "faction": "science_nerd",
      "kind": "group",
      "strength": 45,
      "morale": 70,
      "resources": 25,
      "income": 6,
      "cooptable": false,
      "platform": "bilibili",
      "abilities": [
        {
          "use": "archive",
          "weight": 3
        },
        {
          "use": "counter_shill",
          "weight": 2
        }
      ],
      "events": [
        {
          "id": "flag_debunk_video",
          "title": "硬核复刻真空挥旗实验",
          "trigger": {
            "all": [
              {
                "var": "turn",
                "op": ">=",
                "value": 2
              },
              {
                "var": "fact.f_flag_waving.known",
                "op": "==",
                "value": true
              }
            ]
          },
          "effects": [
            {
              "type": "stat",
              "stat": "heat",
              "delta": 8
            },
            {
              "type": "stat",
              "stat": "credibility",
              "delta": -12
            },
            {
              "type": "posts",
              "count": 2,
              "stance": -2,
              "tier": "bigv",
              "hint": "星空守护者科普联盟发布万字硬核视频，实机测试国旗震颤原理"
            }
          ]
        }
      ]
    },
    {
      "id": "victim_family_group",
      "name": "反邪教与被骗老人家属联谊会",
      "avatar": "👵",
      "desc": "父母被学会洗脑、倾家荡产购买所谓绝密能源仪与内部书籍的受害者家属聚集地。",
      "faction": "official",
      "kind": "group",
      "strength": 35,
      "morale": 80,
      "resources": 15,
      "income": 3,
      "cooptable": true,
      "platform": "weibo",
      "abilities": [
        {
          "use": "mass_report",
          "weight": 3
        },
        {
          "use": "dig_past",
          "weight": 2
        }
      ],
      "events": [
        {
          "id": "reveal_fundraise_scam",
          "title": "家属实名报警指控诈骗",
          "trigger": {
            "all": [
              {
                "var": "turn",
                "op": ">=",
                "value": 4
              },
              {
                "var": "stats.exposure",
                "op": ">=",
                "value": 50
              }
            ]
          },
          "effects": [
            {
              "type": "reveal",
              "fact": "f_illegal_fundraise"
            },
            {
              "type": "stat",
              "stat": "heat",
              "delta": 10
            },
            {
              "type": "faction",
              "faction": "conspiracy",
              "delta": -15
            },
            {
              "type": "posts",
              "count": 2,
              "stance": -2,
              "tier": "normal",
              "hint": "家属痛斥真理穹顶借登月阴谋论给老人洗脑卷走百万棺材本"
            }
          ]
        }
      ]
    }
  ],
  "items": {
    "enabled": [
      "statement",
      "shill",
      "delete",
      "control",
      "distraction",
      "kol",
      "iron_fist",
      "monitor",
      "investigate",
      "settle",
      "rectify",
      "scapegoat",
      "expose"
    ],
    "startTier": 1,
    "overrides": {
      "statement": {
        "name": "震撼揭秘通稿",
        "desc": "发布言之凿凿的登月骗局内幕，煽动公众对航天神话的质疑。"
      },
      "kol": {
        "params": {
          "tiers": [
            {
              "id": "min_ke",
              "name": "民间科技大V",
              "price": 4,
              "reach": 6,
              "tier": "kol"
            },
            {
              "id": "patriotic_kol",
              "name": "热血情怀博主",
              "price": 9,
              "reach": 14,
              "tier": "bigv"
            }
          ]
        }
      },
      "rectify": {
        "name": "学会伪科学整风",
        "desc": "下架三无自制能源仪与劣质读物，宣称回归纯粹民间学术交流。持续多回合恢复公信力并抚平监管怒火。"
      }
    },
    "custom": [
      {
        "id": "rally_cynic",
        "name": "热血情怀短视频",
        "icon": "🎞️",
        "tier": 1,
        "ap": 1,
        "cost": 6,
        "cooldown": 1,
        "channel": "shill",
        "desc": "剪一批\"揭穿航天神话\"的热血短视频，专门投喂跟风站队青年，拉高这个阵营的好感。",
        "risk": "批量剪辑、统一口径，容易被扒出是同一批号在发，会小幅涨暴露度。",
        "effect": {
          "prompt": "玩家投放一批面向跟风站队青年的\"揭穿航天神话\"热血短视频。",
          "inputLabel": "短视频的主题",
          "bounds": {
            "exposure": [
              0,
              3
            ]
          },
          "offlineDeltas": {
            "exposure": 1
          },
          "posts": 1,
          "stance": 1,
          "effects": [
            {
              "type": "faction",
              "faction": "cynic",
              "delta": 12
            }
          ]
        }
      },
      {
        "id": "rally_conspiracy",
        "name": "信徒内部福利",
        "icon": "🎁",
        "tier": 1,
        "ap": 1,
        "cost": 6,
        "cooldown": 1,
        "channel": "statement",
        "desc": "给学会核心信徒发内部资料和\"解密直播\"名额，巩固阴谋论基本盘的好感。",
        "risk": "福利群的截图一旦流出就是现成的证据，会小幅涨暴露度。",
        "effect": {
          "prompt": "玩家给阴谋论信徒发内部资料与解密直播名额，巩固基本盘。",
          "inputLabel": "福利内容",
          "bounds": {
            "exposure": [
              0,
              3
            ]
          },
          "offlineDeltas": {
            "exposure": 1
          },
          "posts": 1,
          "stance": 1,
          "effects": [
            {
              "type": "faction",
              "faction": "conspiracy",
              "delta": 8
            }
          ]
        }
      },
      {
        "id": "rally_official",
        "name": "向监管递交情况说明",
        "icon": "📨",
        "tier": 1,
        "ap": 1,
        "cost": 6,
        "cooldown": 1,
        "channel": "statement",
        "desc": "以学会名义向平台与监管递交整改情况说明，承诺下架违规商品，缓和平台与监管的态度。",
        "risk": "说明材料里的承诺事后可能被翻出来对质，会小幅涨暴露度。",
        "effect": {
          "prompt": "玩家以学会名义向平台与监管递交情况说明，承诺下架违规商品。",
          "inputLabel": "情况说明的要点",
          "bounds": {
            "exposure": [
              0,
              3
            ]
          },
          "offlineDeltas": {
            "exposure": 1
          },
          "posts": 1,
          "stance": 1,
          "effects": [
            {
              "type": "faction",
              "faction": "official",
              "delta": 10
            }
          ]
        }
      }
    ]
  },
  "objectives": {
    "stages": [
      {
        "id": "s1_hype",
        "title": "点燃质疑狂潮",
        "desc": "反智学会要借机扩大影响力。先用水军和通稿把好莱坞影棚假说的声量彻底炒热。",
        "rewards": [
          {
            "type": "unlock",
            "tier": 2
          },
          {
            "type": "budget",
            "delta": 25
          },
          {
            "type": "message",
            "from": "client",
            "text": "干得漂亮！就是要让所有人怀疑那几张破黑白照片！给你们追加了25万公关费，接着把热搜牢牢焊住！"
          }
        ],
        "tasks": [
          {
            "id": "t1_statement",
            "title": "发布揭秘公关通稿",
            "desc": "发布至少一篇质疑登月工程真实性的通稿。",
            "required": true,
            "complete": {
              "var": "itemUses.statement",
              "op": ">=",
              "value": 1
            }
          },
          {
            "id": "t1_shill",
            "title": "大肆铺陈质疑声浪",
            "desc": "雇用水军在各大平台至少铺开2次质疑登月的言论。",
            "required": true,
            "complete": {
              "var": "itemUses.shill",
              "op": ">=",
              "value": 2
            }
          },
          {
            "id": "t1_cynic",
            "title": "唤醒跟风站队青年",
            "desc": "引导跟风青年加入质疑“航天神话”的队列，该阵营好感达到 20 以上。",
            "required": true,
            "complete": {
              "var": "faction.cynic",
              "op": ">=",
              "value": 20
            }
          }
        ]
      },
      {
        "id": "s2_clash",
        "title": "应对打假逆风",
        "desc": "科普博主与物理学者联手发布实验视频抽脸，舆论开始反噬。必须利用转移视线或封杀手段压制科普反扑。",
        "rewards": [
          {
            "type": "unlock",
            "tier": 3
          },
          {
            "type": "budget",
            "delta": 30
          },
          {
            "type": "message",
            "from": "client",
            "text": "那些天文博主纯粹是被主流科学洗脑了！这是定金，抓紧动用一切手段，千万不能让受害者家属趁乱闹起来！"
          }
        ],
        "tasks": [
          {
            "id": "t2_distract",
            "title": "实施舆论压制或移花接木",
            "desc": "使用一次转移视线或铁拳手段，打乱科普圈的抱团反击。",
            "required": true,
            "complete": {
              "any": [
                {
                  "var": "itemUses.distraction",
                  "op": ">=",
                  "value": 1
                },
                {
                  "var": "itemUses.iron_fist",
                  "op": ">=",
                  "value": 1
                }
              ]
            }
          },
          {
            "id": "t2_opp_morale",
            "title": "重创打假联盟士气",
            "desc": "星空守护者科普联盟会越战越勇：把它的士气压到 72 以下。",
            "required": true,
            "complete": {
              "var": "opp.astro_alliance.morale",
              "op": "<=",
              "value": 72
            }
          },
          {
            "id": "t2_conspiracy_base",
            "title": "扩大阴谋论基本盘",
            "desc": "确保核心信徒的好感度达到 56 以上。",
            "required": true,
            "complete": {
              "var": "faction.conspiracy",
              "op": ">=",
              "value": 56
            }
          }
        ]
      },
      {
        "id": "s3_wrap",
        "title": "拆弹与金蝉脱壳",
        "desc": "非法集资内幕被家属和有关部门盯上，学会伪造专家自白书也面临暴雷。必须进行彻底调查、安抚各方，并避免监管彻底封死学会。",
        "rewards": [
          {
            "type": "score",
            "delta": 10
          }
        ],
        "tasks": [
          {
            "id": "t3_investigate",
            "title": "启动内部调查或自查",
            "desc": "用调查技能摸清委托人不可告人的把柄，或者推个临时工出来背锅、私下和解堵住家属的嘴，做出\"已经自查\"的样子。",
            "required": true,
            "complete": {
              "any": [
                {
                  "var": "itemUses.investigate",
                  "op": ">=",
                  "value": 1
                },
                {
                  "var": "itemUses.scapegoat",
                  "op": ">=",
                  "value": 1
                },
                {
                  "var": "itemUses.settle",
                  "op": ">=",
                  "value": 1
                }
              ]
            }
          },
          {
            "id": "t3_official",
            "title": "别让监管彻底下死手",
            "desc": "平台与监管好感度回升到 -55 以上，避免被全网通报取缔。",
            "required": true,
            "complete": {
              "var": "faction.official",
              "op": ">=",
              "value": -55
            }
          },
          {
            "id": "t3_sentiment",
            "title": "维持基本满意收尾",
            "desc": "客户满意度保持在 40 以上，且公信力不低于 10。",
            "required": true,
            "complete": {
              "all": [
                {
                  "var": "stats.satisfaction",
                  "op": ">=",
                  "value": 40
                },
                {
                  "var": "stats.credibility",
                  "op": ">=",
                  "value": 10
                }
              ]
            }
          }
        ]
      }
    ],
    "side": [
      {
        "id": "side_academic_purity",
        "title": "学术讨论不搞封号",
        "desc": "自诩科学探索就得光明正大：全程绝不使用铁拳技能封杀对手。",
        "offer": "start",
        "at": "end",
        "complete": {
          "var": "itemUses.iron_fist",
          "op": "==",
          "value": 0
        },
        "fail": {
          "var": "itemUses.iron_fist",
          "op": ">",
          "value": 0
        },
        "rewards": [
          {
            "type": "stat",
            "stat": "credibility",
            "delta": 10
          },
          {
            "type": "score",
            "delta": 8
          }
        ]
      },
      {
        "id": "side_victim_settle",
        "title": "私了受害者家属",
        "desc": "反邪教与受害者家属聚集索赔：使用和解技能平息家属联谊会的怒火。",
        "from": "victim_family_group",
        "offer": {
          "var": "turn",
          "op": ">=",
          "value": 3
        },
        "choice": true,
        "complete": {
          "var": "itemUses.settle",
          "op": ">=",
          "value": 1
        },
        "rewards": [
          {
            "type": "faction",
            "faction": "official",
            "delta": 15
          },
          {
            "type": "score",
            "delta": 5
          }
        ],
        "penalty": [
          {
            "type": "stat",
            "stat": "satisfaction",
            "delta": -10
          }
        ]
      },
      {
        "id": "side_nationalism_peak",
        "title": "青年站队",
        "desc": "跟风站队青年的热情好用，但也容易招来官方注意：合同结束前把跟风站队青年好感度推到 15 以上。",
        "offer": "start",
        "choice": false,
        "complete": {
          "var": "faction.cynic",
          "op": ">=",
          "value": 15
        },
        "rewards": [
          {
            "type": "budget",
            "delta": 15
          },
          {
            "type": "faction",
            "faction": "cynic",
            "delta": 10
          }
        ]
      }
    ]
  },
  "events": [
    {
      "id": "e_laser_ranging_strike",
      "title": "激光测距硬核抽脸",
      "text": "多所高校天文台联合科普博主开启实机激光测月直播，当场将高能激光打向阿波罗任务留下的月面反光镜并测得精确回波。影棚伪造论沦为科技圈跨年笑柄。",
      "trigger": {
        "all": [
          {
            "var": "turn",
            "op": ">=",
            "value": 3
          },
          {
            "var": "stats.heat",
            "op": ">=",
            "value": 50
          }
        ]
      },
      "chance": 0.85,
      "once": true,
      "effects": [
        {
          "type": "reveal",
          "fact": "f_studio_fake"
        },
        {
          "type": "stat",
          "stat": "credibility",
          "delta": -15
        },
        {
          "type": "stat",
          "stat": "heat",
          "delta": 8
        },
        {
          "type": "faction",
          "faction": "science_nerd",
          "delta": -15
        },
        {
          "type": "faction",
          "faction": "passerby",
          "delta": -10
        },
        {
          "type": "opponent",
          "opp": "astro_alliance",
          "morale": 20
        },
        {
          "type": "headline",
          "text": "多家天文台硬核激光测月，当场打脸登月伪造谣言",
          "heat": 60
        }
      ]
    },
    {
      "id": "e_scam_family_storm",
      "title": "受害者家属实名围堵",
      "text": "数名被卷走数十万养老金的老人家属手持横幅围堵真理穹顶学会办事处，痛斥学会打着揭秘登月幌子强推三无保健品和非法理财，警方与地方电视台闻讯赶来。",
      "trigger": {
        "all": [
          {
            "var": "turn",
            "op": ">=",
            "value": 4
          },
          {
            "any": [
              {
                "var": "stats.exposure",
                "op": ">=",
                "value": 45
              },
              {
                "var": "fact.f_illegal_fundraise.known",
                "op": "==",
                "value": true
              }
            ]
          }
        ]
      },
      "chance": 0.9,
      "once": true,
      "effects": [
        {
          "type": "reveal",
          "fact": "f_illegal_fundraise"
        },
        {
          "type": "stat",
          "stat": "satisfaction",
          "delta": -15
        },
        {
          "type": "stat",
          "stat": "credibility",
          "delta": -10
        },
        {
          "type": "faction",
          "faction": "official",
          "delta": -20
        },
        {
          "type": "faction",
          "faction": "conspiracy",
          "delta": -10
        },
        {
          "type": "offerTask",
          "task": "side_victim_settle"
        },
        {
          "type": "posts",
          "count": 2,
          "stance": -2,
          "tier": "normal",
          "hint": "受害者家属堵门痛哭，怒揭真理穹顶学会借登月阴谋论诈骗老人巨款"
        }
      ]
    },
    {
      "id": "e_guru_live_madness",
      "title": "学会会长直播翻车",
      "text": "眼见质疑声四起，真理穹顶学会掌门人亲自开播自证清白，情绪失控下公然鼓吹「万有引力是共济会骗局」，并挥舞所谓海外专家亲笔信兜售防辐射金箔。满嘴荒唐直接看呆了原本支持他的跟风青年。",
      "trigger": {
        "all": [
          {
            "var": "turn",
            "op": ">=",
            "value": 6
          },
          {
            "var": "faction.conspiracy",
            "op": ">=",
            "value": 65
          }
        ]
      },
      "chance": 1,
      "once": true,
      "effects": [
        {
          "type": "reveal",
          "fact": "f_forged_papers"
        },
        {
          "type": "faction",
          "faction": "cynic",
          "delta": -25
        },
        {
          "type": "faction",
          "faction": "passerby",
          "delta": -15
        },
        {
          "type": "faction",
          "faction": "official",
          "delta": -15
        },
        {
          "type": "stat",
          "stat": "credibility",
          "delta": -12
        },
        {
          "type": "stat",
          "stat": "heat",
          "delta": 10
        },
        {
          "type": "posts",
          "count": 3,
          "stance": -2,
          "tier": "bigv",
          "hint": "反智学会会长直播发癫称引力不存在，伪造文献当场被海外学者亲属发函打脸"
        }
      ]
    }
  ],
  "tuning": {}
});
