/*
 * Editor field metadata: every section of the level form is described here and rendered by
 * forms.js. Keys are paths into the raw level JSON; list fields use paths relative to the item.
 * `options` may name a dynamic source resolved against the current level (see forms.js).
 */
(function (WW) {
  'use strict';

  var U = WW.U;
  var D = WW.Data;

  function nextId(list, prefix) {
    var n = (list || []).length + 1;
    var ids = (list || []).map(function (x) { return x.id; });
    while (ids.indexOf(prefix + n) >= 0) n++;
    return prefix + n;
  }

  var STANCES = [{ value: -2, label: '-2 强烈负面' }, { value: -1, label: '-1 负面' }, { value: 0, label: '0 中立' }, { value: 1, label: '1 偏正面' }, { value: 2, label: '2 强烈支持' }];

  var EFFECT_FIELDS = { type: 'effects' };

  var sections = [
    {
      id: 'meta', title: '基本信息', icon: '🏷',
      desc: '关卡在选关界面的展示信息。关卡 ID 用作存档与成绩的键，导出文件名也用它。',
      fields: [
        { key: 'id', label: '关卡 ID', type: 'text', help: '小写英文、数字、下划线' },
        { key: 'meta.title', label: '标题', type: 'text' },
        { key: 'meta.subtitle', label: '副标题', type: 'text' },
        { key: 'meta.cover', label: '封面 Emoji', type: 'text' },
        { key: 'meta.difficulty', label: '难度星级（1-5）', type: 'number', min: 1, max: 5 },
        { key: 'meta.order', label: '排序', type: 'number' },
        { key: 'meta.author', label: '作者', type: 'text' },
        { key: 'meta.tags', label: '标签', type: 'tags' },
        { key: 'meta.description', label: '简介', type: 'textarea', full: true }
      ]
    },
    {
      id: 'client', title: '委托方', icon: '💼',
      desc: '客户的人设决定 AI 写的客户巨信；红线会被 AI 评审（离线时用关键词）检查；阶段期望未达成会扣满意度。',
      fields: [
        { key: 'client.name', label: '委托方名称', type: 'text' },
        { key: 'client.contact', label: '联系人', type: 'text' },
        { key: 'client.acceptsRectify', label: '能接受真诚整改（不会因此大怒）', type: 'bool' },
        { key: 'client.persona', label: '人设', type: 'textarea', full: true },
        { key: 'client.intro', label: '开场白', type: 'textarea', full: true },
        {
          key: 'client.demands', label: '客户红线', type: 'list', full: true,
          itemTitle: function (it) { return it.text || '红线'; },
          newItem: function (lv) { return { id: nextId(lv.client && lv.client.demands, 'demand'), text: '', keywords: [], penalty: 12 }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'text', label: '描述', type: 'text' },
            { key: 'keywords', label: '触发关键词（离线判定用）', type: 'tags' },
            { key: 'penalty', label: '违反扣满意度', type: 'number' }
          ]
        },
        {
          key: 'client.expectations', label: '阶段期望', type: 'list', full: true,
          itemTitle: function (it) { return '第 ' + (it.byTurn || '?') + ' 回合：' + (it.text || ''); },
          newItem: function (lv) { return { id: nextId(lv.client && lv.client.expectations, 'expect'), byTurn: 3, condition: { var: 'stats.heat', op: '<=', value: 60 }, penalty: 8, text: '' }; },
          fields: [
            { key: 'byTurn', label: '检查回合', type: 'number' },
            { key: 'penalty', label: '未达成扣满意度', type: 'number' },
            { key: 'text', label: '客户抱怨', type: 'text', full: true },
            { key: 'condition', label: '期望条件', type: 'cond', full: true }
          ]
        }
      ]
    },
    {
      id: 'truth', title: '事件与真相', icon: '🔍',
      desc: '每条事实都有“客户口径”和隐藏真相。否认真事会记谎言债，证据曝光时打脸；否认谣言则在真相大白时得到印证。标记“违规把柄”的真事实可被对手召唤铁拳。',
      fields: [
        { key: 'incident.summary', label: '事件概要', type: 'textarea', full: true },
        { key: 'incident.background', label: '背景', type: 'textarea', full: true },
        { key: 'incident.keywords', label: '关键词', type: 'tags' },
        { key: 'incident.severity', label: '严重程度（0-100）', type: 'number', min: 0, max: 100 },
        {
          key: 'facts', label: '事实与真相', type: 'list', full: true,
          itemTitle: function (it) { return (it.isTrue ? '【真】' : '【假】') + (it.text || '新事实'); },
          newItem: function (lv) { return { id: nextId(lv.facts, 'f'), text: '', clientClaim: '', isTrue: true, regulatory: false, weight: 1, keywords: [] }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'text', label: '指控内容', type: 'text', full: true },
            { key: 'clientClaim', label: '客户口径', type: 'text', full: true },
            { key: 'isTrue', label: '真相：属实', type: 'bool' },
            { key: 'regulatory', label: '违规把柄（可被铁拳）', type: 'bool' },
            { key: 'publicAtStart', label: '开局即已公开', type: 'bool', def: true },
            { key: 'weight', label: '分量（0.5-3）', type: 'number', step: 0.5 },
            { key: 'keywords', label: '关键词', type: 'tags' },
            { key: 'tags', label: '标记（如 management）', type: 'tags' },
            {
              key: 'evidence', label: '证据时间线', type: 'object', optional: true, full: true,
              newValue: function () { return { turn: 4, chance: 0.7, source: '知情人', suppressBy: [] }; },
              fields: [
                { key: 'turn', label: '最早曝光回合', type: 'number' },
                { key: 'chance', label: '每回合曝光概率', type: 'number', step: 0.05, min: 0, max: 1 },
                { key: 'source', label: '曝光来源', type: 'text' },
                { key: 'suppressBy', label: '可被这些手段推迟', type: 'multi', options: [{ value: 'delete', label: '删帖' }, { value: 'settle', label: '和解' }, { value: 'legal', label: '律师函' }] }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'contract', title: '合同 · 数值 · 难度', icon: '📑',
      desc: '回合数、预算、行动点与开局数值。难度档位在引擎默认修正之上还可以按关卡覆盖。',
      fields: [
        { key: 'contract.turns', label: '回合数', type: 'number', min: 1, max: 30 },
        { key: 'contract.actionPoints', label: '每回合行动点', type: 'number', min: 1, max: 9 },
        { key: 'contract.budget', label: '初始预算（万元）', type: 'number' },
        { key: 'contract.slotsPerDay', label: '每天回合数', type: 'select', options: [{ value: 1, label: '1（按天）' }, { value: 2, label: '2（白天/深夜）' }, { value: 3, label: '3（上午/下午/深夜）' }] },
        { key: 'contract.turnLabels', label: '自定义回合名（可选）', type: 'tags', full: true },
        { key: 'initialStats.sentiment', label: '开局舆论好感（-100~100）', type: 'number', min: -100, max: 100 },
        { key: 'initialStats.heat', label: '开局热度', type: 'number', min: 0, max: 100 },
        { key: 'initialStats.credibility', label: '开局公信力', type: 'number', min: 0, max: 100 },
        { key: 'initialStats.exposure', label: '开局暴露度', type: 'number', min: 0, max: 100 },
        { key: 'initialStats.satisfaction', label: '开局客户满意度', type: 'number', min: 0, max: 100 },
        { key: 'difficulty.allowed', label: '开放的难度', type: 'multi', options: 'difficulties', full: true },
        { key: 'difficulty.overrides', label: '难度覆盖（JSON，如 {"gold":{"budgetMul":0.6}}）', type: 'json', full: true },
        {
          key: 'tuning', label: '演化参数', type: 'object', full: true,
          fields: [
            { key: 'heatDecay', label: '热度衰减率', type: 'number', step: 0.01 },
            { key: 'pressureWeight', label: '舆论压力权重', type: 'number' },
            { key: 'credibilityWeight', label: '公信力权重', type: 'number', step: 0.05 },
            { key: 'severityWeight', label: '严重度权重', type: 'number', step: 0.05 },
            { key: 'spreadWeight', label: '负面扩散权重', type: 'number' },
            { key: 'exposureCooldown', label: '暴露度自然冷却', type: 'number' },
            { key: 'detectBase', label: '被扒基础概率', type: 'number', step: 0.05 },
            { key: 'randomEventChance', label: '随机事件概率', type: 'number', step: 0.05 },
            { key: 'organicPosts', label: '每回合自然发帖规模', type: 'number' },
            { key: 'driftRate', label: '阵营漂移速率', type: 'number', step: 0.05 },
            { key: 'pressureBaseline', label: '舆论压力基线（分母常数）', type: 'number' },
            { key: 'maxFeed', label: '舆论场最多保留帖子数', type: 'number' }
          ]
        }
      ]
    },
    {
      id: 'factions', title: '受众阵营', icon: '👥',
      desc: '舆论好感 = 各阵营好感按人口加权。敏感系数决定各类手段对该阵营的效果，负数表示反感（会反噬）。留空则使用默认 6 阵营。',
      fields: [
        {
          key: 'factions', label: '阵营', type: 'list', full: true, defaultsFrom: function () { return U.deepClone(D.defaultFactions); },
          itemTitle: function (it) { return (it.name || '阵营') + ' · 占比 ' + Math.round((it.size || 0) * 100) + '%'; },
          newItem: function (lv) { return { id: nextId(lv.factions, 'faction'), name: '新阵营', size: 0.1, sentiment: 0, volatility: 0.3, bias: 0, desc: '', sens: {} }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'name', label: '名称', type: 'text' },
            { key: 'size', label: '人口占比（0-1）', type: 'number', step: 0.01 },
            { key: 'sentiment', label: '开局好感', type: 'number' },
            { key: 'bias', label: '长期倾向（偏置）', type: 'number' },
            { key: 'volatility', label: '波动性（0-1）', type: 'number', step: 0.05 },
            { key: 'desc', label: '描述', type: 'text', full: true },
            { key: 'sens', label: '对各类手段的敏感系数', type: 'sens', full: true }
          ]
        }
      ]
    },
    {
      id: 'people', title: '平台与网民', icon: '📱',
      desc: '启用的平台决定信息流标签页；网民画像是常驻账号，AI 和离线规则都会优先用它们发帖。',
      fields: [
        { key: 'platforms', label: '启用的平台', type: 'multi', options: 'platforms', full: true },
        {
          key: 'personas', label: '网民画像', type: 'list', full: true,
          itemTitle: function (it) { return (it.name || '网民') + ' · ' + ((D.tiers[it.tier] || {}).name || ''); },
          newItem: function (lv) { return { id: nextId(lv.personas, 'p'), name: '', faction: 'passerby', tier: 'normal', platform: 'weibo', style: '' }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'name', label: '网名', type: 'text' },
            { key: 'faction', label: '阵营', type: 'select', options: 'factions' },
            { key: 'tier', label: '影响力', type: 'select', options: 'tiers' },
            { key: 'platform', label: '常驻平台', type: 'select', options: 'platforms' },
            { key: 'opp', label: '归属对手（可选）', type: 'select', options: 'opponents', empty: '（无）' },
            { key: 'style', label: '说话风格', type: 'text', full: true }
          ]
        }
      ]
    },
    {
      id: 'seed', title: '初始舆论', icon: '🗞',
      desc: '开局时舆论场里已有的帖子。关联事实后，删帖、铁拳判定、打脸都会用到它。',
      fields: [
        {
          key: 'seedPosts', label: '初始帖子', type: 'list', full: true,
          itemTitle: function (it) { return (it.author || it.persona || '网友') + '：' + String(it.content || '').slice(0, 30); },
          newItem: function () { return { persona: null, author: '', tier: 'normal', faction: 'passerby', platform: 'weibo', stance: -1, fact: null, likes: 0, tags: [], content: '' }; },
          fields: [
            { key: 'persona', label: '网民画像（可选）', type: 'select', options: 'personas', empty: '（不用画像）' },
            { key: 'author', label: '或直接填作者名', type: 'text' },
            { key: 'tier', label: '影响力', type: 'select', options: 'tiers' },
            { key: 'faction', label: '阵营', type: 'select', options: 'factions' },
            { key: 'platform', label: '平台', type: 'select', options: 'platforms' },
            { key: 'stance', label: '立场', type: 'select', options: STANCES },
            { key: 'fact', label: '关联事实', type: 'select', options: 'facts', empty: '（无）' },
            { key: 'opp', label: '对手账号（可选）', type: 'select', options: 'opponents', empty: '（无）' },
            { key: 'likes', label: '点赞数（0=自动）', type: 'number' },
            { key: 'tags', label: '标签', type: 'tags' },
            { key: 'content', label: '内容', type: 'textarea', full: true },
            { key: 'comments', label: '热评（每行一条）', type: 'lines', full: true }
          ]
        }
      ]
    },
    {
      id: 'items', title: '技能', icon: '🧰',
      desc: '从技能库里选择本关可用的技能；技能按层级随主任务阶段解锁，也可以单独写解锁条件；还能写只属于本关的“自定义 AI 技能”。',
      fields: [
        { key: 'items.enabled', label: '启用的库技能', type: 'multi', options: 'libraryItems', full: true },
        { key: 'items.startTier', label: '开局已解锁的层级', type: 'select', options: [{ value: 1, label: '1 基础' }, { value: 2, label: '2 进阶' }, { value: 3, label: '3 高阶' }] },
        { key: 'items.unlocks', label: '单独解锁条件', type: 'condMap', options: 'items', full: true },
        { key: 'items.overrides', label: '参数覆盖（JSON，如 {"rectify":{"tier":2,"name":"全面整改"}}）', type: 'json', full: true },
        {
          key: 'items.custom', label: '自定义 AI 技能', type: 'list', full: true,
          itemTitle: function (it) { return (it.icon || '✨') + ' ' + (it.name || '新技能'); },
          newItem: function (lv) {
            return { id: nextId(lv.items && lv.items.custom, 'custom'), name: '新技能', icon: '✨', tier: 1, ap: 1, cost: 5, channel: 'statement', desc: '', risk: '',
              effect: { prompt: '', inputLabel: '', bounds: { sentiment: [-4, 8], heat: [-6, 6], exposure: [0, 6] }, offlineDeltas: null, posts: 2, stance: 1, effects: [] } };
          },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'name', label: '名称', type: 'text' },
            { key: 'icon', label: '图标', type: 'text' },
            { key: 'tier', label: '层级', type: 'select', options: [{ value: 1, label: '1 基础' }, { value: 2, label: '2 进阶' }, { value: 3, label: '3 高阶' }] },
            { key: 'ap', label: '行动点', type: 'number' },
            { key: 'cost', label: '价格（万元）', type: 'number' },
            { key: 'cooldown', label: '冷却回合', type: 'number' },
            { key: 'maxUses', label: '次数上限（0=不限）', type: 'number' },
            { key: 'channel', label: '作用渠道', type: 'select', options: 'channels' },
            { key: 'desc', label: '描述', type: 'text', full: true },
            { key: 'risk', label: '风险说明', type: 'text', full: true },
            { key: 'effect.prompt', label: '给 AI 的技能规则', type: 'textarea', full: true },
            { key: 'effect.inputLabel', label: '玩家输入框提示', type: 'text' },
            { key: 'effect.posts', label: '生成帖子数', type: 'number' },
            { key: 'effect.stance', label: '帖子立场', type: 'select', options: STANCES },
            { key: 'effect.bounds', label: '数值上下限（JSON，如 {"sentiment":[-4,8]}）', type: 'json', full: true },
            { key: 'effect.offlineDeltas', label: '离线时的固定数值（JSON，可留空）', type: 'json', full: true },
            { key: 'effect.effects', label: '附加效果', type: 'effects', full: true }
          ]
        }
      ]
    },
    {
      id: 'objectives', title: '主任务与子任务', icon: '🏁',
      desc: '主任务分阶段推进：阶段内必做子任务全部完成即进入下一阶段并发放阶段奖励（常用来解锁技能层级、追加预算）。可选子任务和支线提供额外奖励。',
      fields: [
        {
          key: 'objectives.stages', label: '主任务阶段', type: 'list', full: true,
          defaultsFrom: function (lv) { return WW.Schema.stageDefaults((lv.contract && lv.contract.budget) || 80); },
          itemTitle: function (it, i) { return '阶段 ' + (i + 1) + '：' + (it.title || ''); },
          newItem: function (lv) { var st = (lv.objectives && lv.objectives.stages) || []; return { id: nextId(st, 'stage'), title: '新阶段', desc: '', rewards: [], tasks: [] }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'title', label: '名称', type: 'text' },
            { key: 'desc', label: '说明', type: 'text', full: true },
            { key: 'rewards', label: '阶段奖励', type: 'effects', full: true },
            {
              key: 'tasks', label: '子任务', type: 'list', full: true,
              itemTitle: function (it) { return (it.required === false ? '◇ ' : '○ ') + (it.title || '子任务'); },
              newItem: function () { return { id: 'task_' + Date.now().toString(36), title: '', required: true, complete: { var: 'stats.heat', op: '<=', value: 50 }, rewards: [] }; },
              fields: [
                { key: 'id', label: 'ID', type: 'text' },
                { key: 'title', label: '标题', type: 'text' },
                { key: 'required', label: '必做', type: 'bool', def: true },
                { key: 'hidden', label: '隐藏（完成后才显示）', type: 'bool' },
                { key: 'deadline', label: '期限回合（0=无）', type: 'number' },
                { key: 'at', label: '判定时机', type: 'select', options: [{ value: '', label: '随时' }, { value: 'end', label: '结案时' }] },
                { key: 'complete', label: '完成条件', type: 'cond', full: true },
                { key: 'fail', label: '失败条件（可选）', type: 'cond', full: true },
                { key: 'rewards', label: '奖励', type: 'effects', full: true }
              ]
            }
          ]
        },
        {
          key: 'objectives.side', label: '支线 / 额外委托', type: 'list', full: true,
          itemTitle: function (it) { return '📌 ' + (it.title || '支线'); },
          newItem: function () { return { id: 'side_' + Date.now().toString(36), title: '', desc: '', from: 'client', offer: 'start', choice: false, complete: null, rewards: [], penalty: [] }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'title', label: '标题', type: 'text' },
            { key: 'from', label: '发布者', type: 'select', options: [{ value: 'client', label: '客户' }, { value: 'system', label: '系统' }] },
            { key: 'choice', label: '需玩家接受', type: 'bool' },
            { key: 'hidden', label: '隐藏成就', type: 'bool' },
            { key: 'deadline', label: '期限回合（0=无）', type: 'number' },
            { key: 'at', label: '判定时机', type: 'select', options: [{ value: '', label: '随时' }, { value: 'end', label: '结案时' }] },
            { key: 'desc', label: '说明', type: 'text', full: true },
            { key: 'offer', label: '发放时机', type: 'offer', full: true },
            { key: 'complete', label: '完成条件', type: 'cond', full: true },
            { key: 'fail', label: '失败条件（可选）', type: 'cond', full: true },
            { key: 'rewards', label: '奖励', type: 'effects', full: true },
            { key: 'penalty', label: '失败惩罚', type: 'effects', full: true }
          ]
        }
      ]
    },
    {
      id: 'opponents', title: '对手盘与技能', icon: '🎯',
      desc: '对手按意图出招：每回合从可用技能里按“权重 × 局势”选择。经典技能来自技能库，也可以在下方定义本关专属技能（用效果列表实现）。',
      fields: [
        {
          key: 'opponents', label: '对手', type: 'list', full: true,
          itemTitle: function (it) { return (it.avatar || '👤') + ' ' + (it.name || '对手'); },
          newItem: function (lv) { return { id: nextId(lv.opponents, 'opp'), name: '新对手', avatar: '👤', desc: '', faction: 'rival', kind: 'group', strength: 50, morale: 60, resources: 20, income: 6, cooptable: true, platform: 'weibo', abilities: [{ use: 'black_traffic', weight: 2 }], events: [], rumors: [], pastScandals: [], dirt: [] }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'name', label: '名称', type: 'text' },
            { key: 'avatar', label: '头像 Emoji', type: 'text' },
            { key: 'kind', label: '类型', type: 'select', options: [{ value: 'brand', label: '品牌' }, { value: 'group', label: '群体' }, { value: 'person', label: '个人' }, { value: 'victims', label: '受害者群体（不可收买、律师函=灾难）' }] },
            { key: 'faction', label: '关联阵营', type: 'select', options: 'factions' },
            { key: 'platform', label: '主场平台', type: 'select', options: 'platforms' },
            { key: 'strength', label: '势力', type: 'number' },
            { key: 'morale', label: '士气', type: 'number' },
            { key: 'resources', label: '初始资源', type: 'number' },
            { key: 'income', label: '每回合资源', type: 'number' },
            { key: 'cooptable', label: '可被招安（受害者群体始终不可）', type: 'bool', def: true },
            { key: 'startActive', label: '开局即在场', type: 'bool', def: true },
            { key: 'desc', label: '描述', type: 'text', full: true },
            { key: 'enterWhen', label: '入场条件（开局不在场时）', type: 'cond', full: true },
            {
              key: 'abilities', label: '技能', type: 'list', full: true,
              itemTitle: function (it) { var a = D.abilities[it.use]; return (a ? a.icon + ' ' + a.name : it.use || '技能') + (it.weight ? ' · 权重 ' + it.weight : ''); },
              newItem: function () { return { use: 'mass_report', weight: 2 }; },
              fields: [
                { key: 'use', label: '技能', type: 'select', options: 'abilities' },
                { key: 'weight', label: '权重（留空=默认）', type: 'number' },
                { key: 'cooldown', label: '冷却（留空=默认）', type: 'number' },
                { key: 'condition', label: '额外条件（与技能自带的使用条件同时满足）', type: 'cond', full: true },
                { key: 'overrides', label: '参数覆盖（JSON）', type: 'json', full: true }
              ]
            },
            { key: 'rumors', label: '会散布的谣言（造谣带节奏用）', type: 'lines', full: true },
            { key: 'dirt', label: '对手的把柄（反向扒皮用）', type: 'lines', full: true },
            {
              key: 'pastScandals', label: '客户黑历史（翻旧账用）', type: 'list', full: true,
              itemTitle: function (it) { return (it.isTrue === false ? '【假】' : '【真】') + (it.text || ''); },
              newItem: function () { return { text: '', isTrue: true }; },
              fields: [{ key: 'text', label: '内容', type: 'text', full: true }, { key: 'isTrue', label: '属实', type: 'bool', def: true }]
            },
            {
              key: 'events', label: '专属事件', type: 'list', full: true,
              itemTitle: function (it) { return it.title || '事件'; },
              newItem: function () { return { id: 'oe_' + Date.now().toString(36), title: '', trigger: { var: 'turn', op: '>=', value: 3 }, chance: 1, once: true, effects: [] }; },
              fields: [
                { key: 'id', label: 'ID', type: 'text' },
                { key: 'title', label: '标题', type: 'text' },
                { key: 'chance', label: '概率', type: 'number', step: 0.05 },
                { key: 'once', label: '只触发一次', type: 'bool', def: true },
                { key: 'trigger', label: '触发条件', type: 'cond', full: true },
                { key: 'effects', label: '效果', type: 'effects', full: true }
              ]
            }
          ]
        },
        {
          key: 'abilities', label: '本关专属技能', type: 'list', full: true,
          itemTitle: function (it) { return (it.icon || '⚡') + ' ' + (it.name || '技能'); },
          newItem: function (lv) { return { id: nextId(lv.abilities, 'ability'), name: '新技能', icon: '⚡', category: '攻击', desc: '', counter: '', cost: 6, cooldown: 2, weight: 2, condition: null, effects: [{ type: 'stat', stat: 'heat', delta: 5 }], posts: 1, stance: -2, aiHint: '' }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'name', label: '名称', type: 'text' },
            { key: 'icon', label: '图标', type: 'text' },
            { key: 'category', label: '类别', type: 'text' },
            { key: 'cost', label: '资源消耗', type: 'number' },
            { key: 'cooldown', label: '冷却', type: 'number' },
            { key: 'weight', label: '权重', type: 'number' },
            { key: 'posts', label: '生成帖子数', type: 'number' },
            { key: 'stance', label: '帖子立场', type: 'select', options: STANCES },
            { key: 'desc', label: '描述', type: 'text', full: true },
            { key: 'counter', label: '玩家应对提示', type: 'text', full: true },
            { key: 'aiHint', label: '给 AI 的发帖提示', type: 'text', full: true },
            { key: 'condition', label: '使用条件', type: 'cond', full: true },
            { key: 'effects', label: '效果', type: 'effects', full: true }
          ]
        }
      ]
    },
    {
      id: 'events', title: '事件脚本', icon: '📰',
      desc: '脚本事件在条件满足时触发（每回合开局判定）；随机事件池每回合按概率抽一个。留空随机事件池则使用默认池。',
      fields: [
        {
          key: 'events', label: '脚本事件', type: 'list', full: true,
          itemTitle: function (it) { return it.title || '事件'; },
          newItem: function (lv) { return { id: nextId(lv.events, 'event'), title: '', text: '', trigger: { var: 'turn', op: '>=', value: 3 }, chance: 1, once: true, effects: [] }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'title', label: '标题', type: 'text' },
            { key: 'chance', label: '概率', type: 'number', step: 0.05 },
            { key: 'once', label: '只触发一次', type: 'bool', def: true },
            { key: 'text', label: '说明文字', type: 'text', full: true },
            { key: 'trigger', label: '触发条件', type: 'cond', full: true },
            { key: 'effects', label: '效果', type: 'effects', full: true }
          ]
        },
        {
          key: 'randomEvents', label: '随机事件池', type: 'list', full: true, defaultsFrom: function () { return U.deepClone(WW.Schema.DEFAULT_RANDOM_EVENTS); },
          itemTitle: function (it) { return (it.title || '随机事件') + ' · 权重 ' + (it.weight || 1); },
          newItem: function (lv) { return { id: nextId(lv.randomEvents, 'random'), title: '', weight: 1, condition: null, once: true, effects: [] }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'title', label: '标题', type: 'text' },
            { key: 'weight', label: '权重', type: 'number' },
            { key: 'once', label: '只触发一次', type: 'bool', def: true },
            { key: 'condition', label: '可触发条件', type: 'cond', full: true },
            { key: 'effects', label: '效果', type: 'effects', full: true }
          ]
        }
      ]
    },
    {
      id: 'ending', title: '胜负与评级', icon: '🏆',
      desc: '主任务全部完成即可结案；合同到期时满足胜利条件也算成功。默认失败条件（解约、翻车、社死）始终生效，可以按 ID 覆盖或追加。',
      fields: [
        { key: 'victory.condition', label: '到期胜利条件', type: 'cond', full: true },
        { key: 'victory.text', label: '胜利文案', type: 'text', full: true },
        {
          key: 'defeat', label: '额外失败条件', type: 'list', full: true,
          itemTitle: function (it) { return it.title || '失败条件'; },
          newItem: function () { return { id: 'defeat_' + Date.now().toString(36), title: '', condition: null, text: '', epilogue: '' }; },
          fields: [
            { key: 'id', label: 'ID（与默认 fired/exposed/collapse 同名则覆盖）', type: 'text' },
            { key: 'title', label: '标题', type: 'text' },
            { key: 'text', label: '说明', type: 'text', full: true },
            { key: 'condition', label: '条件', type: 'cond', full: true }
          ]
        },
        {
          key: 'grading', label: '评分', type: 'object', full: true,
          fields: [
            { key: 'weights.sentiment', label: '舆论好感权重', type: 'number', step: 0.05 },
            { key: 'weights.heat', label: '热度权重', type: 'number', step: 0.05 },
            { key: 'weights.credibility', label: '公信力权重', type: 'number', step: 0.05 },
            { key: 'weights.satisfaction', label: '满意度权重', type: 'number', step: 0.05 },
            { key: 'weights.budget', label: '结余权重', type: 'number', step: 0.05 },
            { key: 'weights.exposure', label: '隐蔽权重', type: 'number', step: 0.05 },
            { key: 'thresholds.S', label: 'S 级分数线', type: 'number' },
            { key: 'thresholds.A', label: 'A 级分数线', type: 'number' },
            { key: 'thresholds.B', label: 'B 级分数线', type: 'number' },
            { key: 'thresholds.C', label: 'C 级分数线', type: 'number' }
          ]
        }
      ]
    },
    {
      id: 'ai', title: '引导 · AI · 离线文本', icon: '🤖',
      desc: '教程步骤按顺序显示在左下角卡片里：设了“完成条件”的步骤做到就自动打勾，没设的是“下一步”式说明。AI 设定会写进系统提示词；离线文本池在不调用 AI 时使用（会和内置文本池合并）。',
      fields: [
        {
          key: 'guide', label: '教程步骤', type: 'list', full: true,
          itemTitle: function (it) { return (it.at === 'result' ? '结算页：' : '第 ' + (it.turn || 1) + ' 回合起：') + String(it.title || it.text || '').slice(0, 24); },
          newItem: function (lv) { return { id: nextId(lv.guide, 'step'), turn: 1, title: '', text: '' }; },
          fields: [
            { key: 'id', label: 'ID', type: 'text' },
            { key: 'title', label: '标题（留空 = 只显示一回合的旧式提示）', type: 'text' },
            { key: 'turn', label: '最早出现的回合', type: 'number', min: 1 },
            { key: 'at', label: '显示位置', type: 'select', options: [{ value: 'play', label: '游戏中（教程卡片）' }, { value: 'result', label: '结算页（教程小结）' }] },
            { key: 'text', label: '内容', type: 'textarea', full: true },
            { key: 'target', label: '高亮目标（item:技能ID、post:fact:事实ID、post:negative、end-turn、finish、tasks、side:支线ID、dashboard、feed、opponents、chat）', type: 'text', full: true },
            { key: 'when', label: '出现条件（留空 = 总是）', type: 'cond', full: true },
            { key: 'done', label: '完成条件（留空 = 玩家点“下一步”）', type: 'cond', full: true },
            { key: 'skip', label: '跳过条件', type: 'cond', full: true },
            { key: 'optional', label: '允许玩家跳过', type: 'bool' },
            { key: 'action', label: '按钮（JSON，如 {"item":"iron_fist","label":"举报","preset":{"post":"fact:f2","hint":"…"}}，或 {"cmd":"endTurn"} / {"cmd":"finish"} / {"cmd":"accept","task":"支线ID"}）', type: 'json', full: true, rows: 4 },
            { key: 'notes', label: '附加提示（JSON，如 [{"when":{…},"text":"…"}]）', type: 'json', full: true, rows: 3 }
          ]
        },
        { key: 'ai.context', label: '补充设定（给 AI）', type: 'textarea', full: true },
        { key: 'ai.style', label: '文风', type: 'textarea', full: true },
        { key: 'ai.extraRules', label: '额外要求', type: 'textarea', full: true },
        { key: 'offline', label: '离线文本池（JSON，结构同 js/data/pools.js，如 {"posts":{"-2":["…"]}}）', type: 'json', full: true, rows: 10 }
      ]
    }
  ];

  WW.EditorFields = { sections: sections, nextId: nextId, STANCES: STANCES, EFFECT_FIELDS: EFFECT_FIELDS };
})(window.WW);
