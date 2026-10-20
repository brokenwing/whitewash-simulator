/*
 * Truth mechanics (真相与谎言债): denying / admitting facts, evidence reveals, refuting rumors,
 * broken promises and regulator strikes ("铁拳").
 * Denials have no immediate visible bonus either way; the payoff comes when the truth surfaces:
 * a denied true fact becomes a face-slap (打脸), a denied rumor becomes vindication.
 */
(function (WW) {
  'use strict';

  var U = WW.U;

  function short(text, n) {
    text = String(text || '');
    return text.length > (n || 16) ? text.slice(0, n || 16) + '…' : text;
  }

  function deny(game, fid) {
    var st = game.state;
    var f = st.facts[fid];
    if (!f || f.refuted) return null;
    if (f.isTrue) {
      if (f.admitted) {
        game.addStat('credibility', -4);
        return '前后矛盾：先承认、后否认「' + short(f.text) + '」';
      }
      if (!f.denied) {
        f.denied = true;
        game.addLieDebt(f.id, f.weight);
      }
      if (f.revealed) {
        game.addStat('credibility', -10 * f.weight);
        game.shiftFactions(-6 * f.weight, 'event');
        game.addStat('heat', 6);
        return '明知故犯：否认已经实锤的「' + short(f.text) + '」，当场打脸';
      }
      return '否认了「' + short(f.text) + '」';
    }
    f.denied = true;
    return '否认了「' + short(f.text) + '」';
  }

  function admit(game, fid) {
    var st = game.state;
    var f = st.facts[fid];
    if (!f || f.admitted) return null;
    f.admitted = true;
    if (f.isTrue) {
      if (f.denied) {
        f.denied = false;
        st.lieDebt = Math.max(0, st.lieDebt - (f.debt || 0));
        f.debt = 0;
        game.addStat('credibility', -3);
        return '改口承认「' + short(f.text) + '」：谎言债清零，但被嘲出尔反尔';
      }
      game.addStat('credibility', 2 * f.weight);
      game.shiftFactions(-2 * f.weight, 'event');
      game.shiftFaction('victim', 3 * f.weight, 0.5);
      return '承认了「' + short(f.text) + '」';
    }
    game.shiftFactions(-5 * f.weight, 'event');
    game.addStat('credibility', -3);
    game.addStat('satisfaction', -8 / game.diff.patienceMul);
    game.message('client', '“' + short(f.text, 20) + '”这事根本就不是真的，你们认什么？！', 'angry');
    return '承认了「' + short(f.text) + '」';
  }

  function refute(game, fid, by) {
    var st = game.state;
    var f = st.facts[fid];
    if (!f || f.isTrue || f.refuted) return false;
    f.refuted = true;
    f.known = true;
    f.public = true;
    var bonus = f.denied ? 1.5 : 1;
    game.addStat('credibility', 4 * f.weight * bonus);
    game.shiftFactions(4 * f.weight * bonus, 'event');
    if (f.by && st.opponents[f.by]) {
      var o = st.opponents[f.by];
      game.changeMorale(o, -15);
      o.strength = U.clamp(o.strength - 5, 0, 100);
    }
    game.queuePosts({ kind: 'news', count: 1, stance: 1, tier: 'media', hint: '证伪：“' + f.text + '”系谣言（' + (by || '核查') + '）', tags: ['辟谣'] });
    game.log('truth', '谣言被证伪：' + f.text + (f.denied ? '（你之前的辟谣得到印证）' : ''));
    return true;
  }

  function reveal(game, fid, source) {
    var st = game.state;
    var f = st.facts[fid];
    if (!f) return;
    if (!f.isTrue) { refute(game, fid, source); return; }
    if (f.revealed) return;
    f.revealed = true;
    f.known = true;
    f.public = true;
    var w = f.weight;
    var note;
    if (f.fixed) {
      game.shiftFactions(-2 * w, 'event');
      game.addStat('credibility', -2);
      note = '早已整改，冲击有限';
    } else if (f.admitted) {
      game.shiftFactions(-3 * w, 'event');
      game.addStat('heat', 4);
      note = '已提前承认，冲击较小';
    } else if (f.denied) {
      var debt = Math.max(w, f.debt || w);
      game.shiftFactions(-(8 + 6 * debt), 'event');
      game.addStat('credibility', -10 * debt * (f.fakeEndorsed ? 1.5 : 1));
      game.addStat('heat', 10);
      game.addStat('satisfaction', -8 / game.diff.patienceMul);
      st.counters.faceSlaps += 1;
      note = '打脸！之前的否认全部反噬';
    } else {
      game.shiftFactions(-6 * w, 'event');
      game.addStat('credibility', -4);
      game.addStat('heat', 6);
      note = '负面实锤';
    }
    game.queuePosts({ kind: 'evidence', count: 2, stance: -2, tier: 'bigv', fact: fid, hint: '实锤曝光：' + f.text + '（来源：' + (source || '知情人') + '）', tags: ['实锤'] });
    game.addHeadline(short(game.level.client.name + f.text, 18) + ' 实锤', 92, { tag: '爆' });
    game.log('truth', '证据曝光：' + f.text + ' —— ' + note);
    return note;
  }

  function evidenceTurn(f) {
    return f.evidence ? f.evidence.turn + (f.evidence.delays || 0) : Infinity;
  }

  function delayEvidence(game, fid, by, n) {
    var f = game.state.facts[fid];
    if (!f || !f.evidence || f.revealed || f.refuted) return false;
    if (f.evidence.suppressBy.indexOf(by) < 0) return false;
    f.evidence.delays = Math.min(3, (f.evidence.delays || 0) + (n || 1));
    return true;
  }

  function checkEvidence(game, lines) {
    var st = game.state;
    Object.keys(st.facts).forEach(function (id) {
      var f = st.facts[id];
      if (!f.evidence || f.revealed || f.refuted || f.evidence.suppressed) return;
      var due = evidenceTurn(f);
      if (st.turn + 1 === due && st.monitor && !f.warned) {
        f.warned = true;
        game.message('system', '预警：“' + f.evidence.source + '”正在整理与「' + short(f.text, 20) + '」有关的材料，下回合可能曝光。', 'bad');
      }
      if (st.turn < due) return;
      if (game.rng.chance(f.evidence.chance)) {
        var note = reveal(game, id, f.evidence.source);
        lines.push({ kind: 'evidence', text: (f.isTrue ? '实锤曝光：' : '真相大白：') + f.text + (note ? '（' + note + '）' : '') });
      } else {
        f.evidence.chance = Math.min(1, f.evidence.chance + 0.25);
      }
    });
  }

  function checkPromises(game, lines) {
    var st = game.state;
    st.promises.forEach(function (p) {
      if (p.status !== 'pending' || st.turn <= p.due) return;
      p.status = 'broken';
      game.addStat('credibility', -8);
      game.shiftFactions(-5, 'event');
      game.addStat('heat', 5);
      game.queuePosts({ kind: 'backfire', count: 1, stance: -2, hint: '网友翻出' + game.level.client.name + '之前的承诺“' + p.text + '”，嘲讽跳票', tags: ['跳票'] });
      lines.push({ kind: 'promise', text: '承诺跳票：“' + p.text + '”' });
    });
  }

  var STRIKE_LOCK = ['kol', 'distraction', 'shill', 'trend_remove'];

  /* opts: { lockItems, lockTurns } from the reporting ability's params (default: marketing skills, 2 turns) */
  function regulatorStrike(game, source, opts) {
    var st = game.state;
    opts = opts || {};
    var lock = Array.isArray(opts.lockItems) ? opts.lockItems : STRIKE_LOCK;
    var turns = Number(opts.lockTurns) > 0 ? Number(opts.lockTurns) : 2;
    game.shiftFactions(-12, 'event');
    game.addStat('credibility', -10);
    game.addStat('satisfaction', -12 / game.diff.patienceMul);
    game.addStat('heat', 8);
    game.lockItems(lock, turns);
    st.flags.regulated = true;
    st.counters.regulated += 1;
    game.message('system', '【' + source + '】有关部门约谈' + game.level.client.name + '，要求限期整改' + (lock.length ? '；营销类手段被暂停 ' + turns + ' 回合' : '') + '。', 'bad');
    game.queuePosts({ kind: 'news', count: 1, stance: -2, tier: 'media', pool: 'ironFistBoomerang', hint: '有关部门约谈' + game.level.client.name + '，要求说明情况并限期整改', tags: ['约谈'] });
    game.addHeadline(game.level.client.name + '被约谈', 90, { tag: '爆' });
  }

  WW.Truth = {
    deny: deny,
    admit: admit,
    refute: refute,
    reveal: reveal,
    evidenceTurn: evidenceTurn,
    delayEvidence: delayEvidence,
    checkEvidence: checkEvidence,
    checkPromises: checkPromises,
    regulatorStrike: regulatorStrike
  };
})(window.WW);
