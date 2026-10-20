/*
 * Item resolution and availability. A level's item set = enabled library items (with overrides)
 * + level custom items. Availability depends on tier unlocks, explicit unlocks, locks, cooldowns,
 * use limits, prerequisites, AP and budget.
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;

  function resolve(level) {
    var map = {};
    level.items.enabled.forEach(function (id) {
      if (!D.items[id]) return;
      var base = U.deepClone(D.items[id]);
      var over = level.items.overrides[id];
      map[id] = over ? U.deepMerge(base, over) : base;
    });
    level.items.custom.forEach(function (c) { map[c.id] = U.deepClone(c); });
    return map;
  }

  function order(level, items) {
    var ids = D.itemOrder.filter(function (id) { return items[id]; });
    level.items.custom.forEach(function (c) { if (ids.indexOf(c.id) < 0) ids.push(c.id); });
    return ids;
  }

  function isUnlocked(game, id) {
    var st = game.state;
    var item = game.items[id];
    if (!item) return false;
    if (st.items.unlocked[id]) return true;
    var cond = game.level.items.unlocks[id];
    if (cond) return WW.Cond.evaluate(cond, game);
    return (item.tier || 1) <= st.items.unlockedTier;
  }

  function unlockHint(game, id) {
    var item = game.items[id];
    var cond = game.level.items.unlocks[id];
    if (cond) return '解锁条件：' + WW.Cond.describe(cond, game.level);
    var stages = game.level.objectives.stages;
    for (var i = 0; i < stages.length; i++) {
      var unlocks = (stages[i].rewards || []).filter(function (r) {
        return r.type === 'unlock' && ((r.tier && r.tier >= item.tier) || (r.items && [].concat(r.items).indexOf(id) >= 0));
      });
      if (unlocks.length) return '完成主任务阶段「' + stages[i].title + '」后解锁';
    }
    return (D.tierNames[item.tier] || '') + '技能，推进主任务后解锁';
  }

  function status(game, id, params) {
    var st = game.state;
    var item = game.items[id];
    var res = { id: id, usable: false, reason: '', locked: false, cost: 0, ap: item ? item.ap : 0, voucher: 0, cooldownLeft: 0, usesLeft: null };
    if (!item) { res.reason = '本关不可用'; return res; }
    res.cost = cost(game, id, params);
    res.voucher = st.items.vouchers[id] || 0;
    if (st.finished) { res.reason = '已结案'; return res; }
    if (game.diff && game.diff.unlimited) {
      /* 看不见的大手: only the budget (and a passive skill already deployed) can stop you */
      res.ap = 0;
      if (item.passive && st.itemUses[id]) { res.reason = '已部署，全程生效'; return res; }
      if (!res.voucher && res.cost > st.budget + 1e-9) { res.reason = '预算不足'; return res; }
      res.usable = true;
      return res;
    }
    if (!isUnlocked(game, id)) { res.locked = true; res.reason = unlockHint(game, id); return res; }
    var lockedUntil = st.items.locked[id];
    if (lockedUntil && st.turn < lockedUntil) { res.reason = '被封锁至第 ' + lockedUntil + ' 回合'; return res; }
    if (item.requires && !st[item.requires] && !(item.requires === 'monitor' && st.monitor)) {
      var req = game.items[item.requires] || D.items[item.requires];
      res.reason = '需要先部署「' + (req ? req.name : item.requires) + '」';
      return res;
    }
    if (item.passive && st.itemUses[id]) { res.reason = '已部署，全程生效'; return res; }
    if (item.maxUses) {
      res.usesLeft = Math.max(0, item.maxUses - (st.itemUses[id] || 0));
      if (res.usesLeft <= 0) { res.reason = '本关使用次数已用完'; return res; }
    }
    var ready = st.items.readyTurn[id];
    if (ready && st.turn < ready) { res.cooldownLeft = ready - st.turn; res.reason = '冷却中（' + res.cooldownLeft + ' 回合）'; return res; }
    if (st.ap < item.ap) { res.reason = '行动点不足'; return res; }
    if (!res.voucher && res.cost > st.budget + 1e-9) { res.reason = '预算不足'; return res; }
    res.usable = true;
    return res;
  }

  /* Price in 万元. Handlers may price by params (tiers, counts, selected posts). */
  function cost(game, id, params) {
    var item = game.items[id];
    if (!item) return 0;
    var handler = WW.Actions.get(item.handler);
    var c = handler && handler.cost ? handler.cost(game, item, params || {}) : item.cost || 0;
    return U.round(Math.max(0, c), 1);
  }

  WW.Items = {
    resolve: resolve,
    order: order,
    isUnlocked: isUnlocked,
    unlockHint: unlockHint,
    status: status,
    cost: cost
  };
})(window.WW);
