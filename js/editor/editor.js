/*
 * Level editor app (LevelEditor.html). Edits the raw level JSON through schema-driven forms,
 * validates live with the same WW.Schema the engine uses, and test-plays inside the page.
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var U = WW.U;

  var SECTION_OF = {
    id: 'meta', meta: 'meta', client: 'client', incident: 'truth', facts: 'truth', contract: 'contract', initialStats: 'contract',
    difficulty: 'contract', tuning: 'contract', factions: 'factions', platforms: 'people', personas: 'people', seedPosts: 'seed',
    items: 'items', objectives: 'objectives', opponents: 'opponents', abilities: 'opponents', events: 'events',
    randomEvents: 'events', victory: 'ending', defeat: 'ending', grading: 'ending', guide: 'ai', ai: 'ai', offline: 'ai'
  };

  var E = {
    level: null,
    section: 'meta',
    collapsed: {},
    validation: { errors: [], warnings: [] },
    sideTab: 'check',
    els: {}
  };

  function sectionOfPath(path) {
    var head = String(path || '').split(/[.[]/)[0];
    return SECTION_OF[head] || 'meta';
  }

  function saveDraft() {
    WW.Store.set('editorDraft', E.level);
  }

  var revalidate = U.debounce(function () {
    E.validation = WW.Schema.validate(E.level);
    renderNav();
    renderSide();
    renderTop();
  }, 250);

  function changed() {
    saveDraft();
    revalidate();
  }

  function setLevel(level, note) {
    E.level = U.deepClone(level);
    E.collapsed = {};
    E.section = 'meta';
    E.validation = WW.Schema.validate(E.level);
    saveDraft();
    renderAll();
    if (note) WW.DOM.toast(note, 'good');
  }

  /* ------------------------------------------------------------------ render */

  function renderTop() {
    var lv = E.level;
    var errs = E.validation.errors.length;
    var warns = E.validation.warnings.length;
    WW.DOM.replace(E.els.top,
      h('h1', null, '📝 关卡编辑器'),
      h('span', { class: 'lvl' }, ((lv.meta && lv.meta.cover) || '📰') + ' ' + ((lv.meta && lv.meta.title) || '未命名') + '（' + (lv.id || '无 ID') + '）'),
      h('span', { class: 'chip' + (errs ? '' : '') }, errs ? '❌ ' + errs + ' 个错误' : '✅ 校验通过', warns ? ' · ' + warns + ' 条提醒' : ''),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn small', on: { click: openNew } }, '新建 / 打开'),
      h('button', { class: 'btn small', on: { click: importFile } }, '导入'),
      h('button', { class: 'btn small', on: { click: saveToBrowser } }, '保存到浏览器'),
      h('button', { class: 'btn small', on: { click: exportJSON } }, '导出 JSON'),
      h('button', { class: 'btn small', on: { click: exportJS } }, '导出 JS'),
      h('button', { class: 'btn small accent', on: { click: function () { WW.EditorAI.openGenerate(setLevel); } } }, '✨ AI 生成关卡'),
      h('button', { class: 'btn small primary', on: { click: testPlay } }, '▶ 试玩'),
      h('button', { class: 'btn small', on: { click: testCheck } }, '🧪 通关测试'),
      h('button', { class: 'btn small ghost', on: { click: openInGame } }, '在游戏中打开'),
      h('button', { class: 'btn small ghost', on: { click: function () { WW.SettingsUI.open(); } } }, 'AI 设置'),
      h('button', { class: 'btn small ghost', on: { click: function () { E.els.root.classList.toggle('show-side'); } } }, '校验/JSON'),
      h('a', { class: 'btn small ghost', href: 'Start.html' }, '返回游戏'));
  }

  function renderNav() {
    var counts = {};
    E.validation.errors.forEach(function (e) { var s = sectionOfPath(e.path); counts[s] = (counts[s] || 0) + 1; });
    WW.DOM.replace(E.els.nav, WW.EditorFields.sections.map(function (s) {
      return h('button', { class: s.id === E.section ? 'on' : '', on: { click: function () { E.section = s.id; renderNav(); renderForm(); } } },
        h('span', null, s.icon), s.title, counts[s.id] ? h('span', { class: 'err-badge' }, String(counts[s.id])) : null);
    }));
  }

  function renderForm() {
    var s = WW.EditorFields.sections.filter(function (x) { return x.id === E.section; })[0];
    var norm;
    try { norm = WW.Schema.normalize(E.level); } catch (e) { norm = WW.Schema.normalize({}); }
    var ctx = {
      obj: E.level, root: E.level, norm: norm, collapsed: E.collapsed,
      onChange: function () {
        try { ctx.norm = WW.Schema.normalize(E.level); } catch (e) { /* keep last */ }
        changed();
      },
      rerender: function () { var top = E.els.form.scrollTop; renderForm(); E.els.form.scrollTop = top; }
    };
    var aiFill = WW.EditorAI.fillFor(s.id);
    WW.DOM.replace(E.els.form,
      h('div', { class: 'row' }, h('h2', null, s.icon + ' ' + s.title), h('div', { class: 'spacer' }),
        aiFill ? h('button', { class: 'btn small accent', on: { click: function () { aiFill.run(E.level, function () { changed(); renderForm(); }); } } }, '✨ ' + aiFill.label) : null),
      h('div', { class: 'sec-desc' }, s.desc),
      WW.Forms.render(s.fields, ctx));
  }

  function renderSide() {
    var tabs = h('div', { class: 'ed-side-tabs' },
      h('button', { class: 'btn small' + (E.sideTab === 'check' ? ' accent' : ''), on: { click: function () { E.sideTab = 'check'; renderSide(); } } }, '校验结果'),
      h('button', { class: 'btn small' + (E.sideTab === 'json' ? ' accent' : ''), on: { click: function () { E.sideTab = 'json'; renderSide(); } } }, 'JSON'));
    var body = h('div', { class: 'ed-side-body' });
    if (E.sideTab === 'check') {
      var v = E.validation;
      if (!v.errors.length && !v.warnings.length) body.appendChild(h('div', { class: 'empty' }, '✅ 没有错误，可以试玩了。'));
      v.errors.forEach(function (e) { body.appendChild(msg(e, 'err')); });
      v.warnings.forEach(function (e) { body.appendChild(msg(e, 'warn')); });
      body.appendChild(h('div', { class: 'small muted', style: { marginTop: '10px' } }, '提示：所有省略的字段都会由引擎默认值补齐，见 docs/LevelFormat.md。'));
    } else {
      var ta = h('textarea', { class: 'ed-json', spellcheck: 'false' });
      ta.value = JSON.stringify(E.level, null, 2);
      body.appendChild(ta);
      body.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn small accent', on: { click: function () {
          try {
            var data = JSON.parse(ta.value);
            setLevel(data, '已应用 JSON');
            E.sideTab = 'json';
            renderSide();
          } catch (e) { WW.DOM.toast('JSON 格式错误：' + e.message, 'bad'); }
        } } }, '应用 JSON'),
        h('button', { class: 'btn small', on: { click: function () { ta.value = JSON.stringify(E.level, null, 2); } } }, '还原')));
    }
    WW.DOM.replace(E.els.side, tabs, body);
  }

  function msg(e, kind) {
    return h('div', { class: 'vmsg ' + kind, on: { click: function () { E.section = sectionOfPath(e.path); renderNav(); renderForm(); } } },
      h('div', null, (kind === 'err' ? '❌ ' : '⚠ ') + e.msg), h('div', { class: 'p' }, e.path));
  }

  function renderAll() {
    renderTop();
    renderNav();
    renderForm();
    renderSide();
  }

  /* ------------------------------------------------------------------ actions */

  function openNew() {
    var builtins = WW.Levels.list().filter(function (e) { return e.source === 'builtin'; });
    var customs = WW.Levels.list().filter(function (e) { return e.source === 'custom'; });
    var m;
    var pick = function (level, note) { m.close(); setLevel(level, note); };
    m = WW.DOM.modal({
      title: '新建 / 打开关卡', wide: true,
      body: h('div', { class: 'col', style: { gap: '14px' } },
        h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', on: { click: function () { pick(WW.Schema.blank(), '已新建空白关卡'); } } }, '新建空白关卡')),
        h('div', { class: 'label' }, '以内置关卡为模板（复制一份，不会改动原关卡）'),
        h('div', { class: 'row wrap' }, builtins.map(function (e) {
          return h('button', { class: 'btn', on: { click: function () {
            var copy = U.deepClone(e.level);
            copy.id = e.id + '_mod';
            copy.meta = copy.meta || {};
            copy.meta.title = (copy.meta.title || '') + '（改）';
            pick(copy, '已复制「' + e.level.meta.title + '」作为模板');
          } } }, (e.level.meta.cover || '') + ' ' + e.level.meta.title);
        })),
        h('div', { class: 'label' }, '浏览器中保存的自定义关卡'),
        customs.length ? h('div', { class: 'col' }, customs.map(function (e) {
          return h('div', { class: 'row' },
            h('button', { class: 'btn grow', style: { justifyContent: 'flex-start' }, on: { click: function () { pick(e.level, '已打开「' + ((e.level.meta && e.level.meta.title) || e.id) + '」'); } } }, ((e.level.meta && e.level.meta.cover) || '📰') + ' ' + ((e.level.meta && e.level.meta.title) || e.id)),
            h('button', { class: 'btn small danger', on: { click: function () {
              WW.DOM.confirm('从浏览器中删除「' + ((e.level.meta && e.level.meta.title) || e.id) + '」？此操作不可撤销。', { ok: '删除', danger: true }).then(function (ok) {
                if (ok) { WW.Store.deleteCustomLevel(e.id); m.close(); openNew(); }
              });
            } } }, '删除'));
        })) : h('div', { class: 'small muted' }, '还没有。编辑完点「保存到浏览器」，游戏的选关界面就能看到。')),
      footer: false
    });
  }

  function importFile() {
    WW.DOM.pickFile('.json,.js').then(function (f) {
      if (!f) return;
      try {
        var parsed = WW.Levels.parseImport(f.text);
        setLevel(parsed.level, '已导入 ' + f.name + (parsed.validation.errors.length ? '（有 ' + parsed.validation.errors.length + ' 个错误待修复）' : ''));
      } catch (e) {
        WW.DOM.toast('无法解析：' + e.message, 'bad');
      }
    });
  }

  function ensureId() {
    E.level.id = WW.Schema.slug(E.level.id || (E.level.meta && E.level.meta.title)) || ('custom_' + Date.now().toString(36));
    return E.level.id;
  }

  function saveToBrowser() {
    ensureId();
    if (WW.Levels.isBuiltin(E.level.id)) {
      WW.DOM.toast('ID「' + E.level.id + '」和内置关卡重名，请先改 ID（基本信息里）', 'warn');
      return false;
    }
    WW.Store.saveCustomLevel(U.deepClone(E.level));
    saveDraft();
    renderTop();
    WW.DOM.toast('已保存到浏览器：游戏的选关界面会显示「' + ((E.level.meta && E.level.meta.title) || E.level.id) + '」', 'good');
    return true;
  }

  function exportJSON() {
    var id = ensureId();
    WW.DOM.download(id + '.json', JSON.stringify(E.level, null, 2));
  }

  function exportJS() {
    var id = ensureId();
    WW.DOM.download(id + '.js', WW.Levels.toScript(E.level), 'text/javascript');
    WW.DOM.toast('把 ' + id + '.js 放进 levels/ 目录，并把文件名加到 levels/manifest.js，就成了内置关卡。', 'good', 7000);
  }

  /* blocks test play / 通关测试 while the level has errors, and shows them */
  function playable(what) {
    var v = WW.Schema.validate(E.level);
    if (!v.errors.length) return true;
    WW.DOM.toast('还有 ' + v.errors.length + ' 个错误，修复后才能' + what, 'bad');
    E.sideTab = 'check';
    E.els.root.classList.add('show-side');
    renderSide();
    return false;
  }

  function testPlay() {
    if (!playable('试玩')) return;
    var overlay = h('div', { class: 'ed-play' });
    document.body.appendChild(overlay);
    WW.GameUI.mount(overlay, U.deepClone(E.level), {
      testMode: true,
      onExit: function () { overlay.remove(); }
    });
  }

  /* offline sweep of many play styles (js/editor/levelcheck.js); a verdict click jumps to its section */
  function testCheck() {
    if (!playable('做通关测试')) return;
    WW.LevelCheckUI.open(U.deepClone(E.level), function (path) {
      E.section = sectionOfPath(path);
      renderNav();
      renderForm();
    });
  }

  function openInGame() {
    if (!saveToBrowser()) return;
    window.open('Start.html?level=' + encodeURIComponent(E.level.id), '_blank');
  }

  /* ------------------------------------------------------------------ boot */

  function boot() {
    WW.DOM.applyTheme();
    var root = document.getElementById('editor');
    E.els.root = root;
    E.els.top = h('div', { class: 'ed-top' });
    E.els.nav = h('nav', { class: 'ed-nav', 'aria-label': '关卡分区' });
    E.els.form = h('div', { class: 'ed-form' });
    E.els.side = h('aside', { class: 'ed-side' });
    WW.DOM.replace(root, E.els.top, h('div', { class: 'ed-main' }, E.els.nav, E.els.form, E.els.side));
    WW.Levels.loadBuiltins('levels/').then(function () {
      var draft = WW.Store.get('editorDraft', null);
      var start = draft && typeof draft === 'object' ? draft : null;
      if (!start) {
        var tut = WW.Levels.get('tutorial_crayfish');
        start = tut ? U.deepClone(tut) : WW.Schema.blank();
        if (tut) { start.id = 'tutorial_crayfish_mod'; start.meta.title += '（改）'; }
      }
      E.level = start;
      E.validation = WW.Schema.validate(E.level);
      renderAll();
    });
    window.addEventListener('beforeunload', saveDraft);
  }

  WW.Editor = { boot: boot, state: E, setLevel: setLevel };
  document.addEventListener('DOMContentLoaded', boot);
})(window.WW);
