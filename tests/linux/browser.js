#!/usr/bin/env node
/*
 * Linux 浏览器冒烟测试：用无头 Chromium 分别以 http（tools/serve.py）和 file:// 两种方式打开游戏和编辑器，
 * 签下教程关、用两回合技能、刷新后确认存档还在，并收集页面错误和游戏内「🐞 异常」记录。
 *   node tests/linux/browser.js [--out 目录] [--no-cjk-fonts]
 *   --out           截图和字体报告写到这个目录（默认临时目录）
 *   --no-cjk-fonts  让 Chromium 看不到系统里的中文字体，模拟没装中文字体的发行版，只看效果、不判失败
 * 需要 Playwright：cd tests/linux && npm install（或全局安装）。找不到时以退出码 77 表示跳过。
 * Chromium 不是 Playwright 自带的那个时，用 WW_CHROMIUM=/path/to/chrome 指定。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const OUT = args.indexOf('--out') >= 0 ? path.resolve(args[args.indexOf('--out') + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'ww-browser-'));
const NO_CJK = args.includes('--no-cjk-fonts');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through to the global install */ }
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return require(path.join(globalRoot, 'playwright'));
  } catch (e) {
    return null;
  }
}

let failed = 0;
const ok = (msg) => console.log('  ✔ ' + msg);
const bad = (msg) => { failed++; console.log('  ✘ ' + msg); };
const note = (msg) => console.log('  · ' + msg);

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

async function startServer() {
  const port = await freePort();
  const env = Object.assign({}, process.env, { XDG_CONFIG_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'ww-cfg-')) });
  const proc = spawn('python3', [path.join(ROOT, 'tools/serve.py'), '--port', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.resume();
  proc.stderr.resume();
  for (let i = 0; i < 100; i++) {
    const up = await new Promise((resolve) => {
      const c = net.connect(port, '127.0.0.1', () => { c.end(); resolve(true); }).on('error', () => resolve(false));
    });
    if (up) return { proc, base: 'http://127.0.0.1:' + port + '/' };
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('tools/serve.py 没有启动');
}

/* fontconfig 只认 DejaVu 一个目录：模拟没有中文字体的系统 */
function noCjkFontEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-fonts-'));
  const dejavu = ['/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/dejavu', '/usr/share/fonts/TTF'].find((d) => fs.existsSync(d)) || dir;
  fs.writeFileSync(path.join(dir, 'fonts.conf'), '<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><dir>' + dejavu + '</dir><cachedir>' + dir + '/cache</cachedir></fontconfig>\n');
  return { FONTCONFIG_FILE: path.join(dir, 'fonts.conf') };
}

function cjkFamilies() {
  try {
    return new Set(execFileSync('fc-list', [':lang=zh', 'family'], { encoding: 'utf8' }).split('\n').flatMap((l) => l.split(',')).map((s) => s.trim()).filter(Boolean));
  } catch (e) {
    return null;
  }
}

/* errors from the page itself + warn/error entries in the in-game log (WW.Log) */
function watch(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('未捕获异常：' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('控制台错误：' + m.text()); });
  page.on('requestfailed', (r) => errors.push('请求失败：' + r.url() + ' ' + (r.failure() || {}).errorText));
  return errors;
}

async function gameLog(page) {
  return page.evaluate(() => (window.WW && WW.Log ? WW.Log.list() : []).filter((e) => e.level === 'error').map((e) => '游戏内异常 [' + e.source + ']：' + e.msg));
}

/* close whatever dialogs the last click opened (briefing, morning report, skill result…) with their main button */
async function dismissModals(page) {
  await page.waitForSelector('.modal-mask', { timeout: 1000 }).catch(() => {});
  for (let i = 0; i < 10; i++) {
    const modal = page.locator('.modal-mask .modal').last();
    if (!(await modal.count()) || !(await modal.isVisible())) return;
    const primary = modal.locator('.modal-foot button.primary');
    await ((await primary.count()) ? primary.last() : modal.locator('.modal-foot button').last()).click();
    await page.waitForTimeout(150);
  }
}

async function fontReport(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const out = [];
  for (const [name, selector] of [['文号（系统字体栈）', '.briefing-doc .doc-no'], ['委托书标题（宋体栈）', '.briefing-doc .doc-red'], ['委托书正文（仿宋栈）', '.briefing-doc p']]) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) continue;
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    out.push({ name, fonts: fonts.map((f) => f.familyName + '×' + f.glyphCount) });
  }
  await cdp.detach();
  return out;
}

async function playTutorial(page, url, label) {
  await page.goto(url + 'Start.html?level=tutorial_crayfish');
  await page.getByRole('button', { name: '签约接单' }).click();
  await dismissModals(page);
  for (let turn = 0; turn < 2; turn++) {
    const skill = page.locator('button', { hasText: /控评\s*基础/ });
    if (await skill.isEnabled()) {
      await skill.click();
      await page.getByRole('button', { name: '执行' }).click();
      await dismissModals(page);
    }
    await page.getByRole('button', { name: /结束回合/ }).first().click();
    await page.waitForTimeout(300);
    await dismissModals(page);
  }
  const before = await page.evaluate(() => WW.Store.runs().map((m) => ({ id: m.id, turn: m.turn })));
  if (before.length === 1 && before[0].turn === 3) ok(label + '：教程关签约、用技能、结束两回合，存档在第 3 回合');
  else bad(label + '：教程关两回合后存档不对：' + JSON.stringify(before));
  await page.goto(url + 'Start.html');
  await page.waitForSelector('text=小龙虾店卫生风波');
  const after = await page.evaluate(() => WW.Store.runs().map((m) => ({ id: m.id, turn: m.turn })));
  if (JSON.stringify(after) === JSON.stringify(before)) ok(label + '：刷新后存档还在');
  else bad(label + '：刷新后存档变了：' + JSON.stringify(after));
}

async function scenario(browser, url, label, cjk) {
  console.log(label);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  const errors = watch(page);

  await page.goto(url + 'Start.html');
  await page.waitForSelector('text=小龙虾店卫生风波', { timeout: 10000 }).then(
    () => ok(label + '：首页加载，内置关卡列表出现'),
    () => bad(label + '：首页 10 秒内没有出现内置关卡'));

  try {
    await playTutorial(page, url, label);
  } catch (e) {
    bad(label + '：教程关操作失败：' + e.message.split('\n').slice(0, 3).join(' '));
  }

  await page.goto(url + 'Start.html?level=tutorial_crayfish');
  await page.waitForSelector('.briefing-doc');
  await page.screenshot({ path: path.join(OUT, label + '-委托书.png') });
  const fonts = await fontReport(page);
  for (const f of fonts) {
    const hit = cjk && f.fonts.some((s) => cjk.has(s.replace(/×\d+$/, '')));
    note(label + '：' + f.name + ' 实际用到 ' + (f.fonts.join('、') || '（无）') + (cjk && !hit ? ' ⚠ 都不是中文字体，可能显示成方块' : ''));
  }
  errors.push(...await gameLog(page));

  const editor = await context.newPage();
  const editorErrors = watch(editor);
  await editor.goto(url + 'LevelEditor.html');
  await editor.waitForTimeout(1500);
  await editor.screenshot({ path: path.join(OUT, label + '-编辑器.png') });
  const edText = await editor.innerText('body');
  if (/关卡/.test(edText)) ok(label + '：关卡编辑器加载');
  else bad(label + '：关卡编辑器没有正常显示');
  errors.push(...editorErrors, ...await gameLog(editor));

  if (errors.length) errors.forEach((e) => bad(label + '：' + e));
  else ok(label + '：没有页面错误，游戏内异常面板为空');
  await context.close();
}

(async () => {
  const pw = loadPlaywright();
  if (!pw) {
    console.log('跳过浏览器测试：找不到 Playwright。安装：cd tests/linux && npm install');
    process.exit(77);
  }
  const env = Object.assign({}, process.env, NO_CJK ? noCjkFontEnv() : {});
  const launch = { env };
  if (process.env.WW_CHROMIUM) launch.executablePath = process.env.WW_CHROMIUM;
  const browser = await pw.chromium.launch(launch);
  const server = await startServer();
  const cjk = NO_CJK ? new Set() : cjkFamilies();
  if (cjk && !cjk.size && !NO_CJK) note('系统里没有中文字体（fc-list :lang=zh 为空），截图里的中文可能是方块');
  try {
    await scenario(browser, server.base, 'http', cjk);
    await scenario(browser, 'file://' + ROOT + '/', 'file', cjk);
  } finally {
    await browser.close();
    server.proc.kill();
  }
  console.log('截图：' + OUT);
  console.log(failed ? '\n浏览器测试：' + failed + ' 项失败' : '\n浏览器测试：全部通过');
  process.exitCode = failed ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
