/*
 * Chart pieces for the war room and the result page (inline SVG, no library).
 * Forms: stat tile (value + delta + sparkline), meter (same-ramp track), diverging meter for
 * sentiment (blue <-> red around a neutral midpoint), small-multiple line charts with a
 * crosshair tooltip. Status colors appear only with an icon/label next to them.
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var svg = WW.DOM.svg;
  var U = WW.U;

  var STATUS = { good: 'var(--good)', warn: 'var(--warn)', serious: 'var(--serious)', crit: 'var(--crit)', accent: 'var(--accent)' };

  /* severity bands per stat: returns { color, label, level } */
  function band(stat, v) {
    switch (stat) {
      case 'heat':
        if (v >= 70) return { color: STATUS.crit, label: '爆发', level: 'crit' };
        if (v >= 40) return { color: STATUS.warn, label: '发酵', level: 'warn' };
        if (v >= 15) return { color: STATUS.accent, label: '余温', level: 'ok' };
        return { color: STATUS.good, label: '平息', level: 'good' };
      case 'exposure':
        if (v >= 85) return { color: STATUS.crit, label: '危险', level: 'crit' };
        if (v >= 60) return { color: STATUS.serious, label: '偏高', level: 'serious' };
        if (v >= 30) return { color: STATUS.warn, label: '中等', level: 'warn' };
        return { color: STATUS.accent, label: '较低', level: 'ok' };
      case 'credibility':
      case 'satisfaction':
        if (v < 25) return { color: STATUS.crit, label: '危险', level: 'crit' };
        if (v < 45) return { color: STATUS.warn, label: '偏低', level: 'warn' };
        return { color: STATUS.accent, label: stat === 'satisfaction' ? '尚可' : '稳定', level: 'ok' };
      default:
        return { color: STATUS.accent, label: '', level: 'ok' };
    }
  }

  function sentimentLabel(v) {
    if (v >= 40) return '口碑很好';
    if (v >= 10) return '偏正面';
    if (v > -10) return '中性';
    if (v > -40) return '偏负面';
    if (v > -70) return '很负面';
    return '群情激愤';
  }

  function meter(value, max, color) {
    var pct = U.clamp(value / (max || 100), 0, 1) * 100;
    return h('div', { class: 'meter', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': max || 100, 'aria-valuenow': Math.round(value) },
      h('i', { style: { width: pct + '%', background: color || 'var(--accent)' } }));
  }

  function divMeter(value) {
    var v = U.clamp(value, -100, 100);
    var w = Math.abs(v) / 2;
    var style = v >= 0 ? { left: '50%', width: w + '%', background: 'var(--pos)', borderRadius: '0 99px 99px 0' } : { left: (50 - w) + '%', width: w + '%', background: 'var(--neg)', borderRadius: '99px 0 0 99px' };
    return h('div', { class: 'meter div', role: 'meter', 'aria-valuemin': -100, 'aria-valuemax': 100, 'aria-valuenow': Math.round(v) }, h('i', { style: style }));
  }

  /* Sparkline: de-emphasis line, latest point in the accent, crosshair + tooltip on hover. */
  function sparkline(values, opts) {
    opts = opts || {};
    var W = 120, H = 28, pad = 3;
    var lo = opts.min !== undefined ? opts.min : Math.min.apply(null, values);
    var hi = opts.max !== undefined ? opts.max : Math.max.apply(null, values);
    if (hi - lo < 1) { hi += 1; lo -= 1; }
    var n = values.length;
    var x = function (i) { return n <= 1 ? W / 2 : pad + (i * (W - pad * 2)) / (n - 1); };
    var y = function (v) { return H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2); };
    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    var root = svg('svg', { class: 'spark', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', tabindex: 0, 'aria-label': (opts.label || '') + '趋势' });
    if (opts.zero && lo < 0 && hi > 0) root.appendChild(svg('line', { x1: 0, x2: W, y1: y(0), y2: y(0), style: { stroke: 'var(--axis)', strokeWidth: '1' }, 'vector-effect': 'non-scaling-stroke' }));
    root.appendChild(svg('path', { d: d, fill: 'none', style: { stroke: 'var(--ink-3)', strokeWidth: '2', strokeLinejoin: 'round', strokeLinecap: 'round' }, 'vector-effect': 'non-scaling-stroke' }));
    var cross = svg('line', { y1: 0, y2: H, style: { stroke: 'var(--ink-3)', strokeWidth: '1', display: 'none' }, 'vector-effect': 'non-scaling-stroke' });
    root.appendChild(cross);
    if (n) root.appendChild(svg('circle', { cx: x(n - 1), cy: y(values[n - 1]), r: 2.6, style: { fill: 'var(--accent)', stroke: 'var(--panel-2)', strokeWidth: '1.5' } }));
    var labels = opts.labels || values.map(function (_, i) { return '第' + (i + 1) + '回合'; });
    var fmt = opts.format || function (v) { return String(Math.round(v)); };
    var move = function (clientX, clientY) {
      var r = root.getBoundingClientRect();
      var rel = (clientX - r.left) / Math.max(1, r.width) * W;
      var i = n <= 1 ? 0 : U.clamp(Math.round((rel - pad) / ((W - pad * 2) / (n - 1))), 0, n - 1);
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.style.display = 'block';
      WW.DOM.showTip(clientX, clientY, [h('strong', null, fmt(values[i])), ' ', h('span', { class: 'muted' }, (opts.label ? opts.label + ' · ' : '') + labels[i])]);
    };
    root.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
    root.addEventListener('mouseleave', function () { cross.style.display = 'none'; WW.DOM.hideTip(); });
    root.addEventListener('focus', function () { var r = root.getBoundingClientRect(); move(r.right - 2, r.bottom); });
    root.addEventListener('blur', function () { cross.style.display = 'none'; WW.DOM.hideTip(); });
    return root;
  }

  function deltaClass(d, upGood) {
    if (!d || Math.abs(d) < 0.5) return 'flat';
    if (d > 0) return upGood ? 'up-good' : 'up-bad';
    return upGood ? 'down-bad' : 'down-good';
  }

  /*
   * o: { label, value, display, delta, upGood, history, kind:'div'|'meter', bandStat, fuzzy, wide }
   */
  function statTile(o) {
    var b = o.bandStat ? band(o.bandStat, o.value) : null;
    var deltaText = o.delta === null || o.delta === undefined || Math.abs(o.delta) < 0.5 ? '±0' : (o.delta > 0 ? '▲ ' : '▼ ') + Math.abs(U.round(o.delta, 1));
    var valueText = o.display !== undefined ? o.display : String(Math.round(o.value));
    var tile = h('div', { class: 'tile' + (o.wide ? ' wide' : '') },
      h('div', { class: 't-label' }, o.label, o.hint ? h('span', { class: 'muted tiny' }, o.hint) : null),
      h('div', { class: 't-row' },
        h('span', { class: 't-value' }, valueText),
        o.fuzzy ? null : h('span', { class: 't-delta ' + deltaClass(o.delta, o.upGood), title: '本回合变化' }, deltaText),
        h('span', { class: 'spacer' }),
        b && !o.fuzzy ? h('span', { class: 't-band' }, h('i', { class: 'status-dot', style: { background: b.color } }), b.label) : null,
        b && o.fuzzy ? h('span', { class: 't-band', title: '只能看到大致档位，部署舆情监测后显示精确数值' }, h('i', { class: 'status-dot', style: { background: b.color } })) : null,
        o.kind === 'div' ? h('span', { class: 't-band' }, sentimentLabel(o.value)) : null),
      o.kind === 'div' ? divMeter(o.value) : meter(o.value, 100, b ? b.color : 'var(--accent)'),
      o.history && o.history.length > 1 && !o.fuzzy ? sparkline(o.history, { min: o.kind === 'div' ? -100 : 0, max: 100, zero: o.kind === 'div', label: o.label }) : null);
    return tile;
  }

  function factionBars(list, showValue) {
    return h('div', { class: 'fbars' }, list.map(function (f) {
      var v = U.clamp(f.sentiment, -100, 100);
      var w = Math.abs(v) / 2;
      var fill = v >= 0 ? { left: '50%', width: w + '%', background: 'var(--pos)' } : { left: (50 - w) + '%', width: w + '%', background: 'var(--neg)' };
      var row = h('div', { class: 'fbar', tabindex: 0 },
        h('span', { class: 'fname', title: f.name }, f.name),
        h('div', { class: 'ftrack' }, h('i', { class: 'ffill', style: fill })),
        h('span', { class: 'fval' }, showValue ? String(Math.round(v)) : sentimentLabel(v).slice(0, 2)));
      WW.DOM.hoverTip(row, function () {
        return [h('strong', null, showValue ? String(Math.round(v)) : sentimentLabel(v)), ' ', h('span', { class: 'muted' }, f.name + ' · 占比 ' + Math.round(f.size * 100) + '%'), f.desc ? '\n' + f.desc : ''];
      });
      return row;
    }));
  }

  /* Small-multiple line chart with axis ticks, end label, crosshair tooltip. */
  function lineChart(values, o) {
    o = o || {};
    var W = 260, H = 110, L = 28, R = 30, T = 8, B = 18;
    var lo = o.min !== undefined ? o.min : Math.min.apply(null, values);
    var hi = o.max !== undefined ? o.max : Math.max.apply(null, values);
    var n = values.length;
    var x = function (i) { return n <= 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1); };
    var y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, tabindex: 0, role: 'img', 'aria-label': (o.label || '') + '历史走势' });
    var ticks = o.ticks || [lo, (lo + hi) / 2, hi];
    ticks.forEach(function (t) {
      root.appendChild(svg('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), style: { stroke: t === 0 && lo < 0 ? 'var(--axis)' : 'var(--line)', strokeWidth: '1' } }));
      root.appendChild(svg('text', { x: L - 4, y: y(t) + 3, 'text-anchor': 'end', style: { fill: 'var(--ink-3)', fontSize: '9px' } }, String(Math.round(t))));
    });
    var labels = o.labels || values.map(function (_, i) { return String(i + 1); });
    (n > 1 ? [0, n - 1] : n === 1 ? [0] : []).forEach(function (i) {
      root.appendChild(svg('text', { x: x(i), y: H - 4, 'text-anchor': 'middle', style: { fill: 'var(--ink-3)', fontSize: '9px' } }, labels[i]));
    });
    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    root.appendChild(svg('path', { d: d, fill: 'none', style: { stroke: 'var(--accent)', strokeWidth: '2', strokeLinejoin: 'round', strokeLinecap: 'round' } }));
    if (n) {
      root.appendChild(svg('circle', { cx: x(n - 1), cy: y(values[n - 1]), r: 4, style: { fill: 'var(--accent)', stroke: 'var(--panel)', strokeWidth: '2' } }));
      root.appendChild(svg('text', { x: x(n - 1) + 7, y: y(values[n - 1]) + 3, style: { fill: 'var(--ink)', fontSize: '10px', fontWeight: '600' } }, String(Math.round(values[n - 1]))));
    }
    var cross = svg('line', { y1: T, y2: H - B, style: { stroke: 'var(--ink-3)', strokeWidth: '1', display: 'none' } });
    var dot = svg('circle', { r: 4, style: { fill: 'var(--accent)', stroke: 'var(--panel)', strokeWidth: '2', display: 'none' } });
    root.appendChild(cross);
    root.appendChild(dot);
    var move = function (clientX, clientY) {
      var r = root.getBoundingClientRect();
      var rel = (clientX - r.left) / Math.max(1, r.width) * W;
      var i = n <= 1 ? 0 : U.clamp(Math.round((rel - L) / ((W - L - R) / (n - 1))), 0, n - 1);
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.style.display = 'block';
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(values[i])); dot.style.display = 'block';
      WW.DOM.showTip(clientX, clientY, [h('strong', null, String(U.round(values[i], 1))), ' ', h('span', { class: 'muted' }, (o.label || '') + ' · 第' + labels[i] + '回合')]);
    };
    root.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
    root.addEventListener('mouseleave', function () { cross.style.display = 'none'; dot.style.display = 'none'; WW.DOM.hideTip(); });
    root.addEventListener('focus', function () { var r = root.getBoundingClientRect(); move(r.right - 4, r.top + r.height / 2); });
    root.addEventListener('blur', function () { cross.style.display = 'none'; dot.style.display = 'none'; WW.DOM.hideTip(); });
    return root;
  }

  WW.Charts = { band: band, sentimentLabel: sentimentLabel, meter: meter, divMeter: divMeter, sparkline: sparkline, statTile: statTile, factionBars: factionBars, lineChart: lineChart };
})(window.WW);
