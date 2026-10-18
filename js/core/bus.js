/* Minimal event emitter used by the game engine and UI. */
(function (WW) {
  'use strict';

  function Emitter() {
    this._handlers = {};
  }
  Emitter.prototype.on = function (name, fn) {
    (this._handlers[name] || (this._handlers[name] = [])).push(fn);
    var self = this;
    return function () { self.off(name, fn); };
  };
  Emitter.prototype.off = function (name, fn) {
    var list = this._handlers[name];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
  Emitter.prototype.emit = function (name, payload) {
    var list = (this._handlers[name] || []).slice().concat(this._handlers['*'] || []);
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](payload, name);
      } catch (e) {
        if (typeof console !== 'undefined') console.error('[WW] handler for "' + name + '" failed', e);
      }
    }
  };

  WW.Emitter = Emitter;
  WW.bus = new Emitter();
})(window.WW);
