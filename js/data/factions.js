/*
 * Audience factions (受众阵营) and the "channels" every action is routed through.
 * Each faction has a sensitivity multiplier per channel: negative values mean the tactic backfires
 * with that crowd (e.g. sleuths hate paid posters).
 */
(function (WW) {
  'use strict';

  WW.Data.channels = {
    statement:    { name: '公文表态', persist: 0.30 },
    apology:      { name: '道歉认错', persist: 0.40 },
    shill:        { name: '水军控评', persist: 0.05 },
    kol:          { name: 'KOL 软文', persist: 0.20 },
    legal:        { name: '律师函/举报', persist: 0.25 },
    deletion:     { name: '删帖限流', persist: 0.30 },
    compensation: { name: '赔偿和解', persist: 0.60 },
    distraction:  { name: '转移话题', persist: 0.00 },
    label:        { name: '强硬定性', persist: 0.20 },
    expose:       { name: '反向扒皮', persist: 0.30 },
    rectify:      { name: '真诚整改', persist: 0.80 },
    scapegoat:    { name: '甩锅背锅', persist: 0.10 },
    event:        { name: '事件冲击', persist: 0.30 }
  };

  WW.Data.channelOrder = Object.keys(WW.Data.channels);

  /* sizes sum to 1.0; sentiment is -100..100; volatility = share of the gap closed per turn */
  WW.Data.defaultFactions = [
    {
      id: 'passerby', name: '吃瓜路人', size: 0.42, sentiment: -25, volatility: 0.35, bias: -5,
      desc: '人数最多，容易被带节奏，也最容易忘记',
      sens: { statement: 1, apology: 1.1, shill: 1, kol: 1.2, legal: -0.6, deletion: -0.4, compensation: 0.6, distraction: 1.2, label: 0.3, expose: 1, rectify: 1, scapegoat: 0.8, event: 1 }
    },
    {
      id: 'fans', name: '品牌粉丝', size: 0.16, sentiment: 30, volatility: 0.25, bias: 25,
      desc: '天然护主，爱控评，对强硬表态买账',
      sens: { statement: 1.3, apology: 0.7, shill: 0.8, kol: 0.8, legal: 0.6, deletion: 0.2, compensation: 0.4, distraction: 0.6, label: 1.2, expose: 1.2, rectify: 0.8, scapegoat: 0.9, event: 0.8 }
    },
    {
      id: 'victim', name: '苦主', size: 0.08, sentiment: -70, volatility: 0.3, bias: -40,
      desc: '直接受害者，只认真诚道歉与赔偿，律师函会让他们暴怒',
      sens: { statement: 0.6, apology: 1.4, shill: -0.5, kol: -0.3, legal: -1.5, deletion: -1.2, compensation: 2, distraction: -0.3, label: -1, expose: 0.3, rectify: 1.5, scapegoat: -0.2, event: 1.2 }
    },
    {
      id: 'sleuth', name: '扒皮党', size: 0.12, sentiment: -35, volatility: 0.3, bias: -15,
      desc: '较真、爱整理时间线，对水军和删帖极其敏感',
      sens: { statement: 0.8, apology: 0.9, shill: -0.8, kol: -0.4, legal: -0.8, deletion: -1, compensation: 0.5, distraction: -0.2, label: -0.8, expose: 0.8, rectify: 1.2, scapegoat: -0.6, event: 1.1 }
    },
    {
      id: 'media', name: '媒体大V', size: 0.12, sentiment: -25, volatility: 0.25, bias: -10,
      desc: '追求信息与立场，讨厌被删稿，偏爱有料的回应',
      sens: { statement: 1.1, apology: 1, shill: 0.2, kol: 0.6, legal: -0.3, deletion: -0.9, compensation: 0.7, distraction: 0.5, label: -0.6, expose: 0.9, rectify: 1.1, scapegoat: 0.3, event: 1 }
    },
    {
      id: 'rival', name: '对家', size: 0.10, sentiment: -45, volatility: 0.15, bias: -35,
      desc: '竞品与对家粉丝，基本不可能转化，但能被打击',
      sens: { statement: 0.3, apology: 0.2, shill: 0.2, kol: 0.2, legal: 0.3, deletion: -0.3, compensation: 0.1, distraction: 0.2, label: 0.2, expose: 0.6, rectify: 0.3, scapegoat: 0.2, event: 0.6 }
    }
  ];
})(window.WW);
