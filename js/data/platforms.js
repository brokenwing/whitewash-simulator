/* Platforms (信息流平台) and author tiers (作者影响力层级). */
(function (WW) {
  'use strict';

  WW.Data.platforms = {
    weibo:       { id: 'weibo',       name: '围脖',       short: '围', color: '#e6162d', reachMul: 1.2, style: '短评、转发、热搜词条、超话，节奏快' },
    douyin:      { id: 'douyin',      name: '颤音',       short: '颤', color: '#161823', reachMul: 1.3, style: '短视频评论区，爱玩梗、接龙、谐音' },
    xiaohongshu: { id: 'xiaohongshu', name: '小红薯',     short: '薯', color: '#ff2442', reachMul: 1.0, style: '“姐妹们”“避雷”“踩雷”长图文，带个人体验' },
    zhihu:       { id: 'zhihu',       name: '知否',       short: '否', color: '#0066ff', reachMul: 0.9, style: '“谢邀”“利益相关”，长文分析，自带专业身份' },
    bilibili:    { id: 'bilibili',    name: '币站',        short: '币',  color: '#fb7299', reachMul: 1.0, style: '视频与弹幕，鬼畜、整活、“前方高能”' },
    tieba:       { id: 'tieba',       name: '铁吧',       short: '铁', color: '#4e6ef2', reachMul: 0.7, style: '楼层对线，阴阳怪气，抽象话' },
    news:        { id: 'news',        name: '新闻客户端', short: '闻', color: '#b8000a', reachMul: 1.5, style: '新闻稿、评论员文章，措辞克制' },
    overseas:    { id: 'overseas',    name: '外网',       short: '外', color: '#5b6470', reachMul: 1.1, immune: true, style: '海外平台与海外媒体转载，删不掉也限不了流' }
  };

  WW.Data.platformOrder = ['weibo', 'douyin', 'xiaohongshu', 'zhihu', 'bilibili', 'tieba', 'news', 'overseas'];

  /* reach: weight in the opinion-pressure formula; deleteCost: 万元 per post (null = cannot be deleted). */
  WW.Data.tiers = {
    normal: { id: 'normal', name: '素人', reach: 1,  deleteCost: 0.2 },
    kol:    { id: 'kol',    name: 'KOL',  reach: 5,  deleteCost: 1.2 },
    bigv:   { id: 'bigv',   name: '大V',  reach: 12, deleteCost: 3 },
    media:  { id: 'media',  name: '媒体', reach: 20, deleteCost: 8 },
    state:  { id: 'state',  name: '官媒', reach: 40, deleteCost: null },
    client: { id: 'client', name: '官方', reach: 15, deleteCost: null }
  };

  /* Channels the client can publish official statements on. */
  WW.Data.statementChannels = {
    weibo:  { id: 'weibo',  name: '官方围脖',   reachMul: 1.0, heatMul: 1.0 },
    wechat: { id: 'wechat', name: '巨信公众号', reachMul: 0.8, heatMul: 0.7 },
    site:   { id: 'site',   name: '官网公告',   reachMul: 0.5, heatMul: 0.4 }
  };
})(window.WW);
