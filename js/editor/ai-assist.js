/*
 * Editor AI assist: one-line premise -> full level draft, and per-section fills.
 * Output is plain JSON validated with WW.Schema before it is loaded; nothing is executed.
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var U = WW.U;

  function needAI() {
    if (WW.LLM.isReady()) return false;
    WW.DOM.toast('请先在「AI 设置」里配置接口（离线模式下无法生成）', 'warn');
    WW.SettingsUI.open();
    return true;
  }

  /* Section-by-section generation (js/editor/levelgen.js): one row per section with its state; a
     failed section keeps the finished ones and can be retried alone. */
  function openGenerate(setLevel) {
    if (needAI()) return;
    var premise = h('textarea', { class: 'input', rows: 3, placeholder: '一句话描述事件，例如：网红火锅店被曝使用回收锅底油，老板坚称是同行陷害' });
    var turns = h('input', { class: 'input', type: 'number', value: 8, min: 4, max: 12 });
    var budget = h('input', { class: 'input', type: 'number', value: 100 });
    var rows = WW.LevelGen.SECTIONS.map(function (s) { return h('div', { class: 'gen-row' }, '○ ' + s.label); });
    var log = h('div', { class: 'gen-log' }, rows);
    var summary = h('div', { class: 'gen-summary small' });
    var go = h('button', { class: 'btn primary' }, '生成');
    var retry = h('button', { class: 'btn', style: { display: 'none' } }, '重试这一段');
    var cancel = h('button', { class: 'btn', on: { click: function () { m.close(); } } }, '取消');
    var m = WW.DOM.modal({
      title: '✨ AI 一句话生成关卡', wide: true, maskClose: false,
      body: h('div', { class: 'col', style: { gap: '10px' } },
        h('div', { class: 'small sub' }, 'AI 会分 ' + WW.LevelGen.SECTIONS.length + ' 段写出关卡草稿，每段写完都会校验，出错会自动修一次。生成后载入编辑器，你可以继续修改。参考格式见 docs/LevelFormat.md。'),
        h('div', { class: 'field' }, h('label', null, '事件设定'), premise),
        h('div', { class: 'row' }, h('div', { class: 'field grow' }, h('label', null, '回合数'), turns), h('div', { class: 'field grow' }, h('label', null, '预算（万元）'), budget)),
        log, summary),
      footer: [cancel, retry, go]
    });
    var state = { draft: null, failed: null };
    var streamed = 0;

    var showRow = function (r, i) {
      var row = rows[i];
      if (r.running) { streamed = 0; row.className = 'gen-row run'; row.textContent = '⟳ ' + r.label + '……'; return; }
      var tokens = U.sum(r.usage || [], function (u) { return u ? (u.completion_tokens || u.output_tokens || 0) : 0; });
      var meta = ' · ' + Math.round(r.ms / 1000) + ' 秒' + (tokens ? ' · ' + Math.round(tokens) + ' token' : '') + (r.repairs ? ' · 修复 ' + r.repairs + ' 次' : '');
      if (!r.ok) { row.className = 'gen-row bad'; row.textContent = '✗ ' + r.label + meta + '：' + r.error; return; }
      row.className = 'gen-row ' + (r.errors.length ? 'warn' : 'good');
      row.textContent = (r.errors.length ? '⚠ ' : '✓ ') + r.label + meta + (r.errors.length ? '（' + r.errors.length + ' 个问题待手动修复）' : '');
    };

    var run = function (from) {
      if (!premise.value.trim()) { WW.DOM.toast('先写一句事件设定', 'warn'); return; }
      go.disabled = true;
      retry.style.display = 'none';
      summary.textContent = '';
      WW.LevelGen.generate(premise.value.trim(), {
        turns: Number(turns.value), budget: Number(budget.value), draft: from ? state.draft : null, from: from,
        onProgress: showRow,
        onText: function (sec, d) {
          streamed += d.length;
          var i = WW.LevelGen.SECTIONS.indexOf(sec);
          if (i >= 0) rows[i].textContent = '⟳ ' + sec.label + '…… 已写 ' + streamed + ' 字';
        }
      }).then(function (res) {
        state.draft = res.draft;
        state.failed = res.failed;
        go.disabled = false;
        if (res.failed) {
          go.textContent = '重新生成';
          retry.style.display = '';
          summary.textContent = '已完成的段会保留，可以只重试失败的这一段。';
          return;
        }
        var v = res.validation;
        WW.DOM.replace(summary,
          h('div', null, '生成完成：' + v.errors.length + ' 个错误，' + v.warnings.length + ' 条提醒。'),
          res.fixes.length ? h('div', { class: 'sub' }, '自动整理：' + res.fixes.join('；')) : null,
          v.errors.concat(v.warnings).slice(0, 6).map(function (e) { return h('div', { class: 'sub' }, (v.errors.indexOf(e) >= 0 ? '✗ ' : '! ') + e.path + '：' + e.msg); }));
        setLevel(res.level, '已载入 AI 生成的关卡草稿' + (v.errors.length ? '（请修复 ' + v.errors.length + ' 个错误）' : ''));
        go.textContent = '重新生成';
        cancel.textContent = '完成';
      }, function (e) {
        go.disabled = false;
        summary.textContent = '生成失败：' + e.message;
      });
    };
    go.addEventListener('click', function () { run(null); });
    retry.addEventListener('click', function () { run(state.failed); });
  }

  /* Per-section helpers: append AI-written entries to an existing list. */
  function fillList(key, ask, shapeHint) {
    return function (level, done) {
      if (needAI()) return;
      var norm = WW.Schema.normalize(level);
      WW.DOM.toast('AI 正在补充……', 'good');
      WW.LLM.chat({
        task: 'level.fill', effort: 'medium', maxTokens: 16000, system: WW.LevelGen.rules(),
        user: '关卡概要：' + norm.incident.summary + '\n事实：' + JSON.stringify(level.facts || []) + '\n阵营 id：' + norm.factions.map(function (f) { return f.id; }).join(',') +
          '\n网民画像 id：' + norm.personas.map(function (p) { return p.id; }).join(',') + '\n' + ask + '\n输出 JSON：{"items": [' + shapeHint + ', ...]}'
      }).then(function (res) {
        var data = WW.LLM.extractJSON(res.text);
        var items = Array.isArray(data.items) ? data.items : [];
        var list = U.get(level, key);
        if (!Array.isArray(list)) { list = []; U.set(level, key, list); }
        items.forEach(function (it) { list.push(it); });
        WW.DOM.toast('已添加 ' + items.length + ' 条，请检查后保存', 'good');
        done();
      }, function (e) { WW.DOM.toast('AI 补充失败：' + e.message, 'bad'); });
    };
  }

  var FILLS = {
    seed: { label: 'AI 补 4 条初始帖子', run: fillList('seedPosts', '再写 4 条风格各异的初始帖子（不同平台、立场与影响力，部分关联事实 id）。', '{"persona":null,"author":"网名","tier":"normal|kol|bigv|media","faction":"阵营id","platform":"weibo","stance":-2,"fact":"f1或null","likes":1000,"tags":[],"content":"…"}') },
    people: { label: 'AI 补 4 个网民画像', run: fillList('personas', '再设计 4 个常驻网民画像（不同阵营与平台），id 不要与已有重复。', '{"id":"p_x","name":"网名","faction":"阵营id","tier":"normal","platform":"weibo","style":"说话风格"}') },
    events: { label: 'AI 补 2 个脚本事件', run: fillList('events', '再设计 2 个脚本事件（触发条件 + 效果），id 不要与已有重复。', '{"id":"event_x","title":"…","text":"…","trigger":{"var":"turn","op":">=","value":3},"chance":1,"once":true,"effects":[{"type":"stat","stat":"heat","delta":6}]}') }
  };

  WW.EditorAI = {
    openGenerate: openGenerate,
    fillFor: function (sectionId) { return FILLS[sectionId] || null; }
  };
})(window.WW);
