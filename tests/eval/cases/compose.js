/*
 * statement.complete / statement.polish.
 *   leak : words that would reveal a hidden truth the client never told the public (must not appear)
 *   draft : for continuation cases, the output must keep it
 *   tone corners are cross-checked by sending the output back through statement.judge
 *   (followup 'judge'): sincere > stern on sincerity, blame-shifting > owning up on blameShift.
 */
'use strict';

const MILK_LEAK = ['改标签', '默许', '总部知情'];

const Comp = (level, key, type, tone, opts) => Object.assign({
  id: level + '.complete.' + key, task: 'statement.complete', level, group: level + '.complete', tone,
  args: { type, channel: 'weibo', title: '', draft: '', tone },
  gold: { leak: [] }, followup: 'judge'
}, opts || {});

module.exports = [
  Comp('milktea', 'sincere_admit', 'apology', { sincere: 1, admit: 1 }, { ref: true, gold: { leak: MILK_LEAK } }),
  Comp('milktea', 'stern_shift', 'stern', { sincere: -1, admit: -1 }, { ref: true, gold: { leak: MILK_LEAK } }),
  Comp('milktea', 'sincere_shift', 'explain', { sincere: 1, admit: -1 }, { gold: { leak: MILK_LEAK } }),
  Comp('milktea', 'stern_admit', 'rectify', { sincere: -1, admit: 1 }, { gold: { leak: MILK_LEAK } }),
  Comp('autobrake', 'continue', 'explain', { sincere: 0.5, admit: 0 }, {
    followup: null,
    args: {
      type: 'explain', channel: 'weibo', title: '关于车展事件的情况说明', tone: { sincere: 0.5, admit: 0 },
      draft: '尊敬的各位车主、各位网友：\n近日，一位车主在车展现场的维权引发广泛关注，我们第一时间联系了车主本人。'
    },
    gold: { leak: [] }
  }),
  {
    id: 'milktea.polish.boilerplate', task: 'statement.polish', level: 'milktea', ref: true,
    args: {
      type: 'explain', tone: { sincere: 1, admit: 0.5 },
      text: '近日关于我司的相关讨论，我们高度重视，第一时间成立专项小组，正在积极调查核实，后续将及时公布进展。我司一贯严格把控原料品质，感谢大家的关注与监督。'
    },
    gold: { leak: MILK_LEAK }
  }
];
