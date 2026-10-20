/*
 * Error log viewer for WW.Log (js/core/log.js): a modal listing errors / warnings with stack and detail,
 * copy / export / clear, plus the 🐞 entry button (badge = unseen errors), Ctrl+Shift+L and a
 * clickable toast when an uncaught error happens.
 */
(function (WW) {
  'use strict';
  var h = WW.DOM.h;

  var LEVEL_ICON = { error: '❌', warn: '⚠️', info: 'ℹ️' };
  var SOURCE_NAME = {
    uncaught: '未捕获异常', promise: '未处理的 Promise', resource: '资源加载', bus: '事件', engine: '引擎', levels: '关卡加载',
    ai: 'AI', levelgen: 'AI 生成关卡', ui: '界面提示', editor: '编辑器', storage: '存储', console: '控制台'
  };
  var opened = null;

  function env() {
    var out = { userAgent: navigator.userAgent, url: location.protocol + '//' + location.host + location.pathname, theme: document.documentElement.getAttribute('data-theme') };
    if (WW.LLM && WW.LLM.getSettings) {
      var s = WW.LLM.getSettings();
      ['provider', 'format', 'baseURL', 'model', 'keyMode', 'aiLevel', 'reasoning', 'streaming', 'useProxy', 'timeoutSec'].forEach(function (k) { out[k] = s[k]; });
      out.aiReady = WW.LLM.isReady();
    }
    return out;
  }

  /* entries were scrubbed on write and env() never reads the key */
  function exportJSONText() { return JSON.stringify(WW.Log.export(env()), null, 2); }

  function copy(text) {
    var fallback = function () {
      var ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      WW.DOM.toast(ok ? '已复制到剪贴板' : '复制失败，请改用「导出 JSON」', ok ? 'good' : 'warn');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { WW.DOM.toast('已复制到剪贴板', 'good'); }, fallback);
    } else fallback();
  }

  function entryView(e) {
    return h('details', { class: 'panel log-entry' + (e.prev ? ' prev' : '') },
      h('summary', { class: 'row' },
        h('span', null, LEVEL_ICON[e.level] || '•'),
        h('b', { class: 'log-src' }, SOURCE_NAME[e.source] || e.source),
        h('span', null, e.msg.split('\n')[0].slice(0, 140)),
        e.count > 1 ? h('span', { class: 'chip' }, '×' + e.count) : null,
        h('span', { class: 'muted tiny' }, e.time + (e.page ? ' · ' + e.page : '') + (e.levelId ? ' · 关卡 ' + e.levelId : '') + (e.prev ? ' · 上次会话' : ''))),
      h('pre', { class: 'code' }, e.msg),
      e.stack ? [h('div', { class: 'label', style: { marginTop: '6px' } }, '堆栈'), h('pre', { class: 'code' }, e.stack)] : null,
      e.detail ? [h('div', { class: 'label', style: { marginTop: '6px' } }, '详情'), h('pre', { class: 'code' }, e.detail)] : null);
  }

  function open() {
    if (opened) { opened.render(); return opened.modal; }
    var filter = 'warn';
    var withPrev = h('input', { type: 'checkbox', checked: true });
    var list = h('div', { class: 'col' });
    var filterBtns = {};
    var render = function () {
      var all = WW.Log.list().filter(function (e) { return withPrev.checked || !e.prev; });
      var shown = all.filter(function (e) { return filter === 'all' || (filter === 'warn' ? e.level !== 'info' : e.level === filter); }).reverse();
      Object.keys(filterBtns).forEach(function (k) { filterBtns[k].classList.toggle('primary', k === filter); });
      WW.DOM.replace(list, shown.length ? shown.map(entryView)
        : h('div', { class: 'empty' }, all.length ? '当前筛选下没有记录。' : '还没有异常记录。出问题时这里会自动记下来。'));
      WW.Log.markSeen();
    };
    var fbtn = function (id, label) {
      filterBtns[id] = h('button', { class: 'btn small', on: { click: function () { filter = id; render(); } } }, label);
      return filterBtns[id];
    };
    withPrev.addEventListener('change', render);
    var body = h('div', { class: 'col' },
      h('div', { class: 'small sub' }, '这里汇总了使用过程中的报错和警告（刷新页面后仍保留最近 100 条，API Key 不会被记录）。反馈问题时请点「导出 JSON」把文件发给开发者；需要看 AI 请求原文时打开「AI 调用日志」。'),
      h('div', { class: 'row' }, fbtn('error', '仅错误'), fbtn('warn', '错误 + 警告'), fbtn('all', '全部（含调试信息）'),
        h('div', { class: 'spacer' }), h('label', { class: 'check' }, withPrev, '包含上次会话')),
      list);
    var m = WW.DOM.modal({
      title: '🐞 异常日志', xwide: true, body: body,
      onClose: function () { opened = null; },
      footer: [
        h('button', { class: 'btn ghost', on: { click: function () { WW.SettingsUI.openLog(); } } }, 'AI 调用日志'),
        h('button', { class: 'btn ghost', on: { click: function () {
          WW.DOM.confirm('清空全部异常日志？', { ok: '清空', danger: true }).then(function (ok) { if (ok) { WW.Log.clear(); render(); } });
        } } }, '清空'),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn', on: { click: render } }, '刷新'),
        h('button', { class: 'btn', on: { click: function () { copy(exportJSONText()); } } }, '复制全部'),
        h('button', { class: 'btn primary', on: { click: function () {
          WW.DOM.download('whitewash-log-' + Date.now() + '.json', exportJSONText());
        } } }, '导出 JSON')
      ]
    });
    opened = { modal: m, render: render };
    render();
    return m;
  }

  /* ---------- entry button: every .log-btn on the page shows the unseen error count ---------- */
  function refreshBadges() {
    var n = WW.Log.unseen();
    var btns = document.querySelectorAll('.log-btn');
    for (var i = 0; i < btns.length; i++) {
      var badge = btns[i].querySelector('.log-count');
      if (n && !badge) btns[i].appendChild(h('span', { class: 'log-count' }, String(n)));
      else if (n) badge.textContent = String(n);
      else if (badge) badge.remove();
      btns[i].title = n ? n + ' 条新的错误，点击查看（Ctrl+Shift+L）' : '异常日志（Ctrl+Shift+L）';
    }
  }

  function button(cls) {
    var b = h('button', { class: 'btn log-btn ' + (cls || ''), on: { click: open } }, '🐞 异常');
    setTimeout(refreshBadges, 0);
    return b;
  }

  var lastToast = 0;
  WW.bus.on('log', function (e) {
    refreshBadges();
    if (opened && e) opened.render();
    if (!e || e.level !== 'error' || opened) return;
    if (e.source !== 'uncaught' && e.source !== 'promise' && e.source !== 'resource' && e.source !== 'bus') return;
    var now = Date.now();
    if (now - lastToast < 10000) return;
    lastToast = now;
    WW.DOM.toast('出现异常：' + e.msg.slice(0, 80) + '\n点此查看详情', 'warn', 7000, open);
  });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) { e.preventDefault(); open(); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refreshBadges);

  WW.LogUI = { open: open, button: button, refresh: refreshBadges };
})(window.WW);
