/*
 * Disclaimer texts shown in the game and the editor, and put at the top of exported stories.
 * Keep in step with NOTICE and the 声明 / Disclaimer sections of README.md and README.en.md.
 */
(function (WW) {
  'use strict';

  WW.Data.notice = {
    /* one line under the title screen */
    short: '本游戏为虚构讽刺作品，人物、品牌、组织和事件均为虚构；不鼓励在现实中操纵舆论。',
    /* the full disclaimer, one paragraph per item */
    full: [
      ['虚构与讽刺', '本项目是讽刺性模拟游戏，人物、品牌、组织和事件均为虚构；涉及的现实事件、机构和网络平台名称只作戏仿背景，与现实中的个人或组织无关，也不代表作者对它们的评价。'],
      ['不鼓励现实操纵', '游戏用夸张的方式展示删帖、控评、水军、甩锅等手段和它们的代价，目的是讽刺与反思。它不是教程，也不鼓励任何人在现实中操纵舆论、散布谣言、侵犯他人权益或规避监管。'],
      ['AI 生成内容', '帖子、关卡、爽文等由你在「AI 设置」里配置的第三方模型生成，可能不准确或不当，仅供娱乐。请遵守所用模型服务的条款和当地法律法规；你对自己生成、保存、发布或传播的内容自行负责。'],
      ['无担保', '本项目按“原样”提供，不提供任何保证。在法律允许的范围内，作者和贡献者不对使用本项目或其生成内容造成的损失负责。'],
      ['修改版与部署', '基于本项目修改、再发布或部署成在线服务的版本，由其发布者或运营者负责。'],
      ['许可', '代码以 MIT 许可授权，关卡与文档等文字内容以 CC BY 4.0 授权，详见仓库里的 LICENSE、LICENSE-CONTENT 和 NOTICE。']
    ],
    /* shown where AI writes content the player may take out of the game */
    ai: 'AI 生成的内容可能不准确或不当，仅供娱乐；发布或转发前请自行审核，责任由发布者承担。',
    /* first line of an exported / copied story (Markdown quote) */
    story: '> 本文由《公关洗地模拟器》根据一局游戏自动生成（AI 模型或离线模板），纯属虚构讽刺，仅供娱乐；不代表作者立场，也不鼓励现实中的舆论操纵。转载或发布者对所发布的内容自行负责。'
  };
})(window.WW);
