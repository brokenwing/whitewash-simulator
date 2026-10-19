/*
 * Records real call sites: bots play each built-in level with an aiRunner that answers offline but
 * remembers (task, args, game save). Samples spread over early / mid / late turns are written to
 * fixtures/<level>.json, so eval cases replay exactly the prompts the game would send.
 *   node tests/eval/eval.js --record
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadContext, createBots } = require('../harness');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

/* how many recorded calls to keep per level and task */
const KEEP = {
  'feed.generate': 3, 'shill.generate': 1, 'control.generate': 1, 'kol.write': 1, 'distraction.generate': 1,
  'expose.generate': 1, 'item.custom': 2, 'ending.report': 2
};
const PLAYS = [['smart', 11], ['shill', 23], ['honest', 37], ['balanced', 41]];

function spread(list, n) {
  if (list.length <= n) return list;
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.round((i * (list.length - 1)) / Math.max(1, n - 1))]);
  return out;
}

async function record() {
  const WW = loadContext().WW;
  const bots = createBots(WW);
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const summary = [];
  for (const entry of WW.Levels.list()) {
    const byTask = {};
    for (const [strategy, seed] of PLAYS) {
      const aiRunner = (game, task, args) => {
        if (KEEP[task]) {
          (byTask[task] = byTask[task] || []).push({
            task, strategy, seed, turn: game.state.turn,
            args: JSON.parse(JSON.stringify(args || {})),
            save: JSON.parse(JSON.stringify(game.serialize()))
          });
        }
        return Promise.resolve({ data: WW.Offline.run(game, task, args), source: 'offline' });
      };
      const game = await bots.playBot(entry.level, strategy, seed, 'regular', { aiRunner });
      await game.runAI('ending.report', {});
    }
    const out = [];
    Object.keys(KEEP).forEach((task) => {
      const list = (byTask[task] || []).sort((a, b) => a.turn - b.turn);
      spread(list, KEEP[task]).forEach((r, i) => {
        r.id = entry.id + '@' + task + '#' + (i + 1);
        r.level = entry.id;
        out.push(r);
      });
    });
    fs.writeFileSync(path.join(FIXTURE_DIR, entry.id + '.json'), JSON.stringify(out), 'utf8');
    summary.push(entry.id + ': ' + out.length + ' 个录制调用（' + out.map((r) => r.task.split('.')[0] + '@T' + r.turn).join(' ') + '）');
  }
  return summary;
}

function loadFixtures() {
  const all = {};
  if (!fs.existsSync(FIXTURE_DIR)) return all;
  fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).forEach((f) => {
    JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), 'utf8')).forEach((r) => { all[r.id] = r; });
  });
  return all;
}

module.exports = { record, loadFixtures, FIXTURE_DIR };
