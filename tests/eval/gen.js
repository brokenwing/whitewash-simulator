#!/usr/bin/env node
/*
 * Editor "✨ AI 一句话生成关卡" against a real model: generate, validate, then run the editor's 通关测试 on it.
 *   WW_EVAL_FORMAT=openai WW_EVAL_PROVIDER=lmstudio WW_EVAL_MODEL=qwen/qwen3.8-27b node tests/eval/gen.js
 * Model settings come from the same env vars as eval.js (WW_EVAL_FORMAT/BASE/MODEL/PROVIDER/KEY,
 * WW_EVAL_TIMEOUT, WW_EVAL_REASONING). Options:
 *   --premises 0,2      which built-in premises (default all)   --premise "<text>"  a custom one
 *   --depth quick       通关测试 depth: quick / standard / deep (default quick; none = skip)
 *   --run <name>        output folder under tests/eval/runs/ (default gen-<model>-<time>)
 * Writes <run>/gen-<i>.json (level), gen-<i>.report.json (sections, validation, check) and prints a summary.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { makeContext, envSettings } = require('./provider');

const PREMISES = [
  '网红火锅店被曝使用回收锅底油，老板坚称是同行陷害',
  '某国产手机品牌新机发布一周后被曝电池鼓包，官方客服回应“个例”',
  '知名少儿编程机构暴雷跑路传闻四起，家长维权群里流出老板转移资产的截图'
];

const args = process.argv.slice(2);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; };
const settings = envSettings('WW_EVAL_');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const runDir = path.join(__dirname, 'runs', val('--run', 'gen-' + String(settings.model).replace(/[^\w.-]+/g, '_') + '-' + stamp));
const depth = val('--depth', 'quick');
const premises = val('--premise') ? [val('--premise')] : val('--premises', PREMISES.map((_, i) => i).join(',')).split(',').map((i) => PREMISES[Number(i)]);

const WW = makeContext(settings).WW;
(async () => {
  fs.mkdirSync(runDir, { recursive: true });
  console.log('模型：' + settings.model + '（' + settings.format + (settings.provider ? ' / ' + settings.provider : '') + '），思考：' + (process.env.WW_EVAL_REASONING || 'auto'));
  const summary = [];
  for (let i = 0; i < premises.length; i++) {
    const premise = premises[i];
    console.log('\n==== ' + (i + 1) + '. ' + premise);
    const t0 = Date.now();
    const r = await WW.LevelGen.generate(premise, {
      turns: 8, budget: 100,
      onProgress: (rep) => {
        if (rep.running) return;
        const tok = rep.usage.reduce((n, u) => n + (u ? (u.completion_tokens || u.output_tokens || 0) : 0), 0);
        console.log('  ' + (rep.ok ? (rep.errors.length ? '⚠' : '✓') : '✗') + ' ' + rep.label + '：' + Math.round(rep.ms / 1000) + 's，' + rep.calls + ' 次调用，' + tok + ' token' +
          (rep.repairs ? '，修复 ' + rep.repairs + ' 次' : '') + (rep.errors.length ? '，残留 ' + rep.errors.length + ' 个问题' : '') + (rep.error ? '\n    ' + rep.error.split('\n')[0] : ''));
      }
    });
    const v = r.validation;
    const ob = r.level.objectives || {};
    const row = { premise, sec: Math.round((Date.now() - t0) / 1000), failed: r.failed, errors: v.errors.length, warnings: v.warnings.length,
      stages: (ob.stages || []).length, side: (ob.side || []).length, fixes: r.fixes };
    console.log('  总耗时 ' + row.sec + 's' + (r.failed ? '，停在「' + r.failed + '」段' : '') + '；校验 ' + v.errors.length + ' 错误 / ' + v.warnings.length + ' 提醒；阶段 ' + row.stages + '、支线 ' + row.side);
    if (r.fixes.length) console.log('  自动整理：' + r.fixes.join('；'));
    v.errors.concat(v.warnings).forEach((e) => console.log('  ' + (v.errors.indexOf(e) >= 0 ? '✗ ' : '! ') + e.path + '：' + e.msg));
    fs.writeFileSync(path.join(runDir, 'gen-' + i + '.json'), JSON.stringify(r.level, null, 2), 'utf8');
    if (!r.failed && !v.errors.length && depth !== 'none') {
      const res = await WW.LevelCheck.run(r.level, { depth });
      const a = WW.LevelCheck.analyze(r.level, res, 'any');
      const pct = (x) => (x ? Math.round(x.rate * 100) + '%' : '-');
      row.check = { games: res.games, verdicts: a.verdicts, byDiff: {} };
      res.diffs.forEach((dd) => { const x = a.byDiff[dd]; row.check.byDiff[dd] = { best: pct(x.best), blind: pct(x.bestBlind), admit: pct(x.admitBest), cover: pct(x.coverBest) }; });
      console.log('  通关测试（' + res.games + ' 局）：' + res.diffs.map((dd) => dd + ' 最佳 ' + row.check.byDiff[dd].best + '（凭可见信息 ' + row.check.byDiff[dd].blind + '）').join('，'));
      a.verdicts.forEach((x) => console.log('    ' + { red: '✗', yellow: '!', info: 'i', green: '✓' }[x.level] + ' ' + x.title));
    }
    fs.writeFileSync(path.join(runDir, 'gen-' + i + '.report.json'), JSON.stringify({ row, reports: r.reports, validation: v }, null, 2), 'utf8');
    summary.push(row);
  }
  const usable = summary.filter((x) => !x.failed && !x.errors).length;
  console.log('\n可直接载入：' + usable + '/' + summary.length + '，结果在 ' + runDir);
})();
