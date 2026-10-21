#!/usr/bin/env node
/*
 * Linux 静态检查（无依赖）：Windows 上不会暴露、到 Linux 才出问题的文件层面差异。
 *   node tests/linux/static.js
 *   - shell 脚本：git 里记录了可执行位、LF 换行、没有 BOM、首行是 shebang
 *   - 页面和测试引用的 js/css/关卡路径：大小写与磁盘上的文件名完全一致（Linux 区分大小写）、不含反斜杠
 *   - 仓库里没有只差大小写的两个文件（在 Windows / macOS 检出时会互相覆盖）
 * 退出码：有失败为 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
let failed = 0;
const ok = (msg) => console.log('  ✔ ' + msg);
const bad = (msg) => { failed++; console.log('  ✘ ' + msg); };

function gitFiles() {
  try {
    return execFileSync('git', ['ls-files', '-s'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').map((line) => {
      const m = line.match(/^(\d+) \S+ \d+\t(.*)$/);
      return { mode: m[1], file: m[2] };
    });
  } catch (e) {
    return null;
  }
}

/* true only if every path segment exists with exactly this spelling */
function existsExact(rel) {
  let dir = ROOT;
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    let names;
    try { names = fs.readdirSync(dir); } catch (e) { return false; }
    if (names.indexOf(seg) < 0) return false;
    dir = path.join(dir, seg);
  }
  return true;
}

function htmlRefs(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out = [];
  const re = /<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    if (!/^[a-z]+:|^\/\/|^#/i.test(m[1])) out.push(m[1].split(/[?#]/)[0]);
  }
  return out;
}

function checkRefs(label, from, refs) {
  const missing = refs.filter((r) => r.indexOf('\\') >= 0 || !existsExact(r));
  if (missing.length) missing.forEach((r) => bad(label + '：' + from + ' 引用的 ' + r + ' 在 Linux 上找不到（大小写或分隔符不一致）'));
  else ok(label + '：' + from + ' 的 ' + refs.length + ' 个引用大小写一致');
}

console.log('shell 脚本');
const git = gitFiles();
const shells = (git ? git.map((g) => g.file) : fs.readdirSync(ROOT)).filter((f) => /\.sh$/.test(f));
for (const f of shells) {
  const buf = fs.readFileSync(path.join(ROOT, f));
  const text = buf.toString('utf8');
  const problems = [];
  if (git && git.find((g) => g.file === f).mode !== '100755') problems.push('git 里没有可执行位（git update-index --chmod=+x ' + f + '）');
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) problems.push('文件开头有 BOM');
  if (text.indexOf('\r') >= 0) problems.push('含 CRLF 换行');
  if (!/^#!/.test(text.replace(/^﻿/, ''))) problems.push('首行不是 shebang');
  if (problems.length) bad(f + '：' + problems.join('；'));
  else ok(f + '：可执行、LF、有 shebang');
}

console.log('路径大小写');
for (const page of ['Start.html', 'LevelEditor.html']) checkRefs('页面', page, htmlRefs(page));

const sandbox = { WW: { Levels: {} } };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'levels/manifest.js'), 'utf8'), sandbox);
checkRefs('关卡清单', 'levels/manifest.js', (sandbox.WW.Levels.manifest || []).map((f) => 'levels/' + f));

checkRefs('测试', 'tests/harness.js', require(path.join(ROOT, 'tests/harness.js')).FILES);

console.log('只差大小写的文件');
if (git) {
  const seen = {};
  const clashes = [];
  for (const { file } of git) {
    const k = file.toLowerCase();
    if (seen[k]) clashes.push(seen[k] + ' ↔ ' + file);
    else seen[k] = file;
  }
  if (clashes.length) clashes.forEach((c) => bad('大小写冲突：' + c));
  else ok(git.length + ' 个文件里没有只差大小写的');
} else {
  console.log('  - 不是 git 检出，跳过');
}

console.log(failed ? '\n静态检查：' + failed + ' 项失败' : '\n静态检查：全部通过');
process.exitCode = failed ? 1 : 0;
