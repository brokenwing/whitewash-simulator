/*
 * One-line premise -> level draft, written section by section (no DOM; the editor dialog and
 * tests/eval/gen.js both drive it).
 *
 * Why sections: one 25 KB JSON is too much for small / local models -- a single slipped bracket
 * voids the whole level and long thinking can eat the context before any output. Each section is a
 * short JSON with its own example (cut from the tutorial level), gets parsed (with bracket repair),
 * validated against what is already written, and on failure is sent back once with the error, then
 * retried once from scratch. Finished sections are kept, so a failed one can be retried alone.
 */
(function (WW) {
  'use strict';

  var U = WW.U;

  /* Lists are built from the engine catalogs so the prompt never drifts from what the engine accepts. */
  function rules() {
    var D = WW.Data;
    var vars = WW.Cond.VARS.map(function (v) { return v.key + (v.param && v.key.slice(-1) === '.' ? '<id>' : ''); });
    return [
      '你是讽刺类网络舆情模拟游戏《公关洗地模拟器》的关卡设计师。所有人物、品牌、机构必须虚构，不涉及现实政治。',
      '只输出一个 JSON 对象，不要解释，不要代码块。字符串里不要用英文双引号（需要引号时用「」或中文引号）。',
      '条件格式：{"var":"stats.heat","op":"<=","value":60}，组合用 {"all":[...]}、{"any":[...]}、{"not":{...}}；op 只能是 ' + WW.Cond.OPS.join(' ') + '。',
      '可用变量：' + vars.join('、') + '。',
      '效果格式：{"type":"stat","stat":"heat","delta":5}，可用 type：' + Object.keys(WW.Effects.TYPES).map(function (k) { return k + '(' + WW.Effects.TYPES[k].fields.join(',') + ')'; }).join('、') + '。',
      '技能 id：' + Object.keys(D.items).join(' ') + '。',
      '对手技能 id：' + Object.keys(D.abilities).join(' ') + '。',
      '所有 id 用英文小写加下划线；引用别的条目时只能用已经定义的 id。'
    ].join('\n');
  }

  var TASK_RULES = [
    '子任务字段：id、title、desc、complete（完成条件，必填）、required（主任务子任务默认必做）、fail（失败条件）、deadline（第几回合结束前要完成）、at:"end"（结算时才判定）、rewards / penalty（效果列表）。',
    '支线写在 objectives.side 里（不要写在顶层），另有 offer（"start" 开局发放，或一个条件）、choice:true（玩家可以拒绝）、from（发放方）。',
    '“全程保持 / 零 X 通关 / 不超过 X”这类目标必须写成支线或可选子任务，加 at:"end" 并用 fail 写违规条件，否则开局就会判定完成；必做子任务不会失败（fail 对它无效），不要用来写这类目标。',
    '条件里用到的 flags.<名> 必须有某个 {"type":"flag","name":"<名>"} 效果去设置（引擎自带的只有 ' +
      Object.keys(WW.Schema.ENGINE_FLAG_LABELS).map(function (k) { return k + ' ' + WW.Schema.ENGINE_FLAG_LABELS[k]; }).join('、') + '）；itemUses.<技能> 和 unlock 的技能都必须在 items.enabled 里。',
    '阶段奖励用 {"type":"unlock","tier":2}（或 3）逐步解锁技能层级，再配 {"type":"budget","delta":15} 追加预算。',
    '技能层级：' + [1, 2, 3].map(function (n) { return n + ' 级 ' + Object.keys(WW.Data.items).filter(function (k) { return (WW.Data.items[k].tier || 1) === n; }).join(' '); }).join('；') + '。',
    '必做子任务要用到的技能（itemUses.<技能>，flags.rectified 需要 rectify）必须在这一阶段开始前就已解锁：开局层级 items.startTier，或前面阶段奖励里的 unlock。本阶段的奖励要等本阶段完成才发放。',
    '以 faction.<阵营> 好感为目标时，玩家得有办法单独拉动这个阵营：它在某个已启用技能的渠道上 sens ≥ 1.3 且明显高于其他阵营，或者有自定义技能 / 事件效果 {"type":"faction","faction":"<阵营>"} 专门作用于它。开局舆论压力会把所有阵营往下拉，目标别定得比开局值高太多。',
    '以 opp.<对手>.morale / strength 压低为目标时，要启用能打击它的技能：反向扒皮 expose（配舆情监测 monitor，且对手有 dirt 把柄或会用 counter_shill / rumor）、律师函 legal，或对手会造谣（rumor）时用铁拳 iron_fist。',
    '描述里写“合同结束时 / 全程 / 整局”的目标要加 at:"end"；可选子任务和带期限的支线要用的技能，也必须在它能被完成之前解锁（可选子任务在本阶段完成时就会过期）。'
  ].join('\n');

  /* keys: what the section writes; ctx: what it may reference from earlier sections */
  var SECTIONS = [
    { id: 'core', label: '骨架：委托方、事件、事实、阵营', effort: 'medium', maxTokens: 12000,
      keys: ['id', 'meta', 'client', 'incident', 'facts', 'contract', 'initialStats', 'factions', 'platforms'], ctx: [],
      ask: function (o) {
        return '写这一关的骨架。要求：contract.turns=' + o.turns + '，contract.budget=' + o.budget + '；3~5 条事实（真假混合，至少一条是谣言 isTrue:false、一条是可被铁拳的违规把柄 regulatory:true，每条写清客户口径 clientClaim 和 keywords）；4~6 个阵营（factions，size 合计约 1）。' +
          '每个阵营都要写 sens（对各类手段的敏感系数，渠道：' + WW.Data.channelOrder.filter(function (c) { return c !== 'event'; }).join(' ') + '；1 为普通，2 为加倍，负数为反感），' +
          '按人设至少有两个渠道明显偏离 1，各阵营之间要有区别：没写 sens 的阵营对所有手段一律为 1，玩家没法单独拉动它。';
      } },
    { id: 'people', label: '网民画像与初始帖子', effort: 'medium', maxTokens: 12000,
      keys: ['personas', 'seedPosts', 'ai'], ctx: ['incident', 'facts', 'factions', 'platforms'],
      ask: function () {
        return '写 4~6 个常驻网民画像 personas、6~8 条初始帖子 seedPosts（不同平台、立场与影响力，大部分用 fact 关联事实 id，persona 只能引用本段的画像 id 或 null），以及 ai.style（网民文风补充）。';
      } },
    { id: 'opponents', label: '对手', effort: 'medium', maxTokens: 12000,
      keys: ['opponents'], ctx: ['incident', 'facts', 'factions'],
      ask: function () {
        return '写 1~3 个对手 opponents，每个带 abilities（对手技能 id）；可以带 events（对手事件，效果里的 opp 只能引用本段定义的对手 id）。';
      } },
    { id: 'objectives', label: '技能、主任务与支线', effort: 'high', maxTokens: 14000,
      keys: ['items', 'objectives'], ctx: ['contract', 'facts', 'factions', 'opponents'],
      ask: function () {
        return '写 items（enabled 启用的技能，至少包含 statement、investigate、rectify、iron_fist；startTier）和 objectives：3 个主任务阶段 stages（每阶段 2~3 个子任务，逐步解锁技能层级并追加预算）和 2~3 条支线 side。\n' + TASK_RULES;
      } },
    { id: 'events', label: '脚本事件', effort: 'high', maxTokens: 12000,
      keys: ['events'], ctx: ['contract', 'facts', 'factions', 'opponents', 'objectives'],
      ask: function () {
        return '写 2~3 个脚本事件 events（id、title、text、trigger 触发条件、chance、once、effects），让局势在中后期有转折；offerTask 只能发放 objectives.side 里已有的支线。';
      } }
  ];

  function pick(obj, keys) {
    var out = {};
    keys.forEach(function (k) { if (obj && obj[k] !== undefined) out[k] = obj[k]; });
    return out;
  }

  /* the tutorial's own section is the format example; tutorial steps are never part of it */
  function example(sec) {
    var ref = WW.Levels.get('tutorial_crayfish') || WW.Schema.blank();
    return JSON.stringify(pick(ref, sec.keys));
  }

  function userPrompt(sec, premise, opts, draft) {
    var lines = ['事件设定：' + premise];
    var known = pick(draft, sec.ctx);
    if (Object.keys(known).length) lines.push('已经写好的部分（只能引用这里的 id，不要重复输出）：\n' + JSON.stringify(known));
    lines.push('这一段的格式参考（只学结构和写法，不要照抄内容）：\n' + example(sec));
    lines.push(sec.ask(opts));
    lines.push('只输出一个 JSON 对象，顶层键只能是：' + sec.keys.join('、') + '。');
    return lines.join('\n\n');
  }

  /* errors (and blocking warnings: tasks that can never work) of the merged draft in this section's keys */
  function sectionErrors(sec, draft) {
    var v = WW.Schema.validate(WW.Schema.repairDraft(draft).level);
    return v.errors.concat(v.warnings.filter(function (w) { return w.blocking; })).filter(function (e) {
      var head = String(e.path).split(/[.[]/)[0];
      return sec.keys.indexOf(head) >= 0;
    });
  }

  function merge(sec, draft, data) {
    var next = U.deepClone(draft);
    var extra = [];
    Object.keys(data || {}).forEach(function (k) {
      /* side / stages written at the top level are moved by repairDraft later */
      if (sec.keys.indexOf(k) >= 0 || k === 'side' || k === 'stages') next[k] = data[k];
      else extra.push(k);
    });
    return { draft: next, ignored: extra };
  }

  function call(sec, user, opts, report) {
    return WW.LLM.chat({
      task: 'level.generate.' + sec.id, effort: sec.effort, maxTokens: sec.maxTokens,
      stream: !!opts.onText, onText: opts.onText ? function (d) { opts.onText(sec, d); } : undefined,
      system: rules(), user: user
    }).then(function (res) {
      report.calls++;
      report.ms += res.ms || 0;
      report.usage.push(res.usage || null);
      if (res.finishReason === 'length') {
        var e = new Error(WW.LLM.truncationMessage(res.usage));
        e.code = 'truncated';
        throw e;
      }
      return res.text;
    });
  }

  /* One section: generate -> parse -> validate; one repair round with the error, then one fresh retry. */
  function runSection(sec, premise, opts, draft) {
    var report = { id: sec.id, label: sec.label, calls: 0, ms: 0, usage: [], repairs: 0, errors: [], ignored: [], ok: false, error: '' };
    var user = userPrompt(sec, premise, opts, draft);
    var best = null; /* the parsed attempt with the fewest reference errors */
    var attempt = function (left) {
      return call(sec, user, opts, report).then(function (text) {
        return check(text).catch(function (e) {
          if (e.code === 'truncated' || !e.repairable) throw e;
          report.repairs++;
          var fixUser = user + '\n\n你上一次的输出有问题：' + e.message + '\n上一次的输出：\n' + String(text).slice(0, 14000) + '\n\n请改正后重新完整输出这一段 JSON。';
          return call(sec, fixUser, opts, report).then(check);
        });
      }).catch(function (e) {
        if (e.code === 'truncated' || left <= 0) throw e;
        return attempt(left - 1);
      });
    };
    var check = function (text) {
      var data;
      try { data = WW.LLM.extractJSON(text); } catch (e) {
        var pe = new Error(e.message + (e.snippet ? '\n出错位置附近：' + e.snippet : ''));
        pe.repairable = true;
        return Promise.reject(pe);
      }
      if (!U.isObj(data)) { var ne = new Error('输出不是 JSON 对象'); ne.repairable = true; return Promise.reject(ne); }
      var m = merge(sec, draft, data);
      var errs = sectionErrors(sec, m.draft);
      if (errs.length) {
        var ve = new Error('校验错误：\n' + errs.slice(0, 12).map(function (x) { return x.path + '：' + x.msg; }).join('\n'));
        ve.repairable = true;
        ve.partial = m;
        ve.errs = errs;
        if (!best || errs.length < best.errs.length) best = { partial: m, errs: errs };
        return Promise.reject(ve);
      }
      report.ignored = m.ignored;
      return Promise.resolve(m.draft);
    };
    return attempt(1).then(function (next) {
      report.ok = true;
      return { draft: next, report: report };
    }, function (e) {
      /* parsed but still has reference errors: keep it, the editor shows the errors to fix by hand */
      if (best) {
        WW.Log.warn('levelgen', '「' + sec.label + '」段生成后仍有 ' + best.errs.length + ' 处校验错误，已保留待手动修改',
          best.errs.slice(0, 20).map(function (x) { return x.path + '：' + x.msg; }).join('\n'));
        report.ok = true;
        report.errors = best.errs;
        report.ignored = best.partial.ignored;
        return { draft: best.partial.draft, report: report };
      }
      report.error = e.message;
      WW.Log.warn('levelgen', '「' + sec.label + '」段生成失败：' + e.message, { code: e.code || '', calls: report.calls, repairs: report.repairs });
      return { draft: draft, report: report };
    });
  }

  /* opts: { turns, budget, draft? (resume), from? (section id to start at), onProgress(report, index),
   *         onText(section, delta)? } -> { level, draft, fixes, validation, reports, failed } */
  function generate(premise, opts) {
    opts = opts || {};
    var draft = U.deepClone(opts.draft || {});
    var reports = [];
    var start = 0;
    if (opts.from) SECTIONS.forEach(function (s, i) { if (s.id === opts.from) start = i; });
    var progress = function (r, i) { if (opts.onProgress) opts.onProgress(r, i); };
    var step = function (i) {
      if (i >= SECTIONS.length) return Promise.resolve(null);
      var sec = SECTIONS[i];
      progress({ id: sec.id, label: sec.label, running: true }, i);
      return runSection(sec, premise, opts, draft).then(function (r) {
        draft = r.draft;
        reports.push(r.report);
        progress(r.report, i);
        return r.report.ok ? step(i + 1) : sec.id;
      });
    };
    return step(start).then(function (failed) {
      var fixed = WW.Schema.repairDraft(draft);
      return { level: fixed.level, draft: draft, fixes: fixed.fixes, validation: WW.Schema.validate(fixed.level), reports: reports, failed: failed };
    });
  }

  WW.LevelGen = { SECTIONS: SECTIONS, rules: rules, TASK_RULES: TASK_RULES, userPrompt: userPrompt, generate: generate };
})(window.WW);
