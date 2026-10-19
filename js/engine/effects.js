/*
 * Effect DSL (效果 DSL). Effects are plain objects with a `type`; lists apply in order.
 * They are used by events, task rewards, opponent signature events and custom abilities.
 * Every effect goes through the Game helper API so numbers stay clamped and logged.
 */
(function (WW) {
  'use strict';

  var U = WW.U;

  var STAT_NAMES = { sentiment: '舆论好感', heat: '热度', credibility: '公信力', exposure: '暴露度', satisfaction: '客户满意度' };

  var TYPES = {
    stat:      { label: '数值变化', fields: ['stat', 'delta'] },
    faction:   { label: '阵营好感', fields: ['faction', 'delta'] },
    budget:    { label: '预算', fields: ['delta'] },
    ap:        { label: '行动点', fields: ['delta', 'permanent'] },
    unlock:    { label: '解锁道具', fields: ['items', 'tier'] },
    lockItem:  { label: '封锁道具', fields: ['items', 'turns'] },
    voucher:   { label: '一次性券', fields: ['item', 'count'] },
    posts:     { label: '生成帖子', fields: ['count', 'stance', 'hint', 'fact', 'platform', 'tier', 'faction'] },
    reveal:    { label: '曝光事实', fields: ['fact'] },
    addFact:   { label: '新增事实', fields: ['fact'] },
    opponent:  { label: '对手属性', fields: ['opp', 'strength', 'morale', 'resources', 'active'] },
    offerTask: { label: '发放支线', fields: ['task'] },
    score:     { label: '评分加成', fields: ['delta'] },
    message:   { label: '消息', fields: ['from', 'text'] },
    headline:  { label: '热搜词条', fields: ['text', 'heat'] },
    flag:      { label: '剧情标记', fields: ['name', 'value'] },
    modifier:  { label: '持续效果', fields: ['stat', 'delta', 'turns'] },
    chance:    { label: '概率分支', fields: ['p', 'then', 'else'] },
    'if':      { label: '条件分支', fields: ['cond', 'then', 'else'] },
    end:       { label: '结束关卡', fields: ['result', 'title', 'text'] }
  };

  function apply(game, effects, source) {
    if (!effects) return;
    if (!Array.isArray(effects)) effects = [effects];
    for (var i = 0; i < effects.length; i++) {
      if (game.state.finished) return;
      applyOne(game, effects[i], source || {});
    }
  }

  function applyOne(game, e, source) {
    if (!e || !e.type) return;
    var st = game.state;
    switch (e.type) {
      case 'stat':
        game.addStat(e.stat, Number(e.delta) || 0, { channel: 'event', source: source });
        break;
      case 'faction':
        game.shiftFaction(e.faction, Number(e.delta) || 0, e.persist === undefined ? 0.5 : Number(e.persist));
        break;
      case 'budget':
        st.budget = Math.max(0, U.round(st.budget + (Number(e.delta) || 0), 1));
        break;
      case 'ap':
        if (e.permanent) st.apMax = Math.max(1, st.apMax + (Number(e.delta) || 0));
        st.ap = Math.max(0, st.ap + (Number(e.delta) || 0));
        break;
      case 'unlock':
        if (e.tier) game.unlockTier(Number(e.tier));
        if (e.items) game.unlockItems([].concat(e.items));
        break;
      case 'lockItem':
        game.lockItems([].concat(e.items || []), Number(e.turns) || 1);
        break;
      case 'voucher':
        st.items.vouchers[e.item] = (st.items.vouchers[e.item] || 0) + (Number(e.count) || 1);
        break;
      case 'posts':
        game.queuePosts({
          kind: 'event', count: Number(e.count) || 1, stance: e.stance === undefined ? -1 : Number(e.stance),
          hint: e.hint || '', fact: e.fact || null, platform: e.platform || null, tier: e.tier || null,
          faction: e.faction || null, tags: e.tags || [], source: source.id ? 'event:' + source.id : 'event'
        });
        break;
      case 'reveal':
        game.revealFact(e.fact, source.title || source.name || '事件');
        break;
      case 'addFact':
        if (e.fact) game.addFact(e.fact, { reveal: e.reveal !== false });
        break;
      case 'opponent': {
        var o = st.opponents[e.opp];
        if (!o) break;
        if (e.strength) o.strength = U.clamp(o.strength + Number(e.strength), 0, 100);
        if (e.morale) game.changeMorale(o, Number(e.morale));
        if (e.resources) o.resources = Math.max(0, o.resources + Number(e.resources));
        if (e.active === false) game.retireOpponent(o, e.text || '');
        break;
      }
      case 'offerTask':
        WW.Objectives.offer(game, e.task);
        break;
      case 'score':
        st.counters.scoreBonus = (st.counters.scoreBonus || 0) + (Number(e.delta) || 0);
        break;
      case 'message':
        game.message(e.from || 'system', U.tpl(e.text || '', game.textVars()), e.mood);
        break;
      case 'headline':
        game.addHeadline(U.tpl(e.text || '', game.textVars()), Number(e.heat) || 60, { tag: e.tag || '新' });
        break;
      case 'flag':
        st.flags[e.name] = e.value === undefined ? true : e.value;
        break;
      case 'modifier':
        game.addModifier({ kind: 'stat', stat: e.stat, delta: Number(e.delta) || 0, turns: Number(e.turns) || 1, label: e.label || '' });
        break;
      case 'chance':
        apply(game, game.rng.chance(Number(e.p) || 0) ? e.then : e['else'], source);
        break;
      case 'if':
        apply(game, WW.Cond.evaluate(e.cond, game) ? e.then : e['else'], source);
        break;
      case 'end':
        game.endGame(e.result === 'win' ? 'win' : 'lose', e.title || '', U.tpl(e.text || '', game.textVars()));
        break;
      default:
        if (typeof console !== 'undefined') console.warn('[WW] unknown effect type', e.type);
    }
  }

  function describe(e, level) {
    if (!e) return '';
    var name = function (arr, id) {
      var hit = (arr || []).filter(function (x) { return x.id === id; })[0];
      return hit ? (hit.name || hit.title || id) : id;
    };
    var itemName = function (id) {
      var c = level && level.items && (level.items.custom || []).filter(function (x) { return x.id === id; })[0];
      var over = level && level.items && level.items.overrides && level.items.overrides[id];
      return c ? c.name : over && over.name ? over.name : (WW.Data.items[id] ? WW.Data.items[id].name : id);
    };
    switch (e.type) {
      case 'stat': return (STAT_NAMES[e.stat] || e.stat) + ' ' + U.signed(e.delta);
      case 'faction': return '「' + name(level && level.factions, e.faction) + '」好感 ' + U.signed(e.delta);
      case 'budget': return (e.delta >= 0 ? '追加预算 ' : '预算 ') + U.fmtMoney(e.delta);
      case 'ap': return (e.permanent ? '每回合行动点 ' : '行动点 ') + U.signed(e.delta);
      case 'unlock': {
        var parts = [];
        if (e.tier) parts.push('解锁' + (WW.Data.tierNames[e.tier] || e.tier) + '道具');
        if (e.items && e.items.length) parts.push('解锁「' + [].concat(e.items).map(itemName).join('、') + '」');
        return parts.join('，');
      }
      case 'lockItem': return '封锁「' + [].concat(e.items || []).map(itemName).join('、') + '」' + (e.turns || 1) + '回合';
      case 'voucher': return '获得「' + itemName(e.item) + '」免费券 ×' + (e.count || 1);
      case 'posts': return '新增 ' + (e.count || 1) + ' 条' + (e.stance > 0 ? '正面' : e.stance < 0 ? '负面' : '中性') + '帖子';
      case 'reveal': return '曝光：' + name(level && level.facts, e.fact);
      case 'addFact': return '新增事实：' + (e.fact && e.fact.text || '');
      case 'opponent': {
        var bits = [];
        if (e.strength) bits.push('势力 ' + U.signed(e.strength));
        if (e.morale) bits.push('士气 ' + U.signed(e.morale));
        if (e.active === false) bits.push('退场');
        return '对手「' + name(level && level.opponents, e.opp) + '」' + bits.join('、');
      }
      case 'offerTask': return '发放支线任务';
      case 'score': return '结案评分 ' + U.signed(e.delta);
      case 'message': return '消息：' + (e.text || '');
      case 'headline': return '热搜：#' + (e.text || '') + '#';
      case 'flag': return '标记 ' + e.name;
      case 'modifier': return (STAT_NAMES[e.stat] || e.stat) + ' 每回合 ' + U.signed(e.delta) + '（' + (e.turns || 1) + '回合）';
      case 'chance': return Math.round((e.p || 0) * 100) + '% 概率：' + (e.then || []).map(function (x) { return describe(x, level); }).join('，');
      case 'if': return '若 ' + WW.Cond.describe(e.cond, level) + '：' + (e.then || []).map(function (x) { return describe(x, level); }).join('，');
      case 'end': return e.result === 'win' ? '直接胜利' : '直接失败';
      default: return e.type;
    }
  }

  /* opts.skipFlavor hides message/headline/flag effects (used where only tangible rewards matter) */
  function describeList(list, level, opts) {
    var skip = opts && opts.skipFlavor ? { message: 1, headline: 1, flag: 1 } : {};
    return (list || []).filter(function (e) { return e && !skip[e.type]; }).map(function (e) { return describe(e, level); }).filter(Boolean).join('；');
  }

  function validate(list, level, path, errors) {
    errors = errors || [];
    (list || []).forEach(function (e, i) {
      var p = path + '[' + i + ']';
      if (!e || !TYPES[e.type]) {
        errors.push({ path: p, msg: '未知效果类型 ' + (e && e.type) });
        return;
      }
      var has = function (arr, id) { return (arr || []).some(function (x) { return x.id === id; }); };
      if (e.type === 'stat' && !STAT_NAMES[e.stat]) errors.push({ path: p, msg: '未知数值 ' + e.stat });
      if (e.type === 'faction' && level && !has(level.factions, e.faction)) errors.push({ path: p, msg: '阵营不存在 ' + e.faction });
      if (e.type === 'reveal' && level && !has(level.facts, e.fact)) errors.push({ path: p, msg: '事实不存在 ' + e.fact });
      if (e.type === 'opponent' && level && !has(level.opponents, e.opp)) errors.push({ path: p, msg: '对手不存在 ' + e.opp });
      if (e.type === 'chance' || e.type === 'if') {
        validate(e.then, level, p + '.then', errors);
        validate(e['else'], level, p + '.else', errors);
        if (e.type === 'if') WW.Cond.validate(e.cond, level, p + '.cond', errors);
      }
    });
    return errors;
  }

  WW.Effects = {
    TYPES: TYPES,
    STAT_NAMES: STAT_NAMES,
    apply: apply,
    describe: describe,
    describeList: describeList,
    validate: validate
  };
})(window.WW);
