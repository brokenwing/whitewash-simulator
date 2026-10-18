/*
 * Offline rules (离线规则). Every AI task has an offline implementation with the same output shape,
 * used when AI is off, a call fails, or a task is excluded by the AI intensity setting.
 * These rules never look at hidden truth except where the engine itself would (report.judge on a
 * post linked to a fact is resolved by the engine before reaching here).
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;

  var LEX = {
    sincerity: ['抱歉', '道歉', '歉意', '对不起', '致歉', '愧疚', '惭愧', '辜负', '痛心', '反省', '诚恳', '照单全收', '骂得对'],
    responsibility: ['我们的责任', '责任在', '承担', '全面排查', '彻查', '整改', '负责', '问责', '赔偿', '不推卸', '失职', '不会推卸', '根源在于'],
    empathy: ['理解', '愤怒', '失望', '受到影响', '每一位', '心情', '感受', '担心', '关切', '受害', '伤害', '难过'],
    blameShift: ['临时工', '个别员工', '涉事员工', '第三方', '供应商', '外包', '合作方', '擅自', '违规操作', '个人行为', '不代表公司', '个别门店'],
    arrogance: ['严正', '法律责任', '追究', '造谣', '别有用心', '恶意', '抹黑', '绝不姑息', '不信谣', '不传谣', '保留追究', '律师', '绝不接受'],
    evasiveness: ['高度重视', '正在调查', '以官方', '进一步核实', '如有', '若有', '可能', '不排除', '后续', '敬请', '一定程度', '相关部门', '有关情况'],
    meme: ['高度重视', '深表歉意', '临时工', '个别', '不代表', '严正', '绝不', '从未', '一直以来', '用户至上', '衣食父母', '没有合眼', '我们也是受害者'],
    denial: ['不实', '谣言', '不存在', '从未', '没有', '绝无', '捏造', '虚假', '否认', '纯属', '子虚乌有', 'P图', '恶意剪辑', '并非', '不属实'],
    admission: ['确实', '属实', '承认', '存在问题', '是我们的', '的确', '经查', '核实存在', '确有', '我们错了']
  };

  var NUMS = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '十': 10 };

  function count(text, words) {
    var n = 0;
    words.forEach(function (w) { if (text.indexOf(w) >= 0) n += 1; });
    return n;
  }

  function score(base, hits, per) { return U.clamp(Math.round(base + hits * per), 0, 10); }

  function sentences(text) {
    return String(text).split(/[。！？!?\n；;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function factKeywords(f) {
    var kws = (f.keywords || []).filter(function (k) { return k && k.length >= 2; });
    if (!kws.length) {
      var t = String(f.text || '').replace(/[，。、“”「」\s]/g, '');
      for (var i = 0; i + 4 <= t.length && kws.length < 4; i += 3) kws.push(t.slice(i, i + 4));
    }
    return kws;
  }

  function pickStanceByQuality(rng, q) {
    var r = rng.next() * 10 + q;
    return r < 2 ? -2 : r < 5 ? -1 : r < 8 ? 0 : r < 11 ? 1 : 2;
  }

  function comment(game, stance) {
    return { author: game.rng.pick(D.nicknames), content: game.pick('comments', String(stance)), stance: stance };
  }

  var tasks = {};

  /* ------------------------------------------------------------ 公文评审 */
  tasks['statement.judge'] = function (game, a) {
    var text = String(a.text || '');
    var s = {
      sincerity: score(2, count(text, LEX.sincerity), 1.6),
      responsibility: score(2, count(text, LEX.responsibility), 1.5),
      empathy: score(2, count(text, LEX.empathy), 1.4),
      clarity: 0,
      blameShift: score(1, count(text, LEX.blameShift), 2),
      arrogance: score(1, count(text, LEX.arrogance), 1.6),
      evasiveness: score(2, count(text, LEX.evasiveness), 1.3),
      memeRisk: score(1, count(text, LEX.meme), 1.5)
    };
    var digits = /\d/.test(text) ? 1.5 : 0;
    var listed = /一、|1\.|（一）|首先/.test(text) ? 1 : 0;
    s.clarity = U.clamp(Math.round(2.5 + Math.min(4, text.length / 160) + digits + listed - s.evasiveness * 0.25), 0, 10);
    if (a.type === 'founder' && text.length > 300) s.empathy = Math.min(10, s.empathy + 1);
    if (a.type === 'stern') s.arrogance = Math.min(10, s.arrogance + 2);

    var st = game.state;
    var denies = [], admits = [];
    var sents = sentences(text);
    var facts = Object.keys(st.facts).map(function (id) { return st.facts[id]; }).filter(function (f) { return f.public || f.revealed; });
    /* each sentence is attributed to the fact(s) whose keywords it matches best (by matched length) */
    sents.forEach(function (sent) {
      var best = [], bestScore = 0;
      facts.forEach(function (f) {
        var score = 0;
        factKeywords(f).forEach(function (k) { if (sent.indexOf(k) >= 0) score += k.length; });
        if (score > bestScore) { bestScore = score; best = [f.id]; }
        else if (score > 0 && score === bestScore) best.push(f.id);
      });
      if (!bestScore) return;
      var target = count(sent, LEX.denial) ? denies : (count(sent, LEX.admission) || (a.type === 'apology' && count(sent, LEX.sincerity))) ? admits : null;
      if (target) best.forEach(function (id) { if (target.indexOf(id) < 0) target.push(id); });
    });
    admits = admits.filter(function (id) { return denies.indexOf(id) < 0; });

    var promises = [];
    sents.forEach(function (sent) {
      var m = sent.match(/(\d+|[一二两三四五六七十])\s*(日|天|个工作日|周)内/);
      if (m && /公布|公开|通报|给出|答复|整改|结果/.test(sent)) {
        var n = /\d/.test(m[1]) ? Number(m[1]) : NUMS[m[1]] || 3;
        if (m[2] === '周') n *= 7;
        promises.push({ text: sent.slice(0, 40), days: U.clamp(n, 1, 14) });
      } else if (/尽快公布|将于近期公布|第一时间公布/.test(sent)) {
        promises.push({ text: sent.slice(0, 40), days: 2 });
      }
    });

    var fulfills = [];
    var type = D.statementTypeMap[a.type];
    if (type && type.fulfills && s.clarity >= 5) {
      var pending = st.promises.filter(function (p) { return p.status === 'pending'; });
      if (pending.length) fulfills.push(pending[0].id);
    }

    var violations = [];
    game.level.client.demands.forEach(function (d) {
      if (d.keywords.length && d.keywords.some(function (k) { return text.indexOf(k) >= 0; })) violations.push(d.id);
    });

    var q = (s.sincerity + s.responsibility + s.empathy + s.clarity) / 4 - (s.blameShift + s.arrogance + s.evasiveness) / 3;
    var reactions = [0, 1, 2].map(function () { return comment(game, pickStanceByQuality(game.rng, q)); });
    var verdict = q >= 5 ? '诚意满满，有望止血' : q >= 2 ? '中规中矩，部分网友买账' : q >= -1 ? '套话偏多，网友不太买账' : '灾难级公关，准备好被玩梗';
    return { scores: s, denies: denies, admits: admits, promises: promises.slice(0, 2), fulfills: fulfills, violations: violations, reactions: reactions, verdict: verdict };
  };

  /* ------------------------------------------------------------ 公文补全 */
  tasks['statement.complete'] = function (game, a) {
    var type = D.statementTypeMap[a.type] || D.statementTypeMap.explain;
    var T = D.statementTones;
    var rng = game.rng;
    var tone = a.tone || {};
    var vars = game.textVars();
    var parts = [];
    var sincere = Number(tone.sincere) || 0;
    var admit = Number(tone.admit) || 0;
    var toneLine = (sincere >= 0 ? rng.pick(T.sincere) : rng.pick(T.tough));
    var factLine = admit >= 0 ? rng.pick(T.admit) : rng.pick(T.shift);
    var ms = rng.sample(T.measures, 3);
    var fill = { fact: factLine, tone: toneLine, m1: ms[0], m2: ms[1], m3: ms[2] };
    type.skeleton.forEach(function (line) { parts.push(U.tpl(U.tpl(line, fill), vars)); });
    var draft = String(a.draft || '').trim();
    var body = parts.join('\n\n');
    var text = draft ? draft + '\n\n' + body : body;
    return { text: text + '\n\n' + vars.client + '\n' + game.turnLabel() };
  };

  tasks['statement.polish'] = function (game, a) {
    var text = String(a.text || '');
    var tone = a.tone || {};
    if ((Number(tone.sincere) || 0) > 0 && text.indexOf('照单全收') < 0) text += '\n\n' + D.statementTones.sincere[0];
    if ((Number(tone.sincere) || 0) < 0 && text.indexOf('法律责任') < 0) text += '\n\n' + D.statementTones.tough[0];
    return { text: text.replace(/高度重视/g, '非常重视').replace(/深表歉意/g, '真诚道歉') };
  };

  /* ------------------------------------------------------------ 筛帖 */
  var STOP = ['所有', '全部', '帖子', '删除', '删掉', '那些', '有关', '相关', '提到', '包含', '关于', '晒出', '发布', '这些', '一切', '内容', '限流', '散布', '传播',
    '的', '删', '说', '和', '与', '或', '把', '里', '中', '条', '传', '晒', '发'];

  /* Chinese has no spaces: cut on stop words, then keep each segment plus every 2- and 3-char window. */
  function tokens(criterion) {
    var raw = String(criterion || '').split(/[\s,，。、；;：:“”"'‘’「」()（）!！?？/]+/).filter(Boolean);
    var out = [];
    raw.forEach(function (t) {
      STOP.forEach(function (s) { t = t.split(s).join(' '); });
      t.split(' ').forEach(function (x) {
        x = x.trim();
        if (x.length >= 2) out.push(x);
        if (x.length >= 3) {
          for (var i = 0; i + 2 <= x.length; i++) out.push(x.slice(i, i + 2));
          for (var j = 0; j + 3 <= x.length; j++) out.push(x.slice(j, j + 3));
        }
      });
    });
    return U.uniq(out);
  }

  tasks['posts.classify'] = function (game, a) {
    var c = String(a.criterion || '');
    var toks = tokens(c);
    var st = game.state;
    var matches = [];
    (a.posts || []).forEach(function (p) {
      var post = WW.Feed.find(st, p.id);
      if (!post) return;
      var hay = (p.content || '') + ' ' + (p.tags || []).join(' ') + ' ' + p.author;
      var reason = '';
      var hit = toks.filter(function (t) { return hay.indexOf(t) >= 0; }).sort(function (x, y) { return y.length - x.length; })[0];
      if (hit) reason = '提到“' + hit + '”';
      else if (/负面|骂|黑|攻击|差评|抵制/.test(c) && post.stance <= -1) reason = '负面内容';
      else if (/受害者|苦主|维权/.test(c) && post.author.faction === 'victim') reason = '苦主发帖';
      else if (/大V|营销号|博主/.test(c) && (post.author.tier === 'bigv' || post.author.tier === 'kol')) reason = '大V/博主';
      else if (/谣|网传|据说|爆料/.test(c) && /网传|据说|听说|爆料|内部人士/.test(post.content)) reason = '疑似传言';
      else if (/水军/.test(c) && post.isShill) reason = '疑似水军';
      else if (/截图/.test(c) && post.isScreenshot) reason = '截图流传';
      else if (/外网|海外/.test(c) && post.platform === 'overseas') reason = '外网内容';
      if (reason) matches.push({ id: p.id, reason: reason });
    });
    return { matches: matches };
  };

  /* ------------------------------------------------------------ 水军 */
  tasks['shill.generate'] = function (game, a) {
    var dir = String(a.direction || '');
    var tier = a.tier || 'normal';
    var pool = (D.pools.shill[tier] || D.pools.shill.normal);
    var n = a.samples || 4;
    var posts = [];
    for (var i = 0; i < n; i++) {
      posts.push({ author: tier === 'zombie' ? game.rng.pick(D.botNames) : game.rng.pick(D.nicknames), content: U.tpl(game.rng.pick(pool), U.deepMerge(game.textVars(), { dir: dir })) });
    }
    var pers = { zombie: 3, normal: 5, premium: 7 }[tier] || 5;
    if (dir.length >= 8 && dir.length <= 50) pers += 1;
    if (/其实|理性|证据|调查|整改|时间线|原始/.test(dir)) pers += 1;
    if (/永远|绝对|全是|境外|！！|!!/.test(dir)) pers -= 1;
    var awk = { zombie: 8, normal: 5, premium: 3 }[tier] || 5;
    if (/支持|加油|yyds|最棒/.test(dir)) awk += 1;
    return { posts: posts, persuasiveness: U.clamp(pers, 0, 10), awkwardness: U.clamp(awk, 0, 10) };
  };

  tasks['control.generate'] = function (game) {
    return {
      comments: game.rng.sample(D.pools.control, 3).map(function (t) {
        return { author: game.rng.pick(D.nicknames), content: U.tpl(t, game.textVars()) };
      })
    };
  };

  tasks['kol.write'] = function (game, a) {
    var raw = game.rng.pick(D.pools.kol).split('|');
    var vars = U.deepMerge(game.textVars(), { dir: String(a.brief || '').slice(0, 80) });
    var brief = String(a.brief || '');
    var pers = 5 + (brief.length > 20 ? 1 : 0) + (/数据|时间线|对比|证据|整改/.test(brief) ? 1 : 0) - (/洗|水军/.test(brief) ? 2 : 0);
    return { author: game.rng.pick(['理性观察员', '深度内参', '商业观察家老秦', '数码老炮']), title: U.tpl(raw[0], vars), content: U.tpl(raw[1], vars), persuasiveness: U.clamp(pers, 0, 10) };
  };

  tasks['distraction.generate'] = function (game) {
    var topic = game.rng.pick(D.pools.distraction);
    return {
      topic: topic,
      posts: [
        { author: game.rng.pick(D.nicknames), content: '“' + topic + '”是真的吗？？我人傻了' },
        { author: game.rng.pick(D.nicknames), content: '今天的瓜也太大了吧，' + topic }
      ]
    };
  };

  tasks['expose.generate'] = function (game, a) {
    var vars = U.deepMerge(game.textVars(), { opp: a.opp });
    if (a.success) {
      return { posts: game.rng.sample(D.pools.exposeOpp, 2).map(function (t) { return { author: game.rng.pick(['时间线整理员', '图片考古学家', '真相只有一个']), content: U.tpl(t, vars) }; }) };
    }
    return { posts: [{ author: game.rng.pick(D.nicknames), content: U.tpl('笑死，{client}的公关开始扒{opp}了，扒了半天啥也没有，急了急了', vars) }] };
  };

  tasks['report.judge'] = function (game, a) {
    var c = String(a.content || '');
    if (/住址|电话|身份证|家住|门牌/.test(c)) return { violation: true, type: '侵犯隐私', confidence: 7, reason: '公开了他人隐私信息' };
    if (/垃圾|去死|滚|傻|狗东西|脑残/.test(c)) return { violation: true, type: '人身攻击', confidence: 6, reason: '含有辱骂性内容' };
    if (/网传|据说|听说|内部人士|爆料称|细思极恐|真的假的/.test(c)) return { violation: true, type: '散布不实信息', confidence: 4, reason: '传言未经证实' };
    return { violation: false, type: '无违规', confidence: 3, reason: '属于正常的批评与讨论' };
  };

  tasks['item.custom'] = function (game, a) {
    var bounds = a.bounds || {};
    var item = game.items[a.itemId] || {};
    var fixed = item.effect && item.effect.offlineDeltas;
    var deltas = {};
    Object.keys(bounds).forEach(function (k) {
      var b = bounds[k];
      deltas[k] = fixed && fixed[k] !== undefined ? fixed[k] : U.round(b[0] + (b[1] - b[0]) * 0.6, 1);
    });
    var stance = item.effect ? item.effect.stance : 1;
    var posts = [];
    for (var i = 0; i < (a.posts || 2); i++) posts.push({ author: game.rng.pick(D.nicknames), content: game.pick('posts', String(U.clamp(stance, -2, 2))), stance: stance });
    return { narration: (a.desc || a.name) + '，效果符合预期。', deltas: deltas, posts: posts };
  };

  tasks['ending.report'] = function (game) {
    var st = game.state;
    var f = st.final || { grade: 'C', score: 0 };
    var key = st.endEpilogue && D.pools.epilogue[st.endEpilogue] ? st.endEpilogue : f.grade;
    var s = st.stats;
    var lines = [
      '本次委托历时 ' + st.turn + ' 个回合，最终舆论好感 ' + U.round(s.sentiment) + '，热度 ' + U.round(s.heat) + '，公信力 ' + U.round(s.credibility) + '。',
      '共发布公文 ' + st.counters.statements + ' 份，删帖 ' + st.counters.deleted + ' 条' + (st.counters.shillExposed ? '，水军被扒 ' + st.counters.shillExposed + ' 次' : '') + (st.counters.faceSlaps ? '，被打脸 ' + st.counters.faceSlaps + ' 次' : '') + '。',
      st.lieDebt > 0 ? '仍有未爆的谎言债 ' + U.round(st.lieDebt, 1) + ' 点，祝客户好运。' : '没有留下谎言债。'
    ];
    return { report: lines.join('\n'), epilogue: U.tpl(D.pools.epilogue[key] || D.pools.epilogue.C, game.textVars()) };
  };

  /* ------------------------------------------------------------ 回合网评 */
  var HINT_TPL = {
    neg: ['{hint}', '刚看到：{hint}', '{hint}，这下怎么洗？', '{hint}，坐等回应', '{hint}。我只想说，离谱。'],
    neu: ['{hint}，先吃瓜', '{hint}，有没有懂哥说说', '{hint}'],
    pos: ['{hint}，这才像样', '{hint}，给个机会吧', '{hint}']
  };

  function slotPost(game, s) {
    var vars = U.deepMerge(game.textVars(), s.vars || {});
    var content;
    if (s.pool) {
      var list = game.pool(s.pool);
      if (list.length) content = U.tpl(game.rng.pick(list), vars);
    }
    if (!content && s.hint) {
      var key = s.stance < 0 ? 'neg' : s.stance > 0 ? 'pos' : 'neu';
      content = U.tpl(game.rng.pick(HINT_TPL[key]), { hint: U.tpl(s.hint, vars) });
    }
    if (!content) content = game.pick('posts', String(s.stance));
    var comments = [];
    if (s.tier !== 'normal' || game.rng.chance(0.4)) {
      var n = game.rng.int(1, 2);
      for (var i = 0; i < n; i++) comments.push(comment(game, U.clamp(s.stance + game.rng.int(-1, 1), -2, 2)));
    }
    return { slot: s.slot, author: null, content: content, comments: comments };
  }

  function summary(game) {
    var st = game.state;
    return U.tpl(D.pools.briefing[String(st.phase)] || '', game.textVars());
  }

  tasks['feed.generate'] = function (game, a) {
    var posts = (a.slots || []).map(function (s) { return slotPost(game, s); });
    var headlines = [];
    if (game.state.stats.heat >= 30 && game.rng.chance(0.6)) headlines.push(game.pick('headlines'));
    if (game.rng.chance(0.5)) headlines.push(game.rng.pick(D.pools.neutralHeadlines));
    var client = game.rng.chance(a.mood === 'neutral' ? 0.5 : 0.9) ? game.pick('client', a.mood || 'neutral') : '';
    return { posts: posts, headlines: headlines, summary: summary(game), client: client };
  };

  function run(game, task, args) {
    var fn = tasks[task];
    if (!fn) throw new Error('No offline implementation for task ' + task);
    return fn(game, args || {});
  }

  WW.Offline = { run: run, tasks: tasks, slotPost: slotPost, summary: summary, tokens: tokens, LEX: LEX };
})(window.WW);
