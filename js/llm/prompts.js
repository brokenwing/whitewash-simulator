/*
 * AI task catalogue (提示词与 JSON 协议) and the runner the engine calls.
 * Every task = { effort, maxTokens, shape, user(game,args), post?(game,args,data) }.
 * The system prompt is stable for a whole level (rules + level context incl. hidden truth), so it is
 * cached by the provider; per-turn state goes into the user message.
 * WW.AI.run(game, task, args, opts) always resolves: AI result, or the offline rule result on any
 * failure (with `error` set so the UI can show a toast).
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;
  var S = WW.Shape;

  var STANCE = { '-2': '强烈负面', '-1': '负面/质疑', '0': '中立/吃瓜', '1': '偏正面', '2': '强烈支持' };
  var PHASES = ['平息', '余温', '发酵', '爆发'];

  /* ---------------------------------------------------------------- context */

  /* in-game (parody) platform and channel names, e.g. 围脖、颤音……、巨信公众号 */
  function platformNames() {
    var names = (D.platformOrder || Object.keys(D.platforms)).map(function (id) { return D.platforms[id].name; })
      .concat(Object.keys(D.statementChannels).map(function (id) { return D.statementChannels[id].name; }));
    return names.join('、');
  }

  function baseSystem(game) {
    var key = game.level.id + '|' + game.state.difficulty;
    if (game._sysKey === key && game._sys) return game._sys;
    var lv = game.level;
    var lines = [];
    lines.push('你是讽刺类网络舆情模拟游戏《公关洗地模拟器》的内容引擎。玩家扮演一家危机公关公司，替委托方处理负面舆情。');
    lines.push('【硬性规则】');
    lines.push('1. 一切人物、品牌、机构均为虚构：不要出现任何真实存在的人名、品牌、媒体、机构名称；不涉及现实政治、民族、宗教、领土话题。监管一律称“有关部门”或“平台”，境外称“外网/海外媒体”。平台只能用游戏里的名字（' + platformNames() + '），不要写出现实中的平台或 App 名称。');
    lines.push('2. 风格：中文互联网语境，网民口吻真实多样（吃瓜、玩梗、阴阳怪气、理中客、较真）。可以讽刺，但不要仇恨言论、人身威胁、色情或对弱势群体的歧视。');
    lines.push('3. 只输出要求的内容（JSON 任务只输出 JSON），不要解释，不要 Markdown 代码块。');
    lines.push('4. 你能看到隐藏的“真相”。真相只用于判断；替网民、客户、KOL 写内容时，他们只知道已公开或已曝光的信息。尚未公开的事实不能写出来——以猜测、暗示的方式猜中它，或抢先否认它（此地无银三百两），都算剧透。');
    lines.push('');
    lines.push('【关卡设定】');
    lines.push('委托方：' + lv.client.name + '（联系人：' + lv.client.contact + (lv.client.persona ? '，人设：' + lv.client.persona : '') + '）');
    lines.push('事件：' + lv.incident.summary);
    if (lv.incident.background) lines.push('背景：' + lv.incident.background);
    lines.push('关键词：' + lv.incident.keywords.join('、'));
    lines.push('平台：' + lv.platforms.map(function (p) { return D.platforms[p].name + '（' + D.platforms[p].style + '）'; }).join('；'));
    lines.push('受众阵营：' + lv.factions.map(function (f) { return f.name + (f.desc ? '：' + f.desc : ''); }).join('；'));
    if (lv.personas.length) lines.push('常驻网民：' + lv.personas.map(function (p) { return p.name + '（' + (D.tiers[p.tier] || {}).name + '，' + (p.style || '') + '）'; }).join('；'));
    if (lv.facts.length) {
      lines.push('事实与真相（隐藏信息，ID 用于判定）：');
      lv.facts.forEach(function (f) {
        lines.push('- [' + f.id + '] ' + f.text + (f.clientClaim ? '｜客户口径：' + f.clientClaim : '') + '｜真相：' + (f.isTrue ? '属实' : '不实'));
      });
    }
    if (lv.client.demands.length) {
      lines.push('客户红线（违反会让客户不满）：');
      lv.client.demands.forEach(function (d) { lines.push('- [' + d.id + '] ' + d.text); });
    }
    if (lv.opponents.length) lines.push('对手：' + lv.opponents.map(function (o) { return o.name + (o.desc ? '：' + o.desc : ''); }).join('；'));
    if (lv.ai.context) lines.push('补充设定：' + lv.ai.context);
    if (lv.ai.style) lines.push('文风：' + lv.ai.style);
    if (lv.ai.extraRules) lines.push('额外要求：' + lv.ai.extraRules);
    lines.push('网友敏锐度：' + game.diff.savvy);
    game._sys = lines.join('\n');
    game._sysKey = key;
    return game._sys;
  }

  function publicFacts(game) {
    var st = game.state;
    var out = [];
    Object.keys(st.facts).forEach(function (id) {
      var f = st.facts[id];
      if (f.revealed) out.push('「' + f.text + '」（已实锤）');
      else if (f.refuted) out.push('「' + f.text + '」（已被证伪）');
      else if (f.public) out.push('「' + f.text + '」（网传，尚未证实）');
    });
    return out;
  }

  /* facts the public has not heard of yet: content written for netizens / the client must not touch them */
  function unpublishedFacts(game) {
    var st = game.state;
    return Object.keys(st.facts).map(function (id) { return st.facts[id]; }).filter(function (f) {
      return !f.public && !f.revealed && !f.refuted;
    }).map(function (f) { return '「' + f.text + '」'; });
  }

  function dynamicFacts(game) {
    var st = game.state;
    return Object.keys(st.facts).map(function (id) { return st.facts[id]; }).filter(function (f) { return f.origin !== 'seed'; }).map(function (f) {
      var o = f.by ? st.opponents[f.by] : null;
      return '- [' + f.id + '] ' + f.text + '｜真相：' + (f.isTrue ? '属实' : '不实') + (o ? '（由' + o.name + '放出）' : '');
    });
  }

  function situation(game) {
    var st = game.state;
    var s = st.stats;
    var lines = [];
    lines.push('【当前局势】第 ' + st.turn + '/' + game.level.contract.turns + ' 回合（' + game.turnLabel() + '），舆情阶段：' + PHASES[st.phase] +
      '；舆论好感 ' + Math.round(s.sentiment) + '（-100~100），热度 ' + Math.round(s.heat) + '，公信力 ' + Math.round(s.credibility) + '，热搜排名 ' + (st.trend.rank >= 99 ? '榜外' : '第' + st.trend.rank) + '。');
    var pf = publicFacts(game);
    if (pf.length) lines.push('网民已知的信息：' + pf.join('；'));
    var up = unpublishedFacts(game);
    if (up.length) lines.push('尚未公开的事实（网民和客户都不知道；替他们写的任何内容都不得提及、暗示、猜中或抢先否认）：' + up.join('；'));
    var dyn = dynamicFacts(game);
    if (dyn.length) lines.push('游戏中新出现的事实（隐藏真相，仅供判定）：\n' + dyn.join('\n'));
    if (st.lastStatement) lines.push('委托方最近的官方表态：《' + st.lastStatement.title + '》' + st.lastStatement.excerpt);
    var hot = WW.Feed.ranked(st, 'all').filter(function (p) { return p.status !== 'deleted'; }).slice(0, 5);
    if (hot.length) lines.push('近期热帖：' + hot.map(function (p) { return p.author.name + '：' + p.content.slice(0, 40); }).join(' ／ '));
    return lines.join('\n');
  }

  function platformName(id) { return (D.platforms[id] || {}).name || id; }
  function tierName(id) { return (D.tiers[id] || {}).name || id; }
  function factionName(game, id) {
    var f = game.state.factions[id];
    return f ? f.name : id || '路人';
  }

  /* ---------------------------------------------------------------- shapes */

  var COMMENT = S.obj({ author: S.str(), content: S.str('', 200) });
  var AUTHORED = S.obj({ author: S.str(), content: S.str('', 600) });

  var TASKS = {
    'feed.generate': {
      effort: 'low', maxTokens: 16000,
      shape: S.obj({
        posts: S.arr(S.obj({ slot: S.int(0, 99, 0), author: S.str(), title: S.str('', 80), content: S.str('', 600), comments: S.arr(COMMENT, 3) }), 40),
        headlines: S.arr(S.str('', 30), 4), summary: S.str('', 400), client: S.str('', 120)
      }),
      user: function (game, a) {
        var lines = [situation(game)];
        lines.push('本回合玩家做了：' + (a.actions && a.actions.length ? a.actions.join('；') : '没有出手'));
        if (a.lines && a.lines.length) lines.push('回合间发生：' + a.lines.join('；'));
        lines.push('');
        lines.push('请为下面每个“发帖位”写一条帖子。平台、作者身份、阵营和立场都已由引擎决定，你只写内容，且必须符合立场（-2 强烈负面，-1 负面/质疑，0 中立/吃瓜，1 偏正面，2 强烈支持）：');
        a.slots.forEach(function (s) {
          var bits = ['#' + s.slot, '平台=' + platformName(s.platform), '作者=' + tierName(s.tier), '阵营=' + factionName(game, s.faction), '立场=' + s.stance + '(' + STANCE[String(s.stance)] + ')'];
          if (s.opp && game.state.opponents[s.opp]) bits.push('对手账号=' + game.state.opponents[s.opp].name);
          if (s.hint) bits.push('要求=' + U.tpl(s.hint, game.textVars()));
          if (s.fact && game.state.facts[s.fact]) bits.push('关联事件=' + game.state.facts[s.fact].text);
          lines.push(bits.join(' '));
        });
        lines.push('');
        lines.push('写作要求：每条 15~80 字（新闻客户端/知否可 60~160 字并给 title，其他 title 留空）；口吻贴合平台和阵营，彼此不要雷同，多用具体细节和网络梗；author 写网名（大V/媒体用像样的账号名，有“对手账号”的就用它或它的小号）；挑 2~4 条热帖各配 1~2 条 comments，其余 comments 为空数组。');
        lines.push('多样性：每条帖子只讲一个点，角度各不相同（爆料、玩梗、质疑委托方、理中客分析、跑题吃瓜等）；同一条爆料或旧账最多出现在 2 条帖子里；不要重复同一句式、口头禅或梗。');
        lines.push('headlines：2~3 个此刻会上热搜的词条（不带#）。summary：2~3 句舆情监测简报。client：委托方联系人此刻发来的一条巨信（符合人设，当前心情：' + ({ great: '非常满意', good: '还算满意', neutral: '一般', bad: '不满', angry: '暴怒' }[a.mood] || '一般') + '），不超过 50 字。');
        return lines.join('\n');
      },
      post: function (game, a, data) {
        var valid = {};
        a.slots.forEach(function (s) { valid[s.slot] = true; });
        data.posts = data.posts.filter(function (p) { return valid[p.slot] && p.content; });
        return data;
      }
    },

    'statement.judge': {
      effort: 'medium', maxTokens: 16000,
      shape: S.obj({
        scores: S.obj({
          sincerity: S.int(0, 10, 5), responsibility: S.int(0, 10, 5), empathy: S.int(0, 10, 5), clarity: S.int(0, 10, 5),
          blameShift: S.int(0, 10, 0), arrogance: S.int(0, 10, 0), evasiveness: S.int(0, 10, 3), memeRisk: S.int(0, 10, 2)
        }),
        denies: S.arr(S.str(), 10), admits: S.arr(S.str(), 10),
        promises: S.arr(S.obj({ text: S.str('', 80), days: S.int(1, 30, 3) }), 3),
        fulfills: S.arr(S.str(), 5), violations: S.arr(S.str(), 5),
        reactions: S.arr(S.obj({ author: S.str(), content: S.str('', 200), stance: S.int(-2, 2, 0) }), 4),
        verdict: S.str('', 60)
      }),
      user: function (game, a) {
        var st = game.state;
        var type = D.statementTypeMap[a.type] || D.statementTypeMap.explain;
        var pending = st.promises.filter(function (p) { return p.status === 'pending'; });
        var lines = [situation(game), ''];
        lines.push('委托方以「' + type.name + '」形式在' + (D.statementChannels[a.channel] || {}).name + '发布了下面这篇公文：');
        lines.push('标题：' + a.title);
        lines.push('正文：\n"""\n' + a.text + '\n"""');
        lines.push('');
        lines.push('请以资深舆情分析师的眼光评审，按 0~10 打分：sincerity 诚恳；responsibility 担当（是否承认责任）；empathy 共情；clarity 信息量（有无具体事实、数据、措施、时间表）；blameShift 甩锅；arrogance 傲慢强硬；evasiveness 回避打太极；memeRisk 被玩梗群嘲的风险。');
        lines.push('并判断：denies = 公文明确否认了哪些事实（填事实 ID，含上面“新出现的事实”）；admits = 明确承认了哪些事实（ID）；promises = 承诺在将来某个明确期限内完成的事（text 概括，days 为距今天数）——当场已经做完的（如“现公布如下”“今天公布”）、周期性的（如“每月公布一次”）、没有具体期限的（如“及时公布”“后续通报”）都不算；fulfills = 下列待兑现承诺中被这篇公文实质兑现的（ID）：' + (pending.length ? pending.map(function (p) { return '[' + p.id + ']' + p.text; }).join('；') : '无') + '；violations = 违反了哪些客户红线（ID）；reactions = 3 条评论区第一反应（stance -2~2，要符合公文质量与网友敏锐度）；verdict = 20 字内专业点评。');
        lines.push('打分要严格：套话、空话、只表态不说事、把责任推给员工/供应商都要扣分；真正具体、诚恳、有担当的才给高分。');
        lines.push('评分锚点：只表态、无事实的套话 → sincerity 约 2、clarity 约 1、evasiveness 约 9；承认问题 + 具体数据 + 措施 + 时间表 + 道歉 → sincerity、responsibility、clarity 约 8，blameShift 不超过 2。处理涉事员工本身不算甩锅；只有把责任全推给员工/供应商、否认管理责任时 blameShift 才给高分。');
        return lines.join('\n');
      },
      post: function (game, a, data) {
        var st = game.state;
        data.denies = U.uniq(data.denies.filter(function (id) { return st.facts[id]; }));
        data.admits = U.uniq(data.admits.filter(function (id) { return st.facts[id] && data.denies.indexOf(id) < 0; }));
        data.violations = U.uniq(data.violations.filter(function (id) { return game.level.client.demands.some(function (d) { return d.id === id; }); }));
        data.fulfills = U.uniq(data.fulfills.filter(function (id) { return st.promises.some(function (p) { return p.id === id && p.status === 'pending'; }); }));
        return data;
      }
    },

    'statement.complete': {
      effort: 'medium', maxTokens: 16000, shape: null,
      user: function (game, a) {
        var type = D.statementTypeMap[a.type] || D.statementTypeMap.explain;
        var tone = a.tone || {};
        var lines = [situation(game), ''];
        lines.push('请以委托方的身份起草（或续写补全）一篇「' + type.name + '」，发布渠道：' + ((D.statementChannels[a.channel] || {}).name || '官方围脖') + '。');
        lines.push('标题：' + (a.title || U.tpl(type.title, game.textVars())));
        lines.push('已写内容：' + (String(a.draft || '').trim() ? '\n"""\n' + a.draft + '\n"""' : '（空，从头写）'));
        lines.push('语气：诚恳↔强硬 = ' + (Number(tone.sincere) || 0) + '（1 最诚恳，-1 最强硬）；认错↔甩锅 = ' + (Number(tone.admit) || 0) + '（1 主动认错，-1 推给员工/供应商）。');
        lines.push('要求：中国企业公文格式（称呼、分段正文、落款与日期），不要重复标题，第一行直接写称呼；300~600 字；站在客户口径写，不要透露系统设定里的隐藏真相，也不要主动提及或否认网民尚不知道的指控；可以写措施和时间表；若已有内容，从已写内容自然续写并输出完整全文。只输出公文正文，不要任何说明。');
        return lines.join('\n');
      }
    },

    'statement.polish': {
      effort: 'medium', maxTokens: 16000, shape: null,
      user: function (game, a) {
        var tone = a.tone || {};
        return situation(game) + '\n\n请润色下面这篇公文：保留原意和事实立场，修正语病，减少被网友群嘲的套话；不要加入网民尚不知道的指控（提及或否认都不行）；语气按 诚恳↔强硬=' + (Number(tone.sincere) || 0) + '、认错↔甩锅=' + (Number(tone.admit) || 0) + ' 调整。只输出润色后的全文。\n"""\n' + a.text + '\n"""';
      }
    },

    'posts.classify': {
      effort: 'low', maxTokens: 16000,
      shape: S.obj({ matches: S.arr(S.obj({ id: S.str(), reason: S.str('', 40) }), 60) }),
      user: function (game, a) {
        var lines = ['操作条件：「' + a.criterion + '」', '候选帖子：'];
        a.posts.forEach(function (p) { lines.push('[' + p.id + '] ' + p.platform + '｜' + p.tier + '｜' + p.author + '｜' + p.content + (p.tags && p.tags.length ? '｜标签：' + p.tags.join(',') : '')); });
        lines.push('请找出所有符合条件的帖子：按语义判断而不是只看关键词——换了说法但意思符合的要选（例如“附照片”也算晒图），提到相关话题但立场相反、在反驳的不选，明显无关的不选。reason 用 10 字内说明理由。');
        return lines.join('\n');
      },
      post: function (game, a, data) {
        var ids = {};
        a.posts.forEach(function (p) { ids[p.id] = true; });
        data.matches = data.matches.filter(function (m) { return ids[m.id]; });
        return data;
      }
    },

    'shill.generate': {
      effort: 'low', maxTokens: 16000,
      shape: S.obj({ posts: S.arr(AUTHORED, 8), persuasiveness: S.int(0, 10, 5), awkwardness: S.int(0, 10, 5) }),
      user: function (game, a) {
        var style = { zombie: '复读机式的僵尸号：口号化、感叹号多、一眼假', normal: '普通网友口吻，有一点个人色彩', premium: '像真人：有身份、有细节、有逻辑，不刻意' }[a.tier] || '';
        return situation(game) + '\n\n公关公司买了 ' + a.count + ' 条“' + a.tierName + '”，节奏方向：「' + a.direction + '」。\n请写 ' + a.samples + ' 条有代表性的水军评论（' + style + '），author 写网名。\n再评估：persuasiveness = 这个节奏方向对吃瓜群众的说服力（0~10）；awkwardness = 这批评论的违和感/一眼假程度（0~10，方向生硬、与网民已知信息冲突、措辞整齐划一都会提高违和感）。';
      }
    },

    'control.generate': {
      effort: 'low', maxTokens: 16000,
      shape: S.obj({ comments: S.arr(AUTHORED, 4) }),
      user: function (game, a) {
        return situation(game) + '\n\n要给下面这条帖子“控评”：写 3~4 条会被顶上热评的正面或理性评论' + (a.direction ? '，方向：' + a.direction : '') + '。别太假。' +
          (a.post.official ? '这是客户的官方声明，评论要像普通网友自发表示理解和支持，不要替官方说话。' : a.post.own ? '这是我方安排的内容，评论要像路人自发认同。' : '') +
          '\n帖子（' + a.post.platform + '，' + a.post.author + '）：' + a.post.content;
      }
    },

    'kol.write': {
      effort: 'low', maxTokens: 16000,
      shape: S.obj({ author: S.str(), title: S.str('', 60), content: S.str('', 800), persuasiveness: S.int(0, 10, 5) }),
      user: function (game, a) {
        return situation(game) + '\n\n你是一位' + a.tier + '，收了钱要发一篇“理性分析”为委托方说话。brief：「' + a.brief + '」。\n要求：看起来中立客观、有逻辑，150~300 字，标题吸引人；author 是你的账号名。persuasiveness 评估这篇对路人的说服力（0~10，与网民已知信息冲突或太像洗地要扣分）。';
      }
    },

    'distraction.generate': {
      effort: 'low', maxTokens: 16000,
      shape: S.obj({ topic: S.str('', 30), posts: S.arr(AUTHORED, 3) }),
      user: function (game, a) {
        return '公关公司要买一个更大的娱乐或社会热点来转移视线（必须虚构，不涉及真实人物）。请编一个热搜话题（12 字内）和 2~3 条网友讨论。' + (a.hint ? '偏好：' + a.hint : '');
      }
    },

    'expose.generate': {
      effort: 'low', maxTokens: 16000,
      shape: S.obj({ posts: S.arr(AUTHORED, 3) }),
      user: function (game, a) {
        if (a.success) return situation(game) + '\n\n扒皮博主起底对手「' + a.opp + '」：' + a.dirt.join('、') + '。写 2 条扒皮帖（有时间线、截图描述、证据感），author 写博主网名。';
        return situation(game) + '\n\n公关公司试图扒对手「' + a.opp + '」，结果什么都没扒到。写 1 条网友的嘲讽帖。';
      }
    },

    'report.judge': {
      effort: 'medium', maxTokens: 16000,
      shape: S.obj({ violation: S.bool(false), type: S.enumOf(['散布不实信息', '侵犯隐私', '人身攻击', '无违规'], '无违规'), confidence: S.int(0, 10, 3), reason: S.str('', 80) }),
      user: function (game, a) {
        return situation(game) + '\n\n有人向平台举报了下面这条内容。请依据系统设定中的真相和平台规则判断是否违规：陈述与真相不符的事实（造谣）、泄露隐私、人身攻击算违规；批评、质疑、陈述真实情况、表达不满不算违规。confidence 表示你有多确定。\n作者：' + a.author + '（' + (a.platform || '') + '）\n内容：' + a.content;
      }
    },

    'item.custom': {
      effort: 'low', maxTokens: 16000,
      shape: S.obj({
        narration: S.str('', 120),
        deltas: S.obj({ sentiment: S.num(-30, 30, 0), heat: S.num(-30, 30, 0), credibility: S.num(-30, 30, 0), exposure: S.num(-30, 30, 0), satisfaction: S.num(-30, 30, 0) }),
        posts: S.arr(S.obj({ author: S.str(), content: S.str('', 400), stance: S.int(-2, 2, 1) }), 4)
      }),
      user: function (game, a) {
        var b = Object.keys(a.bounds || {}).map(function (k) { return (WW.Effects.STAT_NAMES[k] || k) + ' ' + a.bounds[k][0] + '~' + a.bounds[k][1]; }).join('，');
        return situation(game) + '\n\n玩家使用了道具「' + a.name + '」：' + (a.desc || '') + '\n道具规则（关卡作者设定）：' + (a.prompt || '无') + '\n玩家的具体指示：' + (a.instruction || '无') + '\n数值变化范围：' + (b || '无') + '（超出会被截断，范围外的数值写 0）\n请给出 narration（30 字内的执行结果）、deltas、以及 ' + (a.posts || 2) + ' 条相关帖子（stance -2~2）。';
      }
    },

    'ending.report': {
      effort: 'medium', maxTokens: 16000,
      shape: S.obj({ report: S.str('', 600), epilogue: S.str('', 300) }),
      user: function (game) {
        var st = game.state;
        var f = st.final || {};
        var acts = st.log.filter(function (l) { return l.kind === 'action' || l.kind === 'truth' || l.kind === 'opponent'; }).slice(-24).map(function (l) { return '第' + l.turn + '回合 ' + l.text; });
        return situation(game) + '\n\n委托结案：' + (st.result === 'win' ? '成功' : '失败') + '（' + st.endTitle + '：' + st.endText + '），评级 ' + f.grade + '，得分 ' + f.score + '。谎言债 ' + st.lieDebt + '，被打脸 ' + st.counters.faceSlaps + ' 次，水军被扒 ' + st.counters.shillExposed + ' 次。\n经过：\n' + acts.join('\n') +
          '\n\n请写：report = 150 字内的《结案报告》（公关公司内部口吻，冷静专业、暗含讽刺）；epilogue = 80 字内的“三个月后……”尾声，黑色幽默。';
      }
    },

    /* args: { length: 'short'|'long', hero, ending: {report, epilogue} }; plain-text Markdown */
    'story.write': {
      effort: 'medium', maxTokens: 14000, shape: null, timeoutSec: 300,
      user: function (game, a) {
        var long = a.length === 'long';
        return storyMaterial(game, a) +
          '\n\n【写作要求】把上面这局游戏改写成一篇网络爽文，约 ' + (long ? '4000' : '1500') + ' 字，用 Markdown：第一行是“# 书名”，之后分 ' + (long ? '5~7' : '3~4') + ' 章，每章用“## 第X章 章名”。\n' +
          '- 主角：' + (a.hero || '老K') + '，' + D.pools.firm + '的首席“洗地官”，第三人称叙述。\n' +
          '- 爽文节奏：开局危机压顶、客户施压、对手嚣张 → 主角见招拆招、一次次打脸对手 → 高潮反转 → 结局。多用短句、金句、围观网友的反应和“全场震惊”式的爽点。\n' +
          '- 必须忠于这局的实际经过：用上真实发生的关键操作、对手招式、证据曝光和局势起落，不要编造没发生的大事件；可以补写对话和心理活动。\n' +
          '- 这是小说不是游戏战报：正文不要出现游戏术语（回合、技能、行动点、评级、得分、谎言债、暴露度、公信力、好感度、满意度等）和素材里的任何具体数值。把数值变化写成看得见的剧情：热搜掉榜或冲顶、评论区风向转变、客户语气变化、对手慌乱。时间用“第X天白天/深夜”这样的说法。\n' +
          '- 主角做过的事只限经过里列出的操作（技能、公文）；没列出操作的回合，就写主角按兵不动、观望或被动挨打，不要替主角编造删帖、投放、水军等操作。\n' +
          '- 网民、路人、比喻里同样不得出现任何现实存在的平台、App、电商、品牌名，只用游戏里的平台名。\n' +
          '- 结局按实际结果写：赢了就痛快收尾；输了写成黑色幽默，主角嘴硬、留下“下一单再见”的伏笔。\n' +
          '- 保持讽刺意味：爽感来自主角的手段，但字里行间让读者看出洗地的荒诞。\n' +
          '- 直接输出正文，不要任何解释。';
      },
      post: function (game, a, data) { return { text: renumberChapters(data.text) }; }
    }
  };

  /* models miscount chapters ("第四章" twice): number the "## 第X章" headings in order */
  var CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五'];
  function renumberChapters(text) {
    var n = 0;
    return String(text || '').replace(/^##\s*第[一二三四五六七八九十百零〇\d]+章/gm, function () {
      n += 1;
      return '## 第' + (CN_NUM[n - 1] || n) + '章';
    });
  }

  /* everything that happened in a run, in order, for story.write */
  function storyMaterial(game, a) {
    a = a || {};
    var st = game.state;
    var lv = game.level;
    var f = st.final || {};
    var out = [];
    out.push('【这局游戏】委托方 ' + lv.client.name + '（联系人：' + lv.client.contact + '），事件：' + lv.incident.summary);
    out.push('难度：' + ((D.difficulties[st.difficulty] || {}).name || st.difficulty) + '；合同 ' + lv.contract.turns + ' 回合，实际进行到第 ' + st.turn + ' 回合。');
    if (st.finished) out.push('结局：' + (st.result === 'win' ? '成功' : '失败') + '——' + st.endTitle + '：' + st.endText + '；评级 ' + f.grade + '，得分 ' + f.score + '。');
    else out.push('结局：这局还没打完，写到当前进度为止，结尾留悬念。');
    var s = st.stats;
    out.push('最终数值：舆论好感 ' + Math.round(s.sentiment) + '，热度 ' + Math.round(s.heat) + '，公信力 ' + Math.round(s.credibility) + '，暴露度 ' + Math.round(s.exposure) + '，客户满意 ' + Math.round(s.satisfaction) +
      '；谎言债 ' + U.round(st.lieDebt, 1) + '，被打脸 ' + st.counters.faceSlaps + ' 次，水军被扒 ' + st.counters.shillExposed + ' 次。');
    var opps = Object.keys(st.opponents || {}).map(function (id) { return st.opponents[id]; }).filter(function (o) { return o && o.name; });
    if (opps.length) out.push('对手：' + opps.map(function (o) { return o.name; }).join('、'));
    var nActs = st.log.filter(function (l) { return l.kind === 'action'; }).length;
    out.push(nActs ? '主角本局共使用技能 ' + nActs + ' 次（经过里标注“〔我方〕”的就是）。' : '主角本局一个技能都没用过，全程按兵不动。');
    out.push('');
    out.push('【经过（按回合）】');
    var chron = st.chronicle || [];
    var byTurn = {};
    st.log.forEach(function (l) { (byTurn[l.turn] = byTurn[l.turn] || []).push(l); });
    chron.forEach(function (c) { byTurn[c.turn] = byTurn[c.turn] || []; });
    Object.keys(byTurn).map(Number).sort(function (x, y) { return x - y; }).forEach(function (t) {
      var c = chron.filter(function (x) { return x.turn === t; })[0];
      out.push('第' + t + '回合（' + game.turnLabel(t) + '）');
      byTurn[t].forEach(function (l) { if (l.kind !== 'end') out.push('  - ' + (l.kind === 'action' ? '〔我方〕' : '') + l.text); });
      if (c && c.summary) out.push('  局势：' + c.summary);
      if (c && c.headlines && c.headlines.length) out.push('  热搜：' + c.headlines.join(' / '));
      if (c && c.deltas && Object.keys(c.deltas).length) {
        out.push('  回合数值变化：' + Object.keys(c.deltas).map(function (k) { return (WW.Effects.STAT_NAMES[k] || (k === 'budget' ? '预算' : k)) + (c.deltas[k] > 0 ? '+' : '') + c.deltas[k]; }).join('，'));
      }
    });
    var sts = st.statements || [];
    if (sts.length) {
      out.push('');
      out.push('【发布的公文】');
      sts.forEach(function (x) { out.push('第' + x.turn + '回合《' + x.title + '》（' + x.type + '，评审：' + (x.verdict || x.q) + '）：' + x.text.slice(0, 200)); });
    }
    var client = st.messages.filter(function (m) { return m.from === 'client'; }).slice(-8);
    if (client.length) {
      out.push('');
      out.push('【客户' + lv.client.contact + '的消息】');
      client.forEach(function (m) { out.push('第' + m.turn + '回合：' + m.text.slice(0, 120)); });
    }
    if (a.ending && (a.ending.report || a.ending.epilogue)) {
      out.push('');
      out.push('【结案报告】' + (a.ending.report || ''));
      if (a.ending.epilogue) out.push('【尾声】' + a.ending.epilogue);
    }
    return out.join('\n');
  }

  var LITE = ['statement.judge', 'statement.complete', 'statement.polish', 'feed.generate', 'report.judge', 'ending.report', 'story.write'];

  function enabledFor(task) {
    if (!WW.LLM) return false;
    var s = WW.LLM.getSettings();
    if (s.aiLevel === 'off' || !WW.LLM.isReady()) return false;
    if (s.aiLevel === 'lite') return LITE.indexOf(task) >= 0;
    return true;
  }

  function parseOrRepair(spec, game, res, task) {
    try {
      return Promise.resolve(WW.LLM.extractJSON(res.text));
    } catch (e) {
      return WW.LLM.chat({
        task: task + '.repair', effort: 'low', maxTokens: 16000, shape: spec.shape,
        system: '你负责把一段输出修复成合法 JSON。',
        user: '下面的输出无法解析为 JSON。请按结构 ' + S.describe(spec.shape) + ' 输出修复后的合法 JSON，只输出 JSON：\n' + String(res.text).slice(0, 6000)
      }).then(function (r2) { return WW.LLM.extractJSON(r2.text); });
    }
  }

  function run(game, task, args, opts) {
    opts = opts || {};
    var spec = TASKS[task];
    if (!spec || !enabledFor(task)) return Promise.resolve({ data: WW.Offline.run(game, task, args), source: 'offline' });
    var call = WW.LLM.chat({
      task: task, effort: spec.effort, maxTokens: (args && args.maxTokens) || spec.maxTokens, shape: spec.shape, timeoutSec: spec.timeoutSec,
      system: baseSystem(game), user: spec.user(game, args || {}),
      stream: !!opts.onText && WW.LLM.getSettings().streaming, onText: opts.onText
    });
    return call.then(function (res) {
      if (!spec.shape) {
        var plain = { text: String(res.text || '').trim() };
        return { data: spec.post ? spec.post(game, args, plain) : plain, source: 'ai' };
      }
      return parseOrRepair(spec, game, res, task).then(function (json) {
        var data = S.coerce(spec.shape, json);
        if (spec.post) data = spec.post(game, args, data);
        return { data: data, source: 'ai' };
      });
    }).catch(function (e) {
      WW.Log.warn('ai', task + ' 已回退离线规则：' + (e && e.message || e));
      return { data: WW.Offline.run(game, task, args), source: 'offline', error: e && e.message || String(e) };
    });
  }

  WW.AI = { TASKS: TASKS, LITE: LITE, run: run, enabledFor: enabledFor, baseSystem: baseSystem, situation: situation, storyMaterial: storyMaterial, renumberChapters: renumberChapters };
})(window.WW);
