/*
 * Shared test harness: loads the browser scripts into a Node vm context (the context's global
 * object doubles as window) and provides the bot strategies used by tests/run.js and tests/eval.
 *   const { loadContext, createBots } = require('./harness');
 *   const ctx = loadContext({ dynamicImport: true, extraGlobals: { fetch } });
 *   const bots = createBots(ctx.WW);   // { STRATEGIES, playBot, tryAct, finiteStats, ... }
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'js/core/ns.js', 'js/core/util.js', 'js/core/bus.js', 'js/core/storage.js',
  'js/data/platforms.js', 'js/data/factions.js', 'js/data/personas.js', 'js/data/pools.js', 'js/data/statements.js',
  'js/data/items.js', 'js/data/abilities.js', 'js/data/difficulty.js',
  'js/engine/cond.js', 'js/engine/effects.js', 'js/engine/schema.js', 'js/engine/feed.js', 'js/engine/items.js',
  'js/engine/truth.js', 'js/engine/actions.js', 'js/engine/sim.js', 'js/engine/objectives.js', 'js/engine/guide.js', 'js/engine/opponents.js',
  'js/engine/events.js', 'js/engine/scoring.js', 'js/engine/engine.js', 'js/engine/levels.js',
  'js/llm/offline.js', 'js/llm/shape.js', 'js/llm/client.js', 'js/llm/prompts.js'
];

/* opts.extraGlobals: injected into the context (e.g. fetch for real LLM calls);
 * opts.dynamicImport: let import() inside the scripts resolve with Node's loader (Anthropic SDK). */
function loadContext(opts) {
  opts = opts || {};
  const ctx = Object.assign({ console, setTimeout, clearTimeout, Promise, Date, Math, JSON }, opts.extraGlobals || {});
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const runOpts = (filename) => opts.dynamicImport ? { filename, importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER } : { filename };
  for (const f of FILES) {
    const file = path.join(ROOT, f);
    if (!fs.existsSync(file)) continue;
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, runOpts(f));
  }
  const manifest = path.join(ROOT, 'levels/manifest.js');
  if (fs.existsSync(manifest)) {
    vm.runInContext(fs.readFileSync(manifest, 'utf8'), ctx, { filename: 'levels/manifest.js' });
    for (const f of ctx.WW.Levels.manifest) {
      const lf = path.join(ROOT, 'levels', f);
      if (fs.existsSync(lf)) vm.runInContext(fs.readFileSync(lf, 'utf8'), ctx, { filename: 'levels/' + f });
    }
  }
  return ctx;
}

function createBots(WW) {
  function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

  function finiteStats(game) {
    const s = game.state.stats;
    for (const k of Object.keys(s)) assert(Number.isFinite(s[k]), 'stat ' + k + ' is ' + s[k]);
    assert(Number.isFinite(game.state.budget), 'budget is ' + game.state.budget);
    for (const id of Object.keys(game.state.factions)) assert(Number.isFinite(game.state.factions[id].sentiment), 'faction ' + id + ' NaN');
  }

  /* ------------------------------------------------------------------ bot helpers */
  async function tryAct(game, id, params) {
    if (!game.items[id] || game.state.finished) return null;
    const st = game.itemStatus(id, params || {});
    if (!st.usable) return null;
    const r = await game.act(id, params || {});
    return r && r.ok ? r : null;
  }

  /* A careful player never types the client's red-line keywords. */
  function careful(game, text) {
    game.level.client.demands.forEach((d) => d.keywords.forEach((k) => { text = text.split(k).join('此事'); }));
    return text;
  }

  function statementText(game, type, sincere, admit) {
    return careful(game, WW.Offline.tasks['statement.complete'](game, { type, tone: { sincere, admit } }).text);
  }

  /* What a skilled player writes once they know the truth: refute rumors, own the rest, give measures. */
  function smartStatement(game) {
    const st = game.state;
    const lines = ['各位关心' + game.level.client.name + '的朋友：', '我们理解大家的愤怒与失望，每一条留言我们都认真看了，大家骂得对。'];
    Object.values(st.facts).filter((f) => !f.isTrue && f.public && !f.refuted && !f.denied).forEach((f) => {
      lines.push('关于网传“' + (f.keywords[0] || f.text) + '”的说法，经核查不属实，相关证据我们已提交第三方。');
    });
    lines.push('对于大家关心的问题，我们已成立专项小组全面排查，责任在我们，绝不推卸。');
    lines.push('一、全面排查所有环节；二、设立专项赔付通道；三、邀请第三方机构进驻监督。');
    if (!st.promises.some((p) => p.status === 'pending')) lines.push('我们将在3日内公布调查结果。');
    return careful(game, lines.join('\n'));
  }

  function topNegative(game, filter) {
    return WW.Feed.ranked(game.state, 'all').filter((p) => p.status !== 'deleted' && !p.isClient && p.stance < 0 && (!filter || filter(p)));
  }

  async function deleteSome(game, criterion, max) {
    if (!game.items.delete) return null;
    const st = game.itemStatus('delete', { ids: ['x'] });
    if (st.locked || (st.reason && st.reason !== '预算不足' && !st.usable && st.reason !== '')) { /* fallthrough to preview anyway */ }
    const prev = await game.preview('delete', { criterion });
    if (!prev) return null;
    const ids = prev.candidates.filter((c) => !c.immune && c.cost !== null && c.post.stance < 0).slice(0, max).map((c) => c.id);
    if (!ids.length) return null;
    return tryAct(game, 'delete', { criterion, ids });
  }

  const STRATEGIES = {
    idle: async () => {},

    shill: async (game) => {
      const st = game.state;
      while (st.ap > 0 && !st.finished) {
        const before = st.ap;
        (await tryAct(game, 'trend_remove')) ||
          (await tryAct(game, 'shill', { tier: 'normal', count: 300, direction: '大家理性看待，事情还在调查中，别被带节奏' })) ||
          (await deleteSome(game, '骂客户的负面帖子', 4)) ||
          (topNegative(game)[0] && (await tryAct(game, 'control', { postId: topNegative(game)[0].id }))) ||
          (await tryAct(game, 'distraction'));
        if (st.ap === before) break;
      }
    },

    honest: async (game) => {
      const st = game.state;
      if (st.turn === 1) await tryAct(game, 'statement', { type: 'apology', channel: 'weibo', text: statementText(game, 'apology', 1, 1) });
      while (st.ap > 0 && !st.finished) {
        const before = st.ap;
        const pending = st.promises.some((p) => p.status === 'pending');
        (!st.flags.rectified && (await tryAct(game, 'rectify'))) ||
          (!st.counters.settled && (await tryAct(game, 'settle', { scale: 'medium' }))) ||
          (pending && (await tryAct(game, 'statement', { type: 'rectify', channel: 'weibo', text: statementText(game, 'rectify', 1, 1) }))) ||
          (await tryAct(game, 'monitor')) ||
          (await tryAct(game, 'kol', { tier: 'small', brief: '梳理时间线和整改措施，理性看待' })) ||
          (st.counters.statementsTurn === 0 && (await tryAct(game, 'statement', { type: 'explain', channel: 'weibo', text: statementText(game, 'explain', 1, 1) })));
        if (st.ap === before) break;
      }
    },

    balanced: async (game) => {
      const st = game.state;
      if (st.turn === 1) await tryAct(game, 'statement', { type: 'explain', channel: 'weibo', text: statementText(game, 'explain', 1, 0) });
      while (st.ap > 0 && !st.finished) {
        const before = st.ap;
        const facts = Object.values(st.facts);
        const unknown = facts.find((f) => !f.known && f.public && !f.revealed && !f.refuted);
        const knownFalse = facts.find((f) => f.known && !f.isTrue && !f.refuted);
        const rumorPost = knownFalse && WW.Feed.visible(st).find((p) => p.fact === knownFalse.id && !p.isClient);
        const handle = game.findHandle();
        const knownHandle = handle && handle.known;
        (await tryAct(game, 'monitor')) ||
          (unknown && (await tryAct(game, 'investigate', { factId: unknown.id }))) ||
          (rumorPost && (await tryAct(game, 'iron_fist', { postId: rumorPost.id }))) ||
          (knownFalse && !knownFalse.denied && (await tryAct(game, 'endorse', { factId: knownFalse.id }))) ||
          (knownHandle && !st.flags.rectified && (await tryAct(game, 'rectify'))) ||
          (st.stats.heat > 55 && (await tryAct(game, 'trend_remove'))) ||
          (await tryAct(game, 'kol', { tier: 'big', brief: '用时间线和数据说话，事情正在整改，理性看待' })) ||
          (topNegative(game, (p) => p.author.tier !== 'normal')[0] && (await tryAct(game, 'control', { postId: topNegative(game, (p) => p.author.tier !== 'normal')[0].id }))) ||
          (st.counters.statementsTurn === 0 && (await tryAct(game, 'statement', { type: 'explain', channel: 'weibo', text: statementText(game, 'explain', 1, 1) }))) ||
          (await tryAct(game, 'shill', { tier: 'premium', count: 100, direction: '其实整改措施已经公布了，大家可以看看原始信息' }));
        if (st.ap === before) break;
      }
    },

    /* Knows the hidden truth: an upper bound for a skilled player who investigates and reads carefully. */
    smart: async (game) => {
      const st = game.state;
      const pending = st.promises.some((p) => p.status === 'pending');
      if (st.turn === 1 || (pending && st.counters.statementsTurn === 0)) {
        await tryAct(game, 'statement', { type: pending ? 'rectify' : 'explain', channel: 'weibo', text: smartStatement(game) });
      }
      while (st.ap > 0 && !st.finished) {
        const before = st.ap;
        const rumorPost = WW.Feed.visible(st).find((p) => p.fact && st.facts[p.fact] && !st.facts[p.fact].isTrue && !st.facts[p.fact].refuted && !p.isClient);
        const handle = game.findHandle();
        const dirty = Object.values(st.opponents).find((o) => o.active && (o.flags.usedShill || o.flags.spreadRumor || (game.oppDef(o.id).dirt || []).length));
        const bigNeg = topNegative(game, (p) => p.author.tier !== 'normal' && !p.controlled)[0];
        (rumorPost && (await tryAct(game, 'iron_fist', { postId: rumorPost.id }))) ||
          (await tryAct(game, 'monitor')) ||
          (st.stats.heat > 58 && st.stats.exposure < 50 && (await deleteSome(game, '负面帖子', 3))) ||
          (handle && !st.flags.rectified && st.stats.satisfaction > 35 && (await tryAct(game, 'rectify'))) ||
          (dirty && st.monitor && (await tryAct(game, 'expose', { oppId: dirty.id }))) ||
          (st.stats.heat > 62 && (await tryAct(game, 'trend_remove'))) ||
          (st.factions.victim && st.factions.victim.sentiment < -50 && !st.counters.settled && (await tryAct(game, 'settle', { scale: 'medium' }))) ||
          (await tryAct(game, 'kol', { tier: 'big', brief: '用时间线和数据说话：问题正在整改，谣言部分已经澄清，理性看待' })) ||
          (bigNeg && (await tryAct(game, 'control', { postId: bigNeg.id }))) ||
          (st.counters.statementsTurn === 0 && st.turn % 2 === 0 && (await tryAct(game, 'statement', { type: 'explain', channel: 'weibo', text: smartStatement(game) }))) ||
          (st.stats.heat > 50 && (await tryAct(game, 'distraction'))) ||
          (await tryAct(game, 'kol', { tier: 'small', brief: '整改进展与第三方监督情况' }));
        if (st.ap === before) break;
      }
    },

    random: async (game) => {
      const st = game.state;
      let guard = 0;
      while (st.ap > 0 && !st.finished && guard++ < 6) {
        const ids = game.itemOrder.filter((id) => game.itemStatus(id).usable || game.items[id].target === 'criterion');
        if (!ids.length) break;
        const id = game.rng.pick(ids);
        const item = game.items[id];
        const params = {};
        const post = game.rng.pick(WW.Feed.visible(st).filter((p) => !p.isClient));
        const opp = game.rng.pick(Object.values(st.opponents).filter((o) => o.active));
        const fact = game.rng.pick(Object.values(st.facts));
        if (item.handler === 'statement') Object.assign(params, { type: game.rng.pick(WW.Data.statementTypes).id, channel: 'weibo', text: statementText(game, 'explain', game.rng.range(-1, 1), game.rng.range(-1, 1)) });
        if (item.handler === 'shill') Object.assign(params, { tier: game.rng.pick(['zombie', 'normal', 'premium']), count: game.rng.pick([100, 300, 1000]), direction: '支持一下，别被带节奏了' });
        if (item.handler === 'kol') Object.assign(params, { tier: 'small', brief: '理性分析事件来龙去脉' });
        if (item.handler === 'settle') params.scale = 'small';
        if (item.target === 'post' && post) params.postId = post.id;
        if (item.target === 'postOrOpponent') { if (opp && game.rng.chance(0.5)) params.oppId = opp.id; else if (post) params.postId = post.id; }
        if (item.target === 'opponent' && opp) params.oppId = opp.id;
        if (item.target === 'fact' && fact) params.factId = fact.id;
        if (item.target === 'criterion') {
          const prev = await game.preview(id, { criterion: '负面帖子' });
          params.criterion = '负面帖子';
          params.ids = prev ? prev.candidates.filter((c) => !c.immune).slice(0, 3).map((c) => c.id) : [];
        }
        await game.act(id, params);
      }
    }
  };

  /* gameOpts: extra Game options, e.g. { aiRunner } to record or route AI calls */
  async function playBot(level, strategy, seed, difficulty, gameOpts) {
    const game = new WW.Engine.Game(level, Object.assign({ seed, difficulty }, gameOpts || {}));
    let guard = 0;
    while (!game.state.finished && guard++ < 40) {
      await STRATEGIES[strategy](game);
      if (game.state.finished) break;
      Object.values(game.state.objectives.tasks).filter((t) => t.status === 'offered').forEach((t) => game.respondTask(t.id, true));
      if (game.state.objectives.mainComplete) { game.finishEarly(); break; }
      const r = await game.endTurn();
      if (!r.ok && !game.state.finished) throw new Error('endTurn failed: ' + r.reason);
      finiteStats(game);
    }
    return game;
  }

  /* A newcomer who does exactly what the tutorial card says: reads tips, presses the card's action
   * button (using the sample draft when one is offered) and ends the turn when the card has nothing
   * to press. Returns the finished game. */
  async function playGuide(level, seed, difficulty) {
    const game = new WW.Engine.Game(level, { seed, difficulty });
    const st = game.state;
    let guard = 0;
    while (!st.finished && guard++ < 40) {
      let steps = 0;
      while (!st.finished && steps++ < 20) {
        const step = WW.Guide.sync(game).current;
        if (!step) break;
        if (!step.done) { WW.Guide.mark(game, step.id, 'ack'); continue; }
        const a = step.action;
        if (!a || a.cmd === 'endTurn') break;
        if (a.cmd === 'finish') { game.finishEarly(); break; }
        if (a.cmd === 'accept') { game.respondTask(a.task, true); continue; }
        const params = Object.assign({}, a.preset);
        const sample = params.sample;
        delete params.hint;
        delete params.sample;
        if (params.post) {
          const p = WW.Guide.findPost(game, params.post);
          delete params.post;
          if (p) params.postId = p.id;
        }
        if (game.items[a.item].handler === 'statement') {
          params.channel = 'weibo';
          params.text = sample ? sample.text : statementText(game, params.type || 'explain', 0.5, 0);
        }
        const r = await tryAct(game, a.item, params);
        if (!r) {
          if (step.optional) { WW.Guide.mark(game, step.id, 'skip'); continue; }
          break;
        }
      }
      if (st.finished) break;
      const r = await game.endTurn();
      if (!r.ok && !st.finished) throw new Error('endTurn failed: ' + r.reason);
    }
    return game;
  }

  return { STRATEGIES, playBot, playGuide, tryAct, finiteStats, statementText, smartStatement, topNegative, deleteSome, careful };
}

module.exports = { ROOT, FILES, loadContext, createBots };
