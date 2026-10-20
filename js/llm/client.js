/*
 * LLM client: settings, provider presets and two adapters.
 *  - Anthropic (Claude): official @anthropic-ai/sdk, loaded on demand from a pinned CDN URL with
 *    dangerouslyAllowBrowser (a browser-stored key goes straight to the API; in custody mode the relay
 *    injects it). JSON tasks use output_config.format.
 *  - OpenAI-compatible (DeepSeek / 通义 / Kimi / 智谱 / 豆包 / 硅基流动 / Ollama ...): fetch.
 * Optional local relay (tools/serve.py) for providers that block browser CORS:
 *    {proxyURL}/llm-proxy/<base64url(baseURL)>/<path>
 * The API key is stored separately from the other settings: in localStorage / sessionStorage, or — keyMode
 * 'server' — held by tools/serve.py (POST /api/key), which injects it into proxied requests so this page
 * never sees it again; only a masked hint is kept here.
 */
(function (WW) {
  'use strict';

  var U = WW.U;

  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
  var SDK_FALLBACK_URL = 'https://esm.sh/@anthropic-ai/sdk@0.131.0';

  var PRESETS = [
    { id: 'anthropic', name: 'Claude（Anthropic 官方）', format: 'anthropic', baseURL: 'https://api.anthropic.com', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], keyHint: 'sk-ant-…' },
    { id: 'anthropic-relay', name: 'Claude（Anthropic 格式中转）', format: 'anthropic', baseURL: '', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], keyHint: '中转服务商提供的 Key' },
    { id: 'deepseek', name: 'DeepSeek', format: 'openai', baseURL: 'https://api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'], keyHint: 'sk-…' },
    { id: 'qwen', name: '通义千问（阿里云百炼）', format: 'openai', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'], keyHint: 'sk-…' },
    { id: 'kimi', name: 'Kimi（月之暗面）', format: 'openai', baseURL: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-32k', 'moonshot-v1-8k'], keyHint: 'sk-…' },
    { id: 'zhipu', name: '智谱 GLM', format: 'openai', baseURL: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus', 'glm-4-flash'], keyHint: '' },
    { id: 'doubao', name: '豆包（火山方舟）', format: 'openai', baseURL: 'https://ark.cn-beijing.volces.com/api/v3', models: [], keyHint: '模型处填推理接入点 ID' },
    { id: 'siliconflow', name: '硅基流动', format: 'openai', baseURL: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'], keyHint: 'sk-…' },
    { id: 'openrouter', name: 'OpenRouter', format: 'openai', baseURL: 'https://openrouter.ai/api/v1', models: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'], keyHint: 'sk-or-…' },
    { id: 'gemini', name: 'Google Gemini', format: 'openai', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'], keyHint: 'AIza…（Google AI Studio 获取）', reasoning: true, maxOutput: 16000 },
    { id: 'ollama', name: '本地 Ollama', format: 'openai', baseURL: 'http://localhost:11434/v1', models: ['qwen2.5:14b', 'qwen2.5:7b'], keyHint: '无需 Key', noKey: true },
    { id: 'lmstudio', name: '本地 LM Studio', format: 'openai', baseURL: 'http://localhost:1234/v1', models: [], keyHint: '无需 Key；模型处填 LM Studio 中已加载模型的标识，并在服务器设置里开启 CORS', noKey: true, jsonFormat: 'json_schema', reasoning: true },
    { id: 'custom', name: '自定义（OpenAI 兼容）', format: 'openai', baseURL: '', models: [], keyHint: '' }
  ];

  /* Key custody needs this page to be served by tools/serve.py (it only answers its own origin). */
  function serverAvailable() {
    return typeof location !== 'undefined' && /^http:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  }

  var DEFAULTS = {
    provider: 'anthropic', format: 'anthropic', baseURL: 'https://api.anthropic.com', model: 'claude-opus-5-5',
    keyMode: serverAvailable() ? 'server' : 'local', serverKeyOrigin: '', serverKeyHint: '', aiLevel: 'full', jsonMode: true, reasoning: 'auto', structured: true, temperature: 0.9, timeoutSec: 120,
    useProxy: false, proxyURL: 'http://127.0.0.1:8765', fallbacks: true, sdkURL: SDK_URL, streaming: true
  };

  var logs = [];
  var listeners = [];

  function LLMError(message, code, status) {
    var e = new Error(message);
    e.code = code || 'error';
    e.status = status || 0;
    return e;
  }

  /* ---------------------------------------------------------------- settings */

  function getSettings() {
    var s = U.deepMerge(DEFAULTS, WW.Store.get('settings', {}) || {});
    delete s.apiKey;
    return s;
  }

  function getKey() {
    var s = getSettings();
    if (s.keyMode === 'server') return '';
    return s.keyMode === 'session' ? WW.Store.sessionGet('apikey', '') : WW.Store.get('apikey', '');
  }

  function saveSettings(s, key) {
    var clean = U.deepClone(s);
    delete clean.apiKey;
    WW.Store.set('settings', clean);
    if (clean.keyMode === 'server') {
      /* the server holds it now: drop any plaintext copy this browser still has */
      WW.Store.remove('apikey');
      WW.Store.sessionRemove('apikey');
    } else if (key !== undefined) {
      if (clean.keyMode === 'session') {
        WW.Store.sessionSet('apikey', key);
        WW.Store.remove('apikey');
      } else {
        WW.Store.set('apikey', key);
        WW.Store.sessionRemove('apikey');
      }
    }
    listeners.forEach(function (fn) { try { fn(getSettings()); } catch (e) { WW.Log.warn('ai', '设置变更回调出错：' + e.message, e); } });
  }

  function preset(id) { return PRESETS.filter(function (p) { return p.id === id; })[0] || null; }

  function isReady() {
    var s = getSettings();
    if (s.aiLevel === 'off') return false;
    if (!s.baseURL || !s.model) return false;
    var p = preset(s.provider);
    var held = s.keyMode === 'server' && serverAvailable() && !!s.serverKeyHint && s.serverKeyOrigin === originOf(s.baseURL);
    return !!(held || getKey() || (p && p.noKey) || /localhost|127\.0\.0\.1/.test(s.baseURL));
  }

  function isOfficialAnthropic(s) { return /^https:\/\/api\.anthropic\.com\/?$/.test(s.baseURL); }

  function originOf(base) {
    try { return new URL(base).origin; } catch (e) { return ''; }
  }

  /* custody mode always goes through the serving page's own relay, which injects the key */
  function viaProxy(s) { return s.keyMode === 'server' || !!s.useProxy; }

  function proxyRoot(s) {
    if (s.keyMode === 'server' && serverAvailable()) return location.origin;
    return String(s.proxyURL || DEFAULTS.proxyURL).replace(/\/+$/, '');
  }

  /* ---------------------------------------------------------------- key custody */

  /* action: 'status' | 'set' | 'delete'. Resolves { stored, hint?, backend, origin }; never returns the key. */
  function serverKey(action, base, key) {
    if (!serverAvailable()) return Promise.reject(LLMError('需要通过 tools/serve.py 打开游戏才能托管 Key', 'nokeyserver'));
    var body = { action: action, base: base };
    if (action === 'set') body.key = key;
    return fetch(location.origin + '/api/key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) throw LLMError(j.error || ('本地服务返回 ' + res.status), 'keyserver', res.status);
        var s = getSettings();
        var current = s.serverKeyOrigin === j.origin || originOf(s.baseURL) === j.origin;
        if (current) {
          s.serverKeyOrigin = j.origin;
          s.serverKeyHint = j.stored ? j.hint : '';
          WW.Store.set('settings', s);
        }
        return j;
      });
    }, function (e) {
      throw LLMError('连不上本地服务（tools/serve.py 是否在运行？）：' + e.message, 'keyserver');
    });
  }

  function b64url(str) {
    var bytes = unescape(encodeURIComponent(str));
    return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function effectiveBase(s) {
    var base = String(s.baseURL || '').replace(/\/+$/, '');
    if (viaProxy(s) && base) return proxyRoot(s) + '/llm-proxy/' + b64url(base);
    return base;
  }

  /* ---------------------------------------------------------------- JSON */

  function parseLoose(body) {
    try { return JSON.parse(body); } catch (e) { return JSON.parse(body.replace(/,\s*([}\]])/g, '$1')); }
  }

  /* Re-balances brackets the way small models get them wrong in long outputs: a closer that does not
     match the open container either closes the missing ones (when that container is open further down)
     or is dropped; a closer that would end the root while the text goes on with "," or another closer is dropped; raw
     newlines inside strings are escaped; an unterminated string / open containers at the end are closed. */
  function rebalance(t) {
    var out = '', stack = [], inStr = false, esc = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        else if (c === '\n') { out += '\\n'; continue; }
        else if (c === '\r') continue;
        out += c;
        continue;
      }
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === '{' || c === '[') { stack.push(c); out += c; continue; }
      if (c === '}' || c === ']') {
        var want = c === '}' ? '{' : '[';
        if (!stack.length) break;
        if (stack[stack.length - 1] !== want) {
          if (stack.lastIndexOf(want) < 0) continue;
          while (stack[stack.length - 1] !== want) out += stack.pop() === '{' ? '}' : ']';
        }
        if (stack.length === 1 && /^\s*[,\]}]/.test(t.slice(i + 1))) continue;
        stack.pop();
        out += c;
        if (!stack.length) break;
        continue;
      }
      out += c;
    }
    if (inStr) out += '"';
    out = out.replace(/[,:\s]+$/, '');
    while (stack.length) out += stack.pop() === '{' ? '}' : ']';
    return out;
  }

  function jsonError(e, body) {
    var err = LLMError('JSON 解析失败：' + e.message, 'json');
    var m = /position (\d+)/.exec(e.message);
    if (m) {
      err.pos = Number(m[1]);
      err.snippet = body.slice(Math.max(0, err.pos - 120), err.pos + 120);
    }
    return err;
  }

  function extractJSON(text) {
    var t = String(text || '').trim();
    var fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    var start = t.search(/[[{]/);
    if (start < 0) throw LLMError('输出里没有 JSON', 'json');
    var depth = 0, inStr = false, esc = false, end = -1;
    for (var i = start; i < t.length; i++) {
      var c = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    var body = end > 0 ? t.slice(start, end + 1) : t.slice(start);
    /* text that carries on with structure after the "root" closed means an extra closer upstream:
       the balanced prefix would be a silently truncated object, so go straight to re-balancing */
    var overClosed = end > 0 && /^\s*[,\]}"]/.test(t.slice(end + 1));
    var first;
    if (!overClosed) {
      try { return parseLoose(body); } catch (e) { first = e; }
    }
    try {
      return parseLoose(rebalance(t.slice(start)));
    } catch (e2) {
      throw jsonError(first || e2, first ? body : t.slice(start));
    }
  }

  /* "output was cut off" with the token counts that explain why (OpenAI or Anthropic usage shape) */
  function truncationMessage(usage) {
    var u = usage || {};
    var inTok = u.prompt_tokens || u.input_tokens || 0;
    var outTok = u.completion_tokens || u.output_tokens || 0;
    var think = (u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens) || 0;
    var msg = '输出被截断';
    if (inTok || outTok) msg += '：提示词 ' + inTok + ' + 输出 ' + outTok + ' token' + (think ? '（其中思考 ' + think + '）' : '');
    msg += '。本地模型请调大上下文长度';
    if (think) msg += '，或在「AI 设置」里把思考强度设为关闭';
    return msg + '。';
  }

  /* ---------------------------------------------------------------- logging */

  function pushLog(entry, err) {
    if (!entry.ok) WW.Log.warn('ai', entry.task + ' 调用失败：' + entry.error,
      { aiLogId: entry.id, code: err && err.code || '', status: err && err.status || '', provider: entry.provider, model: entry.model, ms: entry.ms });
    logs.push(entry);
    if (logs.length > 60) logs.shift();
    WW.bus.emit('llm-log', entry);
  }

  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…（截断）' : s; }

  /* ---------------------------------------------------------------- Anthropic */

  var sdkPromise = null;
  function loadSDK(url) {
    if (!sdkPromise) {
      var load = function (u) { return import(u).then(function (m) { return m.default || m.Anthropic; }); };
      sdkPromise = load(url || SDK_URL).catch(function () {
        return load(SDK_FALLBACK_URL);
      }).catch(function (e) {
        sdkPromise = null;
        throw LLMError('无法加载 Anthropic SDK（需要能访问 cdn.jsdelivr.net 或 esm.sh）：' + e.message, 'sdk');
      });
    }
    return sdkPromise;
  }

  function anthropicError(Anthropic, e) {
    if (Anthropic && e instanceof Anthropic.AuthenticationError) return LLMError('认证失败：API Key 无效或已过期', 'auth', 401);
    if (Anthropic && e instanceof Anthropic.PermissionDeniedError) return LLMError('没有权限使用该模型', 'permission', 403);
    if (Anthropic && e instanceof Anthropic.NotFoundError) return LLMError('模型或接口地址不存在：' + e.message, 'notfound', 404);
    if (Anthropic && e instanceof Anthropic.RateLimitError) return LLMError('请求太频繁或额度不足（429）', 'ratelimit', 429);
    if (Anthropic && e instanceof Anthropic.BadRequestError) return LLMError('请求被拒绝（400）：' + e.message, 'badrequest', 400);
    if (Anthropic && e instanceof Anthropic.APIConnectionError) return LLMError('网络连接失败：可能被跨域拦截或无法访问该地址，可尝试开启本地代理', 'network');
    if (Anthropic && e instanceof Anthropic.APIError) return LLMError('服务端错误（' + e.status + '）：' + e.message, 'server', e.status);
    return LLMError(String(e && e.message || e), e && e.code || 'error');
  }

  var compatMode = false;

  function anthropicChat(s, key, o) {
    return loadSDK(s.sdkURL).then(function (Anthropic) {
      var client = new Anthropic({
        apiKey: key || 'missing-key', baseURL: effectiveBase(s) || undefined, dangerouslyAllowBrowser: true,
        maxRetries: 1, timeout: (s.timeoutSec || 120) * 1000
      });
      var build = function (compat) {
        var params = {
          model: s.model,
          max_tokens: o.maxTokens || 16000,
          system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: o.user }]
        };
        if (!compat) {
          var oc = { effort: o.effort || 'low' };
          if (o.shape && s.structured) oc.format = { type: 'json_schema', schema: WW.Shape.toJSONSchema(o.shape) };
          params.output_config = oc;
        }
        return params;
      };
      var send = function (compat) {
        var params = build(compat);
        /* the local relay forwards the beta header as-is, so custody / proxy mode gets fallbacks too */
        var useFallback = !compat && s.fallbacks && isOfficialAnthropic(s);
        var api = useFallback ? client.beta.messages : client.messages;
        if (useFallback) {
          params.betas = ['server-side-fallback-2026-07-01'];
          params.fallbacks = 'default';
        }
        if (o.stream && o.onText) {
          var stream = api.stream(params);
          stream.on('text', function (delta) { o.onText(delta); });
          return stream.finalMessage();
        }
        return api.create(params);
      };
      return send(compatMode).catch(function (e) {
        if (!compatMode && e instanceof Anthropic.BadRequestError && /output_config|effort|fallback|beta|json_schema|format/i.test(String(e.message))) {
          compatMode = true;
          return send(true);
        }
        throw e;
      }).then(function (msg) {
        if (msg.stop_reason === 'refusal') throw LLMError('模型拒绝了这个请求', 'refusal');
        var text = (msg.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
        if (msg.stop_reason === 'max_tokens' && o.shape) throw LLMError(truncationMessage(msg.usage), 'truncated');
        return { text: text, usage: msg.usage || null, model: msg.model || s.model, finishReason: msg.stop_reason === 'max_tokens' ? 'length' : (msg.stop_reason || '') };
      }, function (e) {
        if (e && e.code && e.code !== 'error' && !(e instanceof Anthropic.APIError)) throw e;
        throw anthropicError(Anthropic, e);
      });
    });
  }

  /* ---------------------------------------------------------------- OpenAI-compatible */

  function httpError(status, body) {
    var msg = body;
    try { var j = JSON.parse(body); msg = (j.error && (j.error.message || j.error)) || j.message || body; } catch (e) { /* keep text */ }
    msg = clip(typeof msg === 'string' ? msg : JSON.stringify(msg), 300);
    if (status === 401) return LLMError('认证失败：API Key 无效（401）', 'auth', 401);
    if (status === 403) return LLMError('没有权限（403）：' + msg, 'permission', 403);
    if (status === 404) return LLMError('地址或模型不存在（404）：' + msg, 'notfound', 404);
    if (status === 429) return LLMError('请求太频繁或额度不足（429）', 'ratelimit', 429);
    if (status >= 500) return LLMError('服务端错误（' + status + '）：' + msg, 'server', status);
    return LLMError('请求失败（' + status + '）：' + msg, 'badrequest', status);
  }

  function readSSE(res, onData) {
    var reader = res.body.getReader();
    var decoder = new TextDecoder('utf-8');
    var buf = '';
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) return;
        buf += decoder.decode(r.value, { stream: true });
        var lines = buf.split(/\r?\n/);
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.indexOf('data:') !== 0) continue;
          var data = line.slice(5).trim();
          if (data === '[DONE]') return;
          try { onData(JSON.parse(data)); } catch (e) { /* ignore keep-alive noise */ }
        }
        return pump();
      });
    }
    return pump();
  }

  /* JSON modes to try: the preset's own format first (json_schema for LM Studio, json_object otherwise),
     then the other one, then none. */
  var jsonModeMemo = {};
  function jsonModes(s) {
    var p = preset(s.provider);
    var first = (p && p.jsonFormat) || 'json_object';
    return [first].concat(['json_schema', 'json_object'].filter(function (m) { return m !== first; })).concat(['none']);
  }

  /* Task effort -> OpenAI-style reasoning_effort, one notch lower: hidden reasoning tokens count against
     max_tokens and add latency, and the game's low-effort tasks are pure writing. Only sent for presets
     with `reasoning: true`; a 400 about it drops the parameter for that endpoint. */
  var REASONING_EFFORT = { low: 'none', medium: 'low', high: 'medium' };
  var noReasoningMemo = {};

  /* Remote APIs keep the conservative 8000 cap (several reject more); local servers and presets with
     maxOutput get the task's own budget, since thinking models spend part of it before answering. */
  function outputCap(s) {
    var p = preset(s.provider);
    if (p && p.maxOutput) return p.maxOutput;
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(s.baseURL || '') ? Infinity : 8000;
  }

  function openaiChat(s, key, o) {
    var url = effectiveBase(s) + '/chat/completions';
    var sys = o.system + (o.shape ? '\n\n【输出格式】只输出一个 JSON 对象，结构为：' + WW.Shape.describe(o.shape) : '');
    var body = {
      model: s.model,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: o.user }],
      temperature: Number(s.temperature),
      max_tokens: Math.min(o.maxTokens || 4096, outputCap(s))
    };
    var memoKey = s.baseURL + '|' + s.model;
    var pr = preset(s.provider);
    /* s.reasoning: 'auto' = the task mapping above; 'none' | 'low' | 'medium' | 'high' = fixed for every task */
    if (pr && pr.reasoning && !noReasoningMemo[memoKey]) {
      body.reasoning_effort = s.reasoning && s.reasoning !== 'auto' ? s.reasoning : (REASONING_EFFORT[o.effort || 'low'] || 'none');
    }
    var modes = o.shape && s.jsonMode ? jsonModes(s) : ['none'];
    var mi = Math.min(jsonModeMemo[memoKey] || 0, modes.length - 1);
    var applyMode = function () {
      if (modes[mi] === 'json_schema') body.response_format = { type: 'json_schema', json_schema: { name: 'output', strict: true, schema: WW.Shape.toJSONSchema(o.shape) } };
      else if (modes[mi] === 'json_object') body.response_format = { type: 'json_object' };
      else delete body.response_format;
    };
    applyMode();
    if (o.stream && o.onText) body.stream = true;
    var headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = 'Bearer ' + key;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, (s.timeoutSec || 120) * 1000) : null;
    var once = function () {
      return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
    };
    /* one retry after a short pause on rate limits, server errors and dropped connections */
    var send = function () {
      var retry = function () { return new Promise(function (r) { setTimeout(r, 1500); }).then(once); };
      return once().then(function (res) {
        return res.status === 429 || res.status >= 500 ? retry() : res;
      }, function (e) {
        if (e && e.name === 'AbortError') throw e;
        return retry();
      });
    };
    /* a 400 while optional parameters are set: drop reasoning_effort if the error is about it, else move
       to the next JSON mode in jsonModes() order (schema presets: json_schema -> json_object -> none; the
       rest: json_object -> json_schema -> none); remember what worked for this endpoint so
       later calls skip the rejected variants */
    var sendWithMode = function () {
      return send().then(function (res) {
        /* only structured calls learn the JSON mode; a plain-text call must not reset it */
        if (res.ok && modes.length > 1) jsonModeMemo[memoKey] = mi;
        if (res.status !== 400 || !(body.response_format || body.reasoning_effort)) return res;
        return res.clone().text().then(function (t) {
          var canStep = body.response_format && mi < modes.length - 1;
          if (body.reasoning_effort && (/reason/i.test(t) || !canStep)) {
            delete body.reasoning_effort;
            noReasoningMemo[memoKey] = true;
            return sendWithMode();
          }
          if (canStep) {
            mi++;
            applyMode();
            return sendWithMode();
          }
          return res;
        });
      });
    };
    return sendWithMode().then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw httpError(res.status, t); });
      if (body.stream) {
        var text = '';
        var usage = null;
        var finish = '';
        return readSSE(res, function (chunk) {
          var ch = chunk.choices && chunk.choices[0];
          var delta = ch && ch.delta;
          if (delta && delta.content) {
            text += delta.content;
            o.onText(delta.content);
          }
          if (ch && ch.finish_reason) finish = ch.finish_reason;
          if (chunk.usage) usage = chunk.usage;
        }).then(function () { return { text: text, usage: usage, model: s.model, finishReason: finish }; });
      }
      return res.json().then(function (j) {
        var choice = j.choices && j.choices[0];
        var content = choice && choice.message ? choice.message.content : '';
        if (Array.isArray(content)) content = content.map(function (c) { return c.text || ''; }).join('');
        return { text: content || '', usage: j.usage || null, model: j.model || s.model, finishReason: (choice && choice.finish_reason) || '' };
      }).then(function (r) {
        /* same rule as the Anthropic path: a structured task cut off by the token limit is a failure */
        if (r.finishReason === 'length' && o.shape) throw LLMError(truncationMessage(r.usage), 'truncated');
        return r;
      });
    }).catch(function (e) {
      if (e && e.name === 'AbortError') throw LLMError('请求超时（' + s.timeoutSec + ' 秒）', 'timeout');
      if (e && e.code) throw e;
      throw LLMError('网络请求失败：' + (e && e.message || e) + '（可能是跨域限制，可尝试开启本地代理）', 'network');
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      return r;
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  /* ---------------------------------------------------------------- public */

  /* o: { system, user, shape?, effort?, maxTokens?, stream?, onText?, task? } */
  function chat(o) {
    var s = getSettings();
    var key = getKey();
    var started = Date.now();
    var entry = { id: U.uid('call'), time: new Date().toLocaleTimeString(), task: o.task || 'chat', provider: s.provider, model: s.model, ok: false, ms: 0, system: clip(o.system, 6000), user: clip(o.user, 6000), response: '', error: '' };
    var p = s.format === 'anthropic' ? anthropicChat(s, key, o) : openaiChat(s, key, o);
    return p.then(function (res) {
      entry.ok = true;
      entry.ms = Date.now() - started;
      entry.response = clip(res.text, 8000);
      entry.usage = res.usage;
      pushLog(entry);
      res.ms = entry.ms;
      return res;
    }, function (e) {
      entry.ms = Date.now() - started;
      entry.error = e.message;
      pushLog(entry, e);
      throw e;
    });
  }

  function test() {
    return chat({
      task: 'test', effort: 'low', maxTokens: 2000,
      system: '你是连通性测试助手。',
      user: '请只输出 JSON：{"ok": true, "msg": "连接成功"}',
      shape: WW.Shape.obj({ ok: WW.Shape.bool(true), msg: WW.Shape.str('') })
    }).then(function (res) {
      var j = extractJSON(res.text);
      return { ok: true, ms: res.ms, model: res.model, msg: j.msg || '连接成功' };
    });
  }

  WW.LLM = {
    PRESETS: PRESETS,
    DEFAULTS: DEFAULTS,
    SDK_URL: SDK_URL,
    preset: preset,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getKey: getKey,
    serverAvailable: serverAvailable,
    serverKey: serverKey,
    originOf: originOf,
    isReady: isReady,
    effectiveBase: effectiveBase,
    extractJSON: extractJSON,
    truncationMessage: truncationMessage,
    chat: chat,
    test: test,
    logs: logs,
    onSettings: function (fn) { listeners.push(fn); },
    resetCompat: function () { compatMode = false; jsonModeMemo = {}; noReasoningMemo = {}; }
  };
})(window.WW);
