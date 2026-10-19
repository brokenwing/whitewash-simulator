/*
 * All eval cases. A case:
 *   { id, task, level, args, gold?, ref?, setup?, fixture?, group?, followup?, safety? }
 *   setup   : { turn, reveal: [factId], public: [factId], promises: [{id,text,days}], stats: {} }
 *   fixture : id of a recorded call (fixtures/*.json); its game save and args are replayed as-is
 *   ref     : part of the reference subset (--ref) used for the expensive cross-model rounds
 */
'use strict';

const { loadFixtures } = require('../record');

/* recorded calls that join the reference subset */
const REF_RECORDED = [
  'milktea@feed.generate#2', 'autobrake@feed.generate#2', 'idol@feed.generate#2',
  'milktea@control.generate#1', 'idol@kol.write#1', 'autobrake@expose.generate#1', 'milktea@ending.report#2'
];

function recorded() {
  const fx = loadFixtures();
  return Object.keys(fx).sort().map((id) => ({
    id, task: fx[id].task, level: fx[id].level, fixture: id, ref: REF_RECORDED.indexOf(id) >= 0, turn: fx[id].turn
  }));
}

function all() {
  return [].concat(
    require('./classify'), require('./judge'), require('./report'), require('./shill'),
    require('./compose'), require('./custom'), require('./safety'), recorded()
  );
}

module.exports = { all, REF_RECORDED };
