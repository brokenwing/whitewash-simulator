/*
 * The opinion field (舆论场): post model, author generation and the opinion-pressure formula.
 *   Π = Σ(stance × reach × freshness × treatment × weight) / (Σ(reach × freshness × weight) + baseline)
 * Official client posts are excluded: their effect is applied as impulses when published.
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;

  var ENGAGEMENT = {
    normal: [30, 900], kol: [800, 8000], bigv: [4000, 60000], media: [8000, 90000], state: [50000, 300000], client: [3000, 30000]
  };

  function find(state, id) {
    for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === id) return state.posts[i];
    return null;
  }

  function isVisible(p) { return p.status !== 'deleted'; }

  function visible(state) { return state.posts.filter(isVisible); }

  function reachOf(p) {
    var t = D.tiers[p.author.tier] || D.tiers.normal;
    var pl = D.platforms[p.platform] || D.platforms.weibo;
    return t.reach * pl.reachMul;
  }

  function pickPlatform(game, preferred) {
    var lv = game.level;
    if (preferred && lv.platforms.indexOf(preferred) >= 0) return preferred;
    var list = lv.platforms.filter(function (p) { return p !== 'overseas'; });
    if (game.state.flags.abroad && lv.platforms.indexOf('overseas') >= 0 && game.rng.chance(0.12)) return 'overseas';
    return game.rng.pick(list.length ? list : ['weibo']);
  }

  /* Pick an author: level personas first, then generic archetypes with random nicknames. */
  function pickAuthor(game, o) {
    o = o || {};
    var rng = game.rng;
    var lv = game.level;
    if (o.name) return { name: o.name, tier: o.tier || 'normal', faction: o.faction || null, persona: o.persona || null, opp: o.opp || null };
    if (o.opp) {
      var linked = lv.personas.filter(function (p) { return p.opp === o.opp; });
      var opp = game.state.opponents[o.opp];
      if (linked.length && rng.chance(0.7)) {
        var lp = rng.pick(linked);
        return { name: lp.name, tier: o.tier || lp.tier, faction: lp.faction, persona: lp.id, opp: o.opp };
      }
      if (opp) {
        var oppDef = lv.opponents.filter(function (x) { return x.id === o.opp; })[0];
        var suffix = o.tier === 'normal' ? rng.pick(['', '的粉丝', '路人号', '小号']) : '';
        return { name: (oppDef ? oppDef.name : o.opp) + suffix, tier: o.tier || 'kol', faction: oppDef ? oppDef.faction : 'rival', persona: null, opp: o.opp };
      }
    }
    if (o.persona) {
      var pp = lv.personas.filter(function (p) { return p.id === o.persona; })[0];
      if (pp) return { name: pp.name, tier: o.tier || pp.tier, faction: pp.faction, persona: pp.id, opp: pp.opp || null };
    }
    var faction = o.faction;
    var pool = lv.personas.filter(function (p) {
      return (!faction || p.faction === faction) && (!o.tier || p.tier === o.tier) && !p.opp && !game.state.banned[p.id];
    });
    if (pool.length && rng.chance(0.45)) {
      var p2 = rng.pick(pool);
      return { name: p2.name, tier: p2.tier, faction: p2.faction, persona: p2.id, opp: null };
    }
    var arch = D.archetypes.filter(function (a) { return (!faction || a.faction === faction) && (!o.tier || a.tier === o.tier); });
    var a = rng.pick(arch.length ? arch : D.archetypes);
    var name = rng.pick(D.nicknames);
    if (a.id === 'marketing') name = rng.pick(['每日爆料君', '娱乐八卦站', '热点速递', '吃瓜情报局', '震惊部']);
    if (a.id === 'journalist') name = rng.pick(['某财经记者', '都市快报记者', '深度调查组']);
    if (a.id === 'lawyer') name = rng.pick(['法律人老周', '张律师说法', '律界观察']);
    return { name: name, tier: o.tier || a.tier, faction: faction || a.faction, persona: null, opp: null };
  }

  function engagement(game, tier, platform) {
    var range = ENGAGEMENT[tier] || ENGAGEMENT.normal;
    var heat = game.state.stats.heat;
    var mul = (0.4 + heat / 100) * (D.platforms[platform] ? D.platforms[platform].reachMul : 1);
    return Math.round(game.rng.range(range[0], range[1]) * mul);
  }

  /* Create a post and push it into the feed. `d` is a loose description; the engine decides numbers. */
  function create(game, d) {
    var st = game.state;
    var lv = game.level;
    var author = d.authorObj || pickAuthor(game, { name: d.author, tier: d.tier, faction: d.faction, persona: d.persona, opp: d.opp });
    if (d.tier) author.tier = d.tier;
    if (d.faction) author.faction = d.faction;
    if (!D.tiers[author.tier]) author.tier = 'normal';
    var platform = pickPlatform(game, d.platform || (author.persona && (lv.personas.filter(function (p) { return p.id === author.persona; })[0] || {}).platform));
    if (d.platform === 'overseas') platform = 'overseas';
    var stance = U.clamp(Math.round(Number(d.stance) || 0), -2, 2);
    var factId = d.fact && st.facts[d.fact] ? d.fact : null;
    var likes = d.likes ? Math.round(d.likes) : engagement(game, author.tier, platform);
    st.seq += 1;
    var post = {
      id: 'p' + st.seq,
      turn: d.turn || st.turn,
      platform: platform,
      author: author,
      content: String(d.content || '').slice(0, 800),
      title: d.title ? String(d.title).slice(0, 80) : '',
      stance: stance,
      fact: factId,
      tags: (d.tags || []).slice(0, 4),
      likes: likes,
      reposts: Math.round(likes * game.rng.range(0.05, 0.4)),
      commentCount: Math.round(likes * game.rng.range(0.03, 0.2)),
      comments: (d.comments || []).slice(0, 4).map(function (c) {
        return { author: c.author || game.rng.pick(D.nicknames), content: String(c.content || '').slice(0, 200), stance: U.clamp(Math.round(Number(c.stance) || 0), -2, 2), likes: Math.round(likes * game.rng.range(0.02, 0.15)), shill: !!c.shill };
      }),
      foldedComments: 0,
      status: 'visible',
      throttled: false,
      controlled: false,
      protectedUntil: 0,
      isShill: !!d.isShill,
      shillTier: d.shillTier || null,
      shillBatch: d.shillBatch === undefined ? null : d.shillBatch,
      oppShill: !!d.oppShill,
      isClient: !!d.isClient,
      isScreenshot: !!d.isScreenshot,
      exposed: false,
      source: d.source || 'organic',
      weight: d.weight || 1,
      opp: d.opp || author.opp || null,
      immune: platform === 'overseas' || author.tier === 'state' || author.tier === 'client' || !!d.immune
    };
    st.posts.push(post);
    return post;
  }

  function pressure(game) {
    var st = game.state;
    var num = 0, den = 0;
    for (var i = 0; i < st.posts.length; i++) {
      var p = st.posts[i];
      if (p.status === 'deleted' || p.isClient) continue;
      var age = Math.max(0, st.turn - p.turn);
      var fresh = Math.pow(0.65, age);
      if (fresh < 0.05) continue;
      var r = reachOf(p) * fresh * (p.weight || 1);
      var treat = 1;
      if (p.throttled) treat *= 0.4;
      if (p.controlled && p.stance < 0) treat *= 0.5;
      num += p.stance * r * treat;
      den += r;
    }
    return den > 0 ? U.clamp(num / (den + game.level.tuning.pressureBaseline), -2, 2) : 0;
  }

  /* Recent posts keep collecting likes while the topic is hot. */
  function tick(game) {
    var st = game.state;
    var heat = st.stats.heat;
    st.posts.forEach(function (p) {
      if (p.status === 'deleted') return;
      var age = st.turn - p.turn;
      if (age > 3) return;
      var g = 1 + (heat / 220) * game.rng.range(0.2, 0.7) / (1 + age);
      if (p.throttled) g = 1 + (g - 1) * 0.3;
      p.likes = Math.round(p.likes * g);
      p.reposts = Math.round(p.reposts * g);
      p.commentCount = Math.round(p.commentCount * g);
    });
    var max = game.level.tuning.maxFeed || 140;
    if (st.posts.length > max) {
      st.posts.sort(function (a, b) { return a.turn - b.turn; });
      var drop = st.posts.length - max;
      var kept = [];
      for (var i = 0; i < st.posts.length; i++) {
        var p = st.posts[i];
        if (drop > 0 && (p.status === 'deleted' || st.turn - p.turn > 3)) { drop--; continue; }
        kept.push(p);
      }
      st.posts = kept;
    }
  }

  /* Display ordering: hot and fresh first. */
  function ranked(state, platform) {
    var list = state.posts.filter(function (p) { return !platform || platform === 'all' || p.platform === platform; });
    return list.slice().sort(function (a, b) {
      var sa = a.likes / Math.pow(1.8, state.turn - a.turn) + (a.turn === state.turn ? 1e5 : 0);
      var sb = b.likes / Math.pow(1.8, state.turn - b.turn) + (b.turn === state.turn ? 1e5 : 0);
      return sb - sa;
    });
  }

  WW.Feed = {
    find: find,
    visible: visible,
    reachOf: reachOf,
    pickAuthor: pickAuthor,
    pickPlatform: pickPlatform,
    create: create,
    pressure: pressure,
    tick: tick,
    ranked: ranked
  };
})(window.WW);
