/*
 * Opponent ability library (对手经典技能). Levels attach abilities to opponents via
 * opponents[].abilities[{use, weight, cooldown, condition, overrides}] and can define brand-new
 * ones in level.abilities (handler "generic" runs an effect list).
 * cost: opponent resources; weight: base pick weight before situational multipliers.
 */
(function (WW) {
  'use strict';

  WW.Data.abilities = {
    mass_report: {
      id: 'mass_report', name: '抱团举报', icon: '🚩', category: '攻击', cost: 8, cooldown: 2, weight: 3,
      handler: 'mass_report',
      desc: '组织集体举报，下架你近两回合发布的公文、软文和水军帖，水军号被封会抬高暴露度。',
      counter: '提前控评护住内容（2 回合内不会被冲掉），或对其召唤铁拳。',
      params: { takedown: { shill: 0.6, kol: 0.35, client: 0.15 }, exposurePerBan: 3 }
    },
    go_abroad: {
      id: 'go_abroad', name: '告洋状', icon: '🌐', category: '升级', cost: 15, cooldown: 4, weight: 2,
      handler: 'go_abroad',
      desc: '把事情捅到外网：外网帖删不掉、限不了流，热度上升、公信力下降；但“告洋状”会让部分国内网友反感对手。',
      counter: '冷处理、发澄清公文；越压越容易逼它出手。',
      params: { minHeat: 45, heat: 10, cred: 6, strengthLoss: 8 }
    },
    black_traffic: {
      id: 'black_traffic', name: '吃黑流量', icon: '🧲', category: '消耗', cost: 4, cooldown: 1, weight: 3,
      handler: 'black_traffic',
      desc: '营销号批量产出黑稿蹭流量，热度越高越来劲，还能赚回资源。',
      counter: '把热度降下去断其流量；律师函、限流，或对造谣黑稿召唤铁拳。',
      params: { minHeat: 40, heat: 4, posts: 2 }
    },
    iron_fist: {
      id: 'iron_fist', name: '召唤铁拳', icon: '👊', category: '重击', cost: 20, cooldown: 4, weight: 4,
      handler: 'iron_fist',
      desc: '向有关部门实名举报客户。把柄（违规事实）一旦被证据曝光，举报大概率导致约谈整改、营销手段被锁；拿不出实据的举报会诬告反噬。',
      counter: '在证据曝光前完成真诚整改补上漏洞；用内部调查摸清哪些是把柄。',
      params: { requiresHandle: true, success: 0.75, lockTurns: 2, lockItems: ['kol', 'distraction', 'shill', 'trend_remove'] }
    },
    dig_past: {
      id: 'dig_past', name: '翻旧账', icon: '📼', category: '攻击', cost: 10, cooldown: 3, weight: 2,
      handler: 'dig_past',
      desc: '挖出客户的黑历史，新增一条已曝光的负面事实。',
      counter: '提前摸底，用 KOL 先定调。',
      params: { minTurn: 3 }
    },
    rumor: {
      id: 'rumor', name: '造谣带节奏', icon: '🗯️', category: '攻击', cost: 6, cooldown: 2, weight: 2,
      handler: 'rumor',
      desc: '制造一条新的谣言（假事实）并大量转发。',
      counter: '辟谣（真相站在你这边时公信力上升），或召唤铁拳处理造谣者。',
      params: {}
    },
    archive: {
      id: 'archive', name: '截图存档', icon: '📸', category: '反制', cost: 3, cooldown: 1, weight: 5,
      handler: 'archive', reactive: true,
      desc: '你刚删过帖就会触发：被删内容以截图形式重新流传，暴露度上升。',
      counter: '少删多限流。',
      params: {}
    },
    counter_shill: {
      id: 'counter_shill', name: '买水军反打', icon: '🐟', category: '攻击', cost: 8, cooldown: 2, weight: 3,
      handler: 'counter_shill',
      desc: '对家也会买水军抹黑客户——这也是它的把柄。',
      counter: '部署舆情监测后用“反向扒皮”识破，或对其召唤铁拳。',
      params: { posts: 3, power: 4 }
    }
  };

  WW.Data.abilityOrder = ['mass_report', 'go_abroad', 'black_traffic', 'iron_fist', 'dig_past', 'rumor', 'archive', 'counter_shill'];
})(window.WW);
