/*
 * Global namespace for the Whitewash Simulator.
 * All scripts are classic <script> files (no ES modules) so the game runs from file://.
 * Every other file wraps itself in `(function (WW) { ... })(window.WW);`.
 */
(function (root) {
  'use strict';
  var WW = root.WW || (root.WW = {});
  WW.VERSION = '1.0.0';
  WW.SCHEMA_VERSION = 1;
  WW.Data = WW.Data || {};
})(typeof window !== 'undefined' ? window : globalThis);
