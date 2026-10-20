/*
 * Level schema: defaults, normalisation and validation.
 * A level file only needs the fields that differ from DEFAULTS; normalize() fills in the rest so
 * the engine never has to guess. The editor uses the same functions, so what validates in the
 * editor is exactly what the engine runs.
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;

  function stageDefaults(budget) {
    return [
      {
        id: 'stage_stop', title: '止血', desc: '先把热度压下来，别让事情继续发酵。',
        rewards: [{ type: 'unlock', tier: 2 }, { type: 'budget', delta: Math.round(budget * 0.25) }, { type: 'message', from: 'client', text: '热度总算下来点了，再给你们追加一笔预算。' }],
        tasks: [{ id: 'task_heat60', title: '热度降到 60 以下', required: true, complete: { var: 'stats.heat', op: '<=', value: 60 } }]
      },
      {
        id: 'stage_turn', title: '扭转', desc: '把口碑拉回来。',
        rewards: [{ type: 'unlock', tier: 3 }, { type: 'budget', delta: Math.round(budget * 0.2) }],
        tasks: [{ id: 'task_s0', title: '舆论好感回正（≥0）', required: true, complete: { var: 'stats.sentiment', op: '>=', value: 0 } }]
      },
      {
        id: 'stage_close', title: '善后', desc: '稳住局面，体面结案。',
        rewards: [],
        tasks: [{
          id: 'task_close', title: '好感 ≥ 15 且热度 ≤ 40', required: true,
          complete: { all: [{ var: 'stats.sentiment', op: '>=', value: 15 }, { var: 'stats.heat', op: '<=', value: 40 }] }
        }]
      }
    ];
  }

  var DEFAULT_RANDOM_EVENTS = [
    {
      id: 're_bigmelon', title: '天降大瓜', weight: 2, builtin: true,
      condition: { var: 'stats.heat', op: '>=', value: 30 },
      effects: [
        { type: 'stat', stat: 'heat', delta: -15 },
        { type: 'headline', text: '某顶流塌房', heat: 96, tag: '爆' },
        { type: 'message', from: 'news', text: '另一个大瓜爆了，全网注意力被吸走。' }
      ]
    },
    {
      id: 're_faker', title: '职业打假人下场', weight: 1.5, builtin: true,
      condition: { var: 'stats.heat', op: '>=', value: 50 },
      effects: [
        { type: 'stat', stat: 'heat', delta: 6 },
        { type: 'posts', count: 1, stance: -2, tier: 'bigv', hint: '职业打假人发长视频逐条质疑{client}' }
      ]
    },
    {
      id: 're_meme', title: '段子手造梗', weight: 1.5, builtin: true,
      effects: [
        { type: 'stat', stat: 'heat', delta: 5 },
        { type: 'posts', count: 2, stance: -1, hint: '段子手拿“{kw}”造梗，评论区接龙玩梗' }
      ]
    },
    {
      id: 're_kind', title: '暖心路人发声', weight: 1, builtin: true,
      condition: { var: 'stats.sentiment', op: '>=', value: -20 },
      effects: [
        { type: 'stat', stat: 'sentiment', delta: 4 },
        { type: 'posts', count: 1, stance: 1, hint: '普通顾客分享和{client}之间的暖心经历' }
      ]
    },
    {
      id: 're_holiday', title: '小长假', weight: 1, builtin: true,
      effects: [
        { type: 'stat', stat: 'heat', delta: -8 },
        { type: 'message', from: 'news', text: '小长假来了，网友忙着出去玩，讨论量下降。' }
      ]
    },
    {
      id: 're_leak', title: '内部群截图流出', weight: 1, builtin: true,
      condition: { var: 'stats.exposure', op: '>=', value: 35 },
      effects: [
        { type: 'stat', stat: 'exposure', delta: 6 },
        { type: 'posts', count: 1, stance: -2, hint: '疑似{client}内部群截图：“让公关公司多买点水军”' }
      ]
    }
  ];

  var DEFAULT_DEFEATS = [
    { id: 'fired', title: '被客户解约', condition: { var: 'stats.satisfaction', op: '<=', value: 0 }, text: '{contact}：你们明天不用来了。', epilogue: 'fired' },
    { id: 'exposed', title: '操纵舆论翻车', condition: { var: 'stats.exposure', op: '>=', value: 100 }, text: '你们的水军账号、删帖记录被整理成长文，刷屏全网。', epilogue: 'exposed' },
    { id: 'collapse', title: '品牌社死', condition: { var: 'counters.collapseTurns', op: '>=', value: 2 }, text: '舆论好感连续两回合跌破 -85，{client}口碑彻底崩盘。', epilogue: 'collapse' }
  ];

  var DEFAULTS = {
    schemaVersion: 1,
    id: '',
    meta: { title: '未命名关卡', subtitle: '', difficulty: 2, cover: '📰', description: '', tags: [], author: '', order: 99 },
    client: { name: '委托方', contact: '王总', persona: '只关心热搜和钱', demands: [], expectations: [] },
    incident: { summary: '', background: '', keywords: [], severity: 50 },
    facts: [],
    contract: { turns: 8, actionPoints: 3, budget: 80, currency: '万元', slotsPerDay: 2, turnLabels: [] },
    difficulty: { allowed: ['intern', 'regular', 'gold'], overrides: {} },
    initialStats: { sentiment: -40, heat: 70, credibility: 55, exposure: 0, satisfaction: 70 },
    tuning: {
      heatDecay: 0.2, pressureWeight: 16, credibilityWeight: 0.3, severityWeight: 0.25, driftRate: 1,
      exposureCooldown: 4, detectBase: 0.6, randomEventChance: 0.3, organicPosts: 6, spreadWeight: 4,
      pressureBaseline: 20, maxFeed: 140
    },
    factions: null,
    platforms: ['weibo', 'douyin', 'xiaohongshu', 'zhihu', 'bilibili', 'tieba', 'news', 'overseas'],
    personas: [],
    seedPosts: [],
    items: { enabled: ['statement', 'shill', 'delete', 'control'], startTier: 1, unlocks: {}, overrides: {}, custom: [] },
    objectives: null,
    opponents: [],
    abilities: [],
    events: [],
    randomEvents: null,
    victory: { condition: { all: [{ var: 'stats.sentiment', op: '>=', value: 10 }, { var: 'stats.heat', op: '<=', value: 45 }] }, text: '' },
    defeat: [],
    grading: {
      weights: { sentiment: 0.35, heat: 0.15, credibility: 0.15, satisfaction: 0.15, budget: 0.1, exposure: 0.1 },
      thresholds: { S: 85, A: 72, B: 60, C: 45 }
    },
    guide: [],
    ai: { context: '', style: '', extraRules: '' },
    offline: {}
  };

  function arr(v) { return Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]; }
  function num(v, def) { var n = Number(v); return isFinite(n) ? n : def; }
  function str(v, def) { return v === undefined || v === null ? (def || '') : String(v); }
  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  }

  function normFaction(f, i) {
    var base = (D.defaultFactions || []).filter(function (x) { return x.id === f.id; })[0] || {};
    var sens = {};
    D.channelOrder.forEach(function (c) {
      var v = f.sens && f.sens[c] !== undefined ? f.sens[c] : base.sens && base.sens[c] !== undefined ? base.sens[c] : 1;
      sens[c] = num(v, 1);
    });
    return {
      id: str(f.id, 'faction' + (i + 1)),
      name: str(f.name, base.name || '阵营' + (i + 1)),
      desc: str(f.desc, base.desc || ''),
      size: Math.max(0, num(f.size, base.size || 0.1)),
      sentiment: U.clamp(num(f.sentiment, base.sentiment || 0), -100, 100),
      volatility: U.clamp(num(f.volatility, base.volatility || 0.3), 0, 1),
      bias: U.clamp(num(f.bias, base.bias || 0), -100, 100),
      sens: sens
    };
  }

  function normTask(t, i, prefix, required) {
    return {
      id: str(t.id, prefix + '_t' + (i + 1)),
      title: str(t.title, '子任务'),
      desc: str(t.desc, ''),
      required: t.required === undefined ? required : !!t.required,
      complete: t.complete || null,
      fail: t.fail || null,
      deadline: t.deadline ? num(t.deadline, 0) : 0,
      at: t.at === 'end' ? 'end' : '',
      hidden: !!t.hidden,
      rewards: arr(t.rewards),
      penalty: arr(t.penalty)
    };
  }

  function normAbilityRef(a) {
    if (typeof a === 'string') a = { use: a };
    return {
      use: str(a.use, ''),
      weight: a.weight === undefined ? null : num(a.weight, 1),
      cooldown: a.cooldown === undefined ? null : num(a.cooldown, 1),
      condition: a.condition || null,
      overrides: U.isObj(a.overrides) ? a.overrides : {}
    };
  }

  function normalize(raw) {
    var src = U.isObj(raw) ? U.deepClone(raw) : {};
    var lv = U.deepMerge(DEFAULTS, src);
    // conditions are replaced as a whole, never merged key by key
    if (src.victory && src.victory.condition !== undefined) lv.victory.condition = src.victory.condition;

    lv.schemaVersion = WW.SCHEMA_VERSION;
    lv.id = slug(lv.id) || slug(lv.meta.title) || 'level_' + U.hash(JSON.stringify(src)).toString(36);
    lv.meta.title = str(lv.meta.title, '未命名关卡');
    lv.meta.difficulty = U.clamp(Math.round(num(lv.meta.difficulty, 2)), 1, 5);
    lv.meta.tags = arr(lv.meta.tags).map(String);
    lv.meta.order = num(lv.meta.order, 99);

    lv.client.demands = arr(lv.client.demands).map(function (d, i) {
      return { id: str(d.id, 'demand' + (i + 1)), text: str(d.text, ''), keywords: arr(d.keywords).map(String), penalty: num(d.penalty, 12) };
    });
    lv.client.expectations = arr(lv.client.expectations).map(function (x, i) {
      return { id: str(x.id, 'expect' + (i + 1)), byTurn: num(x.byTurn, 3), condition: x.condition || null, penalty: num(x.penalty, 10), text: str(x.text, '') };
    });

    lv.incident.keywords = arr(lv.incident.keywords).map(String);
    if (!lv.incident.keywords.length) lv.incident.keywords = [lv.meta.title];
    lv.incident.severity = U.clamp(num(lv.incident.severity, 50), 0, 100);

    lv.facts = arr(lv.facts).map(function (f, i) {
      var ev = f.evidence ? {
        turn: num(f.evidence.turn, 4), chance: U.clamp(num(f.evidence.chance, 1), 0, 1),
        source: str(f.evidence.source, '知情人'), suppressBy: arr(f.evidence.suppressBy)
      } : null;
      return {
        id: str(f.id, 'f' + (i + 1)), text: str(f.text, ''), clientClaim: str(f.clientClaim, ''),
        isTrue: !!f.isTrue, regulatory: !!f.regulatory, weight: U.clamp(num(f.weight, 1), 0.5, 3),
        keywords: arr(f.keywords).map(String), evidence: ev, origin: str(f.origin, 'seed'),
        publicAtStart: f.publicAtStart === undefined ? true : !!f.publicAtStart,
        tags: arr(f.tags).map(String)
      };
    });

    lv.contract.turns = U.clamp(Math.round(num(lv.contract.turns, 8)), 1, 30);
    lv.contract.actionPoints = U.clamp(Math.round(num(lv.contract.actionPoints, 3)), 1, 9);
    lv.contract.budget = Math.max(0, num(lv.contract.budget, 80));
    lv.contract.slotsPerDay = [1, 2, 3].indexOf(Number(lv.contract.slotsPerDay)) >= 0 ? Number(lv.contract.slotsPerDay) : 2;
    lv.contract.turnLabels = arr(lv.contract.turnLabels).map(String);

    lv.difficulty.allowed = arr(lv.difficulty.allowed).filter(function (d) { return D.difficulties[d]; });
    if (!lv.difficulty.allowed.length) lv.difficulty.allowed = D.difficultyOrder.slice();
    if (!U.isObj(lv.difficulty.overrides)) lv.difficulty.overrides = {};

    ['sentiment', 'heat', 'credibility', 'exposure', 'satisfaction'].forEach(function (k) {
      var lo = k === 'sentiment' ? -100 : 0;
      lv.initialStats[k] = U.clamp(num(lv.initialStats[k], DEFAULTS.initialStats[k]), lo, 100);
    });

    lv.factions = (Array.isArray(lv.factions) && lv.factions.length ? lv.factions : U.deepClone(D.defaultFactions)).map(normFaction);

    lv.platforms = arr(lv.platforms).filter(function (p) { return D.platforms[p]; });
    if (!lv.platforms.length) lv.platforms = D.platformOrder.slice();

    lv.personas = arr(lv.personas).map(function (p, i) {
      return {
        id: str(p.id, 'persona' + (i + 1)), name: str(p.name, '网友' + (i + 1)), faction: str(p.faction, 'passerby'),
        tier: D.tiers[p.tier] ? p.tier : 'normal', platform: D.platforms[p.platform] ? p.platform : 'weibo',
        style: str(p.style, ''), opp: p.opp ? String(p.opp) : null
      };
    });

    lv.seedPosts = arr(lv.seedPosts).map(function (p, i) {
      return {
        id: str(p.id, 'seed' + (i + 1)), persona: p.persona ? String(p.persona) : null,
        author: p.author ? String(p.author) : null, tier: D.tiers[p.tier] ? p.tier : null,
        faction: p.faction ? String(p.faction) : null,
        platform: D.platforms[p.platform] ? p.platform : null, content: str(p.content, ''),
        stance: U.clamp(Math.round(num(p.stance, -1)), -2, 2), fact: p.fact ? String(p.fact) : null,
        likes: Math.max(0, Math.round(num(p.likes, 0))), tags: arr(p.tags).map(String),
        comments: arr(p.comments).map(function (c) {
          return typeof c === 'string' ? { author: '网友', content: c, stance: -1 } : { author: str(c.author, '网友'), content: str(c.content, ''), stance: U.clamp(num(c.stance, 0), -2, 2) };
        }),
        opp: p.opp ? String(p.opp) : null
      };
    });

    lv.items.enabled = U.uniq(arr(lv.items.enabled).map(String));
    lv.items.startTier = U.clamp(Math.round(num(lv.items.startTier, 1)), 1, 3);
    if (!U.isObj(lv.items.unlocks)) lv.items.unlocks = {};
    if (!U.isObj(lv.items.overrides)) lv.items.overrides = {};
    lv.items.custom = arr(lv.items.custom).map(function (c, i) {
      var eff = U.isObj(c.effect) ? c.effect : {};
      return {
        id: str(c.id, 'custom' + (i + 1)), name: str(c.name, '自定义技能'), icon: str(c.icon, '✨'),
        tier: U.clamp(Math.round(num(c.tier, 1)), 1, 3), ap: Math.max(0, Math.round(num(c.ap, 1))), cost: Math.max(0, num(c.cost, 5)),
        handler: 'custom_ai', channel: D.channels[c.channel] ? c.channel : 'statement', target: 'none',
        cooldown: Math.max(0, num(c.cooldown, 0)), maxUses: c.maxUses ? num(c.maxUses, 0) : 0,
        desc: str(c.desc, ''), risk: str(c.risk, ''), custom: true,
        effect: {
          prompt: str(eff.prompt, ''), inputLabel: str(eff.inputLabel, ''),
          bounds: U.isObj(eff.bounds) ? eff.bounds : { sentiment: [-4, 8], heat: [-6, 6], exposure: [0, 6] },
          offlineDeltas: U.isObj(eff.offlineDeltas) ? eff.offlineDeltas : null,
          posts: num(eff.posts, 2), stance: num(eff.stance, 1), effects: arr(eff.effects)
        }
      };
    });

    var objectives = U.isObj(src.objectives) ? src.objectives : null;
    var stages = objectives && Array.isArray(objectives.stages) && objectives.stages.length ? objectives.stages : stageDefaults(lv.contract.budget);
    lv.objectives = {
      stages: stages.map(function (s, i) {
        var sid = str(s.id, 'stage' + (i + 1));
        return {
          id: sid, title: str(s.title, '阶段' + (i + 1)), desc: str(s.desc, ''), rewards: arr(s.rewards),
          tasks: arr(s.tasks).map(function (t, j) { return normTask(t, j, sid, true); })
        };
      }),
      side: arr(objectives && objectives.side).map(function (t, i) {
        var task = normTask(t, i, 'side', false);
        task.required = false;
        task.offer = t.offer === undefined || t.offer === 'start' ? 'start' : t.offer;
        task.choice = !!t.choice;
        task.from = str(t.from, 'client');
        return task;
      })
    };

    lv.abilities = arr(lv.abilities).map(function (a, i) {
      return {
        id: str(a.id, 'ability' + (i + 1)), name: str(a.name, '自定义技能'), icon: str(a.icon, '⚡'), category: str(a.category, '攻击'),
        desc: str(a.desc, ''), counter: str(a.counter, ''), cost: num(a.cost, 6), cooldown: num(a.cooldown, 2), weight: num(a.weight, 2),
        handler: 'generic', condition: a.condition || null, effects: arr(a.effects), aiHint: str(a.aiHint, ''),
        posts: num(a.posts, 1), stance: num(a.stance, -2), params: U.isObj(a.params) ? a.params : {}
      };
    });

    lv.opponents = arr(lv.opponents).map(function (o, i) {
      return {
        id: str(o.id, 'opp' + (i + 1)), name: str(o.name, '对手' + (i + 1)), avatar: str(o.avatar, '👤'),
        desc: str(o.desc, ''), faction: str(o.faction, 'rival'), kind: str(o.kind, 'group'),
        strength: U.clamp(num(o.strength, 50), 0, 100), morale: U.clamp(num(o.morale, 60), 0, 100),
        resources: Math.max(0, num(o.resources, 20)), income: Math.max(0, num(o.income, 6)),
        cooptable: o.cooptable === undefined ? true : !!o.cooptable, platform: D.platforms[o.platform] ? o.platform : 'weibo',
        abilities: arr(o.abilities).map(normAbilityRef).filter(function (a) { return a.use; }),
        events: arr(o.events).map(function (e, j) {
          return { id: str(e.id, 'oe' + (i + 1) + '_' + (j + 1)), title: str(e.title, ''), trigger: e.trigger || null, chance: num(e.chance, 1), once: e.once === undefined ? true : !!e.once, effects: arr(e.effects) };
        }),
        rumors: arr(o.rumors).map(String), pastScandals: arr(o.pastScandals),
        dirt: arr(o.dirt).map(String), startActive: o.startActive === undefined ? true : !!o.startActive,
        enterWhen: o.enterWhen || null
      };
    });

    lv.events = arr(lv.events).map(function (e, i) {
      return {
        id: str(e.id, 'event' + (i + 1)), title: str(e.title, '事件'), text: str(e.text, ''),
        trigger: e.trigger || null, chance: U.clamp(num(e.chance, 1), 0, 1),
        once: e.once === undefined ? true : !!e.once, effects: arr(e.effects)
      };
    });

    lv.randomEvents = (Array.isArray(src.randomEvents) ? src.randomEvents : U.deepClone(DEFAULT_RANDOM_EVENTS)).map(function (e, i) {
      return {
        id: str(e.id, 'random' + (i + 1)), title: str(e.title, '随机事件'), weight: Math.max(0, num(e.weight, 1)),
        condition: e.condition || null, effects: arr(e.effects), once: e.once === undefined ? true : !!e.once, builtin: !!e.builtin
      };
    });

    var defeats = U.deepClone(DEFAULT_DEFEATS);
    arr(src.defeat).forEach(function (d, i) {
      var id = str(d.id, 'defeat' + (i + 1));
      var existing = defeats.filter(function (x) { return x.id === id; })[0];
      var item = { id: id, title: str(d.title, '失败'), condition: d.condition || null, text: str(d.text, ''), epilogue: str(d.epilogue, '') };
      if (existing) defeats[defeats.indexOf(existing)] = item;
      else defeats.push(item);
    });
    lv.defeat = defeats;

    /* guide steps: see js/engine/guide.js. A tip with neither `done` nor `when` lasts one turn. */
    lv.guide = arr(lv.guide).map(function (g, i) {
      var when = U.isObj(g.when) || Array.isArray(g.when) ? g.when : null;
      var done = U.isObj(g.done) || Array.isArray(g.done) ? g.done : null;
      var turn = Math.max(1, num(g.turn, 1));
      var action = U.isObj(g.action) && (g.action.item || g.action.cmd) ? {
        item: str(g.action.item, ''), cmd: str(g.action.cmd, ''), task: str(g.action.task, ''), label: str(g.action.label, ''),
        preset: U.isObj(g.action.preset) ? g.action.preset : {}
      } : null;
      return {
        id: str(g.id, 'guide' + (i + 1)), turn: turn, title: str(g.title, ''), text: str(g.text, ''), target: str(g.target, ''),
        when: when, done: done, skip: U.isObj(g.skip) || Array.isArray(g.skip) ? g.skip : null,
        until: g.until !== undefined ? num(g.until, 0) : (done || when ? 0 : turn),
        optional: !!g.optional, at: g.at === 'result' ? 'result' : 'play', action: action,
        notes: arr(g.notes).filter(U.isObj).map(function (n) { return { when: n.when || null, text: str(n.text, '') }; })
      };
    });

    if (!U.isObj(lv.offline)) lv.offline = {};
    return lv;
  }

  /* ---------- structure: fields in the wrong place ---------- */

  /* Fields that belong under another key; normalize() would silently drop them at the top level. */
  var MISPLACED = { side: 'objectives.side', stages: 'objectives.stages' };
  /* Top-level-only sections that a lost closing bracket can push into a list entry. `events` is
     legitimate inside opponents, `abilities` too, so they are handled per host. */
  var TOP_ONLY = ['meta', 'client', 'incident', 'facts', 'contract', 'initialStats', 'tuning', 'factions', 'platforms', 'personas',
    'seedPosts', 'items', 'objectives', 'opponents', 'randomEvents', 'victory', 'defeat', 'grading', 'guide', 'ai', 'offline'];
  var HOSTS = ['opponents', 'events', 'seedPosts', 'personas', 'facts', 'factions'];

  function nestedTopFields(raw, fn) {
    HOSTS.forEach(function (h) {
      arr(raw[h]).forEach(function (o, i) {
        if (!U.isObj(o)) return;
        Object.keys(o).forEach(function (k) {
          var top = TOP_ONLY.indexOf(k) >= 0 || (k === 'events' && h !== 'opponents');
          if (top) fn(h, i, k, o);
        });
      });
    });
  }

  function structureWarnings(raw, W) {
    if (!U.isObj(raw)) return;
    Object.keys(raw).forEach(function (k) {
      if (DEFAULTS[k] !== undefined) return;
      W(k, MISPLACED[k] ? '「' + k + '」应放在 ' + MISPLACED[k] + '，写在顶层会被忽略' : '未知的顶层字段「' + k + '」，会被忽略');
    });
    nestedTopFields(raw, function (h, i, k) {
      W(h + '[' + i + '].' + k, '「' + k + '」是顶层字段，嵌在 ' + h + '[' + i + '] 里会被忽略（可能少写了一个闭括号）');
    });
  }

  /* AI drafts only: move misplaced sections back where they belong and drop tutorial steps.
   * Returns { level, fixes[] } with a readable line per change. */
  function repairDraft(raw) {
    var lv = U.isObj(raw) ? U.deepClone(raw) : {};
    var fixes = [];
    Object.keys(MISPLACED).forEach(function (k) {
      if (lv[k] === undefined) return;
      if (!U.isObj(lv.objectives)) lv.objectives = {};
      if (lv.objectives[k] === undefined) {
        lv.objectives[k] = lv[k];
        fixes.push('把顶层的「' + k + '」移到 ' + MISPLACED[k]);
      } else fixes.push('删除重复的顶层「' + k + '」');
      delete lv[k];
    });
    nestedTopFields(lv, function (h, i, k, o) {
      if (lv[k] === undefined) {
        lv[k] = o[k];
        fixes.push('把误嵌在 ' + h + '[' + i + '] 里的「' + k + '」移回顶层');
      } else fixes.push('删除误嵌在 ' + h + '[' + i + '] 里的重复「' + k + '」');
      delete o[k];
    });
    if (lv.guide !== undefined) {
      delete lv.guide;
      fixes.push('删除教程步骤 guide（只用于教程关）');
    }
    return { level: lv, fixes: fixes };
  }

  /* ---------- reachability: conditions that can never hold ---------- */

  /* flags the engine sets by itself, and the skill that does it (null: opponents / regulators) */
  var ENGINE_FLAGS = { suppressed: 'trend_remove', clientLied: 'investigate', rectified: 'rectify', abroad: null, regulated: null };

  function walk(x, path, fn) {
    if (Array.isArray(x)) x.forEach(function (v, i) { walk(v, path + '[' + i + ']', fn); });
    else if (U.isObj(x)) {
      fn(x, path);
      Object.keys(x).forEach(function (k) { walk(x[k], path ? path + '.' + k : k, fn); });
    }
  }

  function reachability(lv, W) {
    var skills = {};
    lv.items.enabled.forEach(function (id) { skills[id] = true; });
    lv.items.custom.forEach(function (c) { skills[c.id] = true; });
    var flagsSet = {};
    var refs = [];
    walk(lv, '', function (o, path) {
      if (o.type === 'flag' && o.name) flagsSet[o.name] = true;
      if (o.type === 'unlock' && o.items) [].concat(o.items).forEach(function (id) {
        if (!skills[id]) W(path + '.items', '解锁的技能「' + id + '」不在 items.enabled 里，解锁不会生效', true);
      });
      if (typeof o.var === 'string') refs.push({ v: o.var, path: path });
    });
    var seen = {};
    refs.forEach(function (r) {
      var parts = r.v.split('.');
      var msg = '';
      if (parts[0] === 'flags') {
        var name = parts.slice(1).join('.');
        if (flagsSet[name]) return;
        if (ENGINE_FLAGS.hasOwnProperty(name)) {
          var by = ENGINE_FLAGS[name];
          if (by && !skills[by]) msg = '标记「' + name + '」只有技能「' + by + '」会设置，但本关没有启用它';
        } else msg = '标记「' + name + '」没有任何 flag 效果会设置，这个条件永远不成立';
      } else if ((parts[0] === 'itemUses' || parts[0] === 'itemUsesTurn') && parts[1] && !skills[parts[1]]) {
        msg = '技能「' + parts[1] + '」本关没有启用，使用次数永远是 0';
      }
      if (msg && !seen[r.path]) { seen[r.path] = true; W(r.path, msg, true); }
    });
    stageSkills(lv, flagsSet, W);
  }

  /* Required main-quest tasks that need a skill the player cannot have yet at that stage: the tier
     reached by earlier stage rewards is too low and nothing else unlocks it. */
  function stageSkills(lv, flagsSet, W) {
    var tierOf = function (id) {
      var c = lv.items.custom.filter(function (x) { return x.id === id; })[0];
      var d = c || WW.Data.items[id];
      return (d && d.tier) || 1;
    };
    /* unlocks outside the stage chain (events, side tasks, task rewards) may come at any time */
    var elsewhere = {}, elsewhereTier = 0;
    walk([lv.events, lv.opponents, lv.objectives.side, lv.objectives.stages.map(function (s) { return s.tasks; })], '', function (o) {
      if (o.type !== 'unlock') return;
      if (o.tier) elsewhereTier = Math.max(elsewhereTier, Number(o.tier) || 0);
      [].concat(o.items || []).forEach(function (id) { elsewhere[id] = true; });
    });
    var tier = lv.items.startTier || 1, unlocked = {};
    lv.objectives.stages.forEach(function (s, i) {
      s.tasks.forEach(function (t, j) {
        if (!t.required) return;
        walk(t.complete, '', function (o) {
          if (typeof o.var !== 'string') return;
          var p = o.var.split('.'), id = null;
          if (p[0] === 'itemUses') id = p[1];
          else if (p[0] === 'flags' && ENGINE_FLAGS[p[1]] && !flagsSet[p[1]]) id = ENGINE_FLAGS[p[1]];
          if (!id || lv.items.unlocks[id] || unlocked[id] || elsewhere[id]) return;
          var need = tierOf(id);
          if (need <= tier || need <= elsewhereTier) return;
          W('objectives.stages[' + i + '].tasks[' + j + '].complete', '必做子任务「' + t.title + '」要用技能「' + id + '」（第 ' + need + ' 级），但到这一阶段只解锁到第 ' + tier +
            ' 级，除“看不见的大手”外都会卡死。请在前面阶段的奖励里解锁它，或改成可选任务', true);
        });
      });
      walk(s.rewards, '', function (o) {
        if (o.type !== 'unlock') return;
        if (o.tier) tier = Math.max(tier, Number(o.tier) || 0);
        [].concat(o.items || []).forEach(function (id) { unlocked[id] = true; });
      });
    });
  }

  /* ---------- validation ---------- */

  function validate(level) {
    var errors = [];
    var warnings = [];
    var lv;
    try {
      lv = normalize(level);
    } catch (e) {
      return { errors: [{ path: '', msg: '关卡结构无法解析：' + e.message }], warnings: [], level: null };
    }
    var E = function (path, msg) { errors.push({ path: path, msg: msg }); };
    /* blocking: the level loads but part of it can never work (AI generation sends these back for a fix) */
    var W = function (path, msg, blocking) { warnings.push(blocking ? { path: path, msg: msg, blocking: true } : { path: path, msg: msg }); };

    structureWarnings(level, W);
    if (!level || !level.meta || !level.meta.title) W('meta.title', '建议填写关卡标题');
    if (!lv.incident.summary) W('incident.summary', '建议填写事件概要（AI 生成内容依赖它）');

    var dupCheck = function (list, path, what) {
      var seen = {};
      list.forEach(function (x, i) {
        if (seen[x.id]) E(path + '[' + i + '].id', what + ' id 重复：' + x.id);
        seen[x.id] = true;
      });
    };
    dupCheck(lv.facts, 'facts', '事实');
    dupCheck(lv.personas, 'personas', '网民画像');
    dupCheck(lv.factions, 'factions', '阵营');
    dupCheck(lv.opponents, 'opponents', '对手');
    dupCheck(lv.events, 'events', '事件');
    dupCheck(lv.items.custom, 'items.custom', '自定义技能');
    var allTasks = [];
    lv.objectives.stages.forEach(function (s) { allTasks = allTasks.concat(s.tasks); });
    allTasks = allTasks.concat(lv.objectives.side);
    dupCheck(allTasks, 'objectives', '子任务');

    var sizeSum = U.sum(lv.factions, function (f) { return f.size; });
    if (Math.abs(sizeSum - 1) > 0.05) W('factions', '阵营人口占比合计为 ' + U.round(sizeSum, 2) + '，建议为 1（引擎会按比例换算）');

    var has = function (list, id) { return list.some(function (x) { return x.id === id; }); };

    lv.personas.forEach(function (p, i) {
      if (!has(lv.factions, p.faction)) E('personas[' + i + '].faction', '阵营不存在：' + p.faction);
    });
    lv.seedPosts.forEach(function (p, i) {
      if (p.persona && !has(lv.personas, p.persona)) E('seedPosts[' + i + '].persona', '网民画像不存在：' + p.persona);
      if (p.fact && !has(lv.facts, p.fact)) E('seedPosts[' + i + '].fact', '事实不存在：' + p.fact);
      if (!p.content) W('seedPosts[' + i + '].content', '帖子内容为空');
    });
    if (!lv.seedPosts.length) W('seedPosts', '没有初始帖子，开局信息流会比较空');

    var itemIds = Object.keys(D.items).concat(lv.items.custom.map(function (c) { return c.id; }));
    lv.items.enabled.forEach(function (id, i) {
      if (!D.items[id]) E('items.enabled[' + i + ']', '技能库中没有：' + id);
    });
    Object.keys(lv.items.unlocks).forEach(function (id) {
      if (itemIds.indexOf(id) < 0) E('items.unlocks.' + id, '技能不存在：' + id);
      WW.Cond.validate(lv.items.unlocks[id], lv, 'items.unlocks.' + id, errors);
    });
    Object.keys(lv.items.overrides).forEach(function (id) {
      if (!D.items[id]) W('items.overrides.' + id, '覆盖了不存在的技能：' + id);
    });

    lv.objectives.stages.forEach(function (s, i) {
      if (!s.tasks.length) E('objectives.stages[' + i + ']', '阶段「' + s.title + '」没有子任务');
      if (!s.tasks.some(function (t) { return t.required; })) W('objectives.stages[' + i + ']', '阶段「' + s.title + '」没有必做子任务，会立即完成');
      WW.Effects.validate(s.rewards, lv, 'objectives.stages[' + i + '].rewards', errors);
      s.tasks.forEach(function (t, j) {
        var p = 'objectives.stages[' + i + '].tasks[' + j + ']';
        if (!t.complete) E(p + '.complete', '子任务「' + t.title + '」缺少完成条件');
        WW.Cond.validate(t.complete, lv, p + '.complete', errors);
        WW.Cond.validate(t.fail, lv, p + '.fail', errors);
        if (t.required && t.fail) W(p + '.fail', '必做子任务设置了失败条件，失败后主任务将无法推进');
        WW.Effects.validate(t.rewards, lv, p + '.rewards', errors);
      });
    });
    lv.objectives.side.forEach(function (t, i) {
      var p = 'objectives.side[' + i + ']';
      if (!t.complete) E(p + '.complete', '支线「' + t.title + '」缺少完成条件');
      WW.Cond.validate(t.complete, lv, p + '.complete', errors);
      WW.Cond.validate(t.fail, lv, p + '.fail', errors);
      if (t.offer !== 'start') WW.Cond.validate(t.offer, lv, p + '.offer', errors);
      WW.Effects.validate(t.rewards, lv, p + '.rewards', errors);
      WW.Effects.validate(t.penalty, lv, p + '.penalty', errors);
    });

    var abilityIds = Object.keys(D.abilities).concat(lv.abilities.map(function (a) { return a.id; }));
    lv.opponents.forEach(function (o, i) {
      if (!has(lv.factions, o.faction)) W('opponents[' + i + '].faction', '对手关联的阵营不存在：' + o.faction);
      if (!o.abilities.length) W('opponents[' + i + '].abilities', '对手「' + o.name + '」没有技能，不会出招');
      o.abilities.forEach(function (a, j) {
        if (abilityIds.indexOf(a.use) < 0) E('opponents[' + i + '].abilities[' + j + ']', '技能不存在：' + a.use);
        WW.Cond.validate(a.condition, lv, 'opponents[' + i + '].abilities[' + j + '].condition', errors);
      });
      o.events.forEach(function (e, j) {
        WW.Cond.validate(e.trigger, lv, 'opponents[' + i + '].events[' + j + '].trigger', errors);
        WW.Effects.validate(e.effects, lv, 'opponents[' + i + '].events[' + j + '].effects', errors);
      });
    });
    lv.abilities.forEach(function (a, i) {
      WW.Effects.validate(a.effects, lv, 'abilities[' + i + '].effects', errors);
    });

    lv.events.forEach(function (e, i) {
      WW.Cond.validate(e.trigger, lv, 'events[' + i + '].trigger', errors);
      WW.Effects.validate(e.effects, lv, 'events[' + i + '].effects', errors);
    });
    lv.randomEvents.forEach(function (e, i) {
      if (e.builtin) return;
      WW.Cond.validate(e.condition, lv, 'randomEvents[' + i + '].condition', errors);
      WW.Effects.validate(e.effects, lv, 'randomEvents[' + i + '].effects', errors);
    });
    lv.defeat.forEach(function (d, i) { WW.Cond.validate(d.condition, lv, 'defeat[' + i + '].condition', errors); });
    WW.Cond.validate(lv.victory.condition, lv, 'victory.condition', errors);
    lv.client.expectations.forEach(function (x, i) { WW.Cond.validate(x.condition, lv, 'client.expectations[' + i + '].condition', errors); });
    dupCheck(lv.guide, 'guide', '教程步骤');
    lv.guide.forEach(function (g, i) {
      var p = 'guide[' + i + ']';
      ['when', 'done', 'skip'].forEach(function (k) { WW.Cond.validate(g[k], lv, p + '.' + k, errors); });
      g.notes.forEach(function (n, j) { WW.Cond.validate(n.when, lv, p + '.notes[' + j + '].when', errors); });
      if (g.action && g.action.item && !lv.items.enabled.concat(lv.items.custom.map(function (c) { return c.id; })).some(function (id) { return id === g.action.item; })) {
        W(p + '.action.item', '教程步骤引用的技能「' + g.action.item + '」本关没有启用');
      }
    });

    lv.facts.forEach(function (f, i) {
      if (!f.text) E('facts[' + i + '].text', '事实缺少描述');
      if (f.evidence && f.evidence.turn > lv.contract.turns) W('facts[' + i + '].evidence.turn', '证据曝光回合晚于合同期限，不会触发');
    });
    if (!lv.facts.length) W('facts', '没有设置事实与真相，谎言债、打脸、铁拳判定都不会生效');

    reachability(lv, W);

    /* semantic check on a fresh game; needs the engine (editor, game, tests) and a sound level */
    if (!errors.length && WW.Engine && WW.Objectives && WW.Objectives.lintStart) {
      try { WW.Objectives.lintStart(lv).forEach(function (w) { W(w.path, w.msg, true); }); } catch (e) { /* a level that cannot start shows up elsewhere */ }
    }

    return { errors: errors, warnings: warnings, level: lv };
  }

  /* A minimal level used by the editor's "新建空白关卡". */
  function blank() {
    return {
      id: 'my_level',
      meta: { title: '新关卡', subtitle: '', difficulty: 2, cover: '📰', description: '一句话描述这单委托。' },
      client: { name: '某品牌', contact: '王总', persona: '急躁，只看热搜排名', demands: [] },
      incident: { summary: '某品牌被曝出问题，舆论哗然。', keywords: ['翻车'], severity: 50 },
      facts: [{ id: 'f1', text: '被曝光的问题确实存在', clientClaim: '纯属造谣', isTrue: true, weight: 1, keywords: ['翻车'] }],
      contract: { turns: 6, actionPoints: 3, budget: 60 },
      seedPosts: [{ author: '爆料博主', tier: 'bigv', platform: 'weibo', stance: -2, content: '某品牌翻车了，大家怎么看？', fact: 'f1' }],
      items: { enabled: ['statement', 'shill', 'delete', 'control', 'trend_remove', 'kol', 'iron_fist', 'monitor', 'rectify'] }
    };
  }

  WW.Schema = {
    DEFAULTS: DEFAULTS,
    DEFAULT_RANDOM_EVENTS: DEFAULT_RANDOM_EVENTS,
    DEFAULT_DEFEATS: DEFAULT_DEFEATS,
    stageDefaults: stageDefaults,
    normalize: normalize,
    validate: validate,
    repairDraft: repairDraft,
    blank: blank,
    slug: slug
  };
})(window.WW);
