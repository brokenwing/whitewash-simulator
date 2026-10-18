/* Generic netizen archetypes (网民画像) used when a level does not define its own personas. */
(function (WW) {
  'use strict';

  WW.Data.archetypes = [
    { id: 'melon',      name: '吃瓜群众', faction: 'passerby', tier: 'normal', style: '看热闹、玩梗、随大流' },
    { id: 'rational',   name: '理中客',   faction: 'passerby', tier: 'normal', style: '“有一说一”，各打五十大板' },
    { id: 'joker',      name: '段子手',   faction: 'passerby', tier: 'kol',    style: '谐音梗、造句、整活' },
    { id: 'worker',     name: '打工人',   faction: 'passerby', tier: 'normal', style: '代入感强，吐槽资本' },
    { id: 'fan',        name: '铁粉',     faction: 'fans',     tier: 'normal', style: '护主、反黑、控评口号' },
    { id: 'bigfan',     name: '粉丝大V',  faction: 'fans',     tier: 'kol',    style: '组织应援、带队反黑' },
    { id: 'victim',     name: '苦主',     faction: 'victim',   tier: 'normal', style: '委屈、愤怒、讲细节' },
    { id: 'sleuth',     name: '扒皮大神', faction: 'sleuth',   tier: 'kol',    style: '时间线、截图、对比图、实锤' },
    { id: 'insider',    name: '知情人士', faction: 'sleuth',   tier: 'normal', style: '“匿名说两句”，半真半假' },
    { id: 'marketing',  name: '营销号',   faction: 'media',    tier: 'bigv',   style: '震惊体、标题党、蹭流量' },
    { id: 'journalist', name: '记者',     faction: 'media',    tier: 'media',  style: '克制、追问、要证据' },
    { id: 'lawyer',     name: '律师大V',  faction: 'media',    tier: 'bigv',   style: '法条、专业分析' },
    { id: 'rivalfan',   name: '对家粉',   faction: 'rival',    tier: 'normal', style: '拉踩、阴阳怪气' }
  ];

  WW.Data.nicknames = [
    '今天也要早睡', '不吃香菜的猫', 'momo', '路过的打工人', '柠檬精本精', '吃瓜第一线', '西瓜太郎',
    '一只大鹅', '芋圆奶冻', '熬夜冠军', '人间清醒', '咸鱼翻身失败', '快乐小狗', '鸭梨山大', '奶茶续命',
    '朝阳热心群众', '理性吃瓜', '有一说一', '冲浪达人', '电子榨菜', '早八人', '退休的李阿姨', '考研上岸了吗',
    '社畜一号', '躺平青年', '小镇做题家', '赛博菩萨', '嗑学家', '毒舌评论家', '数码博主K', '美食探店日记',
    '大胃王小美', '娱乐圈扒姐', '科技观察员', '汽车老司机', '法律人小周', '前员工A', '匿名用户',
    '不愿透露姓名的网友', '深夜放毒', '橘子汽水', '月薪三千', '南方小土豆', '东北大花袄', '川渝辣妹子',
    '摸鱼专家', '周一综合征', '韭菜本菜', '嘴替本替', '已注销用户', '野生评论家', '凌晨三点的星星',
    '想吃火锅', '一颗卤蛋', '不想上班', '在逃公主', '单身狗', '宝妈小林', '奶爸老陈', '大学生小赵',
    '热心网友', '围观群众', '小透明', '路人甲', '路人乙', '吃瓜不吐籽', '瓜田里的猹', '课代表',
    '时间线整理员', '截图保存者', '反诈小能手', '人形计算器', '图片考古学家', '真相只有一个'
  ];

  /* Names that sound like obvious bot accounts, used for zombie-tier paid posters. */
  WW.Data.botNames = [
    '用户7712093', '用户5830266', '用户9021337', '手机用户2846', 'a13579x', '用户1145141', '爱生活的小可爱88',
    '快乐每一天2023', '用户6680721', '天天开心0811', 'sweet_9921', '用户3307714'
  ];
})(window.WW);
