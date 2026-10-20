/*
 * Shared test harness: loads the browser scripts into a Node vm context (the context's global
 * object doubles as window) and exposes the bots (js/engine/bots.js) used by tests/run.js and tests/eval.
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
  'js/core/ns.js', 'js/core/log.js', 'js/core/util.js', 'js/core/bus.js', 'js/core/storage.js',
  'js/data/platforms.js', 'js/data/factions.js', 'js/data/personas.js', 'js/data/pools.js', 'js/data/statements.js',
  'js/data/items.js', 'js/data/abilities.js', 'js/data/difficulty.js',
  'js/engine/cond.js', 'js/engine/effects.js', 'js/engine/schema.js', 'js/engine/feed.js', 'js/engine/items.js',
  'js/engine/truth.js', 'js/engine/actions.js', 'js/engine/sim.js', 'js/engine/objectives.js', 'js/engine/guide.js', 'js/engine/opponents.js',
  'js/engine/events.js', 'js/engine/scoring.js', 'js/engine/engine.js', 'js/engine/levels.js',
  'js/llm/offline.js', 'js/llm/shape.js', 'js/llm/client.js', 'js/llm/prompts.js',
  'js/engine/bots.js', 'js/editor/levelgen.js', 'js/editor/levelcheck.js'
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

  /* the bots themselves live in js/engine/bots.js (the editor's 通关测试 uses them too) */
  const B = WW.Bots;
  return Object.assign({}, B, {
    finiteStats,
    playBot: (level, strategy, seed, difficulty, gameOpts) => B.playBot(level, strategy, seed, difficulty, gameOpts, finiteStats)
  });
}

module.exports = { ROOT, FILES, loadContext, createBots };
