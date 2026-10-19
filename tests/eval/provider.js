/*
 * Model backends for the eval. Every model call goes through one Caller, keyed by a stable call id:
 *   - a response file already in <run>/responses/<who>/<id>.txt is reused (cache / imported answers);
 *   - otherwise the backend answers:
 *       api   : the production WW.LLM.chat of a vm context configured from env vars (real provider);
 *       mock  : in-process fake model (offline rules serialized as JSON, plus injected faults);
 *       agent : nothing answers; the prompt is written to <run>/prompts/<who>/<id>.json and the call
 *               is marked pending, so an external model (e.g. a Claude Code subagent) can answer it
 *               and the next run imports the answer.
 * The API key is read from the environment only and never written to disk.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { loadContext } = require('../harness');

class PendingError extends Error {
  constructor(id) { super('pending: ' + id); this.code = 'pending'; this.pendingId = id; }
}

function promptHash(req) {
  return crypto.createHash('sha1').update(String(req.system) + '\u0000' + String(req.user)).digest('hex').slice(0, 16);
}

function safeId(id) { return String(id).replace(/[^A-Za-z0-9_.@#-]+/g, '_'); }

function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

/* Settings for a vm context: env vars for real calls, a dummy ready config otherwise. */
function envSettings(prefix) {
  const env = (k) => process.env[prefix + k];
  const format = env('FORMAT') || 'anthropic';
  return {
    format,
    provider: format === 'anthropic' ? (/api\.anthropic\.com/.test(env('BASE') || 'https://api.anthropic.com') ? 'anthropic' : 'anthropic-relay') : 'custom',
    baseURL: env('BASE') || (format === 'anthropic' ? 'https://api.anthropic.com' : ''),
    model: env('MODEL') || (format === 'anthropic' ? 'claude-opus-5-5' : ''),
    key: env('KEY') || ''
  };
}

function sdkFileURL() {
  const pkg = path.join(__dirname, 'node_modules', '@anthropic-ai', 'sdk');
  if (!fs.existsSync(pkg)) return null;
  const meta = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
  const exp = meta.exports && meta.exports['.'];
  const entry = (exp && (exp.import && (exp.import.default || exp.import))) || meta.module || 'index.mjs';
  return pathToFileURL(path.join(pkg, typeof entry === 'string' ? entry : 'index.mjs')).href;
}

/* A vm context whose WW.LLM is configured and ready. */
function makeContext(settings) {
  const ctx = loadContext({ dynamicImport: true, extraGlobals: { fetch, AbortController, TextDecoder, TextEncoder, URL, btoa, atob, unescape, encodeURIComponent } });
  const WW = ctx.WW;
  const s = Object.assign({}, WW.LLM.DEFAULTS, {
    provider: settings.provider, format: settings.format, baseURL: settings.baseURL, model: settings.model,
    aiLevel: 'full', streaming: false, timeoutSec: Number(process.env.WW_EVAL_TIMEOUT || 180), keyMode: 'local'
  });
  const sdk = sdkFileURL();
  if (sdk) s.sdkURL = sdk;
  WW.LLM.saveSettings(s, settings.key || 'eval-placeholder');
  return ctx;
}

class Caller {
  /* opts: { backend, runDir, subject, judge, mockFault, maxCalls, effort } */
  constructor(opts) {
    this.o = opts;
    this.calls = 0;
    this.pending = [];
    this.trace = [];
    this.apiCtx = {};
  }

  dirFor(who) { return path.join(this.o.runDir, 'responses', who); }

  /* req: { id, who: 'subject'|'judge', system, user, shape, task, effort, maxTokens, game?, args? } */
  async call(req) {
    const who = req.who === 'judge' ? 'judge' : this.o.subject;
    const id = safeId(req.id);
    const file = path.join(this.dirFor(who), id + '.txt');
    const metaFile = path.join(this.dirFor(who), id + '.meta.json');
    const started = Date.now();
    const rec = { id, who, task: req.task, cached: false, ms: 0, usage: null, error: '', text: '' };
    this.trace.push(rec);
    const hash = promptHash(req);
    /* a stored answer is reused only for the exact same prompt; an edited case or prompt makes it stale */
    if (fs.existsSync(file) && this.storedHash(who, id, req, metaFile) !== hash) {
      fs.renameSync(file, file.replace(/\.txt$/, '.stale.txt'));
      if (fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
    }
    if (fs.existsSync(file)) {
      rec.cached = true;
      rec.text = fs.readFileSync(file, 'utf8');
      if (fs.existsSync(metaFile)) Object.assign(rec, JSON.parse(fs.readFileSync(metaFile, 'utf8')), { cached: true });
      return { text: rec.text, usage: rec.usage, model: who, ms: rec.ms };
    }
    const backend = this.o.backend;
    /* an imported answer that fails to parse counts as a JSON failure: no second round-trip for a repair */
    if (backend === 'agent' && /\.repair$/.test(req.task || '')) {
      rec.error = 'repair-skipped';
      throw Object.assign(new Error('导入模式不做 JSON 修复'), { code: 'json' });
    }
    if (backend === 'agent') {
      return this.defer(req, who, id, rec);
    }
    if (this.o.maxCalls && this.calls >= this.o.maxCalls) {
      rec.error = 'max-calls';
      throw Object.assign(new Error('已达到 --max-calls 上限'), { code: 'budget' });
    }
    this.calls++;
    let res;
    try {
      if (backend === 'mock') res = this.mock(req);
      else res = await this.api(req, who);
    } catch (e) {
      rec.error = e && e.message || String(e);
      rec.ms = Date.now() - started;
      throw e;
    }
    rec.text = res.text;
    rec.usage = res.usage || null;
    rec.ms = res.ms || Date.now() - started;
    writeFile(file, res.text);
    writeFile(metaFile, JSON.stringify({ ms: rec.ms, usage: rec.usage, model: res.model || '', hash }));
    return { text: res.text, usage: res.usage, model: res.model, ms: rec.ms };
  }

  /* hash of the prompt an existing answer was produced for: from its meta file (api/mock) or its exported prompt (agent) */
  storedHash(who, id, req, metaFile) {
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      if (meta.hash) return meta.hash;
    }
    const promptFile = path.join(this.o.runDir, 'prompts', who, id + '.json');
    if (!fs.existsSync(promptFile)) return promptHash(req); /* answer supplied by hand without a prompt: trust it */
    const p = JSON.parse(fs.readFileSync(promptFile, 'utf8'));
    if (p.hash) return p.hash;
    return p.user === req.user && String(p.system).indexOf(req.system) === 0 ? promptHash(req) : 'legacy-mismatch';
  }

  defer(req, who, id, rec) {
    const WWs = req.WW;
    const shapeDesc = req.shape && WWs ? WWs.Shape.describe(req.shape) : '';
    /* same wording the OpenAI-compatible adapter appends, since the answering model has no structured-output mode */
    const system = req.system + (shapeDesc ? '\n\n【输出格式】只输出一个 JSON 对象，结构为：' + shapeDesc : '');
    writeFile(path.join(this.o.runDir, 'prompts', who, id + '.json'), JSON.stringify({ id, task: req.task, effort: req.effort || '', hash: promptHash(req), system, user: req.user, json: !!shapeDesc }, null, 1));
    this.pending.push({ who, id });
    rec.error = 'pending';
    throw new PendingError(id);
  }

  mock(req) {
    if (/\.repair$/.test(req.task || '')) return { text: JSON.stringify(req.mockData || {}), usage: null, model: 'mock' };
    if (req.who === 'judge') {
      const WWs = req.WW;
      return { text: JSON.stringify(WWs.Shape.coerce(req.shape, req.mockData || {})), usage: null, model: 'mock' };
    }
    const data = req.mockData;
    let text = typeof data === 'string' ? data : JSON.stringify(data);
    const n = [...String(req.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    if (this.o.mockFault && req.shape && n % 5 === 0) text = '好的，下面是结果：\n```json\n' + text.slice(0, Math.floor(text.length * 0.6)); /* broken JSON -> repair path */
    return { text, usage: { input_tokens: Math.ceil((req.system.length + req.user.length) / 1.5), output_tokens: Math.ceil(text.length / 1.5) }, model: 'mock' };
  }

  async api(req, who) {
    const prefix = who === 'judge' ? 'WW_EVAL_JUDGE_' : 'WW_EVAL_';
    if (!this.apiCtx[who]) {
      /* the judge falls back to the subject's provider settings for anything not set */
      const settings = who === 'judge' && !process.env.WW_EVAL_JUDGE_MODEL ? envSettings('WW_EVAL_') : envSettings(prefix);
      if (who === 'judge' && !settings.key) settings.key = process.env.WW_EVAL_KEY || '';
      if (!settings.key && !/localhost|127\.0\.0\.1/.test(settings.baseURL)) throw new Error('缺少环境变量 ' + prefix + 'KEY');
      this.apiCtx[who] = makeContext(settings);
    }
    const WWa = this.apiCtx[who].WW;
    return WWa.LLM.chat({ task: req.task, effort: this.o.effort || req.effort, maxTokens: req.maxTokens, shape: req.shape, system: req.system, user: req.user });
  }
}

module.exports = { Caller, PendingError, makeContext, envSettings, safeId };
