/*
 * API settings dialog (shared by the game and the level editor) and the AI call log viewer.
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;

  function field(label, control, help) {
    return h('div', { class: 'field' }, h('label', null, label), control, help ? h('div', { class: 'tiny muted' }, help) : null);
  }

  /* Dictionary order mixing Latin and Chinese names: a Chinese name files under its pinyin initial
     (the zh collator alone puts every Han name before every Latin one). */
  var zh = new Intl.Collator('zh-Hans-CN');
  var PINYIN_BOUNDS = '阿八嚓哒妸发旮哈讥讥咔垃痳拏噢妑七呥扨它穵穵穵夕丫帀';
  function initial(name) {
    var c = name.charAt(0);
    if (/[A-Za-z]/.test(c)) return c.toUpperCase();
    for (var i = PINYIN_BOUNDS.length - 1; i >= 0; i--) if (zh.compare(c, PINYIN_BOUNDS[i]) >= 0) return String.fromCharCode(65 + i);
    return c;
  }
  function byName(a, b) { return initial(a.name).localeCompare(initial(b.name)) || zh.compare(a.name, b.name); }

  function open(opts) {
    opts = opts || {};
    var s = WW.LLM.getSettings();
    var key = WW.LLM.getKey();
    var presetSel = h('select', { class: 'input' }, WW.LLM.PRESETS.slice().sort(byName).map(function (p) { return h('option', { value: p.id, selected: p.id === s.provider }, p.name); }));
    var baseInput = h('input', { class: 'input', value: s.baseURL, placeholder: 'https://…' });
    var modelInput = h('input', { class: 'input', value: s.model, placeholder: '填写模型名' });
    var modelPick = h('select', { class: 'input' }); /* preset models + "custom"; modelInput holds the real value */
    var canHost = WW.LLM.serverAvailable();
    var keyInput = h('input', { class: 'input', type: 'password', value: s.keyMode === 'server' ? '' : key, placeholder: '粘贴你的 API Key', autocomplete: 'off' });
    var keyMode = h('select', { class: 'input' },
      h('option', { value: 'server', selected: s.keyMode === 'server', disabled: !canHost }, canHost ? '交给本地服务保管（推荐，浏览器不留明文）' : '交给本地服务保管（需用 start.bat / start.sh 启动）'),
      h('option', { value: 'local', selected: s.keyMode === 'local' }, '保存在本浏览器（localStorage，明文）'),
      h('option', { value: 'session', selected: s.keyMode === 'session' }, '仅本次会话（关闭标签页即清除）'));
    var keyModeHelp = h('div', { class: 'tiny muted' });
    var heldKey = null; /* last /api/key answer for the base URL currently in the form */
    var clearKeyBtn = h('button', { class: 'btn ghost small hidden', type: 'button' }, '清除托管的 Key');
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
    var reasoning = h('select', { class: 'input' }, [['auto', '自动（按任务，写作类不思考）'], ['none', '关闭'], ['low', '低'], ['medium', '中'], ['high', '高']].map(function (o) {
      return h('option', { value: o[0], selected: (s.reasoning || 'auto') === o[0] }, o[1]);
    }));
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
      h('label', { class: 'check' }, jsonMode, 'JSON 模式（response_format：json_schema / json_object；服务商不支持会自动降级）'),
      field('Temperature', temperature),
      field('思考强度', reasoning, '只对支持的预设生效（LM Studio、Gemini）。思考越多越慢，思考 token 也占输出额度。'));

    var syncPreset = function (applyDefaults) {
      var p = WW.LLM.preset(presetSel.value) || {};
      if (applyDefaults) {
        if (p.baseURL !== undefined) baseInput.value = p.baseURL;
        if (p.models) modelInput.value = p.models[0] || '';
      }
      var models = p.models || [];
      var cur = modelInput.value.trim();
      WW.DOM.replace(modelPick, models.map(function (m) { return h('option', { value: m, selected: m === cur }, m); })
        .concat([h('option', { value: '', selected: models.indexOf(cur) < 0 }, '自定义…')]));
      modelPick.classList.toggle('hidden', !models.length);
      modelInput.classList.toggle('hidden', models.indexOf(cur) >= 0);
      keyHint.textContent = p.keyHint ? 'Key 格式：' + p.keyHint : '';
      var isAnthropic = p.format === 'anthropic';
      anthropicOnly.classList.toggle('hidden', !isAnthropic);
      openaiOnly.classList.toggle('hidden', isAnthropic);
    };
    var BACKENDS = { dpapi: 'Windows DPAPI 加密', 'secret-tool': '系统钥匙串', file: '仅本人可读的文件（0600）', env: '环境变量 WW_API_KEY' };
    var syncKeyMode = function () {
      var hosted = keyMode.value === 'server';
      clearKeyBtn.classList.toggle('hidden', !(hosted && heldKey && heldKey.stored && heldKey.backend !== 'env'));
      if (!hosted) {
        keyInput.placeholder = '粘贴你的 API Key';
        keyModeHelp.textContent = canHost
          ? 'Key 以明文保存在本浏览器，页面上的任何脚本都能读到。建议改用“交给本地服务保管”。'
          : 'Key 只保存在你的浏览器里，只会发给你填写的接口地址。用 start.bat / start.sh 启动游戏后可以把 Key 交给本地服务保管。';
        return;
      }
      if (heldKey && heldKey.stored) {
        keyInput.placeholder = '已托管 ' + heldKey.hint + '（留空则保持不变）';
        keyModeHelp.textContent = '由本地服务保管（' + (BACKENDS[heldKey.backend] || heldKey.backend) + '），只用于 ' + heldKey.origin + '，浏览器里没有明文。';
      } else {
        keyInput.placeholder = '粘贴 Key，保存后交给本地服务保管';
        keyModeHelp.textContent = heldKey && heldKey.error ? heldKey.error : '保存后 Key 交给本地服务（tools/serve.py）保管，并只用于当前接口地址；浏览器里不再保留明文。';
      }
    };
    var refreshHeld = function () {
      if (!canHost || keyMode.value !== 'server' || !WW.LLM.originOf(baseInput.value.trim())) { heldKey = null; syncKeyMode(); return Promise.resolve(); }
      return WW.LLM.serverKey('status', baseInput.value.trim()).then(function (j) { heldKey = j; }, function (e) { heldKey = { stored: false, error: e.message }; }).then(syncKeyMode);
    };
    keyMode.addEventListener('change', refreshHeld);
    baseInput.addEventListener('change', refreshHeld);
    clearKeyBtn.addEventListener('click', function () {
      WW.LLM.serverKey('delete', baseInput.value.trim()).then(function () {
        WW.DOM.toast('已清除托管的 Key', 'good');
      }, function (e) { WW.DOM.toast(e.message, 'bad'); }).then(refreshHeld);
    });
    presetSel.addEventListener('change', function () { syncPreset(true); refreshHeld(); });
    modelPick.addEventListener('change', function () {
      var custom = !modelPick.value;
      if (!custom) modelInput.value = modelPick.value;
      modelInput.classList.toggle('hidden', !custom);
      if (custom) modelInput.focus();
    });
    syncPreset(false);
    refreshHeld();

    /* Save settings; in custody mode hand a newly typed key to the local service first. */
    var persist = function () {
      var next = collect();
      var typed = keyInput.value.trim();
      if (next.keyMode !== 'server') {
        WW.LLM.saveSettings(next, typed);
        return Promise.resolve();
      }
      WW.LLM.saveSettings(next);
      var act = typed ? WW.LLM.serverKey('set', next.baseURL, typed) : WW.LLM.serverKey('status', next.baseURL);
      return act.then(function (j) {
        heldKey = j;
        keyInput.value = '';
        syncKeyMode();
      });
    };

    var collect = function () {
      var p = WW.LLM.preset(presetSel.value) || {};
      return {
        provider: presetSel.value, format: p.format || 'openai', baseURL: baseInput.value.trim(), model: modelInput.value.trim(),
        keyMode: keyMode.value, serverKeyOrigin: WW.LLM.getSettings().serverKeyOrigin, serverKeyHint: WW.LLM.getSettings().serverKeyHint, aiLevel: aiLevel.value, structured: structured.checked, jsonMode: jsonMode.checked, reasoning: reasoning.value,
        fallbacks: fallbacks.checked, streaming: streaming.checked, useProxy: useProxy.checked, proxyURL: proxyURL.value.trim(),
        timeoutSec: Number(timeout.value) || 120, temperature: Number(temperature.value), sdkURL: s.sdkURL || WW.LLM.SDK_URL
      };
    };

    var testBtn = h('button', { class: 'btn', on: { click: function () {
      status.textContent = '正在测试连接…';
      testBtn.disabled = true;
      persist().then(function () {
        WW.LLM.resetCompat();
        return WW.LLM.test();
      }).then(function (r) {
        status.textContent = '✅ 连接成功：' + r.model + '，耗时 ' + r.ms + ' ms（' + r.msg + '）';
      }, function (e) {
        status.textContent = '❌ 连接失败：' + e.message;
      }).then(function () { testBtn.disabled = false; });
    } } }, '测试连接');

    var m = WW.DOM.modal({
      title: 'AI 接口设置',
      wide: true,
      body: h('div', { class: 'col', style: { gap: '12px' } },
        h('div', { class: 'small sub' }, '游戏可以接入 Claude（Anthropic）或任何 OpenAI 兼容接口（DeepSeek、通义、Kimi、智谱、豆包、Gemini、Ollama、LM Studio…）。不配置也能玩：所有 AI 内容都有离线规则兜底。'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' } },
          field('服务商', presetSel),
          field('模型', h('div', { class: 'col' }, modelPick, modelInput), 'Claude 默认 claude-opus-5-5；想更快更省可选 claude-haiku-5-5'),
          field('接口地址（Base URL）', baseInput),
          field('API Key', keyInput, clearKeyBtn),
          field('Key 保存方式', keyMode, keyModeHelp),
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
          persist().then(function () {
            WW.LLM.resetCompat();
            WW.Store.set('theme', theme.value);
            WW.DOM.applyTheme(theme.value);
            m.close(true);
            WW.DOM.toast(WW.LLM.isReady() ? '设置已保存，AI 已就绪' : '设置已保存（当前为离线规则模式）', 'good');
            if (opts.onSave) opts.onSave();
          }, function (e) {
            status.textContent = '❌ ' + e.message;
            WW.DOM.toast(e.message, 'bad');
          });
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
