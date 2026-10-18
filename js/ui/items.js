/*
 * Item dialogs: one form per handler type. `preset` may carry a target picked from the feed or an
 * opponent card ({ postId } / { oppId }).
 */
(function (WW) {
  'use strict';

  var h = WW.DOM.h;
  var D = WW.Data;
  var U = WW.U;

  var SHILL_PRESETS = ['事情还在调查中，大家理性看待，别被带节奏', '已经道歉并公布整改措施了，给个机会', '有人在故意带节奏，看看是不是同行在搞事', '老用户力挺，一直以来体验都很好', '一家企业不容易，别一棒子打死'];
  var KOL_PRESETS = ['梳理时间线，把事实和情绪分开看', '对比行业通病，这事没有传的那么夸张', '重点讲整改措施和第三方监督', '分析爆料里站不住脚的地方'];
  var CRITERIA = ['骂得最凶的负面帖子', '营销号和大V发的负面帖', '传播谣言、“网传”“据说”的帖子', '截图流传的帖子', '苦主的维权帖'];

  function seg(options, value, onChange) {
    var el = h('div', { class: 'seg' });
    options.forEach(function (o) {
      el.appendChild(h('button', { class: o.value === value ? 'on' : '', type: 'button', on: { click: function () {
        Array.prototype.forEach.call(el.children, function (b) { b.classList.remove('on'); });
        this.classList.add('on');
        onChange(o.value);
      } } }, o.label));
    });
    return el;
  }

  function chips(list, onPick) {
    return h('div', { class: 'row wrap', style: { gap: '4px' } }, list.map(function (t) {
      return h('span', { class: 'chip click', tabindex: 0, on: { click: function () { onPick(t); }, keydown: function (e) { if (e.key === 'Enter') onPick(t); } } }, t);
    }));
  }

  function postLabel(p) {
    return '[' + (D.platforms[p.platform] || {}).name + '] ' + p.author.name + '：' + (p.title || p.content).slice(0, 40);
  }

  function postOptions(game, filter) {
    return WW.Feed.ranked(game.state, 'all').filter(function (p) { return p.status !== 'deleted' && !p.isClient && (!filter || filter(p)); }).slice(0, 25);
  }

  function header(item, status) {
    return h('div', { class: 'col', style: { gap: '4px' } },
      h('div', { class: 'small sub' }, item.desc || ''),
      item.risk ? h('div', { class: 'small', style: { color: 'var(--crit-ink)' } }, '风险：' + item.risk) : null,
      h('div', { class: 'tiny muted' }, (WW.Data.tierNames[item.tier] || '') + '道具 · ' + item.ap + ' 行动点' + (item.cooldown ? ' · 冷却 ' + item.cooldown + ' 回合' : '') + (status.usesLeft !== null ? ' · 剩余 ' + status.usesLeft + ' 次' : '') + (status.voucher ? ' · 有免费券 ×' + status.voucher : '')));
  }

  function open(ui, id, preset) {
    var game = ui.game;
    var item = game.items[id];
    if (!item) return;
    preset = preset || {};
    if (item.handler === 'statement') return WW.StatementUI.open(ui, preset);
    var status = game.itemStatus(id, preset);
    if (!status.usable) { WW.DOM.toast('「' + item.name + '」' + status.reason, 'warn'); return; }

    var params = {};
    Object.keys(preset).forEach(function (k) { params[k] = preset[k]; });
    var costLine = h('div', { class: 'small' });
    var form = h('div', { class: 'col', style: { gap: '12px' } });
    var okBtn = h('button', { class: 'btn primary' }, '执行');
    var refreshCost = function () {
      var c = WW.Items.cost(game, id, params);
      var st = game.itemStatus(id, params);
      costLine.textContent = '花费：' + (st.voucher ? '免费券' : U.fmtMoney(c)) + ' · 当前预算 ' + U.fmtMoney(game.state.budget);
      okBtn.disabled = !st.voucher && c > game.state.budget + 1e-9;
    };

    var buildTargetPicker = function (allowPosts, allowOpps, postFilter) {
      var opps = Object.keys(game.state.opponents).map(function (k) { return game.state.opponents[k]; }).filter(function (o) { return o.active; });
      var mode = params.oppId ? 'opp' : (allowPosts ? 'post' : 'opp');
      var wrap = h('div', { class: 'col' });
      var render = function () {
        var sel;
        if (mode === 'post') {
          var posts = postOptions(game, postFilter);
          if (!params.postId && posts[0]) params.postId = posts[0].id;
          sel = h('select', { class: 'input', on: { change: function () { params.postId = sel.value; refreshCost(); } } },
            posts.map(function (p) { return h('option', { value: p.id, selected: p.id === params.postId }, postLabel(p)); }));
          delete params.oppId;
        } else {
          if (!params.oppId && opps[0]) params.oppId = opps[0].id;
          sel = h('select', { class: 'input', on: { change: function () { params.oppId = sel.value; refreshCost(); } } },
            opps.map(function (o) { return h('option', { value: o.id, selected: o.id === params.oppId }, o.avatar + ' ' + o.name); }));
          delete params.postId;
        }
        WW.DOM.replace(wrap,
          allowPosts && allowOpps ? seg([{ value: 'post', label: '针对帖子' }, { value: 'opp', label: '针对对手' }], mode, function (v) { mode = v; render(); refreshCost(); }) : null,
          sel);
        refreshCost();
      };
      render();
      return h('div', { class: 'field' }, h('label', null, '目标'), wrap);
    };

    var run = function () {
      okBtn.disabled = true;
      ui.act(id, params).then(function (r) {
        if (r.ok) m.close();
        else okBtn.disabled = false;
      });
    };

    switch (item.handler) {
      case 'shill': {
        params.tier = params.tier || 'normal';
        params.count = params.count || item.params.counts[1] || item.params.counts[0];
        var dir = h('textarea', { class: 'input', rows: 3, placeholder: '例如：事情还在调查中，大家理性看待' });
        dir.addEventListener('input', function () { params.direction = dir.value; });
        form.appendChild(h('div', { class: 'field' }, h('label', null, '水军档次'),
          seg(item.params.tiers.map(function (t) { return { value: t.id, label: t.name + '（¥' + t.price + '万/百条）' }; }), params.tier, function (v) { params.tier = v; refreshCost(); }),
          h('div', { class: 'tiny muted' }, item.params.tiers.map(function (t) { return t.name + '：' + t.desc; }).join('；'))));
        form.appendChild(h('div', { class: 'field' }, h('label', null, '数量'),
          seg(item.params.counts.map(function (c) { return { value: c, label: c + ' 条' }; }), params.count, function (v) { params.count = v; refreshCost(); })));
        form.appendChild(h('div', { class: 'field' }, h('label', null, '节奏方向（AI 会照这个方向生成评论，并评估说服力与违和感）'), dir,
          chips(SHILL_PRESETS, function (t) { dir.value = t; params.direction = t; })));
        break;
      }
      case 'delete':
      case 'throttle': {
        var crit = h('input', { class: 'input', placeholder: '用一句话描述要处理的帖子，例如：晒出病历的帖子', value: params.criterion || '' });
        var list = h('div', { class: 'cand-list' }, h('div', { class: 'empty' }, '写好条件后点「AI 筛选」。'));
        var selected = {};
        var scanBtn = h('button', { class: 'btn accent', type: 'button' }, item.handler === 'delete' ? '🔎 AI 筛选' : '🔎 AI 筛选');
        var renderCands = function (prev) {
          selected = {};
          if (!prev || !prev.candidates.length) { WW.DOM.replace(list, h('div', { class: 'empty' }, '没有符合条件的帖子，换个说法试试。')); params.ids = []; refreshCost(); return; }
          WW.DOM.replace(list, prev.candidates.map(function (c) {
            var cb = h('input', { type: 'checkbox', checked: !c.immune, disabled: c.immune });
            if (!c.immune) selected[c.id] = true;
            cb.addEventListener('change', function () { if (cb.checked) selected[c.id] = true; else delete selected[c.id]; params.ids = Object.keys(selected); refreshCost(); });
            return h('label', { class: 'cand' }, cb,
              h('div', null, h('div', null, postLabel(c.post)), h('div', { class: 'why' }, (c.reason || '') + (c.immune ? ' · 删不掉/限不了（官方媒体或外网）' : ''))),
              h('span', { class: 'small num' }, c.immune ? '—' : U.fmtMoney(c.cost)));
          }));
          params.ids = Object.keys(selected);
          refreshCost();
        };
        scanBtn.addEventListener('click', function () {
          if (!crit.value.trim()) { WW.DOM.toast('先写筛选条件', 'warn'); return; }
          params.criterion = crit.value.trim();
          scanBtn.disabled = true;
          WW.DOM.replace(list, h('div', { class: 'empty' }, h('span', { class: 'spinner' }), ' 正在筛选……'));
          game.preview(id, { criterion: params.criterion }).then(function (prev) {
            scanBtn.disabled = false;
            if (prev && prev.source === 'offline' && WW.AI.enabledFor('posts.classify')) WW.DOM.toast('AI 筛选失败，已改用关键词匹配', 'warn');
            renderCands(prev);
          }, function (e) {
            scanBtn.disabled = false;
            WW.DOM.toast('筛选失败：' + e.message, 'bad');
          });
        });
        form.appendChild(h('div', { class: 'field' }, h('label', null, '筛选条件'), h('div', { class: 'row' }, crit, scanBtn), chips(CRITERIA, function (t) { crit.value = t; })));
        form.appendChild(list);
        params.ids = [];
        if (preset.postId) {
          var pp = WW.Feed.find(game.state, preset.postId);
          if (pp) {
            params.criterion = '手动选择：' + pp.author.name;
            renderCands({ candidates: [{ id: pp.id, post: pp, reason: '手动选择', cost: WW.Actions.deleteCost(pp) === null ? null : U.round(WW.Actions.deleteCost(pp) * ((item.params && item.params.priceMul) || 1), 1), immune: WW.Actions.deleteCost(pp) === null || (item.handler === 'throttle' && pp.platform === 'overseas') }] });
          }
        }
        break;
      }
      case 'control': {
        form.appendChild(buildTargetPicker(true, false, function (p) { return !p.controlled; }));
        var cd = h('input', { class: 'input', placeholder: '（可选）热评方向，例如：强调已经整改' });
        cd.addEventListener('input', function () { params.direction = cd.value; });
        form.appendChild(h('div', { class: 'field' }, h('label', null, '热评方向'), cd));
        break;
      }
      case 'legal':
        form.appendChild(buildTargetPicker(true, true));
        form.appendChild(h('div', { class: 'small muted' }, '提示：给苦主或维权群体发律师函几乎必然引发众怒。'));
        break;
      case 'iron_fist':
        form.appendChild(buildTargetPicker(true, true));
        form.appendChild(h('div', { class: 'small muted' }, '铁拳只砸真违规：造谣、侵犯隐私、人身攻击。举报说真话的人会失败，还可能让监管反查客户。'));
        break;
      case 'expose':
      case 'coopt':
        form.appendChild(buildTargetPicker(false, true));
        if (item.handler === 'coopt') form.appendChild(h('div', { class: 'small muted' }, '价格随对手势力浮动；维权群体、粉丝团这类对手收买不了。'));
        break;
      case 'investigate':
      case 'endorse': {
        var facts = Object.keys(game.state.facts).map(function (k) { return game.state.facts[k]; }).filter(function (f) {
          if (!(f.public || f.revealed)) return false;
          return item.handler === 'investigate' ? !f.known : !f.refuted && !f.revealed;
        });
        if (!facts.length) { WW.DOM.toast('没有可以操作的事项', 'warn'); return; }
        params.factId = params.factId || facts[0].id;
        var fs = h('select', { class: 'input', on: { change: function () { params.factId = fs.value; } } },
          facts.map(function (f) { return h('option', { value: f.id }, f.text + (f.clientClaim ? '（客户口径：' + f.clientClaim + '）' : '')); }));
        form.appendChild(h('div', { class: 'field' }, h('label', null, item.handler === 'investigate' ? '要核实的事项' : '要证伪的指控'), fs));
        break;
      }
      case 'settle':
        params.scale = params.scale || item.params.scales[1].id;
        form.appendChild(h('div', { class: 'field' }, h('label', null, '方案'),
          seg(item.params.scales.map(function (s) { return { value: s.id, label: s.name + '（¥' + s.price + '万）' }; }), params.scale, function (v) { params.scale = v; refreshCost(); })));
        break;
      case 'kol': {
        params.tier = params.tier || item.params.tiers[0].id;
        var brief = h('textarea', { class: 'input', rows: 3, placeholder: '告诉 KOL 要往哪个方向写' });
        brief.addEventListener('input', function () { params.brief = brief.value; });
        form.appendChild(h('div', { class: 'field' }, h('label', null, '合作对象'),
          seg(item.params.tiers.map(function (t) { return { value: t.id, label: t.name + '（¥' + t.price + '万）' }; }), params.tier, function (v) { params.tier = v; refreshCost(); })));
        form.appendChild(h('div', { class: 'field' }, h('label', null, 'Brief'), brief, chips(KOL_PRESETS, function (t) { brief.value = t; params.brief = t; })));
        break;
      }
      case 'distraction': {
        var hint = h('input', { class: 'input', placeholder: '（可选）想要什么样的瓜：娱乐八卦、社会新闻……' });
        hint.addEventListener('input', function () { params.hint = hint.value; });
        form.appendChild(h('div', { class: 'field' }, h('label', null, '偏好'), hint));
        break;
      }
      case 'custom_ai': {
        var ins = h('textarea', { class: 'input', rows: 3, placeholder: (item.effect && item.effect.inputLabel) || '具体指示（可选）' });
        ins.addEventListener('input', function () { params.instruction = ins.value; });
        form.appendChild(h('div', { class: 'field' }, h('label', null, (item.effect && item.effect.inputLabel) || '指示'), ins));
        break;
      }
      default:
        form.appendChild(h('div', { class: 'small sub' }, '确认执行「' + item.name + '」？'));
    }

    okBtn.addEventListener('click', run);
    var m = WW.DOM.modal({
      title: item.icon + ' ' + item.name,
      wide: item.handler === 'delete' || item.handler === 'throttle',
      body: h('div', { class: 'col', style: { gap: '14px' } }, header(item, status), form, costLine),
      footer: [h('button', { class: 'btn', on: { click: function () { m.close(); } } }, '取消'), okBtn]
    });
    refreshCost();
    return m;
  }

  WW.ItemUI = { open: open };
})(window.WW);
