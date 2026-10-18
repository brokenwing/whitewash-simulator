/*
 * Start.html controller: title screen with the order board (built-in + custom levels),
 * JSON import, settings, help, and routing into GameUI.
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var D = WW.Data;
  var U = WW.U;
  var root = null;

  function bestOf(levelId) {
    var best = null;
    D.difficultyOrder.forEach(function (d) {
      var r = WW.Store.record(levelId, d);
      if (r && (!best || r.score > best.score)) best = { grade: r.grade, score: r.score, diff: d };
    });
    return best;
  }

  function card(entry) {
    var lv = WW.Schema.normalize(entry.level);
    var best = bestOf(lv.id);
    var run = WW.Store.loadRun(lv.id);
    return h('div', { class: 'order-card', tabindex: 0, role: 'button', 'aria-label': lv.meta.title, on: {
      click: function () { play(entry.level); },
      keydown: function (e) { if (e.key === 'Enter') play(entry.level); }
    } },
      best ? h('div', { class: 'stamp' }, best.grade) : null,
      h('div', { class: 'cover' }, lv.meta.cover),
      h('h3', null, lv.meta.title),
      h('div', { class: 'small sub' }, lv.meta.subtitle),
      h('div', { class: 'desc' }, lv.meta.description || lv.incident.summary),
      h('div', { class: 'meta' },
        h('span', { class: 'chip' }, h('span', { class: 'stars' }, WW.GameUI.stars(lv.meta.difficulty))),
        h('span', { class: 'chip' }, lv.contract.turns + ' 回合'),
        h('span', { class: 'chip' }, U.fmtMoney(lv.contract.budget)),
        lv.opponents.length ? h('span', { class: 'chip' }, '对手 ×' + lv.opponents.length) : null,
        entry.source === 'custom' ? h('span', { class: 'chip' }, '自定义') : null,
        run && run.state && !run.state.finished ? h('span', { class: 'chip on' }, '进行中') : null));
  }

  function renderHome() {
    var list = WW.Levels.list();
    var builtin = list.filter(function (e) { return e.source === 'builtin'; });
    var custom = list.filter(function (e) { return e.source === 'custom'; });
    var ready = WW.LLM.isReady();
    var s = WW.LLM.getSettings();
    var view = h('div', { class: 'title-screen' },
      h('div', { class: 'title-card' },
        h('div', { class: 'title-head' },
          h('div', { class: 'title-seal' }, D.pools.firm.slice(0, 2), h('br'), '公关'),
          h('div', null,
            h('h1', null, '公关洗地模拟器'),
            h('div', { class: 'tagline' }, '每一单都是一场舆论战。删帖、控评、水军、召唤铁拳……以及偶尔，说真话。')),
          h('div', { class: 'title-actions' },
            h('button', { class: 'btn', on: { click: function () { WW.GameUI.help(); } } }, '玩法说明'),
            h('button', { class: 'btn', on: { click: importLevel } }, '导入关卡'),
            h('a', { class: 'btn', href: 'LevelEditor.html' }, '关卡编辑器'),
            h('button', { class: 'btn accent', on: { click: function () { WW.SettingsUI.open({ onSave: renderHome }); } } }, 'AI 设置'))),
        h('div', { class: 'small ' + (ready ? 'sub' : 'muted') },
          ready ? '🟢 AI 已就绪：' + (WW.LLM.preset(s.provider) || {}).name + ' · ' + s.model + ' · 强度：' + ({ full: '完整', lite: '精简', off: '离线' })[s.aiLevel]
            : '⚪ 当前为离线规则模式（不调用 AI 也能完整游玩）。在「AI 设置」里填入接口即可启用 AI 生成。'),
        h('div', { class: 'section-title' }, '委托订单'),
        builtin.length ? h('div', { class: 'level-grid' }, builtin.map(card)) : h('div', { class: 'empty' }, '没有找到内置关卡。请确认 levels/ 目录完整。'),
        custom.length ? h('div', { class: 'section-title' }, '自定义关卡（来自编辑器或导入）') : null,
        custom.length ? h('div', { class: 'level-grid' }, custom.map(card)) : null,
        h('div', { class: 'small muted', style: { marginTop: '28px' } }, '本游戏为虚构讽刺作品，人物、品牌、机构均为虚构。')));
    WW.DOM.replace(root, view);
    document.title = '公关洗地模拟器';
  }

  function play(level) {
    var v = WW.Schema.validate(level);
    if (v.errors.length) {
      WW.DOM.toast('关卡有 ' + v.errors.length + ' 处错误，无法开始：\n' + v.errors.slice(0, 3).map(function (e) { return e.path + '：' + e.msg; }).join('\n'), 'bad', 8000);
      return;
    }
    WW.GameUI.mount(root, level, { onExit: renderHome });
  }

  function importLevel() {
    WW.DOM.pickFile('.json,.js').then(function (f) {
      if (!f) return;
      var parsed;
      try { parsed = WW.Levels.parseImport(f.text); } catch (e) {
        WW.DOM.toast('无法解析关卡文件：' + e.message, 'bad');
        return;
      }
      var v = parsed.validation;
      if (v.errors.length) {
        WW.DOM.toast('关卡有 ' + v.errors.length + ' 处错误：\n' + v.errors.slice(0, 4).map(function (e) { return e.path + '：' + e.msg; }).join('\n'), 'bad', 9000);
        return;
      }
      var lv = parsed.level;
      lv.id = WW.Schema.slug(lv.id || (lv.meta && lv.meta.title)) || ('custom_' + Date.now().toString(36));
      if (WW.Levels.isBuiltin(lv.id)) lv.id = lv.id + '_custom';
      WW.Store.saveCustomLevel(lv);
      WW.DOM.toast('已导入「' + ((lv.meta && lv.meta.title) || lv.id) + '」' + (v.warnings.length ? '（' + v.warnings.length + ' 条提醒）' : ''), 'good');
      renderHome();
    });
  }

  function boot() {
    root = document.getElementById('app');
    WW.DOM.applyTheme();
    WW.Levels.loadBuiltins('levels/').then(function () {
      var params = new URLSearchParams(location.search);
      var want = params.get('level');
      if (want && WW.Levels.get(want)) play(WW.Levels.get(want));
      else renderHome();
    });
  }

  WW.App = { boot: boot, renderHome: renderHome, play: play };
  document.addEventListener('DOMContentLoaded', boot);
})(window.WW);
