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

  var RULES = [
    '你是讽刺类网络舆情模拟游戏《公关洗地模拟器》的关卡设计师。所有人物、品牌、机构必须虚构，不涉及现实政治。',
    '只输出一个 JSON 对象，不要解释，不要代码块。',
    '条件格式：{"var":"stats.heat","op":"<=","value":60}，组合用 {"all":[...]} 或 {"any":[...]}；可用变量：stats.sentiment/heat/credibility/exposure/satisfaction、turn、budget、fact.<id>.revealed|refuted、faction.<id>、opp.<id>.morale、itemUses.<道具id>、flags.<名>。',
    '效果格式：{"type":"stat","stat":"heat","delta":5}、{"type":"budget","delta":20}、{"type":"unlock","tier":2}、{"type":"posts","count":2,"stance":-2,"hint":"…"}、{"type":"reveal","fact":"f1"}、{"type":"message","from":"client","text":"…"}、{"type":"headline","text":"…","heat":80}、{"type":"opponent","opp":"<id>","morale":-20}、{"type":"score","delta":5}。',
    '道具 id 可选：statement shill delete control trend_remove throttle distraction kol legal iron_fist expose monitor investigate settle coopt scapegoat endorse rectify。',
    '对手技能可选：mass_report go_abroad black_traffic iron_fist dig_past rumor archive counter_shill。'
  ].join('\n');

  function openGenerate(setLevel) {
    if (needAI()) return;
    var premise = h('textarea', { class: 'input', rows: 3, placeholder: '一句话描述事件，例如：网红火锅店被曝使用回收锅底油，老板坚称是同行陷害' });
    var turns = h('input', { class: 'input', type: 'number', value: 8, min: 4, max: 12 });
    var budget = h('input', { class: 'input', type: 'number', value: 100 });
    var log = h('pre', { class: 'code', style: { maxHeight: '220px' } }, '');
    var go = h('button', { class: 'btn primary' }, '生成');
    var m = WW.DOM.modal({
      title: '✨ AI 一句话生成关卡', wide: true,
      body: h('div', { class: 'col', style: { gap: '10px' } },
        h('div', { class: 'small sub' }, 'AI 会按照关卡格式写出完整草稿（委托方、事实与真相、阵营、初始帖子、对手、主任务与支线、事件）。生成后会自动校验并载入编辑器，你可以继续修改。参考格式见 docs/LevelFormat.md。'),
        h('div', { class: 'field' }, h('label', null, '事件设定'), premise),
        h('div', { class: 'row' }, h('div', { class: 'field grow' }, h('label', null, '回合数'), turns), h('div', { class: 'field grow' }, h('label', null, '预算（万元）'), budget)),
        log),
      footer: [h('button', { class: 'btn', on: { click: function () { m.close(); } } }, '取消'), go]
    });
    go.addEventListener('click', function () {
      if (!premise.value.trim()) { WW.DOM.toast('先写一句事件设定', 'warn'); return; }
      go.disabled = true;
      log.textContent = '生成中……\n';
      var example = JSON.stringify(WW.Levels.get('tutorial_crayfish') || WW.Schema.blank());
      var streamed = '';
      WW.LLM.chat({
        task: 'level.generate', effort: 'high', maxTokens: 32000, stream: true,
        onText: function (d) { streamed += d; log.textContent = '已生成 ' + streamed.length + ' 字……'; },
        system: RULES,
        user: '参考这个完整关卡的 JSON 结构（只学结构和写法，不要照抄内容）：\n' + example + '\n\n请为下面的事件设计一个新关卡：' + premise.value.trim() +
          '\n要求：contract.turns=' + Number(turns.value) + '，contract.budget=' + Number(budget.value) + '；3~5 条事实（真假混合，至少一条是谣言、一条是可被铁拳的违规把柄，写清客户口径）；6~8 条初始帖子并关联事实；1~3 个对手（带技能）；3 个主任务阶段（逐步解锁道具层级并追加预算）和 2~3 条支线；2~3 个脚本事件；id 用英文小写。'
      }).then(function (res) {
        var data = WW.LLM.extractJSON(res.text);
        var v = WW.Schema.validate(data);
        log.textContent = '生成完成：' + v.errors.length + ' 个错误，' + v.warnings.length + ' 条提醒。' + (v.errors.length ? '\n' + v.errors.slice(0, 8).map(function (e) { return e.path + '：' + e.msg; }).join('\n') : '');
        setLevel(data, '已载入 AI 生成的关卡草稿' + (v.errors.length ? '（请修复 ' + v.errors.length + ' 个错误）' : ''));
        setTimeout(function () { m.close(); }, v.errors.length ? 2500 : 600);
      }, function (e) {
        log.textContent = '生成失败：' + e.message;
        go.disabled = false;
      });
    });
  }

  /* Per-section helpers: append AI-written entries to an existing list. */
  function fillList(key, ask, shapeHint) {
    return function (level, done) {
      if (needAI()) return;
      var norm = WW.Schema.normalize(level);
      WW.DOM.toast('AI 正在补充……', 'good');
      WW.LLM.chat({
        task: 'level.fill', effort: 'medium', maxTokens: 16000, system: RULES,
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
