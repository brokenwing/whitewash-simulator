#!/usr/bin/env node
/*
 * Dependency-free test runner for the engine (no DOM needed).
 *   node tests/run.js                 unit tests + quick balance check (10 seeds)
 *   node tests/run.js --balance 50    full balance report (seeds per strategy)
 *   node tests/run.js --level milktea only one level in the balance report
 *   node tests/run.js --check milktea [--depth quick|standard|deep] [--intent any|admit|cover]
 *                                     通关测试 of a level id, a .json file or a levels/*.js file (same as the editor)
 *   node tests/run.js --check-all [--depth ...] [--json dir] [--genome-seed n]
 *                                     通关测试 of every level file in levels/; --json writes one summary per level
 *   node tests/run.js --tune moon_hoax [--out file.json] [--min-win 0.3] [--min-task 0.1] [--rounds 10]
 *                                     自动调优 (js/editor/leveltune.js); writes the tuned level only with --out
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

  await test('Schema.normalize is idempotent on every built-in level', () => {
    for (const entry of WW.Levels.list().filter((e) => e.source === 'builtin')) {
      const once = WW.Schema.normalize(entry.level);
      eq(JSON.stringify(WW.Schema.normalize(once)), JSON.stringify(once), entry.id);
    }
  });

  /* ---- task feasibility (js/engine/feasibility.js) ---- */
  const feas = (patch) => {
    const lv = WW.Schema.blank();
    lv.objectives = { stages: [{ id: 's1', title: '一', tasks: [{ id: 'base', title: '撑到最后', complete: { var: 'turnsLeft', op: '<=', value: 0 } }] }], side: [] };
    patch(lv);
    return { lv, w: WW.Schema.validate(lv).warnings };
  };
  const hits = (w, re) => w.filter((x) => re.test(x.msg));

  await test('Feasibility A: values out of range, facts against the truth, absent opponents, required tasks that "fail"', () => {
    const { w } = feas((lv) => {
      lv.facts.push({ id: 'f2', text: '谣言一条', isTrue: false, keywords: ['谣言'] });
      lv.opponents = [{ id: 'ghost', name: '幽灵号', startActive: false, abilities: [{ use: 'rumor' }] }];
      lv.objectives.side = [
        { id: 'a1', title: '热度破表', offer: 'start', complete: { var: 'stats.heat', op: '>=', value: 120 } },
        { id: 'a2', title: '证伪真事', offer: 'start', complete: { var: 'fact.f1.refuted', op: '==', value: true } },
        { id: 'a3', title: '曝光谣言', offer: 'start', complete: { var: 'fact.f2.revealed', op: '==', value: true } },
        { id: 'a4', title: '等幽灵', offer: 'start', complete: { var: 'opp.ghost.active', op: '==', value: true } },
        { id: 'a5', title: '主线失败', offer: 'start', complete: { var: 'task.base.failed', op: '==', value: true } },
        { id: 'ok', title: '二选一', offer: 'start', complete: { any: [{ var: 'stats.heat', op: '>=', value: 120 }, { var: 'stats.heat', op: '<=', value: 30 }] } }
      ];
    });
    ['热度破表', '证伪真事', '曝光谣言', '等幽灵', '主线失败'].forEach((t) => assert(hits(w, new RegExp(t + '.*完不成')).some((x) => x.blocking), t + ' ' + JSON.stringify(w.map((x) => x.msg))));
    assert(!hits(w, /二选一/).length, 'an any() with one possible branch is fine');
  });

  await test('Feasibility B: use caps, deadline vs offer vs at:end, text says "at the end", skills unlocked too late', () => {
    const { w } = feas((lv) => {
      lv.items.enabled.push('investigate');
      lv.objectives.stages[0].tasks.push({ id: 'opt', title: '本阶段查一次', required: false, complete: { var: 'itemUses.investigate', op: '>=', value: 1 } });
      lv.objectives.stages[0].rewards = [{ type: 'unlock', tier: 3 }];
      lv.objectives.stages.push({ id: 's2', title: '二', tasks: [{ id: 'b2', title: '撑住', complete: { var: 'turn', op: '>=', value: 3 } }] });
      lv.objectives.side = [
        { id: 'b1', title: '铁拳三连', offer: 'start', complete: { var: 'itemUses.iron_fist', op: '>=', value: 3 } },
        { id: 'b3', title: '来不及', offer: { var: 'turn', op: '>=', value: 5 }, deadline: 3, complete: { var: 'stats.heat', op: '<=', value: 50 } },
        { id: 'b4', title: '结算又限期', offer: 'start', at: 'end', deadline: 3, complete: { var: 'stats.heat', op: '<=', value: 50 }, fail: { var: 'stats.heat', op: '>', value: 90 } },
        { id: 'b5', title: '口碑', desc: '合同结束时好感不低于 0', offer: 'start', complete: { var: 'stats.sentiment', op: '>=', value: 0 } },
        { id: 'b6', title: '口碑前', desc: '合同结束前好感不低于 0', offer: 'start', complete: { var: 'stats.sentiment', op: '>=', value: 0 } },
        { id: 'b7', title: '早查', offer: 'start', deadline: 2, complete: { var: 'itemUses.investigate', op: '>=', value: 1 } }
      ];
    });
    assert(hits(w, /铁拳三连.*最多用 2 次/).some((x) => x.blocking), 'maxUses');
    assert(hits(w, /来不及.*发放时就已经过期/).some((x) => x.blocking), 'offer after deadline');
    assert(hits(w, /结算又限期.*永远等不到结算/).some((x) => x.blocking), 'at:end + deadline');
    assert(hits(w, /口碑」的描述.*at:"end"/).length === 1 && !hits(w, /口碑前/).length, 'end words, but not 合同结束前');
    assert(hits(w, /本阶段查一次.*过期/).some((x) => x.blocking), 'optional task needs a skill its own stage unlocks');
    assert(hits(w, /早查.*前 1 个阶段完成才解锁/).length === 1, 'side task with a deadline before the unlock: ' + JSON.stringify(w.map((x) => x.msg)));
  });

  await test('Feasibility B5: required skills that cost more than the whole budget', () => {
    const { w } = feas((lv) => {
      lv.contract.budget = 10;
      lv.items.custom = [{ id: 'gala', name: '天价发布会', tier: 1, cost: 50 }];
      lv.objectives.stages[0].tasks.push({ id: 'show', title: '开发布会', required: true, complete: { var: 'itemUses.gala', op: '>=', value: 1 } });
    });
    assert(hits(w, /天价发布会.*最低也要 50 万.*预算 10 万/).length === 1, JSON.stringify(w.map((x) => x.msg)));
  });

  await test('Feasibility A4: a required task that forces a side task to fail', () => {
    const { w } = feas((lv) => {
      lv.objectives.stages[0].tasks.push({ id: 'buy', title: '买水军', required: true, complete: { var: 'itemUses.shill', op: '>=', value: 2 } });
      lv.objectives.side = [{ id: 'clean', title: '零水军', offer: 'start', at: 'end', complete: { var: 'itemUses.shill', op: '==', value: 0 }, fail: { var: 'itemUses.shill', op: '>', value: 0 } }];
    });
    assert(hits(w, /零水军.*买水军.*必然/).length === 1, JSON.stringify(w.map((x) => x.msg)));
  });

  await test('Feasibility C: no lever on a faction / an opponent, and the fixes remove the warning', () => {
    const make = (lv) => {
      lv.factions = [{ id: 'crowd', name: '路过群众', size: 0.6, sentiment: -10 }, { id: 'zeal', name: '热血青年', desc: '跟风转发', size: 0.4, sentiment: 10 }];
      lv.opponents = [{ id: 'nerds', name: '科普联盟', morale: 70, abilities: [{ use: 'archive' }] }];
      lv.objectives.stages[0].tasks.push({ id: 'rally', title: '唤醒青年', required: true, complete: { var: 'faction.zeal', op: '>=', value: 40 } });
      lv.objectives.stages[0].tasks.push({ id: 'crush', title: '打压联盟', required: true, complete: { var: 'opp.nerds.morale', op: '<=', value: 40 } });
    };
    const { lv, w } = feas(make);
    const c1 = hits(w, /唤醒青年.*没有能单独影响它的手段/)[0], c2 = hits(w, /打压联盟.*没有打击它的手段/)[0];
    assert(c1 && c1.fixes.length === 3 && c2 && c2.fixes.length === 2, JSON.stringify(w.map((x) => [x.msg, x.fixes && x.fixes.length])));
    c1.fixes.forEach((fix) => {
      const copy = JSON.parse(JSON.stringify(lv));
      WW.Feasibility.applyFix(copy, fix);
      assert(!hits(WW.Schema.validate(copy).warnings, /唤醒青年.*没有能单独影响/).length || /性格/.test(fix.label), 'fix "' + fix.label + '" removes the warning');
    });
    c2.fixes.forEach((fix) => {
      const copy = JSON.parse(JSON.stringify(lv));
      WW.Feasibility.applyFix(copy, fix);
      const left = WW.Schema.validate(copy);
      eq(left.errors.length, 0, fix.label);
      assert(!hits(left.warnings, /打压联盟.*没有打击它的手段/).length, 'fix "' + fix.label + '" removes the warning');
    });
    /* the built-in levels, written with the default factions, have their levers */
    for (const id of ['tutorial_crayfish', 'milktea', 'idol', 'autobrake']) {
      assert(!hits(WW.Schema.validate(WW.Levels.get(id)).warnings, /没有能单独影响|没有打击它的手段/).length, id);
    }
  });

  await test('LevelCheck: a never-finished task says how close it came, and only moving targets get a threshold fix', async () => {
    const { lv } = feas((l) => {
      l.factions = [{ id: 'crowd', name: '路过群众', size: 0.6, sentiment: -10 }, { id: 'zeal', name: '热血青年', size: 0.4, sentiment: 10 }];
      l.opponents = [{ id: 'nerds', name: '科普联盟', morale: 70, abilities: [{ use: 'archive' }] }];
      l.objectives.stages[0].tasks.push({ id: 'rally', title: '唤醒青年', required: true, complete: { var: 'faction.zeal', op: '>=', value: 90 } });
      /* nothing deletes posts here (no 删帖 / 限流): the count never moves */
      l.items = { enabled: ['statement', 'kol', 'monitor'] };
      l.objectives.side = [{ id: 'crush', title: '打压联盟', offer: 'start', complete: { var: 'posts.deleted', op: '>=', value: 5 } }];
    });
    const res = await WW.LevelCheck.run(lv, { depth: 'quick', diffs: ['regular'] });
    const a = WW.LevelCheck.analyze(lv, res, 'any');
    const rally = a.verdicts.find((v) => /唤醒青年/.test(v.title)), crush = a.verdicts.find((v) => /打压联盟/.test(v.title));
    assert(rally && /最好只到 -?[\d.]+（差/.test(rally.detail) && rally.fixes && rally.fixes.length === 1, JSON.stringify(rally));
    const to = rally.fixes[0].patch[0].value, n = a.tasks.find((t) => t.id === 'rally').nearest[0];
    assert(to > n.from && to <= n.best, 'the new threshold still asks for progress: ' + JSON.stringify([to, n]));
    eq(rally.fixes[0].patch[0].path, 'objectives.stages[0].tasks[1].complete.value');
    assert(crush && /没往目标方向动过/.test(crush.detail) && !crush.fixes, JSON.stringify(crush));
  });

  await test('LevelTune: a lever first, a looser threshold only after; the input level is left alone', async () => {
    const { lv } = feas((l) => {
      l.factions = [{ id: 'crowd', name: '路过群众', size: 0.6, sentiment: -10 }, { id: 'zeal', name: '热血青年', size: 0.4, sentiment: 10 }];
      l.objectives.stages[0].tasks.push({ id: 'rally', title: '唤醒青年', required: true, complete: { var: 'faction.zeal', op: '>=', value: 90 } });
    });
    const before = JSON.stringify(lv);
    const res = await WW.LevelTune.run(lv, { maxRounds: 6 });
    eq(JSON.stringify(lv), before, 'input untouched');
    assert(res.changes.length && res.changes[0].kind === 'lever' && /专属技能/.test(res.changes[0].label), JSON.stringify(res.changes));
    const firstThreshold = res.changes.findIndex((c) => c.kind === 'threshold');
    assert(firstThreshold < 0 || firstThreshold > 0, 'threshold comes after the lever');
    const t = res.end.tasks.rally;
    assert(t.rate >= 0.1, 'rally finished often enough: ' + JSON.stringify(t) + ' ' + JSON.stringify(res.rounds));
    eq(WW.Schema.validate(res.level).errors.length, 0);
    assert(res.before && res.after, 'before / after recheck');
  });

  await test('LevelTune: a level that is already done is not changed', async () => {
    const res = await WW.LevelTune.run(WW.Levels.get('tutorial_crayfish'));
    assert(res.met && !res.changes.length && !res.rounds.length && !res.before, JSON.stringify(res.left));
  });

  await test('Schema.condSkills: item counts and engine flags map to skills', () => {
    const c = { all: [{ var: 'itemUses.shill', op: '>=', value: 1 }, { any: [{ var: 'flags.rectified', op: '==', value: true }, { var: 'flags.custom', op: '==', value: true }] }] };
    eq(JSON.stringify(WW.Schema.condSkills(c)), '["shill","rectify"]');
    eq(JSON.stringify(WW.Schema.condSkills(c, { rectified: true })), '["shill"]');
  });

  await test('LevelCheck: settling is tried on a level without the default 苦主 faction', async () => {
    const lv = WW.Schema.blank();
    lv.factions = [{ id: 'passerby', name: '路人', size: 0.7, sentiment: -10 }, { id: 'fans', name: '粉丝', size: 0.3, sentiment: 30 }];
    lv.facts[0].isTrue = true;
    lv.facts[0].evidence = { turn: 5, chance: 0.5, source: '家属', suppressBy: ['settle'] };
    lv.items = { enabled: lv.items.enabled.concat(['settle']), startTier: 3 };
    lv.objectives = { stages: [{ id: 's1', title: '一', tasks: [{ id: 'wait', title: '撑到最后', complete: { var: 'turnsLeft', op: '<=', value: 0 } }] }],
      side: [{ id: 'pay', title: '私了', offer: 'start', complete: { var: 'itemUses.settle', op: '>=', value: 1 } }] };
    assert(WW.Bots.victimPressure(new WW.Engine.Game(lv, { seed: 1 })), 'evidence a settlement suppresses counts as pressure');
    const res = await WW.LevelCheck.run(lv, { depth: 'quick', diffs: ['regular'] });
    const a = WW.LevelCheck.analyze(lv, res, 'any');
    assert(a.tasks.find((t) => t.id === 'pay').byDiff.regular.done > 0, JSON.stringify(a.tasks));
    assert(a.coverage.used.indexOf('settle') >= 0, JSON.stringify(a.coverage));
  });

  await test('LevelCheck: custom skills are used, and a task on a skill nobody used is not blamed on the level', async () => {
    const lv = WW.Schema.blank();
    lv.items = { enabled: ['statement', 'kol', 'expose'], startTier: 3, custom: [{ id: 'fan_army', name: '粉丝反黑站', tier: 1, ap: 1, cost: 2, channel: 'shill',
      effect: { prompt: '粉丝反黑', bounds: { sentiment: [-2, 4] }, offlineDeltas: { sentiment: 2 } } }] };
    lv.objectives = { stages: [{ id: 's1', title: '一', tasks: [
      { id: 'fans', title: '动员粉丝', required: false, complete: { var: 'itemUses.fan_army', op: '>=', value: 1 } },
      /* expose needs 舆情监测, which this level does not enable: unlocked, never usable */
      { id: 'dig', title: '扒一次皮', required: true, complete: { var: 'itemUses.expose', op: '>=', value: 1 } }] }] };
    const res = await WW.LevelCheck.run(lv, { depth: 'quick', diffs: ['regular'] });
    const a = WW.LevelCheck.analyze(lv, res, 'any');
    assert(a.tasks.find((t) => t.id === 'fans').byDiff.regular.done > 0, 'custom skill task done');
    assert(a.coverage.used.indexOf('fan_army') >= 0 && a.coverage.unused.indexOf('expose') >= 0, JSON.stringify(a.coverage));
    const dig = a.verdicts.filter((v) => /扒一次皮/.test(v.title));
    assert(dig.length === 1 && dig[0].level === 'yellow' && /扫参没用过/.test(dig[0].detail), JSON.stringify(dig));
  });

  await test('Bots.policy: the general tactics stay inside the genome (不整改 never rectifies)', async () => {
    const lv = WW.Levels.get('tutorial_crayfish');   /* a task there asks for flags.rectified */
    for (let i = 0; i < 6; i++) {
      const g = { id: 'p' + i, intel: 'blind', stance: 'refute', fix: 'never', suppress: 'none', shill: 'none', tactics: ['tasks', 'explore'] };
      const game = await WW.Bots.playBot(lv, WW.Bots.policy(g), 1, 'regular');
      const u = game.state.itemUses;
      assert(!u.rectify && !u.shill && !u.delete && !u.control && !u.investigate, 'p' + i + ' ' + JSON.stringify(u));
    }
  });

  await test('Bots.policy: picky turns down the client\'s add-on jobs', async () => {
    const lv = WW.Schema.blank();
    lv.objectives = { stages: [{ id: 's1', title: '一', tasks: [{ id: 'wait', title: '撑到最后', complete: { var: 'turnsLeft', op: '<=', value: 0 } }] }],
      side: [{ id: 'extra', title: '加单', from: 'client', offer: 'start', choice: true, complete: { var: 'stats.sentiment', op: '>=', value: 90 } }] };
    const g = { stance: 'refute', fix: 'never', suppress: 'none', shill: 'none', intel: 'blind', tactics: ['picky'] };
    const game = await WW.Bots.playBot(lv, WW.Bots.policy(g), 1, 'regular');
    eq(game.state.objectives.tasks.extra.status, 'declined');
  });

  await test('LevelCheck: the expert anchor\'s play without peeking is always tried on a full sample', async () => {
    const lv = WW.Levels.get('autobrake');
    const res = await WW.LevelCheck.run(lv, { depth: 'quick', diffs: ['regular'] });
    const peek = res.entries.filter((e) => e.genome.peekless && e.id.startsWith('p0n'));
    eq(JSON.stringify(peek.map((e) => e.genome.intel).sort()), '["blind","probe"]');
    assert(peek.every((e) => e.games.regular.length >= res.refine), JSON.stringify(peek.map((e) => e.games.regular.length)));
    /* every group's leader stands on a full sample */
    const a = WW.LevelCheck.analyze(lv, res, 'any');
    ['best', 'bestBlind', 'admitBest', 'coverBest'].forEach((k) => assert(!a.byDiff.regular[k] || a.byDiff.regular[k].n >= res.refine, k));
  });

  await test('LevelCheck: a 3-game sample alone does not make a verdict', () => {
    const lv = WW.Schema.blank();
    const games = (n, wins) => Array.from({ length: n }, (_, i) => ({ seed: i + 1, win: i < wins, turns: 5, end: i < wins ? '结案' : '合同到期', route: 'cover', tasks: {}, uses: [], unlocked: [] }));
    const policy = (id, g, n, wins) => ({ id, kind: 'policy', label: id, genome: Object.assign({ intel: 'blind', stance: 'refute', fix: 'early', suppress: 'none', shill: 'none', tactics: [] }, g), games: { regular: games(n, wins) } });
    const res = { diffs: ['regular'], refine: 10, entries: [
      { id: 'idle', kind: 'base', label: 'idle', genome: { base: 'idle' }, games: { regular: games(10, 0) } },
      policy('steady', {}, 10, 5),
      /* lucky: 2 of 3 games as a blind player, 1 of 3 as dirty play; never topped up */
      policy('lucky', { fix: 'never', suppress: 'heavy', shill: 'heavy' }, 3, 2),
      policy('dirty', { fix: 'never', suppress: 'heavy', shill: 'heavy', stance: 'deny' }, 10, 1)
    ] };
    const a = WW.LevelCheck.analyze(lv, res, 'any');
    eq(a.byDiff.regular.best.entry.id, 'steady', 'best only over topped-up entries');
    eq(a.byDiff.regular.bestBlind.rate, 0.5);
    assert(!a.verdicts.some((v) => /重压制/.test(v.title)), 'dirty play at 10% over 10 games is no verdict: ' + JSON.stringify(a.verdicts));
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

  /* in-memory localStorage that throws once `limit` characters are stored */
  function fakeStorage(limit) {
    const data = new Map();
    const size = () => { let n = 0; for (const [k, v] of data) n += k.length + v.length; return n; };
    return {
      get length() { return data.size; },
      key: (i) => Array.from(data.keys())[i] || null,
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => {
        const prev = data.get(k);
        data.set(k, String(v));
        if (size() > limit) { if (prev === undefined) data.delete(k); else data.set(k, prev); throw new Error('QuotaExceededError'); }
      },
      removeItem: (k) => { data.delete(k); }
    };
  }
  const runData = (levelId, turn, finished, pad) => ({ v: 1, levelId, savedAt: 1, state: { levelId, turn, difficulty: 'regular', finished, result: finished ? 'win' : null, final: finished ? { grade: 'B', score: 60 } : null, pad: pad || '' } });

  await test('runs: several saves per level, star, delete, newest first', async () => {
    const S = loadContext().WW.Store;
    assert(S.saveRunById('r1', runData('lv', 2, false), { levelTitle: '甲' }).ok);
    assert(S.saveRunById('r2', runData('lv', 5, true)).ok);
    assert(S.saveRunById('r3', runData('other', 1, false)).ok);
    eq(S.runs().length, 3);
    eq(S.runsOf('lv').length, 2);
    eq(S.runsOf('lv', true).map((m) => m.id).join(','), 'r1');
    await new Promise((r) => setTimeout(r, 5));
    S.saveRunById('r1', runData('lv', 3, false));
    eq(S.runs()[0].id, 'r1', 'updated run first');
    eq(S.runMeta('r1').turn, 3);
    eq(S.runMeta('r1').levelTitle, '甲', 'title kept across saves');
    eq(S.runMeta('r2').grade, 'B');
    S.starRun('r2', true);
    assert(S.runMeta('r2').starred);
    S.patchRun('r2', { story: { text: 'x' } });
    assert(S.runMeta('r2').hasStory && S.runMeta('r2').starred, 'patch keeps star, marks story');
    eq(S.loadRunById('r2').story.text, 'x');
    S.deleteRun('r3');
    eq(S.runs().length, 2);
    eq(S.loadRunById('r3'), null);
  });

  await test('runs: old single save per level is migrated', () => {
    const S = loadContext({ extraGlobals: { localStorage: fakeStorage(1e7) } }).WW.Store;
    S.set('save.milktea', runData('milktea', 4, false));
    const list = S.runs();
    eq(list.length, 1);
    eq(list[0].levelId, 'milktea');
    eq(list[0].turn, 4);
    eq(S.get('save.milktea', null), null, 'old key removed');
    eq(S.loadRunById(list[0].id).state.turn, 4);
  });

  await test('runs: full storage drops oldest un-starred finished runs, never open ones', async () => {
    const S = loadContext({ extraGlobals: { localStorage: fakeStorage(6800) } }).WW.Store;
    const pad = 'x'.repeat(1200);
    const tick = () => new Promise((r) => setTimeout(r, 3));
    assert(S.saveRunById('open', runData('lv', 1, false, pad)).ok); await tick();
    assert(S.saveRunById('old', runData('lv', 8, true, pad)).ok); await tick();
    assert(S.saveRunById('star', runData('lv', 8, true, pad)).ok); await tick();
    S.starRun('star', true);
    const r = S.saveRunById('new', runData('lv', 2, false, pad + pad));
    assert(r.ok, 'saved after pruning');
    eq(r.pruned.map((m) => m.id).join(','), 'old');
    eq(S.runs().map((m) => m.id).sort().join(','), 'new,open,star');
    const r2 = S.saveRunById('huge', runData('lv', 2, false, 'y'.repeat(9000)));
    assert(!r2.ok, 'too big even after pruning');
    assert(S.runMeta('open') && S.runMeta('star'), 'open and starred runs survive');
  });

  await test('chronicle + statements recorded; offline story covers every turn', async () => {
    const game = await playBot(WW.Levels.get('milktea'), 'balanced', 11, 'regular');
    const st = game.state;
    assert(st.chronicle.length >= st.turn - 1, 'chronicle ' + st.chronicle.length + ' for ' + st.turn + ' turns');
    assert(st.chronicle.every((c) => Array.isArray(c.actions) && Array.isArray(c.lines)), 'chronicle shape');
    if (st.counters.statements) assert(st.statements.length && st.statements[0].text.length > 10, 'statement text kept');
    for (const length of ['short', 'long']) {
      const out = WW.Offline.run(game, 'story.write', { length, hero: '阿白' }).text;
      assert(out.indexOf('# ') === 0 && out.indexOf('## 第一章') > 0, 'markdown chapters');
      assert(out.indexOf('阿白') >= 0, 'hero named');
      const turns = new Set(st.log.filter((l) => l.kind === 'action').map((l) => l.turn));
      for (const t of turns) assert(out.indexOf('【' + game.turnLabel(t) + '】') >= 0, 'turn ' + t + ' missing in ' + length);
    }
    eq(WW.AI.renumberChapters('# 书\n## 第一章 甲\n正文 第四章\n## 第四章 乙\n##第四章 丙\n## 第4章 丁'), '# 书\n## 第一章 甲\n正文 第四章\n## 第二章 乙\n## 第三章 丙\n## 第四章 丁');
    const material = WW.AI.storyMaterial(game, {});
    assert(material.indexOf('【经过（按回合）】') >= 0 && material.indexOf(st.endTitle) >= 0, 'story material');
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

  await test('required task with at:"end" counts toward the deadline verdict', async () => {
    const lv = WW.Schema.blank();
    lv.contract.turns = 3;
    lv.objectives = { stages: [{ id: 's1', title: '一', tasks: [{ id: 'keep', title: '热度不超过 100', at: 'end', complete: { var: 'stats.heat', op: '<=', value: 100 } }] }] };
    lv.victory = { condition: { var: 'turn', op: '<', value: 0 } };
    const game = new WW.Engine.Game(lv, { seed: 1 });
    while (!game.state.finished) await game.endTurn();
    eq(game.state.result, 'win', game.state.endTitle);
    eq(game.state.objectives.tasks.keep.status, 'done');
  });

  await test('rewards of tasks judged at the end are paid (early finish and deadline)', async () => {
    const lv = WW.Schema.blank();
    lv.objectives = {
      stages: [{ id: 's1', title: '一', tasks: [{ id: 'go', title: '撑过第 1 回合', complete: { var: 'turn', op: '>=', value: 2 } }] }],
      side: [{ id: 'clean', title: '零水军', at: 'end', complete: { var: 'itemUses.shill', op: '==', value: 0 }, fail: { var: 'itemUses.shill', op: '>', value: 0 }, rewards: [{ type: 'score', delta: 5 }] }]
    };
    const early = new WW.Engine.Game(lv, { seed: 1 });
    await early.endTurn();
    assert(early.finishEarly(), 'main quest done');
    eq(early.state.objectives.tasks.clean.status, 'done');
    eq(early.state.counters.scoreBonus, 5);
    lv.objectives.stages[0].tasks[0].complete = { var: 'turn', op: '>=', value: 99 };
    const late = new WW.Engine.Game(lv, { seed: 1 });
    while (!late.state.finished) await late.endTurn();
    eq(late.state.counters.scoreBonus, 5);
  });

  await test('fail on a required task: never fires, and validate says so', async () => {
    const lv = WW.Schema.blank();
    lv.objectives = { stages: [{ id: 's', title: '一', tasks: [{ id: 't', title: 't', complete: { var: 'turn', op: '>=', value: 9 }, fail: { var: 'turn', op: '>=', value: 1 } }] }] };
    assert(WW.Schema.validate(lv).warnings.some((w) => /不会生效/.test(w.msg)), 'warning says fail has no effect');
    const game = new WW.Engine.Game(lv, { seed: 1 });
    await game.endTurn();
    eq(game.state.objectives.tasks.t.status, 'active');
  });

  await test('victims cannot be co-opted, even without cooptable:false', () => {
    const lv = WW.Schema.blank();
    lv.items.enabled.push('coopt');
    lv.items.startTier = 3;
    lv.opponents = [{ id: 'v', name: '家属', kind: 'victims', faction: 'victim', abilities: ['rumor'] }, { id: 'g', name: '营销号', kind: 'group', abilities: ['rumor'] }];
    const game = new WW.Engine.Game(lv, { seed: 1 });
    assert(WW.Actions.get('coopt').validate(game, game.items.coopt, { oppId: 'v' }), 'victims refused');
    eq(WW.Actions.get('coopt').validate(game, game.items.coopt, { oppId: 'g' }), '');
  });

  await test('opponent iron fist honours lockItems / lockTurns overrides', () => {
    const lv = WW.Schema.blank();
    lv.facts[0].regulatory = true;
    lv.opponents = [{ id: 'o', name: '对家', abilities: [{ use: 'iron_fist', overrides: { params: { lockItems: ['shill'], lockTurns: 3, success: 1 } } }] }];
    const game = new WW.Engine.Game(lv, { seed: 1 });
    game.state.facts.f1.revealed = true;
    const o = game.state.opponents.o;
    o.strength = 100;
    const a = WW.Opponents.abilityFor(game, game.oppDef('o').abilities[0]);
    game.rng.chance = () => true; // the report always lands
    WW.Opponents.HANDLERS.iron_fist(game, o, a, 2);
    eq(JSON.stringify(game.state.items.locked), JSON.stringify({ shill: game.state.turn + 3 }));
    const plain = new WW.Engine.Game(WW.Levels.get('milktea'), { seed: 1 });
    WW.Truth.regulatorStrike(plain, 'test');
    eq(Object.keys(plain.state.items.locked).sort().join(), 'distraction,kol,shill,trend_remove');
  });

  await test('opponent ability condition adds to the ability\'s own condition', () => {
    const lv = WW.Schema.blank();
    lv.abilities = [{ id: 'cry', name: '哭诉', condition: { var: 'stats.heat', op: '>=', value: 40 }, effects: [] }];
    lv.opponents = [{ id: 'o', name: '对家', abilities: [{ use: 'cry', condition: { var: 'turn', op: '>=', value: 3 } }] }];
    const game = new WW.Engine.Game(lv, { seed: 1 });
    const a = WW.Opponents.abilityFor(game, game.oppDef('o').abilities[0]);
    game.state.stats.heat = 80; game.state.turn = 1;
    assert(!WW.Cond.evaluate(a.condition, game), 'turn gate');
    game.state.stats.heat = 10; game.state.turn = 5;
    assert(!WW.Cond.evaluate(a.condition, game), 'heat gate kept');
    game.state.stats.heat = 80;
    assert(WW.Cond.evaluate(a.condition, game), 'both hold');
  });

  await test('OpenAI JSON mode: a plain-text call does not reset the learned mode', async () => {
    const sent = [];
    const fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      const rf = body.response_format ? body.response_format.type : 'none';
      sent.push(rf);
      if (rf === 'json_object') return { ok: false, status: 400, text: async () => '{"error":{"message":"json_object not supported"}}', clone() { return this; } };
      const payload = { choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }] };
      return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload), clone() { return this; } };
    };
    const W = loadContext({ extraGlobals: { fetch, AbortController } }).WW;
    W.LLM.saveSettings(Object.assign({}, W.LLM.DEFAULTS, { provider: 'custom', format: 'openai', baseURL: 'http://127.0.0.1:9/v1', model: 'fake', keyMode: 'local', aiLevel: 'full' }), 'k');
    const shape = W.Shape.obj({ a: W.Shape.num(0, 9) });
    await W.LLM.chat({ system: 's', user: 'u', shape });
    await W.LLM.chat({ system: 's', user: 'u' });
    sent.length = 0;
    await W.LLM.chat({ system: 's', user: 'u', shape });
    eq(sent.join(','), 'json_schema');
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

/* what a sweep says, as plain data: written by --json so two runs can be compared */
function checkSummary(target, res, a) {
  const r = (x) => (x ? Math.round(x.rate * 1000) / 1000 : null);
  const byDiff = {};
  res.diffs.forEach((d) => {
    const b = a.byDiff[d];
    byDiff[d] = { best: r(b.best), bestPlay: b.best ? b.best.entry.label : '', bestBlind: r(b.bestBlind), admit: r(b.admitBest), cover: r(b.coverBest),
      median: b.median, share: b.share, idle: b.idle, shill: b.shill, winTurns: Math.round(b.winTurns * 10) / 10, ends: b.ends };
  });
  const tasks = {};
  a.tasks.forEach((t) => { tasks[t.id] = { title: t.title, side: t.side, required: t.required, byDiff: t.byDiff }; });
  return { level: res.level.id, target, depth: res.depth, games: res.games, ms: res.ms, byDiff, tasks,
    verdicts: a.verdicts.map((v) => ({ level: v.level, title: v.title })), coverage: a.coverage || null };
}

/* a level id, a .json file, or a levels/*.js file (WW.Levels.register wrapper) */
function loadTarget(target) {
  const fs = require('fs');
  if (fs.existsSync(target)) return WW.Levels.parseImport(fs.readFileSync(target, 'utf8')).level;
  return WW.Levels.get(target);
}

/* node tests/run.js --check <level id | file.json | levels/x.js> : the editor's 通关测试 in the terminal */
async function check(target, depth, intent, jsonOut, genomeSeed) {
  const level = loadTarget(target);
  if (!level) throw new Error('找不到关卡：' + target);
  const res = await WW.LevelCheck.run(level, { depth, genomeSeed });
  const a = WW.LevelCheck.analyze(level, res, intent);
  if (jsonOut) {
    const fs = require('fs'), path = require('path');
    fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
    fs.writeFileSync(jsonOut, JSON.stringify(checkSummary(target, res, a), null, 1));
  }
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

/* node tests/run.js --tune <level> [--out file.json] [--min-win 0.3] [--min-task 0.1] [--rounds 10] :
   自动调优 in the terminal; the tuned level is written only with --out, the source is never touched */
async function tune(target, outFile, o) {
  const level = loadTarget(target);
  if (!level) throw new Error('找不到关卡：' + target);
  const started = Date.now();
  const res = await WW.LevelTune.run(level, o, (ev) => {
    if (ev.type === 'try') console.log('第 ' + ev.round + ' 轮尝试：' + ev.tries.map((x) => '「' + x.task + '」' + x.label).join('；'));
    if (ev.type === 'round') ev.row.tries.forEach((x) => console.log('   ' + (x.kept ? '✓ 保留' : '✗ 撤销') + ' 「' + x.task + '」' + x.label + '：' + x.from + ' → ' + x.to));
    if (ev.type === 'final') console.log('标准深度复测调优前后……');
  });
  console.log('\n自动调优：' + target + '，' + res.rounds.length + ' 轮，' + ((Date.now() - started) / 1000).toFixed(1) + ' 秒，' + (res.met ? '已达标' : '未达标') + '\n');
  res.changes.forEach((c) => console.log((c.kind === 'threshold' ? '⚠ ' : '🔧 ') + '「' + c.task + '」' + c.label + '（' + c.from + ' → ' + c.to + '）\n    ' + c.desc));
  if (!res.changes.length) console.log('没有修改。');
  res.left.forEach((l) => console.log('✗ ' + l.title + '\n    ' + l.why));
  if (res.before) {
    const pct = (x) => Math.round(x * 100) + '%';
    console.table(res.after.diffs.map((d) => ({ diff: d, before: pct(res.before.best[d]), after: pct(res.after.best[d]) })));
    console.table(res.after.tasks.map((t, i) => {
      const row = { task: (t.side ? '支线 ' : t.required ? '必做 ' : '可选 ') + t.title };
      const b = res.before.tasks[i].byDiff[res.after.main], a = t.byDiff[res.after.main];
      row.before = b.done + '/' + b.reached;
      row.after = a.done + '/' + a.reached;
      return row;
    }));
  }
  if (outFile) {
    require('fs').writeFileSync(outFile, JSON.stringify(res.level, null, 2));
    console.log('已写出：' + outFile);
  }
  process.exitCode = res.met ? 0 : 2;
}

/* node tests/run.js --check-all [--json dir] : every built-in level, plus levels/*.js files not in the manifest */
async function checkAll(depth, intent, jsonDir, genomeSeed) {
  const fs = require('fs'), path = require('path');
  const { ROOT } = require('./harness');
  const listed = WW.Levels.manifest;
  const targets = listed.map((f) => WW.Levels.parseImport(fs.readFileSync(path.join(ROOT, 'levels', f), 'utf8')).level.id)
    .concat(fs.readdirSync(path.join(ROOT, 'levels')).filter((f) => f.endsWith('.js') && f !== 'manifest.js' && listed.indexOf(f) < 0).map((f) => path.join(ROOT, 'levels', f)));
  let worst = 0;
  for (const t of targets) {
    console.log('\n==================== ' + t);
    await check(t, depth, intent, jsonDir ? path.join(jsonDir, path.basename(t).replace(/\.js$/, '') + '.json') : null, genomeSeed);
    worst = Math.max(worst, process.exitCode || 0);
  }
  process.exitCode = worst;
}

(async () => {
  if (args.includes('--check-all')) {
    await checkAll(argVal('--depth', 'standard'), argVal('--intent', 'any'), argVal('--json', null), Number(argVal('--genome-seed', 7)));
    return;
  }
  if (args.includes('--check')) {
    await check(argVal('--check', 'tutorial_crayfish'), argVal('--depth', 'standard'), argVal('--intent', 'any'), argVal('--json', null), Number(argVal('--genome-seed', 7)));
    return;
  }
  if (args.includes('--tune')) {
    const d = WW.LevelTune.DEFAULTS;
    await tune(argVal('--tune', 'tutorial_crayfish'), argVal('--out', null), {
      minWin: Number(argVal('--min-win', d.minWin)), minTask: Number(argVal('--min-task', d.minTask)),
      maxRounds: Number(argVal('--rounds', d.maxRounds)), genomeSeed: Number(argVal('--genome-seed', d.genomeSeed))
    });
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
