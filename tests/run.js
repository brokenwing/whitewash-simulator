#!/usr/bin/env node
/*
 * Dependency-free test runner for the engine (no DOM needed).
 *   node tests/run.js                 unit tests + quick balance check (10 seeds)
 *   node tests/run.js --balance 50    full balance report (seeds per strategy)
 *   node tests/run.js --level milktea only one level in the balance report
 *   node tests/run.js --check milktea [--depth quick|standard|deep] [--intent any|admit|cover]
 *                                     通关测试 of a level id or a level .json file (same as the editor)
 * Loads the browser scripts into a vm context whose global object doubles as `window`.
 */
'use strict';

const { loadContext, createBots } = require('./harness');

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
const { STRATEGIES, playBot, playGuide, finiteStats, statementText } = createBots(WW);

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
    await test('extractJSON re-balances brackets small models get wrong', () => {
      const X = WW.LLM.extractJSON;
      eq(JSON.stringify(X('{"a":[1,2}')), '{"a":[1,2]}');                       // missing ]
      eq(JSON.stringify(X('{"a":{"b":1}}},"c":2}')), '{"a":{"b":1},"c":2}');     // extra } no longer truncates silently
      eq(JSON.stringify(X('{"a":[{"b":1}]}]}')), '{"a":[{"b":1}]}');            // trailing extra closers
      eq(JSON.stringify(X('{"a":"x\ny","b":[1,2')), '{"a":"x\\ny","b":[1,2]}');  // raw newline, cut off at the end
      let err = null;
      eq(JSON.stringify(X('{"a":["说法\'x\']"}, "b": 1}')), '{"a":["说法\'x\']"],"b":1}'); // ] and } swapped
      try { X('{"turn":1", "b": 2}'); } catch (e) { err = e; }
      assert(err && err.code === 'json' && err.snippet, 'unfixable output reports the spot');
    });
  }

  await test('repairDraft moves misplaced sections, validate warns about them', () => {
    const lv = WW.Schema.blank();
    lv.side = [{ id: 'sd', title: '支线', complete: { var: 'turn', op: '>=', value: 3 } }];
    lv.opponents = [{ id: 'o1', name: '对手', abilities: ['rumor'], guide: [{ text: 'x' }], ai: { style: '阴阳怪气' } }];
    const v = WW.Schema.validate(lv);
    assert(v.warnings.some((w) => w.path === 'side' && /objectives\.side/.test(w.msg)), 'top-level side warned');
    assert(v.warnings.some((w) => w.path === 'opponents[0].ai'), 'nested ai warned');
    const r = WW.Schema.repairDraft(lv);
    eq(r.level.objectives.side[0].id, 'sd');
    eq(r.level.ai.style, '阴阳怪气');
    assert(r.level.guide === undefined && r.level.opponents[0].guide === undefined, 'tutorial steps dropped');
    eq(r.fixes.length, 4);
    assert(!WW.Schema.validate(r.level).warnings.some((w) => /会被忽略/.test(w.msg)), 'nothing left misplaced');
  });

  await test('validate flags tasks done at start and conditions that can never hold', () => {
    const lv = WW.Schema.blank();
    lv.objectives = {
      stages: [{ id: 's1', title: '阶段', tasks: [{ id: 't1', title: '热度降到 60 以下', complete: { var: 'stats.heat', op: '<=', value: 60 } }] }],
      side: [
        { id: 'keep_bad', title: '零水军（缺 at:end）', offer: 'start', complete: { var: 'itemUses.shill', op: '==', value: 0 } },
        { id: 'keep_ok', title: '零水军', offer: 'start', at: 'end', complete: { var: 'itemUses.shill', op: '==', value: 0 }, fail: { var: 'itemUses.shill', op: '>', value: 0 } },
        { id: 'flag_bad', title: '透明', offer: 'start', complete: { var: 'flags.transparency', op: '==', value: true } },
        { id: 'skill_bad', title: '调查', offer: 'start', complete: { var: 'itemUses.investigate', op: '>=', value: 1 } }
      ]
    };
    lv.initialStats = { heat: 80 };
    const w = WW.Schema.validate(lv).warnings.map((x) => x.path + ' ' + x.msg);
    assert(w.some((x) => /side\[0\]\.complete .*开局/.test(x)), 'keep goal without at:end warned');
    assert(!w.some((x) => /side\[1\]/.test(x)), 'at:end keep goal is fine');
    assert(w.some((x) => /side\[2\]\.complete .*transparency/.test(x)), 'flag nothing sets warned');
    assert(w.some((x) => /side\[3\]\.complete .*investigate/.test(x)), 'skill not enabled warned');
    assert(!w.some((x) => /stages\[0\]/.test(x)), 'normal first-stage task not warned');
  });

  await test('Bots.policy: same genome and seed give the same game', async () => {
    const lv = WW.Levels.get('milktea');
    const g = WW.Bots.genomes(5, 3)[4];
    const a = await WW.Bots.playBot(lv, WW.Bots.policy(g), 4, 'regular');
    const b = await WW.Bots.playBot(lv, WW.Bots.policy(g), 4, 'regular');
    eq(JSON.stringify(a.state.history), JSON.stringify(b.state.history));
    assert(WW.Bots.describe(g).split(' · ').length >= 5, WW.Bots.describe(g));
  });

  await test('LevelCheck: a required task nobody can finish is red, pointing at the task', async () => {
    const lv = WW.Schema.blank();
    lv.objectives = { stages: [
      { id: 's1', title: '一', tasks: [{ id: 'easy', title: '发一篇公文', complete: { var: 'itemUses.statement', op: '>=', value: 1 } }] },
      { id: 's2', title: '二', tasks: [{ id: 'never', title: '热度降到负数', complete: { var: 'stats.heat', op: '<', value: 0 } }] }
    ] };
    const res = await WW.LevelCheck.run(lv, { depth: 'quick', diffs: ['regular'] });
    const a = WW.LevelCheck.analyze(lv, res, 'any');
    const red = a.verdicts.filter((v) => v.level === 'red').map((v) => v.title + ' @' + v.path);
    assert(red.some((x) => /热度降到负数.*@objectives\.stages\[1\]\.tasks\[0\]/.test(x)), red.join('\n'));
  });

  await test('LevelCheck: a level idle can win is red', async () => {
    const lv = WW.Schema.blank();
    lv.objectives = { stages: [{ id: 's1', title: '一', tasks: [{ id: 'wait', title: '撑到第 2 回合', complete: { var: 'turn', op: '>=', value: 2 } }] }] };
    lv.victory = { condition: { var: 'turn', op: '>=', value: 1 } };
    const res = await WW.LevelCheck.run(lv, { depth: 'quick', diffs: ['regular'] });
    const a = WW.LevelCheck.analyze(lv, res, 'any');
    assert(a.verdicts.some((v) => v.level === 'red' && /什么都不做也能赢/.test(v.title)), JSON.stringify(a.verdicts));
  });

  for (const entry of WW.Levels.list().filter((e) => e.source === 'builtin')) {
    await test('LevelCheck: built-in level has no red verdict: ' + entry.id, async () => {
      const res = await WW.LevelCheck.run(entry.level, { depth: 'quick', diffs: ['regular'] });
      const red = WW.LevelCheck.analyze(entry.level, res, 'any').verdicts.filter((v) => v.level === 'red');
      assert(!red.length, red.map((v) => v.title).join('; '));
    });
  }

  await test('validate flags required tasks that need a skill not unlocked yet at that stage', () => {
    const lv = WW.Schema.blank();
    lv.items.enabled = ['statement', 'investigate', 'rectify', 'kol'];
    const t = (id, v) => ({ id, title: id, complete: { var: v, op: '>=', value: 1 } });
    lv.objectives = { stages: [
      { id: 's1', title: '一', rewards: [{ type: 'unlock', tier: 2, items: ['investigate'] }], tasks: [t('a', 'itemUses.statement'), t('b', 'flags.rectified')] },
      { id: 's2', title: '二', rewards: [{ type: 'unlock', tier: 3 }], tasks: [t('c', 'itemUses.investigate'), t('d', 'itemUses.kol')] },
      { id: 's3', title: '三', tasks: [t('e', 'flags.rectified')] }
    ] };
    const v = WW.Schema.validate(lv);
    const hit = v.warnings.filter((x) => x.blocking && /还没|只解锁到/.test(x.msg)).map((x) => x.path);
    eq(hit.join(','), 'objectives.stages[0].tasks[1].complete');
  });

  /* fake OpenAI-compatible server: answer(body) -> { content, finish } */
  const fakeLLM = (answer) => {
    const calls = [];
    const fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      const a = answer(body, calls.length);
      const payload = { choices: [{ message: { content: a.content }, finish_reason: a.finish || 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 50 } };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), clone() { return this; } };
    };
    const c = loadContext({ extraGlobals: { fetch, AbortController } });
    const L = c.WW.LLM;
    L.saveSettings(Object.assign({}, L.DEFAULTS, { provider: 'custom', format: 'openai', baseURL: 'http://127.0.0.1:9/v1', model: 'fake', keyMode: 'local', aiLevel: 'full' }), 'k');
    return { W: c.WW, calls };
  };

  await test('OpenAI path: finish_reason length is reported as truncation', async () => {
    const { W } = fakeLLM(() => ({ content: '{"a":', finish: 'length' }));
    const res = await W.LLM.chat({ system: 's', user: 'u' });
    eq(res.finishReason, 'length');
    let err = null;
    try { await W.LLM.chat({ system: 's', user: 'u', shape: W.Shape.obj({ a: W.Shape.num(0) }) }); } catch (e) { err = e; }
    assert(err && err.code === 'truncated' && /提示词 100/.test(err.message), 'structured task fails with token counts');
  });

  await test('LevelGen: section by section, one broken section repaired', async () => {
    const tut = WW.Levels.get('tutorial_crayfish');
    let broke = false;
    const { W, calls } = fakeLLM((body) => {
      const user = body.messages[1].content;
      const keys = /顶层键只能是：(.+)。/.exec(user)[1].split('、');
      const part = {};
      keys.forEach((k) => { if (tut[k] !== undefined) part[k] = tut[k]; });
      if (keys.indexOf('objectives') >= 0 && !broke) { broke = true; return { content: JSON.stringify(part).replace('"title"', '"title""') }; } // stray quote: needs the model repair round
      return { content: JSON.stringify(part) };
    });
    const seen = [];
    const r = await W.LevelGen.generate('测试事件', { turns: 6, budget: 80, onProgress: (rep) => { if (!rep.running) seen.push(rep.id); } });
    eq(r.failed, null);
    eq(seen.join(','), W.LevelGen.SECTIONS.map((s) => s.id).join(','));
    eq(calls.length, W.LevelGen.SECTIONS.length + 1);
    eq(r.reports.filter((x) => x.id === 'objectives')[0].repairs, 1);
    assert(!r.validation.errors.length, JSON.stringify(r.validation.errors));
    assert(r.level.guide === undefined, 'no tutorial steps in a generated level');
  });

  await test('LevelGen: a truncated section stops with the reason and keeps earlier sections', async () => {
    const tut = WW.Levels.get('tutorial_crayfish');
    const { W } = fakeLLM((body) => {
      const keys = /顶层键只能是：(.+)。/.exec(body.messages[1].content)[1].split('、');
      if (keys.indexOf('personas') >= 0) return { content: '{"personas": [', finish: 'length' };
      const part = {};
      keys.forEach((k) => { if (tut[k] !== undefined) part[k] = tut[k]; });
      return { content: JSON.stringify(part) };
    });
    const r = await W.LevelGen.generate('测试事件', { turns: 6, budget: 80 });
    eq(r.failed, 'people');
    assert(/输出被截断/.test(r.reports[1].error), r.reports[1].error);
    eq(r.draft.facts.length, tut.facts.length);
  });

  await test('guide: tips expire, steps wait for their condition and complete by themselves', async () => {
    const lv = WW.Schema.blank();
    lv.guide = [
      { turn: 1, text: '旧格式提示' },
      { id: 'pub', title: '发公文', text: '', done: { var: 'itemUses.statement', op: '>=', value: 1 } },
      { id: 'later', title: '第二回合', text: '', turn: 2 },
      { id: 'gated', title: '热度低了', text: '', when: { var: 'stats.heat', op: '<=', value: -1 } },
      { id: 'bye', at: 'result', title: '结语', text: '', when: { var: 'result', op: '!=', value: '' } }
    ];
    const game = new WW.Engine.Game(lv, { seed: 2 });
    assert(WW.Guide.isTutorial(game.level), 'has done steps = tutorial');
    eq(WW.Guide.sync(game).current.id, 'guide1');
    WW.Guide.mark(game, 'guide1');
    eq(WW.Guide.sync(game).current.id, 'pub');
    assert((await game.act('statement', { type: 'explain', channel: 'weibo', text: statementText(game, 'explain', 1, 1) })).ok, 'statement published');
    const info = WW.Guide.sync(game);
    eq(info.current, null, 'turn-2 step not available yet');
    assert(info.waiting, 'waiting for the next turn');
    await game.endTurn();
    eq(WW.Guide.sync(game).current.id, 'later');
    WW.Guide.mark(game, 'later');
    eq(WW.Guide.sync(game).current, null, 'gated step stays hidden');
    eq(WW.Guide.resultNotes(game).length, 0);
    game.finishEarly() || game.endGame('lose');
    eq(WW.Guide.resultNotes(game).map((g) => g.id).join(), 'bye');
  });

  await test('看不见的大手: every skill usable, no AP / cooldown / use limit', async () => {
    const game = new WW.Engine.Game(WW.Levels.get('tutorial_crayfish'), { seed: 4, difficulty: 'intern' });
    const st = game.state;
    assert(game.itemOrder.every((id) => game.itemStatus(id).usable), 'all skills usable on turn 1');
    const rumor = WW.Guide.findPost(game, 'fact:f2');
    for (let i = 0; i < 3; i++) assert((await game.act('iron_fist', { postId: rumor.id })).ok || st.facts.f2.refuted, 'iron fist again #' + i);
    eq(st.ap, st.apMax, 'no AP spent');
    const regular = new WW.Engine.Game(WW.Levels.get('tutorial_crayfish'), { seed: 4, difficulty: 'regular' });
    assert(regular.itemStatus('rectify').locked, 'regular still gates tiers');
  });

  await test('retired 地狱 saves resume as 金牌公关', () => {
    const lv = WW.Levels.get('tutorial_crayfish');
    const save = JSON.parse(JSON.stringify(new WW.Engine.Game(lv, { seed: 6, difficulty: 'gold' }).serialize()));
    save.state.difficulty = 'hell';
    const back = WW.Engine.restore(lv, save);
    eq(back.state.difficulty, 'gold');
    eq(back.diff.name, WW.Data.difficulties.gold.name);
  });

  await test('tutorial: following the guide card wins', async () => {
    const lv = WW.Levels.get('tutorial_crayfish');
    for (const diff of ['intern', 'regular', 'gold']) {
      for (let seed = 1; seed <= 8; seed++) {
        const game = await playGuide(lv, seed, diff);
        eq(game.state.result, 'win', diff + ' seed ' + seed + ' (' + game.state.endTitle + ')');
      }
    }
  });

  await test('log: dedupe, cap, scrub, unseen', () => {
    const { WW: W } = loadContext();
    const L = W.Log;
    L.clear();
    L.error('t', 'boom'); L.error('t', 'boom'); L.warn('t', 'other');
    const list = L.list();
    eq(list.length, 2);
    eq(list[0].count, 2);
    eq(L.unseen(), 1);
    L.markSeen();
    eq(L.unseen(), 0);
    L.warn('ai', 'bad key sk-ant-abcdef1234567890 rejected', { headers: { 'x-api-key': 'secret-value-123' }, auth: 'Bearer abcdefghijklmnop' });
    const e = L.list().pop();
    assert(e.msg.indexOf('abcdef1234567890') < 0, 'sk key leaked: ' + e.msg);
    assert(e.detail.indexOf('secret-value-123') < 0 && e.detail.indexOf('abcdefghijklmnop') < 0, 'detail leaked: ' + e.detail);
    for (let i = 0; i < 400; i++) L.info('t', 'n' + i);
    eq(L.list().length, 300);
    L.error('t', new Error('with stack'));
    assert(L.list().pop().stack.indexOf('with stack') >= 0, 'stack kept');
  });

  await test('log: warn/error persist across reload, info does not', () => {
    const a = loadContext().WW;
    a.Log.clear();
    a.Log.info('t', 'debug only'); a.Log.error('t', 'kept'); a.Log.flush();
    const saved = a.Store.get('errorLog', []);
    eq(saved.length, 1);
    const b = loadContext().WW;
    b.Store.set('errorLog', saved);
    b.Log.warn('t', 'new');
    const list = b.Log.list();
    eq(list.map(x => x.msg).join(','), 'kept,new');
    assert(list[0].prev && !list[1].prev, 'prev flag');
    assert(list[1].id > list[0].id, 'ids stay monotonic');
    eq(b.Log.unseen(), 0, 'last session errors are not unseen');
  });

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

/* node tests/run.js --check <level id | file.json> : the editor's 通关测试 in the terminal */
async function check(target, depth, intent) {
  const fs = require('fs');
  const level = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : WW.Levels.get(target);
  if (!level) throw new Error('找不到关卡：' + target);
  const res = await WW.LevelCheck.run(level, { depth });
  const a = WW.LevelCheck.analyze(level, res, intent);
  const pct = (x) => (x ? Math.round(x.rate * 100) + '%' : '-');
  console.log('通关测试：' + target + '，' + res.games + ' 局，' + (res.ms / 1000).toFixed(1) + ' 秒（深度 ' + res.depth + '，意图：' + WW.LevelCheck.INTENTS[a.intent] + '）\n');
  const icon = { red: '✗', yellow: '!', info: 'i', green: '✓' };
  a.verdicts.forEach((v) => console.log(icon[v.level] + ' ' + v.title + (v.detail ? '\n    ' + v.detail : '') + (v.path ? '\n    → ' + v.path : '')));
  console.log('');
  console.table(res.diffs.map((d) => {
    const b = a.byDiff[d];
    return { diff: d, best: pct(b.best), bestPlay: b.best ? b.best.entry.label : '', blind: pct(b.bestBlind), admit: pct(b.admitBest), cover: pct(b.coverBest), medianPolicy: Math.round(b.median * 100) + '%' };
  }));
  console.table(a.tasks.map((t) => {
    const row = { task: (t.side ? '支线 ' : t.required ? '必做 ' : '可选 ') + t.title };
    res.diffs.forEach((d) => { const x = t.byDiff[d]; row[d] = x.games ? x.done + '/' + x.reached + '/' + x.games : '-'; });
    return row;
  }));
  console.log('任务列：完成局数 / 出现局数 / 总局数');
  process.exitCode = a.verdicts.some((v) => v.level === 'red') ? 2 : 0;
}

(async () => {
  if (args.includes('--check')) {
    await check(argVal('--check', 'tutorial_crayfish'), argVal('--depth', 'standard'), argVal('--intent', 'any'));
    return;
  }
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
