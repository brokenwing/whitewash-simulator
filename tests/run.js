#!/usr/bin/env node
/*
 * Dependency-free test runner for the engine (no DOM needed).
 *   node tests/run.js                 unit tests + quick balance check (10 seeds)
 *   node tests/run.js --balance 50    full balance report (seeds per strategy)
 *   node tests/run.js --level milktea only one level in the balance report
 * Loads the browser scripts into a vm context whose global object doubles as `window`.
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
  'js/engine/truth.js', 'js/engine/actions.js', 'js/engine/sim.js', 'js/engine/objectives.js', 'js/engine/opponents.js',
  'js/engine/events.js', 'js/engine/scoring.js', 'js/engine/engine.js', 'js/engine/levels.js',
  'js/llm/offline.js', 'js/llm/shape.js', 'js/llm/client.js', 'js/llm/prompts.js'
];

function loadContext() {
  const ctx = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES) {
    const file = path.join(ROOT, f);
    if (!fs.existsSync(file)) continue;
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: f });
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

const ctx = loadContext();
const WW = ctx.WW;
const args = process.argv.slice(2);
const argVal = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

/* ------------------------------------------------------------------ tiny assert lib */
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; }, (e) => {
    failed++;
    failures.push(name + ': ' + (e && e.stack || e));
  });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
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

async function playBot(level, strategy, seed, difficulty) {
  const game = new WW.Engine.Game(level, { seed, difficulty });
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

/* ------------------------------------------------------------------ unit tests */
async function unitTests() {
  const U = WW.U;

  await test('rng is deterministic', () => {
    const a = U.rng(42), b = U.rng(42);
    for (let i = 0; i < 10; i++) eq(a.next(), b.next());
  });

  await test('tpl / fmtNum', () => {
    eq(U.tpl('{client}出事了，{x}', { client: '甜心' }), '甜心出事了，{x}');
    eq(U.fmtNum(12345), '1.2万');
    eq(U.fmtNum(320000000), '3.2亿');
  });

  await test('deepMerge replaces arrays and merges objects', () => {
    const m = U.deepMerge({ a: { b: 1, c: [1, 2] } }, { a: { c: [3] } });
    eq(m.a.b, 1);
    eq(JSON.stringify(m.a.c), '[3]');
  });

  await test('condition DSL', () => {
    const game = new WW.Engine.Game(WW.Schema.blank(), { seed: 1 });
    game.state.stats.heat = 50;
    assert(WW.Cond.evaluate({ var: 'stats.heat', op: '<=', value: 60 }, game));
    assert(!WW.Cond.evaluate({ all: [{ var: 'stats.heat', op: '<=', value: 60 }, { var: 'turn', op: '>=', value: 3 }] }, game));
    assert(WW.Cond.evaluate({ any: [{ var: 'stats.heat', op: '>', value: 60 }, { not: { var: 'turn', op: '>=', value: 3 } }] }, game));
    assert(WW.Cond.evaluate({ var: 'difficulty', op: '==', value: 'regular' }, game));
    assert(WW.Cond.describe({ var: 'stats.heat', op: '<=', value: 60 }, game.level).indexOf('热度') >= 0);
  });

  await test('schema normalize fills defaults', () => {
    const lv = WW.Schema.normalize({ id: 'x', meta: { title: 't' } });
    assert(lv.factions.length === 6, 'default factions');
    assert(lv.objectives.stages.length === 3, 'default stages');
    assert(lv.defeat.length >= 3, 'default defeats');
    eq(lv.contract.turns, 8);
  });

  await test('schema validate catches bad references', () => {
    const v = WW.Schema.validate({
      id: 'bad', meta: { title: 'bad' },
      seedPosts: [{ persona: 'nobody', content: 'x', fact: 'nofact' }],
      items: { enabled: ['statement', 'no_such_item'] },
      events: [{ id: 'e', trigger: { var: 'fact.ghost.revealed', op: '==', value: true }, effects: [{ type: 'reveal', fact: 'ghost' }] }]
    });
    assert(v.errors.length >= 4, 'expected >=4 errors, got ' + v.errors.length + ': ' + JSON.stringify(v.errors));
  });

  await test('blank level plays to the end offline', async () => {
    const game = await playBot(WW.Schema.blank(), 'balanced', 7, 'regular');
    assert(game.state.finished, 'finished');
    assert(game.state.final && game.state.final.grade, 'graded');
    finiteStats(game);
  });

  await test('same seed + same strategy = same result', async () => {
    const a = await playBot(WW.Schema.blank(), 'random', 99, 'regular');
    const b = await playBot(WW.Schema.blank(), 'random', 99, 'regular');
    eq(JSON.stringify(a.state.stats), JSON.stringify(b.state.stats));
  });

  await test('offline classifier tokenises Chinese criteria', () => {
    const t = WW.Offline.tokens('删除所有晒出病历的帖子');
    assert(t.indexOf('病历') >= 0, JSON.stringify(t));
  });

  await test('offline statement judge reacts to wording', () => {
    const game = new WW.Engine.Game(WW.Schema.blank(), { seed: 3 });
    const good = WW.Offline.tasks['statement.judge'](game, { type: 'apology', text: '我们深表歉意，这是我们的责任，我们理解大家的愤怒与失望，将全面排查并赔偿每一位受到影响的用户。一、全面排查；二、设立赔付通道；三、3日内公布调查结果。' });
    const bad = WW.Offline.tasks['statement.judge'](game, { type: 'stern', text: '网传内容纯属谣言，系个别员工个人行为，不代表公司。对于恶意造谣者，我司将追究法律责任，绝不姑息。' });
    assert(good.scores.sincerity > bad.scores.sincerity, 'sincerity');
    assert(bad.scores.blameShift > good.scores.blameShift, 'blameShift');
    assert(good.promises.length === 1, 'promise extracted');
  });

  await test('serialize / restore keeps the run', async () => {
    const game = new WW.Engine.Game(WW.Schema.blank(), { seed: 5 });
    await game.endTurn();
    const save = JSON.parse(JSON.stringify(game.serialize()));
    const back = WW.Engine.restore(WW.Schema.blank(), save);
    eq(back.state.turn, game.state.turn);
    await back.endTurn();
    finiteStats(back);
  });

  if (WW.Shape) {
    await test('shape coerce + json schema', () => {
      const S = WW.Shape;
      const shape = S.obj({ n: S.int(0, 10, 5), list: S.arr(S.obj({ id: S.str(), ok: S.bool() }), 3), mode: S.enumOf(['a', 'b'], 'a') });
      const v = S.coerce(shape, { n: '42', list: [{ id: 1 }, {}, {}, {}], mode: 'zzz' });
      eq(v.n, 10);
      eq(v.list.length, 3);
      eq(v.list[0].id, '1');
      eq(v.mode, 'a');
      const js = S.toJSONSchema(shape);
      eq(js.additionalProperties, false);
      eq(js.properties.list.items.additionalProperties, false);
    });
  }

  if (WW.LLM && WW.LLM.extractJSON) {
    await test('extractJSON tolerates fences and chatter', () => {
      eq(WW.LLM.extractJSON('好的，结果如下：\n```json\n{"a": 1, "b": [1,2,],}\n```').a, 1);
      eq(WW.LLM.extractJSON('{"x": "含有}括号的字符串", "y": 2} 以上').y, 2);
    });
  }

  for (const entry of WW.Levels.list()) {
    await test('level validates: ' + entry.id, () => {
      const v = WW.Schema.validate(entry.level);
      assert(!v.errors.length, JSON.stringify(v.errors, null, 1));
    });
  }
}

/* ------------------------------------------------------------------ balance report */
async function balance(seeds, onlyLevel, diffs, strategies) {
  const levels = WW.Levels.list().filter((e) => !onlyLevel || e.id === onlyLevel);
  if (!levels.length) levels.push({ id: 'blank', level: WW.Schema.blank() });
  const rows = [];
  for (const entry of levels) {
    for (const diff of diffs) {
      for (const strat of strategies) {
        const grades = { S: 0, A: 0, B: 0, C: 0, D: 0 };
        let wins = 0, score = 0, turns = 0;
        const defeats = {};
        for (let s = 0; s < seeds; s++) {
          const game = await playBot(entry.level, strat, 1000 + s * 7919, diff);
          const st = game.state;
          grades[st.final.grade]++;
          score += st.final.score;
          turns += st.turn;
          if (st.result === 'win') wins++;
          else defeats[st.endTitle] = (defeats[st.endTitle] || 0) + 1;
        }
        rows.push({
          level: entry.id, diff, strat, win: Math.round((wins / seeds) * 100) + '%', score: (score / seeds).toFixed(1),
          grades: Object.keys(grades).map((g) => g + grades[g]).join(' '), turns: (turns / seeds).toFixed(1),
          defeats: Object.keys(defeats).map((k) => k + '×' + defeats[k]).join(', ')
        });
      }
    }
  }
  return rows;
}

/* node tests/run.js --trace balanced [--level id] [--diff regular] [--seed 1] : per-turn numbers + log */
async function trace(strategy, levelId, diff, seed) {
  const entry = WW.Levels.list().find((e) => e.id === levelId);
  const level = entry ? entry.level : WW.Schema.blank();
  const game = new WW.Engine.Game(level, { seed, difficulty: diff });
  const r = (v) => Math.round(v * 10) / 10;
  const row = () => {
    const s = game.state.stats;
    const f = Object.values(game.state.factions).map((x) => x.id.slice(0, 4) + ':' + r(x.sentiment) + '/' + r(x.bias)).join(' ');
    return 'T' + game.state.turn + ' S=' + r(s.sentiment) + ' H=' + r(s.heat) + ' C=' + r(s.credibility) + ' E=' + r(s.exposure) + ' Q=' + r(s.satisfaction) +
      ' B=' + game.state.budget + ' P=' + game.state.lastPressure + ' | ' + f;
  };
  console.log(row());
  let seen = 0;
  let guard = 0;
  while (!game.state.finished && guard++ < 40) {
    await STRATEGIES[strategy](game);
    if (game.state.objectives.mainComplete && !game.state.finished) game.finishEarly();
    if (!game.state.finished) await game.endTurn();
    game.state.log.slice(seen).forEach((l) => console.log('   [' + l.kind + '] ' + l.text + (l.extra && l.extra.deltas ? ' ' + JSON.stringify(l.extra.deltas) : '')));
    seen = game.state.log.length;
    console.log(row());
  }
  console.log('RESULT', game.state.result, game.state.endTitle, JSON.stringify(game.state.final));
}

(async () => {
  if (args.includes('--trace')) {
    await trace(argVal('--trace', 'balanced'), argVal('--level', null), argVal('--diff', 'regular'), Number(argVal('--seed', 1)));
    return;
  }
  await unitTests();
  console.log('\nUnit tests: ' + passed + ' passed, ' + failed + ' failed');
  failures.forEach((f) => console.log('  ✗ ' + f.split('\n').slice(0, 6).join('\n    ')));
  const seeds = Number(argVal('--balance', args.includes('--balance') ? 50 : 10));
  const diffArg = argVal('--diffs', 'regular');
  const diffs = diffArg === 'all' ? WW.Data.difficultyOrder.slice() : diffArg.split(',');
  const stratArg = argVal('--strats', 'all');
  const strategies = stratArg === 'all' ? Object.keys(STRATEGIES) : stratArg.split(',');
  const rows = await balance(seeds, argVal('--level', null), diffs, strategies);
  console.log('\nBalance (' + seeds + ' seeds per cell):');
  console.table(rows);
  process.exitCode = failed ? 1 : 0;
})();
