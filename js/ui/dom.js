/*
 * DOM helpers. Everything user- or AI-provided is inserted as text nodes (never innerHTML),
 * because post contents, level JSON and AI output are all untrusted.
 */
(function (WW) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function append(el, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    if (child instanceof Node) { el.appendChild(child); return; }
    el.appendChild(document.createTextNode(String(child)));
  }

  function setAttrs(el, attrs, isSvg) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) {
        if (s.indexOf('--') === 0) el.style.setProperty(s, v[s]);
        else el.style[s] = v[s];
      });
      else if (k === 'on') Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); });
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      else if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected')) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
  }

  function h(tag, attrs) {
    var el = document.createElement(tag);
    setAttrs(el, attrs, false);
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function svg(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    setAttrs(el, attrs, true);
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

  function replace(el) {
    clear(el);
    for (var i = 1; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  /* ---------- toast ---------- */
  var toastBox = null;
  /* onClick: optional, makes the toast clickable (it closes on click). Red toasts are also kept in WW.Log. */
  function toast(text, kind, ms, onClick) {
    if (kind === 'bad' && WW.Log) WW.Log.warn('ui', text);
    if (!toastBox) {
      toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastBox);
    }
    var t = h('div', { class: 'toast ' + (kind || '') + (onClick ? ' clickable' : ''), on: onClick ? { click: function () {
      if (t.parentNode) t.parentNode.removeChild(t);
      onClick();
    } } : null }, text);
    toastBox.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 4200);
  }

  /* ---------- modal ---------- */
  var openModals = [];
  function modal(o) {
    o = o || {};
    hideTip();
    var mask = h('div', { class: 'modal-mask' });
    var box = h('div', { class: 'modal' + (o.wide ? ' wide' : '') + (o.xwide ? ' xwide' : ''), role: 'dialog', 'aria-modal': 'true' });
    var close = function (result) {
      if (!mask.parentNode) return;
      mask.parentNode.removeChild(mask);
      openModals.splice(openModals.indexOf(api), 1);
      if (o.onClose) o.onClose(result);
    };
    var head = h('div', { class: 'modal-head' },
      h('h3', null, o.title || ''),
      h('div', { class: 'spacer' }),
      o.closable === false ? null : h('button', { class: 'x-btn', title: '关闭', 'aria-label': '关闭', on: { click: function () { close(null); } } }, '×'));
    var body = h('div', { class: 'modal-body' });
    var foot = h('div', { class: 'modal-foot' });
    box.appendChild(head);
    box.appendChild(body);
    if (o.body) append(body, o.body);
    if (o.footer !== false) box.appendChild(foot);
    if (o.footer) append(foot, o.footer);
    mask.appendChild(box);
    if (o.closable !== false && o.maskClose !== false) {
      mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(null); });
    }
    document.body.appendChild(mask);
    var api = { el: box, body: body, foot: foot, head: head, close: close, mask: mask };
    openModals.push(api);
    return api;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !openModals.length) return;
    var top = openModals[openModals.length - 1];
    if (top && top.mask.dataset.locked !== '1') top.close(null);
  });

  function confirmDialog(text, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var m;
      var done = function (v) { resolve(v); m.close(v); };
      m = modal({
        title: opts.title || '确认',
        body: h('div', { style: { whiteSpace: 'pre-line' } }, text),
        footer: [
          h('button', { class: 'btn', on: { click: function () { done(false); } } }, opts.cancel || '取消'),
          h('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), on: { click: function () { done(true); } } }, opts.ok || '确定')
        ],
        onClose: function (v) { resolve(!!v); }
      });
    });
  }

  /* ---------- floating tooltip ---------- */
  var tipEl = null;
  function showTip(x, y, content) {
    if (!tipEl) {
      tipEl = h('div', { class: 'tip', role: 'tooltip' });
      document.body.appendChild(tipEl);
    }
    replace(tipEl, content);
    tipEl.style.display = 'block';
    var r = tipEl.getBoundingClientRect();
    var left = Math.min(window.innerWidth - r.width - 8, x + 14);
    var top = y + 16 + r.height > window.innerHeight ? y - r.height - 10 : y + 16;
    tipEl.style.left = Math.max(8, left) + 'px';
    tipEl.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; }

  /* Attach a hover/focus tooltip whose content is produced lazily. */
  function hoverTip(el, contentFn) {
    el.addEventListener('mousemove', function (e) { showTip(e.clientX, e.clientY, contentFn()); });
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('click', hideTip);
    el.addEventListener('focus', function () {
      var r = el.getBoundingClientRect();
      showTip(r.left, r.bottom, contentFn());
    });
    el.addEventListener('blur', hideTip);
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var input = h('input', { type: 'file', accept: accept || '.json,.js,application/json' });
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (!f) return resolve(null);
        var reader = new FileReader();
        reader.onload = function () { resolve({ name: f.name, text: String(reader.result || '') }); };
        reader.onerror = function () { resolve(null); };
        reader.readAsText(f, 'utf-8');
      });
      input.click();
    });
  }

  /* Theme: 'dark' | 'light' | 'auto', kept per viewer. */
  function applyTheme(theme) {
    var t = theme || WW.Store.get('theme', 'dark');
    document.documentElement.setAttribute('data-theme', t);
    return t;
  }

  WW.DOM = {
    h: h, svg: svg, clear: clear, replace: replace, toast: toast, modal: modal, confirm: confirmDialog,
    showTip: showTip, hideTip: hideTip, hoverTip: hoverTip, download: download, pickFile: pickFile, applyTheme: applyTheme
  };
})(window.WW);
