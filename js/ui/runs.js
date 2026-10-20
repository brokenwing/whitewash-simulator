/*
 * 存档（档案馆）: every run the player started, newest first. Look back at a run's record (read straight
 * from the saved state, no Game needed) or turn it into a story (story.write; needs the level to exist).
 *   WW.RunsUI.open({ onResume(level, data, runId) })
 *   WW.RunsUI.detail(runId)
 *   WW.RunsUI.storyDialog(runId)
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var U = WW.U;
  var D = WW.Data;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function when(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var now = new Date();
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    return (d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '-' : '') + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm;
  }

  function diffName(id) { return (D.difficulties[D.difficultyId(id)] || {}).name || id || ''; }

  function levelOf(m) { return WW.Levels.get(m.levelId); }

  function titleOf(m) {
    var lv = levelOf(m);
    return { title: (lv && lv.meta && lv.meta.title) || m.levelTitle || m.levelId, cover: (lv && lv.meta && lv.meta.cover) || m.cover || '📁' };
  }

  function statusText(m) {
    if (!m.finished) return '进行中 · 第 ' + m.turn + (m.turns ? '/' + m.turns : '') + ' 回合';
    return (m.result === 'win' ? '✅ ' : '❌ ') + (m.grade ? m.grade + ' 级 · ' + m.score + ' 分' : '已结案');
  }

  /* ------------------------------------------------------------------ list */

  function open(opts) {
    opts = opts || {};
    var filter = 'all';
    var listBox = h('div', { class: 'runs-list' });
    var filters = [['all', '全部'], ['open', '进行中'], ['done', '已结案'], ['star', '⭐ 收藏']];
    var bar = h('div', { class: 'row wrap runs-filter' }, filters.map(function (f) {
      return h('button', { class: 'btn small' + (f[0] === filter ? ' accent' : ''), dataset: { f: f[0] }, on: { click: function () {
        filter = f[0];
        Array.prototype.forEach.call(bar.children, function (b) { b.classList.toggle('accent', b.dataset.f === filter); });
        render();
      } } }, f[1]);
    }));
    var m = WW.DOM.modal({
      title: '🗂 存档', wide: true,
      body: [h('div', { class: 'small muted' }, '每次签约开局都会自动存一份档；打完的局保留为战绩（最多 ' + WW.Store.FINISHED_CAP + ' 局，满了或空间不够时自动删除最旧的未收藏战绩）。'), bar, listBox],
      footer: false
    });

    function render() {
      var runs = WW.Store.runs().filter(function (r) {
        return filter === 'all' || (filter === 'open' && !r.finished) || (filter === 'done' && r.finished) || (filter === 'star' && r.starred);
      });
      WW.DOM.replace(listBox, runs.length ? runs.map(row) : h('div', { class: 'empty' }, '没有存档。'));
    }

    function row(r) {
      var t = titleOf(r);
      var lv = levelOf(r);
      return h('div', { class: 'run-row' + (r.finished ? '' : ' open') },
        h('div', { class: 'run-cover' }, t.cover),
        h('div', { class: 'run-main' },
          h('div', { class: 'run-title' }, t.title, lv ? null : h('span', { class: 'chip' }, '关卡已不存在')),
          h('div', { class: 'small sub' }, diffName(r.difficulty) + ' · ' + statusText(r) + ' · ' + when(r.updatedAt) + (r.hasStory ? ' · 📖 已成文' : ''))),
        h('div', { class: 'run-actions' },
          h('button', { class: 'btn small ghost run-star' + (r.starred ? ' on' : ''), title: r.starred ? '取消收藏' : '收藏（不会被自动清理）', 'aria-pressed': r.starred ? 'true' : 'false', on: { click: function () {
            WW.Store.starRun(r.id, !r.starred); render();
          } } }, r.starred ? '⭐' : '☆'),
          !r.finished && lv && opts.onResume ? h('button', { class: 'btn small primary', on: { click: function () {
            var data = WW.Store.loadRunById(r.id);
            if (!data || !data.state) { WW.DOM.toast('存档读取失败', 'bad'); return; }
            m.close();
            opts.onResume(lv, data, r.id);
          } } }, '继续') : null,
          h('button', { class: 'btn small', on: { click: function () { detail(r.id); } } }, '查看记录'),
          h('button', { class: 'btn small', disabled: !lv, title: lv ? '' : '关卡已被删除，无法生成', on: { click: function () { storyDialog(r.id, render); } } }, '✍️ 爽文'),
          h('button', { class: 'btn small ghost', title: '删除', on: { click: function () {
            WW.DOM.confirm('删除「' + t.title + '」这份存档？删除后无法恢复。', { ok: '删除', danger: true }).then(function (ok) {
              if (ok) { WW.Store.deleteRun(r.id); render(); }
            });
          } } }, '删除')));
    }

    render();
    return m;
  }

  /* ------------------------------------------------------------------ record */

  var CHARTS = [['sentiment', '舆论好感', -100, 100, [-100, 0, 100]], ['heat', '事件热度', 0, 100], ['credibility', '公信力', 0, 100], ['exposure', '暴露度', 0, 100], ['satisfaction', '客户满意', 0, 100]];

  function detail(runId) {
    var meta = WW.Store.runMeta(runId);
    var data = WW.Store.loadRunById(runId);
    if (!meta || !data || !data.state) { WW.DOM.toast('存档读取失败', 'bad'); return; }
    var st = data.state;
    var t = titleOf(meta);
    var lvRaw = levelOf(meta);
    var lv = lvRaw ? WW.Schema.normalize(lvRaw) : null;
    var label = function (turn) { return lv ? U.turnLabel(turn, lv.contract.slotsPerDay, lv.contract.turnLabels) : '第 ' + turn + ' 回合'; };
    var icons = WW.GameUI.LINE_ICONS;
    var f = st.final || {};

    var head = h('div', { class: 'result-head' },
      st.finished ? h('div', { class: 'grade ' + f.grade, 'aria-label': '评级 ' + f.grade }, f.grade) : h('div', { class: 'grade' }, '…'),
      h('div', { class: 'col', style: { gap: '4px' } },
        h('h2', { style: { margin: 0 } }, t.cover + ' ' + t.title),
        h('div', { class: 'result-sub' }, st.finished ? (st.result === 'win' ? '✅ ' : '❌ ') + st.endTitle + (st.endText ? '：' + st.endText : '') : '进行中，第 ' + st.turn + ' 回合'),
        h('div', { class: 'result-sub' }, diffName(st.difficulty) + '难度' + (st.finished ? ' · 得分 ' + f.score : '') + ' · 开始于 ' + when(meta.createdAt))));

    var hist = st.history || [];
    var labels = hist.map(function (p) { return String(p.turn); });
    var charts = hist.length > 1 ? h('div', { class: 'small-multiples' }, CHARTS.map(function (c) {
      var vals = hist.map(function (p) { return p[c[0]]; });
      return h('div', { class: 'sm-card' }, h('div', { class: 'sm-t' }, h('span', null, c[1]), h('span', { class: 'num' }, String(Math.round(vals[vals.length - 1])))),
        WW.Charts.lineChart(vals, { min: c[2], max: c[3], ticks: c[4], label: c[1], labels: labels }));
    })) : null;

    /* timeline: the log grouped by turn, with each turn's summary / headlines from the chronicle */
    var byTurn = {};
    (st.log || []).forEach(function (l) { (byTurn[l.turn] = byTurn[l.turn] || []).push(l); });
    var chron = st.chronicle || [];
    chron.forEach(function (c) { byTurn[c.turn] = byTurn[c.turn] || []; });
    var turns = Object.keys(byTurn).map(Number).sort(function (a, b) { return a - b; });
    var timeline = h('div', { class: 'run-timeline' }, turns.map(function (turn) {
      var c = chron.filter(function (x) { return x.turn === turn; })[0];
      return h('div', { class: 'run-turn' },
        h('div', { class: 'run-turn-h' }, label(turn)),
        h('div', { class: 'turn-lines' }, byTurn[turn].map(function (l) {
          return h('div', { class: 'turn-line' }, h('span', { class: 'ic' }, icons[l.kind] || (l.kind === 'action' ? '🧰' : l.kind === 'truth' ? '💣' : l.kind === 'end' ? '🏁' : '•')),
            h('span', null, l.text, l.extra && l.extra.deltas ? h('span', { class: 'muted small' }, ' ' + Object.keys(l.extra.deltas).map(function (k) { return (WW.GameUI.STAT_LABELS[k] || k) + (l.extra.deltas[k] > 0 ? '+' : '') + l.extra.deltas[k]; }).join(' ')) : null));
        })),
        c && c.summary ? h('div', { class: 'small sub run-summary' }, '📋 ' + c.summary) : null,
        c && c.headlines && c.headlines.length ? h('div', { class: 'small muted' }, '🔥 ' + c.headlines.join(' / ')) : null,
        c && c.deltas ? WW.GameUI.deltaChips(c.deltas) : null);
    }));

    var stmts = (st.statements || []).map(function (x) {
      return h('details', { class: 'run-doc' }, h('summary', null, label(x.turn) + ' ·《' + x.title + '》' + x.type + (x.verdict ? ' — ' + x.verdict : '')), h('div', { class: 'report-box' }, x.text));
    });
    var client = (st.messages || []).filter(function (m) { return m.from === 'client'; }).map(function (m) {
      return h('div', { class: 'turn-line' }, h('span', { class: 'ic' }, '💬'), h('span', null, h('span', { class: 'muted small' }, label(m.turn) + ' '), m.text));
    });
    var ending = data.ending;
    var storyBox = data.story ? h('details', { class: 'run-doc' }, h('summary', null, '📖 爽文（' + (data.story.length === 'long' ? '长篇' : '短篇') + '，' + when(data.story.at) + '）'), h('pre', { class: 'story-text' }, data.story.text)) : null;
    var sec = function (title, content) { return content && (!Array.isArray(content) || content.length) ? [h('div', { class: 'section-title' }, title), content] : null; };

    var m = WW.DOM.modal({
      title: '对局记录', xwide: true,
      body: h('div', { class: 'run-detail' },
        head,
        sec('舆情走势', charts),
        ending ? sec('结案报告', [h('div', { class: 'report-box' }, ending.report || ''), ending.epilogue ? h('div', { class: 'report-box', style: { fontStyle: 'italic', marginTop: '8px' } }, ending.epilogue) : null]) : null,
        sec('经过', turns.length ? timeline : h('div', { class: 'empty' }, '还没有记录')),
        sec('发布的公文', stmts.length ? stmts : (st.lastStatement ? [h('div', { class: 'small muted' }, '（旧存档只保留了最后一份公文的摘录）'), h('div', { class: 'report-box' }, '《' + st.lastStatement.title + '》' + st.lastStatement.excerpt)] : null)),
        sec('客户来信', client.length ? h('div', { class: 'turn-lines' }, client) : null),
        sec('爽文', storyBox)),
      footer: [
        h('button', { class: 'btn', on: { click: function () { m.close(); } } }, '关闭'),
        h('button', { class: 'btn accent', disabled: !lvRaw, on: { click: function () { m.close(); storyDialog(runId); } } }, '✍️ 写成爽文')
      ]
    });
    return m;
  }

  /* ------------------------------------------------------------------ story */

  function copyText(text) {
    var done = function () { WW.DOM.toast('已复制到剪贴板', 'good'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    }
    fallback();
    function fallback() {
      var ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { WW.DOM.toast('复制失败，请手动选择文本复制', 'warn'); }
      ta.remove();
    }
  }

  function storyDialog(runId, onChange) {
    var meta = WW.Store.runMeta(runId);
    var data = WW.Store.loadRunById(runId);
    if (!meta || !data || !data.state) { WW.DOM.toast('存档读取失败', 'bad'); return; }
    var lvRaw = levelOf(meta);
    if (!lvRaw) { WW.DOM.toast('这局对应的关卡已被删除，无法生成爽文', 'warn'); return; }
    var game;
    try {
      game = WW.Engine.restore(lvRaw, U.deepClone(data));
    } catch (e) {
      WW.DOM.toast('存档损坏：' + e.message, 'bad');
      return;
    }
    var story = data.story || null;
    var length = story ? story.length : 'short';
    var busy = false;
    var lens = h('div', { class: 'row', role: 'radiogroup', 'aria-label': '篇幅' }, [['short', '短篇 · 约 1500 字'], ['long', '长篇 · 约 4000 字']].map(function (o) {
      return h('button', { class: 'btn small' + (o[0] === length ? ' accent' : ''), role: 'radio', 'aria-checked': o[0] === length ? 'true' : 'false', dataset: { l: o[0] }, on: { click: function () {
        length = o[0];
        Array.prototype.forEach.call(lens.children, function (b) { var on = b.dataset.l === length; b.classList.toggle('accent', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      } } }, o[1]);
    }));
    var hero = h('input', { class: 'input', value: (story && story.hero) || '老K', maxlength: 12, style: { width: '140px' }, 'aria-label': '主角名' });
    var out = h('pre', { class: 'story-text' }, story ? story.text : '');
    var status = h('div', { class: 'small muted' }, story ? '已生成于 ' + when(story.at) + (story.source === 'offline' ? '（离线模板）' : '') : (WW.AI.enabledFor('story.write') ? '将由 AI 撰写，长篇可能需要一两分钟。' : '当前为离线模式，会用模板生成简版；在「AI 设置」里配置接口后可由 AI 撰写。'));
    var genBtn = h('button', { class: 'btn primary', on: { click: generate } }, story ? '重新生成' : '生成');
    /* what leaves the game carries the disclaimer (WW.Data.notice.story) */
    var exported = function () { return WW.Data.notice.story + '\n\n' + out.textContent; };
    var copyBtn = h('button', { class: 'btn', disabled: !story, on: { click: function () { copyText(exported()); } } }, '复制');
    var dlBtn = h('button', { class: 'btn', disabled: !story, on: { click: function () {
      var t = titleOf(meta).title;
      WW.DOM.download(('爽文-' + t + '-' + new Date(meta.createdAt || Date.now()).toISOString().slice(0, 10)).replace(/[\\/:*?"<>|\s]+/g, '_') + '.md', exported(), 'text/markdown;charset=utf-8');
    } } }, '下载 .md');

    var m = WW.DOM.modal({
      title: '✍️ 写成爽文 · ' + titleOf(meta).title, wide: true,
      body: h('div', { class: 'col story-dialog', style: { gap: '10px' } },
        h('div', { class: 'row wrap', style: { gap: '12px', alignItems: 'center' } }, lens, h('label', { class: 'row', style: { gap: '6px', alignItems: 'center' } }, '主角', hero)),
        status, out,
        h('div', { class: 'small muted' }, WW.Data.notice.ai + '复制和下载的文本开头会附上这段说明。')),
      footer: [copyBtn, dlBtn, genBtn],
      onClose: function () { if (busy) WW.DOM.toast('生成仍在后台进行，完成后会自动存进档案', 'warn'); }
    });

    function generate() {
      if (busy) return;
      busy = true;
      genBtn.disabled = copyBtn.disabled = dlBtn.disabled = true;
      out.textContent = '';
      WW.DOM.replace(status, h('span', { class: 'spinner' }), ' 正在撰写……');
      var args = { length: length, hero: hero.value.trim() || '老K', ending: data.ending || null, maxTokens: length === 'long' ? 14000 : 6000 };
      WW.AI.run(game, 'story.write', args, { onText: function (delta) { out.textContent += delta; out.scrollTop = out.scrollHeight; } }).then(function (res) {
        var text = String((res.data && res.data.text) || '').trim();
        out.textContent = text;
        busy = false;
        genBtn.disabled = copyBtn.disabled = dlBtn.disabled = false;
        genBtn.textContent = '重新生成';
        if (!text) { WW.DOM.replace(status, '生成失败：没有拿到正文。'); return; }
        var s = { length: length, hero: args.hero, text: text, source: res.source, at: Date.now() };
        var r = WW.Store.patchRun(runId, { story: s });
        WW.DOM.replace(status, (res.source === 'offline' ? (res.error ? 'AI 调用失败，已改用离线模板：' + res.error : '离线模板生成') : 'AI 撰写完成') + (r.ok ? '，已存进档案。' : '，但存档空间不足，未能保存（可先下载）。'));
        if (onChange) onChange();
      });
    }
    return m;
  }

  WW.RunsUI = { open: open, detail: detail, storyDialog: storyDialog, when: when };
})(window.WW);
