/*
 * Item handlers (道具效果原语). Each handler may call AI through game.runAI(), which always resolves
 * (falls back to offline rules), then converts the bounded AI output into numbers.
 *   cost(game, item, params)      -> 万元
 *   validate(game, item, params)  -> error string | ''
 *   preview(game, item, params)   -> Promise<data> (optional, two-step items)
 *   run(game, item, params)       -> Promise<{ text, detail?, cancelled?, reason? }>
 * Impulses use faction sensitivities via game.shiftFactions(impulse, channel): a positive impulse is
 * the intended effect; crowds with negative sensitivity react the other way.
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;
  var registry = {};

  function register(name, handler) { registry[name] = handler; }
  function get(name) { return registry[name]; }

  function cf(game) { return 0.4 + game.state.stats.credibility / 100; }
  function heatDamp(game, k) { return 1 - game.state.stats.heat / (k || 160); }
  function tierOf(item, id) {
    var list = (item.params && item.params.tiers) || [];
    return list.filter(function (t) { return t.id === id; })[0] || list[0];
  }
  function scaleOf(item, id) {
    var list = (item.params && item.params.scales) || [];
    return list.filter(function (t) { return t.id === id; })[0] || list[0];
  }
  function targetPost(game, params) {
    var p = params.postId ? WW.Feed.find(game.state, params.postId) : null;
    return p && p.status !== 'deleted' ? p : null;
  }
  function targetOpp(game, params) {
    var o = params.oppId ? game.state.opponents[params.oppId] : null;
    return o && o.active ? o : null;
  }
  function deleteCost(p) {
    var t = D.tiers[p.author.tier] || D.tiers.normal;
    return p.immune || t.deleteCost === null ? null : t.deleteCost;
  }
  function factName(game, id) {
    var f = game.state.facts[id];
    return f ? f.text : id;
  }

  /* ------------------------------------------------------------------ 公文 */
  register('statement', {
    validate: function (game, item, params) {
      var text = String(params.text || '').trim();
      if (text.length < 20) return '公文至少要写 20 个字';
      if (text.length > 3000) return '公文太长了（上限 3000 字）';
      return '';
    },
    run: function (game, item, params) {
      var st = game.state;
      var type = D.statementTypeMap[params.type] || D.statementTypeMap.explain;
      var ch = D.statementChannels[params.channel] || D.statementChannels.weibo;
      var title = String(params.title || U.tpl(type.title, game.textVars())).slice(0, 60);
      var text = String(params.text).trim();
      return game.runAI('statement.judge', { type: type.id, channel: ch.id, title: title, text: text }).then(function (res) {
        var j = res.data;
        var s = j.scores;
        var q = (s.sincerity + s.responsibility + s.empathy + s.clarity) / 4 - (s.blameShift + s.arrogance + s.evasiveness) / 3;
        var fatigue = Math.pow((item.params && item.params.fatigue) || 0.6, st.counters.statementsTurn) * Math.max(0.5, 1 - 0.07 * st.counters.statements);
        var mute = game.hasModifier('mute') ? 0.7 : 1;
        var impulse = q * 2.4 * cf(game) * fatigue * ch.reachMul * mute;
        game.shiftFactions(impulse, type.channel);

        /* a clear, sincere answer takes air out of the story; a bad one feeds it. The first answer ends the "装死" phase. */
        var heat = (type.heat + s.memeRisk * 0.7 + (s.arrogance >= 7 ? 3 : 0) - Math.max(0, q)) * ch.heatMul;
        if (st.counters.statements === 0) heat -= 6;
        game.addStat('heat', heat);
        game.addStat('credibility', (s.clarity - 5) * 0.35 + (s.responsibility - 5) * 0.3 - (s.evasiveness - 3) * 0.25 - s.blameShift * 0.15);

        var notes = [];
        if (type.channel === 'scapegoat') {
          game.shiftFaction('sleuth', -3, 0.3);
          if (game.hasTrueFactTag('management')) { game.addLieDebt(null, 1); notes.push('真相指向管理层，甩锅记入谎言债'); }
        }
        (j.denies || []).forEach(function (fid) {
          var r = WW.Truth.deny(game, fid);
          if (r) notes.push(r);
        });
        (j.admits || []).forEach(function (fid) {
          var r = WW.Truth.admit(game, fid);
          if (r) notes.push(r);
        });
        if (type.fulfills) {
          (j.fulfills || []).forEach(function (pid) {
            var p = st.promises.filter(function (x) { return x.id === pid && x.status === 'pending'; })[0];
            if (p) {
              p.status = 'kept';
              game.addStat('credibility', 4);
              game.shiftFactions(3, 'statement');
              notes.push('兑现承诺：' + p.text);
            }
          });
        }
        (j.promises || []).forEach(function (p) {
          var turns = Math.max(1, Math.round((Number(p.days) || 1) * game.level.contract.slotsPerDay));
          st.seq += 1;
          var due = Math.min(game.level.contract.turns, st.turn + turns);
          st.promises.push({ id: 'pr' + st.seq, text: String(p.text || '').slice(0, 60), due: due, status: 'pending', turn: st.turn });
          notes.push('新承诺（第 ' + due + ' 回合前兑现）：' + p.text);
        });
        (j.violations || []).forEach(function (did) {
          var d = game.level.client.demands.filter(function (x) { return x.id === did; })[0];
          if (!d) return;
          st.counters.violations = (st.counters.violations || 0) + 1;
          game.addStat('satisfaction', -d.penalty / game.diff.patienceMul);
          game.message('client', game.pick('client', 'violation'), 'angry');
          notes.push('违反客户红线：' + d.text);
        });

        var post = WW.Feed.create(game, {
          authorObj: { name: game.level.client.name + (ch.id === 'weibo' ? '官方围脖' : ch.id === 'wechat' ? '公众号' : '官网'), tier: 'client', faction: null, persona: null, opp: null },
          platform: ch.id === 'weibo' ? 'weibo' : 'news',
          title: title, content: text.slice(0, 500), stance: U.clamp(Math.round(q / 3.5), -2, 2),
          isClient: true, source: 'statement', tags: [type.name],
          comments: (j.reactions || []).slice(0, 4)
        });
        st.counters.statements += 1;
        st.counters.statementsTurn += 1;
        st.recent.playerContent += 1;
        st.lastStatement = { turn: st.turn, title: title, type: type.name, excerpt: text.slice(0, 160), q: U.round(q, 1), postId: post.id };
        return {
          text: '发布《' + title + '》（' + type.name + '）：' + (j.verdict || '评审完成'),
          detail: { kind: 'statement', scores: s, q: U.round(q, 1), verdict: j.verdict, notes: notes, postId: post.id, source: res.source }
        };
      });
    }
  });

  /* ------------------------------------------------------------------ 水军 */
  register('shill', {
    cost: function (game, item, params) {
      var t = tierOf(item, params.tier);
      var n = Number(params.count) || item.params.counts[0];
      return t.price * n / 100;
    },
    validate: function (game, item, params) {
      if (String(params.direction || '').trim().length < 4) return '请写清楚节奏方向（至少 4 个字）';
      return '';
    },
    run: function (game, item, params) {
      var st = game.state;
      var t = tierOf(item, params.tier);
      var n = Number(params.count) || item.params.counts[0];
      var qf = item.params.countFactor[String(n)] || n / 100;
      var samples = n >= 1000 ? 6 : n >= 300 ? 5 : 4;
      var direction = String(params.direction).trim().slice(0, 120);
      return game.runAI('shill.generate', { tier: t.id, tierName: t.name, count: n, direction: direction, platform: params.platform || '', samples: samples }).then(function (res) {
        var g = res.data;
        var pers = U.clamp(g.persuasiveness, 0, 10);
        var awk = U.clamp(g.awkwardness, 0, 10);
        if (t.id === 'zombie') awk = Math.max(awk, 6);
        var fatigue = Math.pow(0.75, st.itemUsesTurn.shill || 0);
        var impulse = qf * t.power * (0.5 + pers / 10) * (1 - awk / 25) * heatDamp(game) * 2.6 * fatigue;
        game.shiftFactions(impulse, 'shill');
        var detect = t.detect * (0.7 + awk / 10);
        game.addExposure((n / 100) * detect * 0.8);
        var batchId = st.shillBatches.length;
        st.shillBatches.push({ id: batchId, turn: st.turn, tier: t.id, count: n, impulse: impulse, detect: detect, exposed: false, direction: direction });
        var posts = (g.posts || []).slice(0, samples);
        posts.forEach(function (p) {
          WW.Feed.create(game, {
            author: t.id === 'zombie' ? game.rng.pick(D.botNames) : p.author, tier: 'normal', faction: 'fans',
            platform: params.platform || null, content: p.content, stance: pers >= 6 || t.id === 'zombie' ? 2 : 1,
            isShill: true, shillTier: t.id, shillBatch: batchId, weight: (n / 100) * 0.6 / Math.max(1, posts.length), source: 'shill'
          });
        });
        game.markManipulation();
        st.recent.playerContent += 1;
        return {
          text: '投放 ' + n + ' 条' + t.name + '：“' + direction + '”（说服力 ' + pers + '/10，违和感 ' + awk + '/10）',
          detail: { kind: 'shill', persuasiveness: pers, awkwardness: awk, posts: posts.length, source: res.source }
        };
      });
    }
  });

  /* ------------------------------------------------------- 删帖 / 限流（两步） */
  function classifyCandidates(game, item, params) {
    var st = game.state;
    var pool = WW.Feed.ranked(st, 'all').filter(function (p) {
      return p.status !== 'deleted' && !p.isClient && !(item.handler === 'throttle' && p.throttled);
    }).slice(0, 60);
    var criterion = String(params.criterion || '').trim();
    return game.runAI('posts.classify', {
      criterion: criterion,
      posts: pool.map(function (p) {
        return { id: p.id, platform: (D.platforms[p.platform] || {}).name, author: p.author.name, tier: (D.tiers[p.author.tier] || {}).name, content: (p.title ? p.title + '｜' : '') + p.content.slice(0, 140), tags: p.tags };
      })
    }).then(function (res) {
      var reasons = {};
      (res.data.matches || []).forEach(function (m) { reasons[m.id] = m.reason || ''; });
      var limit = (item.params && item.params.maxPosts) || 12;
      var hits = pool.filter(function (p) { return Object.prototype.hasOwnProperty.call(reasons, p.id); }).slice(0, limit);
      return {
        criterion: criterion, source: res.source,
        candidates: hits.map(function (p) {
          var c = deleteCost(p);
          if (item.handler === 'throttle' && p.platform !== 'overseas' && c === null && !p.immune) c = 1;
          return {
            id: p.id, reason: reasons[p.id], cost: c === null ? null : U.round(c * ((item.params && item.params.priceMul) || 1), 1),
            immune: c === null, post: p
          };
        })
      };
    });
  }

  function selectedPosts(game, params) {
    return (params.ids || []).map(function (id) { return WW.Feed.find(game.state, id); }).filter(function (p) {
      return p && p.status !== 'deleted' && !p.isClient && deleteCost(p) !== null;
    });
  }

  register('delete', {
    cost: function (game, item, params) {
      return U.sum(selectedPosts(game, params), function (p) { return deleteCost(p); });
    },
    validate: function (game, item, params) {
      if (!params.ids || !params.ids.length) return '没有选中可删除的帖子';
      return '';
    },
    preview: classifyCandidates,
    run: function (game, item, params) {
      var st = game.state;
      var posts = selectedPosts(game, params);
      if (!posts.length) return Promise.resolve({ cancelled: true, reason: '选中的帖子都删不掉' });
      var reach = 0, bigs = 0, victims = 0;
      posts.forEach(function (p) {
        p.status = 'deleted';
        p.deletedTurn = st.turn;
        reach += WW.Feed.reachOf(p);
        if (p.author.tier === 'bigv' || p.author.tier === 'media') bigs += 1;
        if (p.author.faction === 'victim') victims += 1;
        if (p.fact) WW.Truth.delayEvidence(game, p.fact, 'delete');
      });
      var n = posts.length;
      game.addStat('heat', -Math.min(15, reach * 0.3));
      game.addExposure(n * 0.8 + bigs * 2);
      if (victims) game.shiftFaction('victim', -Math.min(15, victims * 4), 0.4);
      st.counters.deleted += n;
      st.recent.deleted += n;
      game.markManipulation();
      var p = (item.params.backfireBase + item.params.backfirePer * n + 0.08 * bigs + st.stats.heat / 100 * 0.15) * game.diff.detectMul;
      var backfire = game.rng.chance(Math.min(0.8, p));
      if (backfire) {
        game.addStat('heat', 10);
        game.shiftFactions(-6, 'event');
        game.addExposure(8);
        game.queuePosts({ kind: 'backfire', count: 2, stance: -2, pool: 'deleteBackfire', hint: '网友发现帖子被删，愤怒质问“心虚了？”', tags: ['删帖反噬'] });
      }
      return Promise.resolve({
        text: '删除 ' + n + ' 条帖子（' + (params.criterion || '手动选择') + '）' + (backfire ? '——被网友发现，删帖反噬！' : ''),
        detail: { kind: 'delete', count: n, backfire: backfire }
      });
    }
  });

  register('throttle', {
    cost: function (game, item, params) {
      return U.sum(selectedPosts(game, params).filter(function (p) { return p.platform !== 'overseas'; }), function (p) {
        return deleteCost(p) * (item.params.priceMul || 1.5);
      });
    },
    validate: function (game, item, params) {
      if (!params.ids || !params.ids.length) return '没有选中可限流的帖子';
      return '';
    },
    preview: classifyCandidates,
    run: function (game, item, params) {
      var st = game.state;
      var posts = selectedPosts(game, params).filter(function (p) { return p.platform !== 'overseas'; });
      if (!posts.length) return Promise.resolve({ cancelled: true, reason: '选中的帖子都限不了流' });
      posts.forEach(function (p) { p.throttled = true; });
      var n = posts.length;
      game.addStat('heat', -Math.min(8, n * 0.8));
      game.addExposure(n * 0.4);
      game.markManipulation();
      var backfire = game.rng.chance(Math.min(0.5, 0.02 * n * game.diff.detectMul));
      if (backfire) {
        game.addStat('heat', 5);
        game.addExposure(5);
        game.queuePosts({ kind: 'backfire', count: 1, stance: -2, pool: 'deleteBackfire', hint: '有人发现自己的帖子被限流，晒出对比截图', tags: ['限流'] });
      }
      return Promise.resolve({ text: '限流 ' + n + ' 条帖子' + (backfire ? '——有人发现被限流了' : ''), detail: { kind: 'throttle', count: n, backfire: backfire } });
    }
  });

  /* ------------------------------------------------------------------ 控评 */
  register('control', {
    cost: function (game, item, params) {
      var p = targetPost(game, params);
      return (item.cost || 0) + (p ? WW.Feed.reachOf(p) * 0.15 : 0);
    },
    validate: function (game, item, params) {
      var p = targetPost(game, params);
      if (!p) return '请选择一条帖子';
      if (p.controlled) return '这条帖子已经控过评了';
      return '';
    },
    run: function (game, item, params) {
      var st = game.state;
      var p = targetPost(game, params);
      return game.runAI('control.generate', { post: { author: p.author.name, content: p.content.slice(0, 200), platform: (D.platforms[p.platform] || {}).name }, direction: params.direction || '' }).then(function (res) {
        var negatives = p.comments.filter(function (c) { return c.stance < 0; }).length;
        p.foldedComments += negatives + Math.round(p.commentCount * 0.3);
        p.comments = (res.data.comments || []).slice(0, 4).map(function (c) {
          return { author: c.author || game.rng.pick(D.nicknames), content: c.content, stance: 2, likes: Math.round(p.likes * game.rng.range(0.1, 0.3)), shill: true };
        });
        p.controlled = true;
        p.protectedUntil = st.turn + 2;
        var reach = WW.Feed.reachOf(p);
        game.addExposure((item.params.exposure || 3) + (reach >= 12 ? 2 : 0));
        game.shiftFaction('fans', 3, 0.1);
        game.shiftFactions(1.5, 'shill');
        game.markManipulation();
        return { text: '控评「' + p.author.name + '」的帖子：折叠 ' + p.foldedComments + ' 条评论，好评顶上热评', detail: { kind: 'control', postId: p.id, source: res.source } };
      });
    }
  });

  /* ---------------------------------------------------------------- 撤热搜 */
  register('trend_remove', {
    run: function (game, item, params) {
      var st = game.state;
      var before = st.stats.heat;
      game.addStat('heat', -(item.params.heatDrop || 25));
      game.addExposure(item.params.exposure || 8);
      st.counters.trendRemoved += 1;
      st.recent.suppressed += 1;
      st.flags.suppressed = true;
      st.trend.removedTurn = st.turn;
      game.markManipulation();
      var backfire = before >= (item.params.backfireHeat || 70) && game.rng.chance((item.params.backfireChance || 0.35) * game.diff.detectMul);
      if (backfire) {
        game.addStat('heat', 12);
        game.shiftFactions(-5, 'event');
        game.addExposure(6);
        game.queuePosts({ kind: 'backfire', count: 2, stance: -2, pool: 'trendBackfire', hint: '网友发现热搜突然消失，质疑有人花钱撤热搜', tags: ['撤热搜'] });
      }
      return Promise.resolve({ text: '撤下热搜' + (backfire ? '——“热搜怎么没了？”反噬！' : '，话题热度骤降'), detail: { kind: 'trend_remove', backfire: backfire } });
    }
  });

  /* ------------------------------------------------------------ 转移话题 */
  register('distraction', {
    run: function (game, item, params) {
      var st = game.state;
      var repeated = st.counters.distractions > 0;
      return game.runAI('distraction.generate', { hint: params.hint || '' }).then(function (res) {
        var topic = String(res.data.topic || game.rng.pick(D.pools.distraction)).slice(0, 30);
        game.addHeadline(topic, 97, { tag: '爆', distraction: true });
        game.addStat('heat', -(item.params.heatNow || 12));
        game.addModifier({ kind: 'stat', stat: 'heat', delta: -(item.params.heatNext || 8), turns: 1, label: '转移话题余波' });
        game.addExposure((item.params.exposure || 5) + (repeated ? 8 : 0));
        (res.data.posts || []).slice(0, 3).forEach(function (p) {
          WW.Feed.create(game, { author: p.author, content: p.content, stance: 0, tier: 'normal', faction: 'passerby', tags: [topic], source: 'distraction' });
        });
        var caught = false;
        if (repeated && game.rng.chance(0.4 * game.diff.detectMul)) {
          caught = true;
          game.shiftFactions(-4, 'event');
          game.addStat('heat', 4);
          game.queuePosts({ kind: 'backfire', count: 1, stance: -1, hint: '网友怀疑“' + topic + '”是买来转移视线的：这瓜出来得也太巧了', tags: ['转移话题'] });
        }
        st.counters.distractions += 1;
        game.markManipulation();
        return { text: '买下热搜「' + topic + '」转移视线' + (caught ? '——被网友识破！' : ''), detail: { kind: 'distraction', topic: topic, caught: caught, source: res.source } };
      });
    }
  });

  /* ------------------------------------------------------------ KOL 软文 */
  register('kol', {
    cost: function (game, item, params) { return tierOf(item, params.tier).price; },
    validate: function (game, item, params) {
      if (String(params.brief || '').trim().length < 6) return '请写一份 brief（至少 6 个字）';
      return '';
    },
    run: function (game, item, params) {
      var st = game.state;
      var t = tierOf(item, params.tier);
      return game.runAI('kol.write', { tier: t.name, brief: String(params.brief).slice(0, 300), platform: params.platform || '' }).then(function (res) {
        var k = res.data;
        var pers = U.clamp(k.persuasiveness, 0, 10);
        var fatigue = Math.pow(0.7, st.itemUsesTurn.kol || 0) * Math.max(0.5, 1 - 0.06 * (st.itemUses.kol || 0));
        var impulse = t.reach * (0.4 + pers / 10) * 0.55 * heatDamp(game, 250) * fatigue;
        game.shiftFactions(impulse, 'kol');
        game.addStat('credibility', t.id === 'top' ? 2 : 1);
        game.addExposure({ small: 2, big: 4, top: 6 }[t.id] || 3);
        var post = WW.Feed.create(game, {
          author: k.author || null, tier: t.tier || 'kol', faction: 'media', platform: params.platform || null,
          title: k.title, content: k.content, stance: pers >= 6 ? 2 : 1, source: 'kol', tags: ['KOL']
        });
        st.risks.push({ type: 'kol', turn: st.turn, chance: 0.06 + (10 - pers) * 0.01, data: { postId: post.id, impulse: impulse } });
        st.recent.playerContent += 1;
        game.markManipulation();
        return { text: t.name + '发布软文《' + (k.title || '理性分析') + '》（说服力 ' + pers + '/10）', detail: { kind: 'kol', persuasiveness: pers, postId: post.id, source: res.source } };
      });
    }
  });

  /* ---------------------------------------------------------------- 律师函 */
  register('legal', {
    validate: function (game, item, params) {
      if (!targetPost(game, params) && !targetOpp(game, params)) return '请选择一条帖子或一个对手';
      return '';
    },
    run: function (game, item, params) {
      var st = game.state;
      var p = targetPost(game, params);
      var o = targetOpp(game, params);
      st.counters.legal += 1;
      game.addStat('heat', 4);
      var oDef = o ? game.oppDef(o.id) : null;
      var victimTarget = (p && (p.author.faction === 'victim' || p.tags.indexOf('受害者') >= 0)) || (oDef && (oDef.kind === 'victims' || oDef.faction === 'victim'));
      if (victimTarget) {
        game.addStat('heat', 15);
        game.shiftFactions(-10, 'event');
        game.shiftFaction('victim', -15, 0.6);
        game.addExposure(4);
        game.queuePosts({ kind: 'backfire', count: 2, stance: -2, pool: 'legalVictim', hint: '网友震怒：' + game.level.client.name + '给受害者发律师函', tags: ['律师函'] });
        if (o) game.changeMorale(o, 10);
        return Promise.resolve({ text: '给受害者发律师函——全网震怒！', detail: { kind: 'legal', disaster: true } });
      }
      game.shiftFactions(4, 'legal');
      var text;
      if (p) {
        var big = p.author.tier === 'kol' || p.author.tier === 'bigv' || p.author.tier === 'media';
        var removed = !p.immune && game.rng.chance(big ? 0.65 : 0.4);
        if (removed) {
          p.status = 'deleted';
          p.deletedTurn = st.turn;
          game.addModifier({ kind: 'chill', turns: 2, label: '律师函寒蝉效应' });
        }
        if (p.fact) WW.Truth.delayEvidence(game, p.fact, 'legal');
        if (!big) game.shiftFaction('passerby', -4, 0.3);
        if (p.opp && st.opponents[p.opp]) game.changeMorale(st.opponents[p.opp], -8);
        text = '给「' + p.author.name + '」发律师函' + (removed ? '，对方删帖了' : '，对方没理你');
      } else {
        game.changeMorale(o, -15);
        o.strength = U.clamp(o.strength - 4, 0, 100);
        text = '给「' + o.name + '」发律师函，对方士气受挫';
      }
      if (game.rng.chance(0.3)) game.queuePosts({ kind: 'backfire', count: 1, stance: -1, pool: 'legalBackfire', hint: '网友玩梗“律师函警告”，嘲讽仗势欺人', tags: ['律师函'] });
      return Promise.resolve({ text: text, detail: { kind: 'legal' } });
    }
  });

  /* -------------------------------------------------------------- 召唤铁拳 */
  register('iron_fist', {
    validate: function (game, item, params) {
      if (!targetPost(game, params) && !targetOpp(game, params)) return '请选择要举报的帖子或对手';
      var p = targetPost(game, params);
      if (p && p.isClient) return '不能举报自己';
      return '';
    },
    run: function (game, item, params) {
      var st = game.state;
      var p = targetPost(game, params);
      var o = targetOpp(game, params);
      st.counters.ironFist += 1;
      var judge;
      if (p && p.fact && st.facts[p.fact]) {
        var f = st.facts[p.fact];
        judge = Promise.resolve({ source: 'truth', data: { violation: !f.isTrue, type: !f.isTrue ? '散布不实信息' : '无违规', confidence: 9, reason: !f.isTrue ? '所述内容与事实不符' : '所述内容属实' } });
      } else if (p) {
        judge = game.runAI('report.judge', { target: 'post', author: p.author.name, content: p.content.slice(0, 300), platform: (D.platforms[p.platform] || {}).name });
      } else {
        var oppDef = game.oppDef(o.id);
        var dirty = o.flags.spreadRumor || o.flags.usedShill;
        judge = Promise.resolve({ source: 'truth', data: { violation: !!dirty, type: o.flags.spreadRumor ? '散布谣言' : o.flags.usedShill ? '雇佣水军' : '无违规', confidence: dirty ? 8 : 2, reason: dirty ? '有据可查' : (oppDef && oppDef.kind === 'victims' ? '维权行为本身不违规' : '未发现违规证据') } });
      }
      return judge.then(function (res) {
        var j = res.data;
        var successP = j.violation ? U.clamp(0.5 + j.confidence * 0.045, 0, 0.95) : 0.08 / game.diff.detectMul;
        var success = game.rng.chance(successP);
        var targetName = p ? p.author.name : o.name;
        var text;
        if (success) {
          if (p) {
            p.status = 'deleted';
            p.deletedTurn = st.turn;
            p.removedBy = 'platform';
            if (p.author.persona) st.banned[p.author.persona] = true;
            if (p.opp && st.opponents[p.opp]) {
              var po = st.opponents[p.opp];
              po.strength = U.clamp(po.strength - 20, 0, 100);
              game.changeMorale(po, -25);
            }
            if (p.fact && !st.facts[p.fact].isTrue) WW.Truth.refute(game, p.fact, '平台处置');
          } else {
            o.strength = U.clamp(o.strength - 25, 0, 100);
            game.changeMorale(o, -30);
          }
          if (j.violation) {
            game.addStat('credibility', 4);
            game.shiftFactions(3, 'event');
            game.queuePosts({ kind: 'news', count: 1, stance: 1, tier: 'media', pool: 'ironFistSuccess', vars: { target: targetName }, hint: '平台通报：对散布不实信息的“' + targetName + '”依规处置', tags: ['铁拳'] });
            text = '铁拳落下：「' + targetName + '」因' + (j.type || '违规') + '被处理';
          } else {
            st.risks.push({ type: 'wrongful', turn: st.turn, chance: 0.25, data: { name: targetName } });
            text = '「' + targetName + '」被处理了——但对方说的其实是真话，埋下隐患';
          }
        } else {
          game.addExposure(10);
          game.shiftFaction('passerby', -4, 0.3);
          game.addStat('heat', 3);
          game.queuePosts({ kind: 'news', count: 1, stance: -1, pool: 'ironFistFail', vars: { target: targetName }, hint: '举报“' + targetName + '”失败，网友嘲讽' + game.level.client.name + '急了', tags: ['铁拳'] });
          text = '举报「' + targetName + '」失败：' + (j.reason || '未见违规');
          var handleFact = p && p.fact ? st.facts[p.fact] : null;
          var boomerang = (handleFact && handleFact.isTrue && handleFact.regulatory && !handleFact.fixed) || (!p && game.findHandle());
          if (boomerang && game.rng.chance((item.params.boomerang || 0.35) * game.diff.detectMul)) {
            WW.Truth.regulatorStrike(game, '铁拳回旋');
            text += '——铁拳回旋，监管反查客户！';
          }
        }
        return { text: text, detail: { kind: 'iron_fist', success: success, violation: !!j.violation, reason: j.reason, source: res.source } };
      });
    }
  });

  /* -------------------------------------------------------------- 反向扒皮 */
  register('expose', {
    validate: function (game, item, params) { return targetOpp(game, params) ? '' : '请选择一个对手'; },
    run: function (game, item, params) {
      var st = game.state;
      var o = targetOpp(game, params);
      var def = game.oppDef(o.id);
      var dirt = [];
      if (o.flags.usedShill) dirt.push('雇佣水军抹黑');
      if (o.flags.spreadRumor) dirt.push('散布谣言');
      (def.dirt || []).forEach(function (d) { dirt.push(d); });
      var ok = dirt.length > 0;
      return game.runAI('expose.generate', { opp: o.name, dirt: dirt, success: ok }).then(function (res) {
        (res.data.posts || []).slice(0, 2).forEach(function (pp) {
          WW.Feed.create(game, { author: pp.author, content: pp.content, stance: ok ? 1 : -1, tier: 'kol', faction: 'sleuth', tags: ['反向扒皮'], source: 'expose' });
        });
        if (ok) {
          st.counters.exposeSuccess = (st.counters.exposeSuccess || 0) + 1;
          game.changeMorale(o, -30);
          o.strength = U.clamp(o.strength - 10, 0, 100);
          game.shiftFactions(6, 'expose');
          game.shiftFaction(def.faction, -8, 0.4);
          game.addExposure(2);
          return { text: '反向扒皮「' + o.name + '」：' + dirt.join('、') + '，舆论开始反转', detail: { kind: 'expose', success: true, source: res.source } };
        }
        game.shiftFactions(-4, 'event');
        game.addExposure(6);
        return { text: '扒「' + o.name + '」没扒出东西，反被嘲“公关公司急了”', detail: { kind: 'expose', success: false, source: res.source } };
      });
    }
  });

  /* -------------------------------------------------------------- 舆情监测 */
  register('monitor', {
    run: function (game) {
      game.state.monitor = true;
      game.message('system', '舆情监测系统已上线：暴露度、阵营明细、对手意图与证据预警现在全部可见。', 'neutral');
      return Promise.resolve({ text: '部署舆情监测系统', detail: { kind: 'monitor' } });
    }
  });

  /* -------------------------------------------------------------- 内部调查 */
  register('investigate', {
    validate: function (game, item, params) {
      var f = game.state.facts[params.factId];
      if (!f) return '请选择要核实的事项';
      if (f.known) return '这件事你已经查清楚了';
      return '';
    },
    run: function (game, item, params) {
      var st = game.state;
      var f = st.facts[params.factId];
      f.known = true;
      var lines = ['调查结果：「' + f.text + '」——' + (f.isTrue ? '属实' : '不实')];
      if (f.clientClaim) lines.push('客户口径“' + f.clientClaim + '”' + (f.isTrue ? '是在糊弄你。' : '没有说谎。'));
      if (f.isTrue && f.clientClaim) st.flags.clientLied = true;
      if (f.evidence && f.isTrue && !f.revealed) lines.push('相关证据可能在第 ' + WW.Truth.evidenceTurn(f) + ' 回合前后由“' + f.evidence.source + '”曝光。');
      if (f.regulatory && f.isTrue) lines.push('注意：这是能被“召唤铁拳”抓住的把柄。');
      game.message('system', lines.join('\n'), f.isTrue ? 'bad' : 'good');
      return Promise.resolve({ text: '内部摸底：' + lines[0], detail: { kind: 'investigate', fact: f.id, isTrue: f.isTrue, lines: lines } });
    }
  });

  /* -------------------------------------------------------------- 和解赔偿 */
  register('settle', {
    cost: function (game, item, params) { return scaleOf(item, params.scale).price; },
    run: function (game, item, params) {
      var st = game.state;
      var sc = scaleOf(item, params.scale);
      game.shiftFaction('victim', sc.power, 0.6);
      game.shiftFactions(sc.power * 0.12, 'compensation');
      var removed = 0;
      st.posts.forEach(function (p) {
        if (p.status !== 'deleted' && p.author.faction === 'victim' && !p.immune && game.rng.chance(0.5)) {
          p.status = 'deleted';
          p.deletedTurn = st.turn;
          removed += 1;
        }
      });
      Object.keys(st.facts).forEach(function (id) {
        var f = st.facts[id];
        if (f.evidence && f.evidence.suppressBy.indexOf('settle') >= 0 && !f.revealed) {
          if (sc.id === 'large') f.evidence.suppressed = true;
          else WW.Truth.delayEvidence(game, id, 'settle', sc.id === 'medium' ? 2 : 1);
        }
      });
      game.addStat('satisfaction', -4 / game.diff.patienceMul);
      st.risks.push({ type: 'settle', turn: st.turn, chance: sc.leak, data: { scale: sc.id } });
      st.counters.settled += 1;
      return Promise.resolve({ text: sc.name + '：苦主情绪缓和，' + removed + ' 条维权帖被撤下', detail: { kind: 'settle', removed: removed } });
    }
  });

  /* -------------------------------------------------------------- 招安收编 */
  register('coopt', {
    cost: function (game, item, params) {
      var o = targetOpp(game, params);
      return o ? o.strength * (item.params.pricePerStrength || 0.8) + o.resources * 0.2 : 0;
    },
    validate: function (game, item, params) {
      var o = targetOpp(game, params);
      if (!o) return '请选择一个对手';
      var def = game.oppDef(o.id);
      if (def && !def.cooptable) return '「' + o.name + '」收买不了';
      return '';
    },
    run: function (game, item, params) {
      var st = game.state;
      var o = targetOpp(game, params);
      if (game.rng.chance(0.75)) {
        game.retireOpponent(o, '拿钱之后，「' + o.name + '」突然安静了。');
        o.coopted = true;
        st.risks.push({ type: 'coopt', turn: st.turn, chance: (item.params.leak || 0.15), data: { opp: o.id, name: o.name } });
        return Promise.resolve({ text: '「' + o.name + '」收下了“合作费”，偃旗息鼓', detail: { kind: 'coopt', success: true } });
      }
      game.changeMorale(o, 10);
      game.addStat('heat', 5);
      game.addExposure(8);
      game.queuePosts({ kind: 'backfire', count: 1, stance: -2, opp: o.id, hint: '「' + o.name + '」晒出公关公司的收买私信，嘲讽“想花钱让我闭嘴”', tags: ['收买'] });
      return Promise.resolve({ text: '收买「' + o.name + '」失败，对方把私信晒了出来', detail: { kind: 'coopt', success: false } });
    }
  });

  /* ------------------------------------------------------------ 临时工背锅 */
  register('scapegoat', {
    run: function (game) {
      var st = game.state;
      game.shiftFactions(6 * cf(game), 'scapegoat');
      game.addStat('credibility', -6);
      game.addStat('heat', -1);
      var again = st.counters.scapegoat > 0;
      if (again) {
        game.addStat('heat', 5);
        game.shiftFactions(-4, 'event');
      }
      if (game.hasTrueFactTag('management')) game.addLieDebt(null, 1);
      game.queuePosts({ kind: 'backfire', count: 1, stance: -1, pool: 'scapegoat', hint: '网友吐槽“又是临时工”', tags: ['临时工'] });
      st.counters.scapegoat += 1;
      return Promise.resolve({ text: '让“涉事员工”背锅' + (again ? '——“又是临时工”梗刷屏' : ''), detail: { kind: 'scapegoat' } });
    }
  });

  /* ------------------------------------------------------------ 第三方背书 */
  register('endorse', {
    validate: function (game, item, params) {
      var f = game.state.facts[params.factId];
      if (!f) return '请选择要证伪的指控';
      if (f.refuted) return '这条指控已经被证伪了';
      if (f.revealed) return '这件事已经实锤，报告救不了';
      return '';
    },
    run: function (game, item, params) {
      var st = game.state;
      var f = st.facts[params.factId];
      if (!f.isTrue) {
        game.addStat('credibility', 12);
        game.shiftFactions(8, 'statement');
        WW.Truth.refute(game, f.id, '第三方检测');
        return Promise.resolve({ text: '第三方报告证伪了“' + f.text + '”，公信力大涨', detail: { kind: 'endorse', honest: true } });
      }
      game.addStat('credibility', 6);
      game.shiftFactions(4, 'statement');
      f.denied = true;
      f.fakeEndorsed = true;
      game.addLieDebt(f.id, 2 * f.weight);
      st.risks.push({ type: 'endorse', turn: st.turn, chance: 0.18, data: { fact: f.id } });
      return Promise.resolve({ text: '拿到一份“证伪”报告——但指控其实是真的，这是颗定时炸弹', detail: { kind: 'endorse', honest: false } });
    }
  });

  /* -------------------------------------------------------------- 真诚整改 */
  register('rectify', {
    cost: function (game, item) {
      return Math.max(10, game.state.budgetInitial * ((item.params && item.params.costRatio) || 0.3));
    },
    run: function (game, item) {
      var st = game.state;
      game.addModifier({ kind: 'rectify', turns: (item.params && item.params.turns) || 3, label: '整改进行中' });
      game.shiftFactions(4, 'rectify');
      game.addStat('credibility', 5);
      Object.keys(st.facts).forEach(function (id) {
        var f = st.facts[id];
        if (f.isTrue) {
          f.fixed = true;
          if (f.debt > 0) {
            var cut = f.debt / 2;
            f.debt -= cut;
            st.lieDebt = Math.max(0, st.lieDebt - cut);
          }
        }
      });
      if (!game.level.client.acceptsRectify) {
        game.addStat('satisfaction', -15 / game.diff.patienceMul);
        game.message('client', '整改？你知道这得花多少钱吗？！……行吧，你们最好有把握。', 'angry');
      }
      st.flags.rectified = true;
      game.queuePosts({ kind: 'news', count: 1, stance: 1, tier: 'media', pool: 'rectify', hint: game.level.client.name + '宣布全面整改，第三方机构进驻', tags: ['整改'] });
      return Promise.resolve({ text: '启动真诚整改：未来几回合口碑与公信力稳步回升', detail: { kind: 'rectify' } });
    }
  });

  /* ------------------------------------------------------------ 自定义 AI 道具 */
  register('custom_ai', {
    validate: function () { return ''; },
    run: function (game, item, params) {
      var eff = item.effect || {};
      return game.runAI('item.custom', { itemId: item.id, name: item.name, desc: item.desc, prompt: eff.prompt, bounds: eff.bounds, instruction: String(params.instruction || '').slice(0, 300), posts: eff.posts }).then(function (res) {
        var r = res.data;
        var bounds = eff.bounds || {};
        var applied = {};
        ['sentiment', 'heat', 'credibility', 'exposure', 'satisfaction'].forEach(function (k) {
          var b = bounds[k];
          if (!b) return;
          var v = U.clamp(Number(r.deltas && r.deltas[k]) || 0, b[0], b[1]);
          if (!v) return;
          applied[k] = v;
          if (k === 'sentiment') game.shiftFactions(v, item.channel || 'statement');
          else if (k === 'exposure') game.addExposure(v);
          else game.addStat(k, v);
        });
        (r.posts || []).slice(0, eff.posts || 2).forEach(function (p) {
          WW.Feed.create(game, { author: p.author, content: p.content, stance: U.clamp(Number(p.stance), -2, 2), tags: [item.name], source: 'custom' });
        });
        WW.Effects.apply(game, eff.effects, { id: item.id, title: item.name });
        if (applied.exposure > 0) game.markManipulation();
        return { text: item.name + '：' + (r.narration || '执行完毕'), detail: { kind: 'custom', deltas: applied, source: res.source } };
      });
    }
  });

  WW.Actions = { register: register, get: get, deleteCost: deleteCost, factName: factName };
})(window.WW);
