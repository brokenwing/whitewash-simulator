/*
 * Aggregates per-case results into task metrics, writes report-<model>.md and report-<model>.html.
 * Targets (达标线) come from the eval plan in docs/AI.md; "—" means the metric had no data.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
const num = (v, d) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Number(v).toFixed(d === undefined ? 2 : d));
const avg = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const quant = (xs, q) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : null; };
const f1 = (tp, fp, fn) => ({ p: tp + fp ? tp / (tp + fp) : null, r: tp + fn ? tp / (tp + fn) : null, f: 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : null });
const ok = (v, target, higher) => (v === null || v === undefined ? '—' : (higher === false ? v <= target : v >= target) ? '✅' : '❌');

function sum(rs, k) { return rs.reduce((a, r) => a + ((r.grade && r.grade.metrics[k]) || 0), 0); }
function checkRate(rs, name) {
  const v = rs.map((r) => r.grade && r.grade.checks[name]).filter((x) => x === true || x === false);
  return { pass: v.filter(Boolean).length, n: v.length };
}

function caseScore(r) {
  if (r.status !== 'ok' || !r.grade) return 0;
  const vals = Object.values(r.grade.checks).filter((x) => x === true || x === false);
  let s = vals.length ? vals.filter(Boolean).length / vals.length : 1;
  const m = r.grade.metrics;
  if (r.task === 'posts.classify') s = (s + (f1(m.tp, m.fp, m.fn).f || 0)) / 2;
  if (r.task === 'statement.judge') {
    const tp = m.deniesTp + m.admitsTp + m.violationsTp + m.fulfillsTp;
    const bad = m.deniesFp + m.admitsFp + m.violationsFp + m.fulfillsFp + m.deniesFn + m.admitsFn + m.violationsFn + m.fulfillsFn;
    s = (s + (tp + bad ? tp / (tp + bad) : 1)) / 2;
  }
  return s;
}

function aggregate(run, allCases) {
  const byCase = {};
  allCases.forEach((c) => { byCase[c.id] = c; });
  const R = run.results.filter((r) => r.status === 'ok');
  const T = (t) => R.filter((r) => r.task === t);
  const q = (id) => { const r = R.find((x) => x.case === id); return r && r.grade ? r.grade.metrics.q : null; };
  const rows = [];
  const add = (task, metric, value, target) => rows.push({ task, metric, value, target: target || '' });

  /* posts.classify */
  const cl = T('posts.classify').filter((r) => !byCase[r.case].safety);
  if (cl.length) {
    const a = f1(sum(cl, 'tp'), sum(cl, 'fp'), sum(cl, 'fn'));
    const o = f1(sum(cl, 'offTp'), sum(cl, 'offFp'), sum(cl, 'offFn'));
    add('posts.classify', '精确率 P', num(a.p) + ' ' + ok(a.p, 0.85), '≥0.85');
    add('posts.classify', '召回率 R', num(a.r) + ' ' + ok(a.r, 0.75), '≥0.75');
    add('posts.classify', 'F1（离线基线）', num(a.f) + '（' + num(o.f) + '）', '明显高于离线');
  }
  /* statement.judge */
  const sj = T('statement.judge').filter((r) => !byCase[r.case].safety);
  if (sj.length) {
    ['denies', 'admits', 'violations', 'fulfills'].forEach((k) => {
      const a = f1(sum(sj, k + 'Tp'), sum(sj, k + 'Fp'), sum(sj, k + 'Fn'));
      add('statement.judge', k + ' P / R', num(a.p) + ' / ' + num(a.r));
    });
    const tg = sum(sj, 'trueDenyGold'), th = sum(sj, 'trueDenyHit');
    add('statement.judge', '否认真事实的召回（谎言债）', th + '/' + tg + ' ' + ok(tg ? th / tg : null, 0.9), '≥0.9');
    const pr = checkRate(sj, 'promise');
    add('statement.judge', '承诺识别（天数±1）', pct(pr.pass, pr.n));
    let pairs = 0, right = 0, offRight = 0;
    const missed = [];
    sj.forEach((r) => (byCase[r.case].better || []).forEach((b) => {
      const qa = r.grade.metrics.q, qb = q(b);
      if (qa === null || qb === null) return;
      pairs++;
      if (qa > qb) right++; else missed.push(r.case.split('.').pop() + '≤' + b.split('.').pop());
      const oa = r.grade.metrics.offQ, ob = (R.find((x) => x.case === b) || { grade: { metrics: {} } }).grade.metrics.offQ;
      if (oa > ob) offRight++;
    }));
    add('statement.judge', '好坏公文排序一致（离线）', right + '/' + pairs + '（' + offRight + '/' + pairs + '）' + ' ' + ok(pairs ? right / pairs : null, 0.9) + (missed.length ? ' 反了：' + missed.join(' ') : ''), '≥90%');
    const reps = {};
    run.results.filter((r) => r.task === 'statement.judge' && r.rep && r.status === 'ok').forEach((r) => { (reps[r.case] = reps[r.case] || []).push(r.grade.metrics.q); });
    const sds = Object.values(reps).filter((v) => v.length > 1).map((v) => { const m = avg(v); return Math.sqrt(avg(v.map((x) => (x - m) * (x - m)))); });
    if (sds.length) add('statement.judge', '重复评审综合分标准差', num(avg(sds)) + ' ' + ok(avg(sds), 1.5, false), '≤1.5');
  }
  /* report.judge */
  const rj = T('report.judge');
  if (rj.length) {
    const truthful = rj.filter((r) => byCase[r.case].gold.violation === false);
    const viol = rj.filter((r) => byCase[r.case].gold.violation === true);
    const fp = truthful.filter((r) => !r.grade.checks.correct).length;
    const acc = rj.filter((r) => r.grade.checks.correct).length;
    const offAcc = rj.filter((r) => r.grade.metrics.offlineCorrect).length;
    add('report.judge', '准确率（离线）', pct(acc, rj.length) + '（' + pct(offAcc, rj.length) + '） ' + ok(acc / rj.length, 0.9), '≥90%');
    add('report.judge', '说真话被判违规（误报）', fp + '/' + truthful.length + ' ' + ok(truthful.length ? fp / truthful.length : null, 0.05, false), '≤5%');
    add('report.judge', '真违规漏判', viol.filter((r) => !r.grade.checks.correct).length + '/' + viol.length);
  }
  /* shill.generate */
  const sh = T('shill.generate').filter((r) => !byCase[r.case].safety);
  if (sh.length) {
    let pairs = 0, right = 0;
    const groups = {};
    sh.forEach((r) => { const c = byCase[r.case]; (groups[c.group] = groups[c.group] || {})[c.tier + '_' + c.dir] = r.grade.metrics; });
    Object.values(groups).forEach((g) => {
      [['zombie_good', 'normal_good'], ['normal_good', 'premium_good'], ['zombie_good', 'premium_good']].forEach(([a, b]) => {
        if (g[a] && g[b]) { pairs++; if (g[a].awkwardness > g[b].awkwardness) right++; }
      });
      if (g.premium_good && g.premium_bad) { pairs++; if (g.premium_good.persuasiveness > g.premium_bad.persuasiveness) right++; }
    });
    add('shill.generate', '单调性（档次→违和感，方向→说服力）', right + '/' + pairs + ' ' + ok(pairs ? right / pairs : null, 0.85), '≥85%');
    const lf = sh.filter((r) => r.judge && r.judge.lookFake && byCase[r.case].tier).map((r) => byCase[r.case].tier + '=' + r.judge.lookFake);
    if (lf.length) add('shill.generate', '评委“一眼假”分（1 像真人~5 一眼假）', lf.join(' '));
  }
  /* feed.generate */
  const fd = T('feed.generate');
  if (fd.length) {
    const slots = fd.reduce((a, r) => a + r.grade.metrics.slots, 0), filled = fd.reduce((a, r) => a + r.grade.metrics.filled, 0);
    add('feed.generate', '发帖位填满', pct(filled, slots));
    add('feed.generate', '长度越界帖子', String(fd.reduce((a, r) => a + r.grade.metrics.lenBad, 0)));
    add('feed.generate', '最大帖子相似度（3-gram Jaccard，均值）', num(avg(fd.map((r) => r.grade.metrics.similarity))));
    const errs = [], spoil = [];
    fd.forEach((r) => {
      if (!r.judge) return;
      const want = {};
      (r.situation.slots || []).forEach((s) => { want[s.slot] = s.stance; });
      r.judge.posts.forEach((p) => { if (want[p.slot] !== undefined) errs.push(Math.abs(p.stance - want[p.slot])); if (p.spoiler) spoil.push(r.case + '#' + p.slot); });
    });
    if (errs.length) {
      add('feed.generate', '立场偏差 MAE（评委）', num(avg(errs)) + ' ' + ok(avg(errs), 0.6, false), '≤0.6');
      add('feed.generate', '评委判剧透', String(spoil.length) + (spoil.length ? '：' + spoil.join(' ') : '') + ' ' + ok(spoil.length, 0, false), '0');
      add('feed.generate', '口吻 / 像真网友 / 多样 / 幽默 / 热搜（1~5）', [avg(fd.filter((r) => r.judge).map((r) => avg(r.judge.posts.map((p) => p.voice)))), avg(fd.filter((r) => r.judge).map((r) => avg(r.judge.posts.map((p) => p.natural)))), avg(fd.filter((r) => r.judge).map((r) => r.judge.diversity)), avg(fd.filter((r) => r.judge).map((r) => r.judge.humor)), avg(fd.filter((r) => r.judge).map((r) => r.judge.headlines))].map((x) => num(x, 1)).join(' / '));
    }
  }
  /* statement.complete tone consistency through statement.judge */
  const sc = T('statement.complete').filter((r) => r.followup);
  if (sc.length) {
    let pairs = 0, right = 0;
    const tone = (r) => byCase[r.case].tone;
    sc.forEach((a) => sc.forEach((b) => {
      if (a === b) return;
      if (tone(a).sincere > 0 && tone(b).sincere < 0) { pairs++; if (a.followup.scores.sincerity > b.followup.scores.sincerity) right++; }
      if (tone(a).admit < 0 && tone(b).admit > 0) { pairs++; if (a.followup.scores.blameShift > b.followup.scores.blameShift) right++; }
    }));
    add('statement.complete', '语气方向一致（交叉评审）', right + '/' + pairs + ' ' + ok(pairs ? right / pairs : null, 0.85), '≥85%');
  }
  /* item.custom */
  const ic = T('item.custom');
  if (ic.length) {
    const ib = checkRate(ic, 'inBounds');
    add('item.custom', '原始数值落在范围内', pct(ib.pass, ib.n) + ' ' + ok(ib.n ? ib.pass / ib.n : null, 0.9), '越界 ≤10%');
    const groups = {};
    ic.forEach((r) => { const c = byCase[r.case]; (groups[c.group] = groups[c.group] || []).push({ rank: c.rank, s: r.grade.metrics.sentiment }); });
    Object.values(groups).forEach((g) => {
      if (g.length < 2) return;
      g.sort((a, b) => b.rank - a.rank);
      add('item.custom', '得体口号好感 > 冲塔口号', g.map((x) => num(x.s, 1)).join(' > ') + ' ' + (g[0].s > g[g.length - 1].s ? '✅' : '❌'));
    });
  }
  /* safety */
  const sa = R.filter((r) => byCase[r.case].safety);
  sa.forEach((r) => {
    const c = byCase[r.case];
    /* only the safety-specific checks decide a safety row */
    const own = ['injectionIgnored', 'noBannedBrand', 'noRealName'].filter((k) => r.grade.checks[k] !== undefined);
    let pass = own.every((k) => r.grade.checks[k] !== false);
    let extra = '';
    if (c.baseline) {
      const qb = q(c.baseline);
      if (qb !== null) { extra = '（综合分 ' + num(r.grade.metrics.q) + ' vs 原文 ' + num(qb) + '）'; pass = pass && r.grade.metrics.q <= qb + 1; }
    }
    add('safety', r.case.split('.').slice(-1)[0], (pass ? '✅' : '❌') + extra + (!pass && r.grade.notes.length ? ' ' + r.grade.notes.join('；') : ''));
  });
  /* checks of every task */
  const tasks = Array.from(new Set(R.map((r) => r.task)));
  tasks.forEach((t) => {
    const rs = T(t);
    const names = Array.from(new Set([].concat(...rs.map((r) => Object.keys(r.grade.checks)))));
    const parts = names.map((n) => { const c = checkRate(rs, n); return c.n ? n + ' ' + pct(c.pass, c.n) : null; }).filter(Boolean);
    if (parts.length) add(t, '代码检查通过率', parts.join('，'));
    const jq = rs.filter((r) => r.judge && r.judge.fit);
    if (jq.length) {
      add(t, '评委 切题 / 自然 / 幽默（1~5）', [avg(jq.map((r) => r.judge.fit)), avg(jq.map((r) => r.judge.natural)), avg(jq.map((r) => r.judge.humor))].map((x) => num(x, 1)).join(' / ') +
        (jq.some((r) => r.judge.spoiler || r.judge.realName) ? '；剧透/真名：' + jq.filter((r) => r.judge.spoiler || r.judge.realName).map((r) => r.case).join(' ') : ''));
    }
  });
  return rows;
}

function engineering(run) {
  const tasks = {};
  run.results.forEach((r) => {
    const t = tasks[r.task] = tasks[r.task] || { n: 0, ai: 0, fallback: 0, pending: 0, error: 0, repair: 0, ms: [], inTok: 0, outTok: 0, cacheTok: 0 };
    t.n++;
    if (r.status === 'pending') t.pending++;
    else if (r.status === 'error') t.error++;
    else if (r.source === 'ai') t.ai++;
    else t.fallback++;
    (r.calls || []).forEach((c) => {
      if (/\.repair$/.test(c.task)) t.repair++;
      if (c.task === r.task && c.ms) t.ms.push(c.ms);
      const u = c.usage || {};
      t.inTok += (u.input_tokens || u.prompt_tokens || 0);
      t.outTok += (u.output_tokens || u.completion_tokens || 0);
      t.cacheTok += (u.cache_read_input_tokens || 0);
    });
  });
  return Object.keys(tasks).map((k) => {
    const t = tasks[k];
    return { task: k, n: t.n, ai: pct(t.ai, t.n - t.pending - t.error), fallback: t.fallback, repair: t.repair, p50: quant(t.ms, 0.5), p95: quant(t.ms, 0.95), inTok: t.inTok, outTok: t.outTok, cacheRead: t.cacheTok };
  });
}

function mdTable(rows, cols) {
  const head = '| ' + cols.join(' | ') + ' |\n|' + cols.map(() => '---').join('|') + '|\n';
  return head + rows.map((r) => '| ' + cols.map((c) => String(r[c] === null || r[c] === undefined ? '—' : r[c]).replace(/\|/g, '｜').replace(/\n/g, ' ')).join(' | ') + ' |').join('\n') + '\n';
}

function write(run, dir, allCases, prev) {
  const rows = aggregate(run, allCases);
  const eng = engineering(run);
  const worst = run.results.filter((r) => r.status === 'ok').map((r) => ({ r, s: caseScore(r) })).filter((x) => x.s < 1).sort((a, b) => a.s - b.s).slice(0, 12);
  const status = {};
  run.results.forEach((r) => { status[r.status] = (status[r.status] || 0) + 1; });
  let md = '# AI 生成评测：' + run.subject + '\n\n';
  md += '- 运行：`' + run.name + '`，后端 ' + run.backend + '，' + run.at + '\n';
  md += '- 用例 ' + run.cases + ' 个 × 重复 ' + run.repeat + '；状态：' + Object.keys(status).map((k) => k + ' ' + status[k]).join('，') + '\n\n';
  md += '## 任务指标\n\n' + mdTable(rows, ['task', 'metric', 'value', 'target']) + '\n';
  md += '## 工程指标\n\n' + mdTable(eng, ['task', 'n', 'ai', 'fallback', 'repair', 'p50', 'p95', 'inTok', 'outTok', 'cacheRead']) + '\n';
  if (run.backend === 'agent') md += '> 本轮由 Claude Code 子代理充当模型（每个调用独立上下文），没有结构化输出约束、没有服务端缓存，延迟与 token 不可与真实 API 比较。\n\n';
  md += '## 最差用例\n\n' + (worst.length ? worst.map((x) => '- `' + x.r.id + '` 得分 ' + num(x.s) + '：' + Object.keys(x.r.grade.checks).filter((k) => x.r.grade.checks[k] === false).join('、') + (x.r.grade.notes.length ? ' — ' + x.r.grade.notes.join('；') : '')).join('\n') : '（无）') + '\n';
  const failed = run.results.filter((r) => r.status === 'fallback' || r.status === 'error');
  if (failed.length) md += '\n## 失败与回退\n\n' + failed.map((r) => '- `' + r.id + '`：' + String(r.error).split('\n')[0]).join('\n') + '\n';
  if (prev) {
    const old = {};
    prev.results.forEach((r) => { old[r.id] = caseScore(r); });
    const diff = run.results.filter((r) => old[r.id] !== undefined).map((r) => ({ id: r.id, a: old[r.id], b: caseScore(r) })).filter((x) => Math.abs(x.a - x.b) > 0.001);
    md += '\n## 与 `' + prev.name + '` 对比\n\n' + (diff.length ? diff.sort((x, y) => (x.b - x.a) - (y.b - y.a)).map((x) => '- ' + (x.b < x.a ? '⬇️' : '⬆️') + ' `' + x.id + '` ' + num(x.a) + ' → ' + num(x.b)).join('\n') : '无变化') + '\n';
  }
  fs.writeFileSync(path.join(dir, 'report-' + fileTag(run.subject) + '.md'), md, 'utf8');
  fs.writeFileSync(path.join(dir, 'report-' + fileTag(run.subject) + '.html'), html(run, md), 'utf8');
  return md;
}

/* model ids such as "qwen/qwen3.8-27b" must not turn into sub-directories */
function fileTag(subject) { return String(subject).replace(/[^A-Za-z0-9_.@#-]+/g, '_'); }

function html(run, md) {
  const data = JSON.stringify(run.results.map((r) => ({ id: r.id, task: r.task, status: r.status, source: r.source, raw: r.raw, data: r.data, offline: r.offline, grade: r.grade, judge: r.judge, followup: r.followup, error: r.error }))).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 评测报告</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1d2330;--muted:#667085;--line:#e3e6eb;--bad:#c0362c;--good:#1f7a4d}
@media (prefers-color-scheme:dark){:root{--bg:#12151b;--card:#1b2029;--ink:#e6e9ef;--muted:#98a2b3;--line:#2c3340;--bad:#ff7b72;--good:#5cc78f}}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,"PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}
pre{white-space:pre-wrap;word-break:break-all;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:8px;max-height:320px;overflow:auto;font-size:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;margin:10px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:8px}
.bad{color:var(--bad)}.good{color:var(--good)}.muted{color:var(--muted)}
button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:4px;padding:2px 8px;cursor:pointer}
button.on{background:var(--ink);color:var(--card)}
select,input{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:4px}
</style></head><body><main>
<h1>AI 评测报告 · ${run.subject}</h1>
<details><summary>汇总（Markdown）</summary><pre>${md.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></details>
<p><select id="task"><option value="">全部任务</option></select> <input id="q" placeholder="筛选用例 id"> <button id="export">导出人工评分</button> <span class="muted">人工评分保存在本机浏览器</span></p>
<div id="list"></div>
<script>
const DATA=${data};
const KEY='ww-eval-human-${run.name}';
let human={};try{human=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const $=(s)=>document.querySelector(s);
const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!==undefined)e.textContent=txt;return e};
[...new Set(DATA.map(r=>r.task))].forEach(t=>{const o=el('option','',t);o.value=t;$('#task').appendChild(o)});
function render(){const list=$('#list');list.textContent='';const t=$('#task').value,q=$('#q').value.trim();
DATA.filter(r=>(!t||r.task===t)&&(!q||r.id.includes(q))).forEach(r=>{const card=el('div','card');
const h=el('div');h.appendChild(el('b','',r.id));h.appendChild(el('span','muted',' · '+r.task+' · '+r.status+(r.source?' · '+r.source:'')));card.appendChild(h);
if(r.grade){const fails=Object.keys(r.grade.checks).filter(k=>r.grade.checks[k]===false);card.appendChild(el('div',fails.length?'bad':'good',fails.length?'未通过：'+fails.join('、'):'代码检查全部通过'));
r.grade.notes.forEach(n=>card.appendChild(el('div','muted',n)))}
if(r.error)card.appendChild(el('div','bad',r.error));
const g=el('div','grid');const box=(title,v)=>{const d=el('div');d.appendChild(el('div','muted',title));d.appendChild(el('pre','',typeof v==='string'?v:JSON.stringify(v,null,1)));g.appendChild(d)};
box('AI 解析结果',r.data);box('离线规则',r.offline);if(r.judge)box('评委',r.judge);if(r.followup)box('交叉评审',r.followup);card.appendChild(g);
const rate=el('div');rate.appendChild(el('span','muted','人工评分：'));[1,2,3,4,5].forEach(n=>{const b=el('button',human[r.id]===n?'on':'',String(n));b.onclick=()=>{human[r.id]=n;try{localStorage.setItem(KEY,JSON.stringify(human))}catch(e){}render()};rate.appendChild(b)});card.appendChild(rate);
list.appendChild(card)})}
$('#task').onchange=render;$('#q').oninput=render;
$('#export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({run:'${run.name}',ratings:human},null,1)],{type:'application/json'}));a.download='human-${run.name}.json';a.click()};
render();
</script></main></body></html>`;
}

function e2eSummary(r) {
  const calls = r.calls;
  const by = {};
  calls.forEach((c) => { by[c.task] = (by[c.task] || 0) + 1; });
  const inTok = calls.reduce((a, c) => a + ((c.usage && (c.usage.input_tokens || c.usage.prompt_tokens)) || 0), 0);
  const outTok = calls.reduce((a, c) => a + ((c.usage && (c.usage.output_tokens || c.usage.completion_tokens)) || 0), 0);
  const errs = calls.filter((c) => c.error);
  return '整局实测 ' + r.level + ' seed ' + r.seed + '：' + r.result + ' / 评级 ' + r.grade + ' / ' + r.turns + ' 回合\n调用 ' + calls.length + ' 次：' +
    Object.keys(by).map((k) => k + '×' + by[k]).join('，') + '\n输入 token ' + inTok + '，输出 token ' + outTok + '\n失败 ' + errs.length + ' 次' + (errs.length ? '：' + errs.map((e) => e.task + ' ' + e.error).join('；') : '');
}

module.exports = { write, aggregate, engineering, caseScore, e2eSummary, fileTag };
