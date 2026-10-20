/*
 * Editor dialog for 通关测试 (js/editor/levelcheck.js): settings, progress with a stop button, then
 * verdict cards (click to jump to the section), per-difficulty overview, play-style ranking with a
 * per-turn replay of any game, and task completion. The last result is kept per level content, so
 * reopening the dialog shows it again (marked stale once the level changes).
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var U = WW.U;
  var C = WW.LevelCheck;

  var last = null; /* { hash, level, res, report } */
  var DIFFS = ['intern', 'regular', 'gold'];
  var ICON = { red: '✗', yellow: '!', info: 'i', green: '✓' };
  var STAT_COLS = [['sentiment', '好感'], ['heat', '热度'], ['credibility', '公信'], ['exposure', '暴露'], ['satisfaction', '满意'], ['budget', '预算']];

  function hashOf(level) { return U.hash(JSON.stringify(level)); }
  function dname(d) { return (WW.Data.difficulties[d] || {}).name || d; }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function pctRow(row) { return row ? pct(row.rate) : '—'; }

  function select(options, value) {
    var s = h('select', { class: 'input' }, Object.keys(options).map(function (k) { return h('option', { value: k }, options[k]); }));
    s.value = value;
    return s;
  }

  /* level: current raw level; jump(path): close and show that editor section */
  function open(level, jump) {
    var lv = WW.Schema.normalize(level);
    var allowed = DIFFS.filter(function (d) { return lv.difficulty.allowed.indexOf(d) >= 0; });
    var checks = {};
    var diffBox = h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } }, allowed.map(function (d) {
      checks[d] = h('input', { type: 'checkbox', checked: true });
      return h('label', { class: 'small' }, checks[d], ' ' + dname(d));
    }));
    var depths = {};
    Object.keys(C.DEPTHS).forEach(function (k) { depths[k] = C.DEPTHS[k].label + '（' + C.DEPTHS[k].policies + ' 种打法）'; });
    var depth = select(depths, WW.Store.get('checkDepth', 'standard'));
    var intent = select(C.INTENTS, WW.Store.get('checkIntent', 'any'));
    var bar = h('div', { class: 'check-bar' }, h('div', { class: 'fill' }));
    var status = h('div', { class: 'small sub' }, '离线模拟，不调用 AI。自动生成一批打法（口径、查证、整改、压制、水军、战术的组合），在各难度下各跑若干局。');
    var out = h('div', { class: 'check-out' });
    var go = h('button', { class: 'btn primary' }, '开始测试');
    var stop = h('button', { class: 'btn', style: { display: 'none' } }, '停止');
    var stopping = false;

    var m = WW.DOM.modal({
      title: '🧪 通关测试', xwide: true, maskClose: false,
      body: h('div', { class: 'col', style: { gap: '10px' } },
        h('div', { class: 'row', style: { gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' } },
          h('div', { class: 'field' }, h('label', null, '难度'), diffBox),
          h('div', { class: 'field' }, h('label', null, '扫描深度'), depth),
          h('div', { class: 'field' }, h('label', null, '设计意图'), intent)),
        status, bar, out),
      footer: [h('button', { class: 'btn', on: { click: function () { stopping = true; m.close(); } } }, '关闭'), stop, go]
    });

    var show = function (res, report, stale) {
      WW.DOM.replace(out, render(level, res, report, stale, function (path) { m.close(); jump(path); }));
    };
    var hash = hashOf(level);
    if (last) {
      show(last.res, C.analyze(last.level, last.res, intent.value), last.hash !== hash);
      status.textContent = '上次的结果（' + last.res.games + ' 局）。' + (last.hash !== hash ? '关卡改过了，结果已过期，请重新测试。' : '');
    }
    intent.addEventListener('change', function () {
      WW.Store.set('checkIntent', intent.value);
      if (last) show(last.res, C.analyze(last.level, last.res, intent.value), last.hash !== hashOf(level));
    });
    depth.addEventListener('change', function () { WW.Store.set('checkDepth', depth.value); });

    go.addEventListener('click', function () {
      var diffs = allowed.filter(function (d) { return checks[d].checked; });
      if (!diffs.length) { WW.DOM.toast('至少选一个难度', 'warn'); return; }
      var snapshot = U.deepClone(level);
      stopping = false;
      go.disabled = true;
      stop.style.display = '';
      out.textContent = '';
      C.run(snapshot, { depth: depth.value, diffs: diffs, shouldStop: function () { return stopping; } }, function (p) {
        bar.firstChild.style.width = Math.min(100, Math.round(p.done / p.total * 100)) + '%';
        var left = p.done ? Math.max(0, Math.round(p.ms / p.done * (p.total - p.done) / 1000)) : 0;
        status.textContent = '已跑 ' + p.done + ' / 约 ' + p.total + ' 局 · ' + (p.ms / 1000).toFixed(1) + ' 秒' + (p.done < p.total ? ' · 预计还要 ' + left + ' 秒' : '');
      }).then(function (res) {
        go.disabled = false;
        go.textContent = '重新测试';
        stop.style.display = 'none';
        if (!res.games) { status.textContent = '已停止。'; return; }
        last = { hash: hashOf(snapshot), level: snapshot, res: res };
        status.textContent = (res.stopped ? '已停止，下面是已跑完的 ' : '完成：') + res.games + ' 局，' + (res.ms / 1000).toFixed(1) + ' 秒。';
        show(res, C.analyze(snapshot, res, intent.value), false);
      }, function (e) {
        go.disabled = false;
        stop.style.display = 'none';
        status.textContent = '测试出错：' + e.message;
      });
    });
    stop.addEventListener('click', function () { stopping = true; stop.disabled = true; setTimeout(function () { stop.disabled = false; }, 500); });
  }

  /* ------------------------------------------------------------------ result view */

  function render(level, res, a, stale, jump) {
    var main = a.main;
    return [
      stale ? h('div', { class: 'vmsg warn' }, '⚠ 关卡在测试之后改过，下面的结果可能已经不准。') : null,
      h('div', { class: 'section-title' }, '结论'),
      h('div', { class: 'check-cards' }, a.verdicts.map(function (v) {
        return h('div', { class: 'check-card ' + v.level + (v.path ? ' link' : ''), title: v.path ? '点击跳到：' + v.path : '', on: { click: function () { if (v.path) jump(v.path); } } },
          h('div', { class: 't' }, ICON[v.level] + ' ' + v.title), v.detail ? h('div', { class: 'd' }, v.detail) : null);
      })),
      h('div', { class: 'section-title' }, '各难度概览'),
      h('table', { class: 'data-table' },
        h('thead', null, h('tr', null, ['难度', '最佳胜率', '最佳打法', '凭可见信息', '认错路线', '掩盖路线', '打法胜率中位数', '获胜平均回合'].map(function (x) { return h('th', null, x); }))),
        h('tbody', null, res.diffs.map(function (d) {
          var b = a.byDiff[d];
          return h('tr', null, h('td', null, dname(d)), h('td', null, pctRow(b.best)), h('td', { class: 'check-label' }, b.best ? b.best.entry.label : '—'),
            h('td', null, pctRow(b.bestBlind)), h('td', null, pctRow(b.admitBest)), h('td', null, pctRow(b.coverBest)), h('td', null, pct(b.median)),
            h('td', null, b.winTurns ? b.winTurns.toFixed(1) : '—'));
        }))),
      ranking(level, res, main),
      h('div', { class: 'section-title' }, '任务完成情况（完成 / 出现 / 总局数）'),
      h('table', { class: 'data-table' },
        h('thead', null, h('tr', null, [h('th', null, '任务')].concat(res.diffs.map(function (d) { return h('th', null, dname(d)); })))),
        h('tbody', null, a.tasks.map(function (t) {
          return h('tr', { class: 'link', on: { click: function () { jump(t.path); } } },
            h('td', null, (t.side ? '支线 · ' : t.required ? '必做 · ' : '可选 · ') + (t.stageTitle ? t.stageTitle + ' · ' : '') + t.title),
            res.diffs.map(function (d) {
              var x = t.byDiff[d];
              var bad = x.reached && !x.done;
              return h('td', { class: bad ? 'bad' : '' }, x.games ? x.done + ' / ' + x.reached + ' / ' + x.games : '—');
            }));
        })))
    ];
  }

  function ranking(level, res, main) {
    var sortBy = main;
    var showAll = false;
    var wrap = h('div');
    var traceBox = h('div');
    var draw = function () {
      var rows = res.entries.filter(function (e) { return e.games[sortBy] && e.games[sortBy].length; })
        .sort(function (x, y) { return C.rate(y.games[sortBy]) - C.rate(x.games[sortBy]) || avg(y.games[sortBy]) - avg(x.games[sortBy]); });
      var shown = showAll ? rows : rows.slice(0, 15);
      WW.DOM.replace(wrap,
        h('div', { class: 'section-title' }, '打法排行（点难度列排序，点一行看对局）'),
        h('table', { class: 'data-table' },
          h('thead', null, h('tr', null, [h('th', null, '打法')].concat(res.diffs.map(function (d) {
            return h('th', { class: 'link' + (d === sortBy ? ' on' : ''), on: { click: function () { sortBy = d; draw(); } } }, dname(d) + (d === sortBy ? ' ▼' : ''));
          }), [h('th', null, '平均分'), h('th', null, '主要结局')]))),
          h('tbody', null, shown.map(function (e) {
            return h('tr', { class: 'link', on: { click: function () { games(e); } } },
              h('td', { class: 'check-label' }, (e.kind === 'base' ? '★ ' : '') + e.label),
              res.diffs.map(function (d) { var g = e.games[d] || []; return h('td', null, g.length ? pct(C.rate(g)) + ' (' + g.length + ')' : '—'); }),
              h('td', null, String(Math.round(avg(e.games[sortBy])))),
              h('td', null, topEnd(e.games[sortBy])));
          }))),
        rows.length > shown.length ? h('button', { class: 'btn small ghost', on: { click: function () { showAll = true; draw(); } } }, '显示全部 ' + rows.length + ' 种') : null,
        traceBox);
    };
    var games = function (e) {
      WW.DOM.replace(traceBox,
        h('div', { class: 'section-title' }, '「' + e.label + '」的对局'),
        h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, res.diffs.map(function (d) {
          return (e.games[d] || []).map(function (x) {
            return h('button', { class: 'btn small' + (x.win ? '' : ' ghost'), on: { click: function () { trace(e, d, x.seed); } } },
              (x.win ? '✓ ' : '✗ ') + dname(d) + ' #' + x.seed);
          });
        })),
        h('div', { class: 'check-trace' }));
      traceBox.scrollIntoView({ block: 'nearest' });
    };
    var trace = function (e, d, seed) {
      var box = traceBox.querySelector('.check-trace');
      box.textContent = '回放中……';
      C.trace(level, res, e.id, d, seed).then(function (t) {
        var byTurn = {};
        t.log.forEach(function (l) { (byTurn[l.turn] = byTurn[l.turn] || []).push(l); });
        WW.DOM.replace(box,
          h('div', { class: 'small' }, dname(d) + ' #' + seed + '：' + (t.result === 'win' ? '✓ ' : '✗ ') + t.endTitle + (t.final ? '，' + t.final.score + ' 分（' + t.final.grade + '）' : '')),
          h('table', { class: 'data-table' },
            h('thead', null, h('tr', null, [h('th', null, '回合')].concat(STAT_COLS.map(function (c) { return h('th', null, c[1]); }), [h('th', null, '这回合发生的事')]))),
            h('tbody', null, t.history.map(function (p) {
              return h('tr', null, h('td', null, String(p.turn)), STAT_COLS.map(function (c) { return h('td', null, String(Math.round(p[c[0]]))); }),
                h('td', { class: 'check-log' }, (byTurn[p.turn] || []).filter(function (l) { return l.kind !== 'info'; }).map(function (l) { return h('div', { class: 'k-' + l.kind }, l.text); })));
            }))));
      });
    };
    draw();
    return wrap;
  }

  function avg(games) { return games && games.length ? U.sum(games, function (x) { return x.score; }) / games.length : 0; }

  function topEnd(games) {
    var c = {};
    (games || []).forEach(function (x) { c[x.end] = (c[x.end] || 0) + 1; });
    var k = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
    return k ? k + ' ×' + c[k] : '—';
  }

  WW.LevelCheckUI = { open: open };
})(window.WW);
