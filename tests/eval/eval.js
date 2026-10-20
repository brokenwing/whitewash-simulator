#!/usr/bin/env node
/*
 * AI generation eval (开发阶段生成效果评测). Runs the production prompt path (WW.AI.run -> WW.LLM.chat
 * -> extractJSON / repair / Shape.coerce / post) on fixed cases and grades the results.
 *
 *   node tests/eval/eval.js --record                  re-record game-state fixtures (no AI)
 *   node tests/eval/eval.js --mock [--faults]         in-process fake model: exercises the harness for free
 *   node tests/eval/eval.js --dry-run                 prompt sizes per task, no calls
 *   node tests/eval/eval.js                           real provider from env (WW_EVAL_FORMAT/BASE/MODEL/KEY,
 *                                                     judge: WW_EVAL_JUDGE_*), see docs/AI.md
 *   node tests/eval/eval.js --agent <name>            export prompts for an external answerer, import its
 *                                                     answers from runs/<run>/responses/<name>/ on re-run
 * Options: --ref (reference subset) --tasks a,b --levels a,b --cases substr --repeat N --run <name>
 *          --max-calls N --no-judge --compare <run-*.json> --e2e <level> [--seed N]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Caller, makeContext } = require('./provider');
const { record } = require('./record');
const cases = require('./cases');
const code = require('./graders/code');
const judge = require('./graders/judge');
const report = require('./report');
const { createBots } = require('../harness');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const RUNS = path.join(__dirname, 'runs');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}

function selectCases() {
  let list = cases.all();
  if (has('--ref')) list = list.filter((c) => c.ref);
  const tasks = val('--tasks'); if (tasks) list = list.filter((c) => tasks.split(',').indexOf(c.task) >= 0);
  const levels = val('--levels'); if (levels) list = list.filter((c) => levels.split(',').indexOf(c.level) >= 0);
  const sub = val('--cases'); if (sub) list = list.filter((c) => sub.split(',').some((s) => c.id.indexOf(s) >= 0));
  return list;
}

/* ------------------------------------------------------------------ game state for a case */
function levelOf(WW, id) {
  const e = WW.Levels.list().find((x) => x.id === id);
  if (!e) throw new Error('未知关卡 ' + id);
  return e.level;
}

const FIXTURES = require('./record').loadFixtures();

function buildGame(WW, c) {
  const level = levelOf(WW, c.level);
  if (c.fixture) {
    const fx = FIXTURES[c.fixture];
    if (!fx) throw new Error('缺少录制数据 ' + c.fixture + '（先运行 --record）');
    return { game: WW.Engine.restore(level, JSON.parse(JSON.stringify(fx.save))), args: JSON.parse(JSON.stringify(fx.args)) };
  }
  const game = new WW.Engine.Game(level, { seed: 1, difficulty: 'regular' });
  const st = game.state;
  const s = c.setup || {};
  if (s.turn) st.turn = s.turn;
  (s.public || []).forEach((id) => { st.facts[id].public = true; });
  (s.reveal || []).forEach((id) => Object.assign(st.facts[id], { public: true, revealed: true, known: true }));
  (s.promises || []).forEach((p) => st.promises.push({ id: p.id, text: p.text, due: st.turn + p.days, status: 'pending', turn: Math.max(1, st.turn - p.days) }));
  Object.assign(st.stats, s.stats || {});
  /* hand-written candidate pools also become real posts, so the offline baseline can see them */
  if (c.task === 'posts.classify') {
    const byName = (map, name, def) => Object.keys(map).find((k) => map[k].name === name) || def;
    c.args.posts.forEach((p) => {
      const post = WW.Feed.create(game, { author: p.author, tier: byName(WW.Data.tiers, p.tier, 'normal'), platform: byName(WW.Data.platforms, p.platform, 'weibo'), content: p.content, tags: p.tags, stance: -1 });
      post.id = p.id;
    });
  }
  return { game, args: JSON.parse(JSON.stringify(c.args || {})) };
}

/* ------------------------------------------------------------------ one case */
function makeRunner(WW, caller, opts) {
  let current = null;
  /* every model call made by the production code lands here */
  WW.LLM.chat = (o) => {
    const isMain = o.task === current.task;
    const id = current.id + (isMain ? '' : '.' + o.task);
    let mockData = null;
    if (opts.backend === 'mock') {
      const base = /\.repair$/.test(o.task) ? o.task.replace(/\.repair$/, '') : o.task;
      mockData = WW.Offline.run(current.game, base, current.args);
      if (!WW.AI.TASKS[base].shape) mockData = mockData.text;
    }
    return caller.call({ id, who: 'subject', system: o.system, user: o.user, shape: o.shape, task: o.task, effort: o.effort, maxTokens: o.maxTokens, WW, mockData });
  };

  async function runTask(id, game, task, a) {
    current = { id, game, args: a, task };
    const before = caller.trace.length;
    const res = await WW.AI.run(game, task, a);
    const calls = caller.trace.slice(before);
    const pending = calls.some((r) => r.error === 'pending');
    return { res, calls, pending };
  }

  return async function runCase(c, rep) {
    const id = c.id + (rep ? '#r' + rep : '');
    const { game, args: a } = buildGame(WW, c);
    const offline = WW.Offline.run(buildGame(WW, c).game, c.task, a);
    const out = { id, case: c.id, task: c.task, level: c.level, ref: !!c.ref, rep: rep || 0, status: 'ok', calls: [] };
    const r = await runTask(id, game, c.task, a);
    out.calls = r.calls.map((x) => ({ id: x.id, task: x.task, cached: x.cached, ms: x.ms, usage: x.usage, error: x.error }));
    if (r.pending) { out.status = 'pending'; return out; }
    out.source = r.res.source;
    out.error = r.res.error || '';
    const mainCall = r.calls.find((x) => x.task === c.task);
    out.raw = mainCall ? mainCall.text : '';
    let rawJSON = null;
    try { if (WW.AI.TASKS[c.task].shape && out.raw) rawJSON = WW.LLM.extractJSON(out.raw); } catch (e) { /* counted via source */ }
    out.data = r.res.data;
    out.offline = offline;
    if (out.source !== 'ai') {
      out.status = 'fallback';
      out.grade = { checks: {}, metrics: {}, notes: ['AI 失败，已回退离线：' + out.error] };
      return out;
    }
    const ctx = { WW, game, args: a, raw: rawJSON, offline };
    out.grade = code.grade(c, out.data, ctx);
    out.situation = { turn: game.state.turn, slots: c.task === 'feed.generate' ? a.slots : undefined };

    /* followup 1: send a drafted statement back through statement.judge (tone consistency) */
    if (c.followup === 'judge') {
      const g2 = buildGame(WW, c).game;
      const f = await runTask(id + '.judged', g2, 'statement.judge', { type: c.args.type, channel: 'weibo', title: '', text: out.data.text });
      out.calls = out.calls.concat(f.calls.map((x) => ({ id: x.id, task: x.task, cached: x.cached, ms: x.ms, usage: x.usage, error: x.error })));
      if (f.pending) out.status = 'pending';
      else if (f.res.source === 'ai') out.followup = { scores: f.res.data.scores, q: code.composite(f.res.data.scores) };
    }
    /* followup 2: LLM judge for the subjective parts */
    if (!opts.noJudge) {
      const jr = judge.build(c, out.data, ctx);
      if (jr) {
        try {
          const res = await caller.call({ id: opts.subject + '__' + id + '.' + jr.kind, who: 'judge', system: jr.system, user: jr.user, shape: jr.shape, task: 'eval.judge', effort: 'medium', maxTokens: 8000, WW, mockData: judge.mockAnswer(c, out.data, ctx) });
          out.judge = WW.Shape.coerce(jr.shape, WW.LLM.extractJSON(res.text));
        } catch (e) {
          if (e.code === 'pending') out.status = 'pending';
          else out.judgeError = e.message;
        }
      }
    }
    return out;
  };
}

/* ------------------------------------------------------------------ e2e: a whole game through the AI */
async function e2e(WW, caller, levelId, seed) {
  const bots = createBots(WW);
  let n = 0;
  WW.LLM.chat = (o) => caller.call({ id: 'e2e.' + levelId + '.s' + seed + '.' + (++n) + '.' + o.task, who: 'subject', system: o.system, user: o.user, shape: o.shape, task: o.task, effort: o.effort, maxTokens: o.maxTokens, WW });
  const aiRunner = (game, task, a, o) => WW.AI.run(game, task, a, o);
  const game = await bots.playBot(levelOf(WW, levelId), 'smart', seed, 'regular', { aiRunner });
  await game.runAI('ending.report', {});
  return { level: levelId, seed, result: game.state.result, grade: game.state.final && game.state.final.grade, turns: game.state.turn, calls: caller.trace.map((x) => ({ id: x.id, task: x.task, ms: x.ms, usage: x.usage, error: x.error })) };
}

/* ------------------------------------------------------------------ main */
(async () => {
  if (has('--record')) {
    (await record()).forEach((l) => console.log(l));
    return;
  }
  const backend = has('--mock') ? 'mock' : has('--dry-run') ? 'dry' : has('--agent') ? 'agent' : 'api';
  const subject = backend === 'mock' ? 'mock' : backend === 'agent' ? val('--agent', 'agent') : backend === 'dry' ? 'dry' : (process.env.WW_EVAL_MODEL || 'model');
  const runName = val('--run', (backend === 'agent' ? 'agent' : backend) + '-' + stamp());
  const runDir = path.join(RUNS, runName);
  fs.mkdirSync(runDir, { recursive: true });

  const ctx = makeContext({ format: 'openai', provider: 'custom', baseURL: 'http://eval.invalid', model: subject, key: 'eval' });
  const WW = ctx.WW;

  if (backend === 'dry') {
    const sizes = {};
    for (const c of selectCases()) {
      const { game, args: a } = buildGame(WW, c);
      const spec = WW.AI.TASKS[c.task];
      const sys = WW.AI.baseSystem(game);
      const user = spec.user(game, a);
      const s = sizes[c.task] = sizes[c.task] || { cases: 0, system: 0, user: 0 };
      s.cases++; s.system += sys.length; s.user += user.length;
    }
    const rows = Object.keys(sizes).map((t) => ({ task: t, cases: sizes[t].cases, avgSystemChars: Math.round(sizes[t].system / sizes[t].cases), avgUserChars: Math.round(sizes[t].user / sizes[t].cases), estInputTokens: Math.round((sizes[t].system + sizes[t].user) / 1.5) }));
    console.table(rows);
    console.log('合计约 ' + rows.reduce((a, r) => a + r.estInputTokens, 0) + ' 输入 token（按 1.5 字/token 粗估，不含评委）');
    return;
  }

  const caller = new Caller({ backend, runDir, subject, mockFault: has('--faults'), maxCalls: Number(val('--max-calls', 0)) });

  if (has('--e2e')) {
    const r = await e2e(WW, caller, val('--e2e', 'milktea'), Number(val('--seed', 3)));
    fs.writeFileSync(path.join(runDir, 'e2e.json'), JSON.stringify(r, null, 1));
    console.log(report.e2eSummary(r));
    return;
  }

  const runCase = makeRunner(WW, caller, { backend, subject, noJudge: has('--no-judge') });
  const list = selectCases();
  const repeat = Number(val('--repeat', 1));
  const results = [];
  for (const c of list) {
    for (let r = 0; r < repeat; r++) {
      try {
        results.push(await runCase(c, repeat > 1 ? r + 1 : 0));
      } catch (e) {
        results.push({ id: c.id, case: c.id, task: c.task, level: c.level, ref: !!c.ref, status: 'error', error: e.stack || String(e), calls: [] });
      }
    }
  }
  const run = { name: runName, subject, backend, at: new Date().toISOString(), cases: list.length, repeat, results };
  /* one file per model, so several models can share a run directory (and its judge answers) */
  fs.writeFileSync(path.join(runDir, 'run-' + report.fileTag(subject) + '.json'), JSON.stringify(run, null, 1));
  const prev = val('--compare') ? JSON.parse(fs.readFileSync(path.resolve(val('--compare')), 'utf8')) : null;
  const md = report.write(run, runDir, cases.all(), prev);
  const pending = results.filter((r) => r.status === 'pending').length;
  console.log(md.split('\n').slice(0, 40).join('\n'));
  console.log('\n报告：' + path.join(runDir, 'report-' + report.fileTag(subject) + '.md'));
  if (pending) console.log('待回答的调用：' + caller.pending.length + ' 个，提示词在 ' + path.join(runDir, 'prompts') + '（回答写入 responses/<who>/<id>.txt 后用同样参数加 --run ' + runName + ' 重跑）');
})().catch((e) => { console.error(e); process.exitCode = 1; });
