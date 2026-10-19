/*
 * 公文编辑器：红头文件 / 蓝底白字样式，AI 补全（流式）与润色，盖章发布后展示 AI 评审。
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var D = WW.Data;
  var U = WW.U;

  var SCORE_LABELS = [
    ['sincerity', '诚恳', false], ['responsibility', '担当', false], ['empathy', '共情', false], ['clarity', '信息量', false],
    ['blameShift', '甩锅', true], ['arrogance', '傲慢', true], ['evasiveness', '回避', true], ['memeRisk', '玩梗风险', true]
  ];

  /* guide (optional, from the tutorial coach): { hint, sample: { title, text } } */
  function open(ui, preset, guide) {
    var game = ui.game;
    var st = game.state;
    var item = game.items.statement;
    var draftKey = 'draft.' + game.level.id;
    var saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('ww.' + draftKey) || '{}') || {}; } catch (e) { saved = {}; }

    var typeSel = h('select', { class: 'input' }, D.statementTypes.map(function (t) { return h('option', { value: t.id, selected: t.id === (preset && preset.type || saved.type || 'explain') }, t.name); }));
    var typeDesc = h('div', { class: 'tiny muted' });
    var channel = saved.channel || 'weibo';
    var chanSeg = h('div', { class: 'seg' }, Object.keys(D.statementChannels).map(function (id) {
      return h('button', { class: id === channel ? 'on' : '', dataset: { id: id }, on: { click: function (e) {
        channel = id;
        Array.prototype.forEach.call(chanSeg.children, function (b) { b.classList.toggle('on', b.dataset.id === id); });
      } } }, D.statementChannels[id].name);
    }));
    var sincere = h('input', { type: 'range', min: -1, max: 1, step: 0.5, value: saved.sincere !== undefined ? saved.sincere : 0.5 });
    var admit = h('input', { type: 'range', min: -1, max: 1, step: 0.5, value: saved.admit !== undefined ? saved.admit : 0 });
    var titleInput = h('input', { class: 'doc-title', value: saved.title || '', placeholder: '公文标题' });
    var text = h('textarea', { class: 'doc-text', placeholder: '在这里起草公文……不会写？点右侧「AI 补全」。\n\n提示：否认真相会记下“谎言债”；违反客户红线会扣满意度；写得具体、诚恳、有措施的公文效果最好。' }, saved.text || '');
    var seal = h('div', { class: 'doc-seal' }, game.level.client.name, h('br'), '公关专用章');
    var docHead = h('div', { class: 'doc-red' }, game.level.client.name + '文件');
    var doc = h('div', { class: 'red-doc' }, docHead, h('div', { class: 'doc-rule' }), titleInput, text, seal);
    var counter = h('div', { class: 'tiny muted' });
    var aiState = h('div', { class: 'small muted' });
    var styleBlue = false;

    var persist = U.debounce(function () {
      try {
        sessionStorage.setItem('ww.' + draftKey, JSON.stringify({ type: typeSel.value, channel: channel, sincere: sincere.value, admit: admit.value, title: titleInput.value, text: text.value }));
      } catch (e) { /* ignore */ }
    }, 400);

    var syncType = function () {
      var t = D.statementTypeMap[typeSel.value];
      typeDesc.textContent = t.desc;
      if (!titleInput.value || titleInput.dataset.auto === '1') {
        titleInput.value = U.tpl(t.title, { kw: game.level.incident.keywords[0], client: game.level.client.name, contact: game.level.client.contact });
        titleInput.dataset.auto = '1';
      }
    };
    titleInput.addEventListener('input', function () { titleInput.dataset.auto = '0'; persist(); });
    typeSel.addEventListener('change', function () { syncType(); persist(); });
    [sincere, admit].forEach(function (r) { r.addEventListener('input', persist); });
    var updateCount = function () { counter.textContent = text.value.length + ' 字'; persist(); };
    text.addEventListener('input', updateCount);
    syncType();
    updateCount();

    var busy = false;
    var setBusy = function (b, msg) {
      busy = b;
      aiState.textContent = msg || '';
      [completeBtn, polishBtn, publishBtn].forEach(function (x) { x.disabled = b; });
    };

    var completeBtn = h('button', { class: 'btn accent', on: { click: function () {
      if (busy) return;
      var draft = text.value;
      var streamed = '';
      var useAI = WW.AI.enabledFor('statement.complete');
      setBusy(true, useAI ? 'AI 正在起草……' : '离线模板生成中……');
      game.runAI('statement.complete', { type: typeSel.value, channel: channel, title: titleInput.value, draft: draft, tone: { sincere: Number(sincere.value), admit: Number(admit.value) } }, {
        onText: function (d) {
          if (!streamed) text.value = '';
          streamed += d;
          text.value = streamed;
          text.scrollTop = text.scrollHeight;
        }
      }).then(function (res) {
        if (res.data && res.data.text) text.value = res.data.text;
        updateCount();
        setBusy(false, res.source === 'ai' ? 'AI 已补全，可以继续修改。' : (res.error ? 'AI 调用失败，已用离线模板：' + res.error : '已用离线模板补全（配置 AI 后效果更好）。'));
      });
    } } }, '✨ AI 补全');

    var polishBtn = h('button', { class: 'btn', on: { click: function () {
      if (busy || text.value.trim().length < 10) return;
      setBusy(true, '润色中……');
      game.runAI('statement.polish', { text: text.value, type: typeSel.value, tone: { sincere: Number(sincere.value), admit: Number(admit.value) } }).then(function (res) {
        if (res.data && res.data.text) text.value = res.data.text;
        updateCount();
        setBusy(false, res.source === 'ai' ? '润色完成。' : '已用离线规则润色。');
      });
    } } }, 'AI 润色');

    var styleBtn = h('button', { class: 'btn small ghost', on: { click: function () {
      styleBlue = !styleBlue;
      doc.classList.toggle('blue', styleBlue);
      styleBtn.textContent = styleBlue ? '切换为红头文件' : '切换为蓝底白字';
    } } }, '切换为蓝底白字');

    var status = game.itemStatus('statement');
    var publishBtn = h('button', { class: 'btn primary', disabled: !status.usable, on: { click: function () {
      if (busy) return;
      setBusy(true, '盖章发布中，AI 评审打分……');
      ui.act('statement', { type: typeSel.value, channel: channel, title: titleInput.value, text: text.value }, { silent: true }).then(function (r) {
        if (!r.ok) { setBusy(false, ''); WW.DOM.toast(r.reason, 'warn'); return; }
        seal.classList.add('stamped');
        try { sessionStorage.removeItem('ww.' + draftKey); } catch (e) { /* ignore */ }
        setTimeout(function () { showReview(r); }, 450);
      });
    } } }, '🔴 盖章发布');

    var demands = game.level.client.demands;
    var facts = Object.keys(st.facts).map(function (id) { return st.facts[id]; }).filter(function (f) { return f.public || f.revealed; });
    var sampleBtn = h('button', { class: 'btn', title: '用教程准备的示范稿替换当前正文', on: { click: function () {
      if (busy) return;
      if (guide.sample.title) { titleInput.value = guide.sample.title; titleInput.dataset.auto = '0'; }
      text.value = guide.sample.text || '';
      updateCount();
      aiState.textContent = '已填入示范稿，可以照着改，也可以直接发布。';
    } } }, '📋 填入示范稿');

    var side = h('div', { class: 'col', style: { gap: '10px' } },
      WW.ItemUI.guideBanner(guide),
      h('div', { class: 'field' }, h('label', null, '公文类型'), typeSel, typeDesc),
      h('div', { class: 'field' }, h('label', null, '发布渠道'), chanSeg),
      h('div', { class: 'field' }, h('label', null, '语气'),
        h('div', { class: 'tone-row' }, h('span', null, '强硬'), sincere, h('span', { style: { textAlign: 'right' } }, '诚恳')),
        h('div', { class: 'tone-row' }, h('span', null, '甩锅'), admit, h('span', { style: { textAlign: 'right' } }, '认错'))),
      h('div', { class: 'row wrap' }, completeBtn, polishBtn, guide && guide.sample ? sampleBtn : null),
      aiState,
      demands.length ? h('div', { class: 'panel', style: { padding: '8px 10px' } },
        h('div', { class: 'label' }, '⚠ 客户红线'),
        demands.map(function (d) { return h('div', { class: 'small' }, '· ' + d.text); })) : null,
      facts.length ? h('div', { class: 'panel', style: { padding: '8px 10px' } },
        h('div', { class: 'label' }, '舆论关注的指控'),
        facts.map(function (f) {
          var state = f.revealed ? '（已实锤）' : f.refuted ? '（已证伪）' : f.known ? (f.isTrue ? '（你已查明：属实）' : '（你已查明：不实）') : '';
          return h('div', { class: 'small' }, '· ' + f.text + state, f.clientClaim && !f.revealed ? h('div', { class: 'tiny muted' }, '　客户口径：' + f.clientClaim) : null);
        })) : null,
      h('div', { class: 'tiny muted' }, '花费 ' + U.fmtMoney(status.cost) + ' · ' + item.ap + ' 行动点' + (st.counters.statementsTurn ? ' · 本回合已发 ' + st.counters.statementsTurn + ' 篇，效果递减' : '')));

    var body = h('div', { class: 'doc-editor' }, h('div', { class: 'col' }, doc, h('div', { class: 'row' }, counter, h('div', { class: 'spacer' }), styleBtn)), side);

    var m = WW.DOM.modal({
      title: '📜 起草公文', xwide: true, body: body,
      footer: [h('button', { class: 'btn', on: { click: function () { m.close(); } } }, '取消'), publishBtn]
    });

    function showReview(r) {
      var d = r.detail || {};
      var s = d.scores || {};
      var bars = h('div', { class: 'score-bars' }, SCORE_LABELS.map(function (x) {
        var v = Number(s[x[0]]) || 0;
        return [h('span', { class: 'small sub' }, x[1]), h('div', { class: 'score-track' + (x[2] ? ' neg' : '') }, h('i', { style: { width: v * 10 + '%' } })), h('span', { class: 'small num' }, String(v))];
      }));
      var deltas = WW.GameUI.deltaChips(r.deltas || {});
      WW.DOM.replace(side,
        h('div', { class: 'panel-title' }, '📋 评审报告', d.source === 'ai' ? h('span', { class: 'chip' }, 'AI 评审') : h('span', { class: 'chip' }, '离线规则')),
        h('div', { class: 'report-box' }, '“' + (d.verdict || '评审完成') + '”'),
        bars,
        h('div', { class: 'small sub' }, '综合质量 ' + (d.q > 0 ? '+' : '') + d.q + '（-10 ~ 10）'),
        deltas,
        (d.notes || []).length ? h('div', { class: 'col', style: { gap: '4px' } }, d.notes.map(function (n) { return h('div', { class: 'small' }, '· ' + n); })) : null,
        h('div', { class: 'tiny muted' }, '网友的第一反应已经出现在舆论场的官方帖下面。'));
      WW.DOM.replace(m.foot, h('button', { class: 'btn primary', on: { click: function () { m.close(); } } }, '好的'));
    }

    return m;
  }

  WW.StatementUI = { open: open };
})(window.WW);
