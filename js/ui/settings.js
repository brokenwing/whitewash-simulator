/*
 * API settings dialog (shared by the game and the level editor) and the AI call log viewer.
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;

  function field(label, control, help) {
    return h('div', { class: 'field' }, h('label', null, label), control, help ? h('div', { class: 'tiny muted' }, help) : null);
  }

  function open(opts) {
    opts = opts || {};
    var s = WW.LLM.getSettings();
    var key = WW.LLM.getKey();
    var presetSel = h('select', { class: 'input' }, WW.LLM.PRESETS.map(function (p) { return h('option', { value: p.id, selected: p.id === s.provider }, p.name); }));
    var baseInput = h('input', { class: 'input', value: s.baseURL, placeholder: 'https://…' });
    var modelInput = h('input', { class: 'input', value: s.model, list: 'ww-models' });
    var modelList = h('datalist', { id: 'ww-models' });
    var keyInput = h('input', { class: 'input', type: 'password', value: key, placeholder: '粘贴你的 API Key', autocomplete: 'off' });
    var keyMode = h('select', { class: 'input' }, h('option', { value: 'local', selected: s.keyMode !== 'session' }, '保存在本浏览器（localStorage）'), h('option', { value: 'session', selected: s.keyMode === 'session' }, '仅本次会话（关闭标签页即清除）'));
    var aiLevel = h('select', { class: 'input' },
      h('option', { value: 'full', selected: s.aiLevel === 'full' }, '完整：所有内容都由 AI 生成'),
      h('option', { value: 'lite', selected: s.aiLevel === 'lite' }, '精简：只有公文、回合网评、铁拳判定和结案用 AI'),
      h('option', { value: 'off', selected: s.aiLevel === 'off' }, '离线：不调用 AI，用内置规则'));
    var structured = h('input', { type: 'checkbox', checked: s.structured });
    var jsonMode = h('input', { type: 'checkbox', checked: s.jsonMode });
    var fallbacks = h('input', { type: 'checkbox', checked: s.fallbacks });
    var streaming = h('input', { type: 'checkbox', checked: s.streaming });
    var useProxy = h('input', { type: 'checkbox', checked: s.useProxy });
    var proxyURL = h('input', { class: 'input', value: s.proxyURL });
    var timeout = h('input', { class: 'input', type: 'number', min: 10, max: 600, value: s.timeoutSec });
    var temperature = h('input', { class: 'input', type: 'number', min: 0, max: 2, step: 0.1, value: s.temperature });
    var theme = h('select', { class: 'input' },
      h('option', { value: 'dark', selected: WW.Store.get('theme', 'dark') === 'dark' }, '深色作战室'),
      h('option', { value: 'light', selected: WW.Store.get('theme', 'dark') === 'light' }, '浅色'),
      h('option', { value: 'auto', selected: WW.Store.get('theme', 'dark') === 'auto' }, '跟随系统'));
    var status = h('div', { class: 'small muted' }, WW.LLM.isReady() ? '当前配置可用。' : 'AI 未就绪：游戏会使用离线规则，照样可以完整游玩。');
    var keyHint = h('div', { class: 'tiny muted' });

    var anthropicOnly = h('div', { class: 'col' },
      h('label', { class: 'check' }, structured, '结构化输出（output_config.format，Claude 官方支持；中转报错时可关闭）'),
      h('label', { class: 'check' }, fallbacks, '拒答时服务端自动回退（仅官方地址生效）'));
    var openaiOnly = h('div', { class: 'col' },
      h('label', { class: 'check' }, jsonMode, 'JSON 模式（response_format；服务商不支持会自动降级）'),
      field('Temperature', temperature));

    var syncPreset = function (applyDefaults) {
      var p = WW.LLM.preset(presetSel.value) || {};
      WW.DOM.replace(modelList, (p.models || []).map(function (m) { return h('option', { value: m }); }));
      if (applyDefaults) {
        if (p.baseURL !== undefined) baseInput.value = p.baseURL;
        if (p.models && p.models.length) modelInput.value = p.models[0];
      }
      keyHint.textContent = p.keyHint ? 'Key 格式：' + p.keyHint : '';
      var isAnthropic = p.format === 'anthropic';
      anthropicOnly.classList.toggle('hidden', !isAnthropic);
      openaiOnly.classList.toggle('hidden', isAnthropic);
    };
    presetSel.addEventListener('change', function () { syncPreset(true); });
    syncPreset(false);

    var collect = function () {
      var p = WW.LLM.preset(presetSel.value) || {};
      return {
        provider: presetSel.value, format: p.format || 'openai', baseURL: baseInput.value.trim(), model: modelInput.value.trim(),
        keyMode: keyMode.value, aiLevel: aiLevel.value, structured: structured.checked, jsonMode: jsonMode.checked,
        fallbacks: fallbacks.checked, streaming: streaming.checked, useProxy: useProxy.checked, proxyURL: proxyURL.value.trim(),
        timeoutSec: Number(timeout.value) || 120, temperature: Number(temperature.value), sdkURL: s.sdkURL || WW.LLM.SDK_URL
      };
    };

    var testBtn = h('button', { class: 'btn', on: { click: function () {
      WW.LLM.saveSettings(collect(), keyInput.value.trim());
      WW.LLM.resetCompat();
      status.textContent = '正在测试连接…';
      testBtn.disabled = true;
      WW.LLM.test().then(function (r) {
        status.textContent = '✅ 连接成功：' + r.model + '，耗时 ' + r.ms + ' ms（' + r.msg + '）';
      }, function (e) {
        status.textContent = '❌ 连接失败：' + e.message;
      }).then(function () { testBtn.disabled = false; });
    } } }, '测试连接');

    var m = WW.DOM.modal({
      title: 'AI 接口设置',
      wide: true,
      body: h('div', { class: 'col', style: { gap: '12px' } },
        h('div', { class: 'small sub' }, '游戏可以接入 Claude（Anthropic）或任何 OpenAI 兼容接口（DeepSeek、通义、Kimi、智谱、豆包、Ollama…）。不配置也能玩：所有 AI 内容都有离线规则兜底。'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' } },
          field('服务商', presetSel),
          field('模型', h('div', null, modelInput, modelList), 'Claude 默认 claude-opus-5-5；想更快更省可选 claude-haiku-5-5'),
          field('接口地址（Base URL）', baseInput),
          field('API Key', keyInput, null),
          field('Key 保存方式', keyMode, 'Key 只保存在你的浏览器里，只会发给你填写的接口地址。'),
          field('AI 强度', aiLevel)),
        keyHint,
        anthropicOnly,
        openaiOnly,
        h('label', { class: 'check' }, streaming, '公文补全流式输出（逐字显示）'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' } },
          field('超时（秒）', timeout),
          field('界面主题', theme)),
        h('details', null,
          h('summary', { class: 'small' }, '浏览器跨域受限？使用本地代理'),
          h('div', { class: 'col', style: { marginTop: '8px' } },
            h('div', { class: 'small sub' }, '部分服务商不允许网页直接调用接口。可在项目目录运行 python tools/serve.py，然后勾选下面的选项（代理只监听 127.0.0.1）。'),
            h('label', { class: 'check' }, useProxy, '通过本地代理转发请求'),
            field('代理地址', proxyURL))),
        status),
      footer: [
        h('button', { class: 'btn ghost', on: { click: function () { openLog(); } } }, 'AI 调用日志'),
        h('div', { class: 'spacer' }),
        testBtn,
        h('button', { class: 'btn primary', on: { click: function () {
          WW.LLM.saveSettings(collect(), keyInput.value.trim());
          WW.LLM.resetCompat();
          WW.Store.set('theme', theme.value);
          WW.DOM.applyTheme(theme.value);
          m.close(true);
          WW.DOM.toast(WW.LLM.isReady() ? '设置已保存，AI 已就绪' : '设置已保存（当前为离线规则模式）', 'good');
          if (opts.onSave) opts.onSave();
        } } }, '保存')
      ]
    });
    return m;
  }

  function openLog() {
    var list = h('div', { class: 'col' });
    var render = function () {
      var logs = WW.LLM.logs.slice().reverse();
      if (!logs.length) { WW.DOM.replace(list, h('div', { class: 'empty' }, '还没有 AI 调用记录。')); return; }
      WW.DOM.replace(list, logs.map(function (l) {
        return h('details', { class: 'panel' },
          h('summary', { class: 'row' },
            h('span', null, l.ok ? '✅' : '❌'), h('b', null, l.task), h('span', { class: 'muted small' }, l.time + ' · ' + l.model + ' · ' + l.ms + 'ms'),
            l.usage ? h('span', { class: 'muted tiny' }, '输入 ' + (l.usage.input_tokens || l.usage.prompt_tokens || '?') + ' / 输出 ' + (l.usage.output_tokens || l.usage.completion_tokens || '?') + ' tokens') : null),
          l.error ? h('div', { class: 'small', style: { color: 'var(--crit-ink)', margin: '6px 0' } }, l.error) : null,
          h('div', { class: 'label', style: { marginTop: '6px' } }, 'System'), h('pre', { class: 'code' }, l.system),
          h('div', { class: 'label', style: { marginTop: '6px' } }, 'User'), h('pre', { class: 'code' }, l.user),
          h('div', { class: 'label', style: { marginTop: '6px' } }, '返回'), h('pre', { class: 'code' }, l.response || '（无）'));
      }));
    };
    render();
    WW.DOM.modal({ title: 'AI 调用日志（API Key 不会被记录）', xwide: true, body: list, footer: [h('button', { class: 'btn', on: { click: render } }, '刷新')] });
  }

  WW.SettingsUI = { open: open, openLog: openLog };
})(window.WW);
