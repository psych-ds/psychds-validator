type Listener = Function & { fn?: Function };

export default class EventEmitter {
  _events: Record<string, Listener[]> = {};

  on(event: string, fn: Listener) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(fn);
    return this;
  }

  once(event: string, fn: Listener) {
    const self = this;
    const onceWrapper: Listener = function () {
      self.off(event, onceWrapper);
      fn.apply(self, arguments);
    };
    onceWrapper.fn = fn;
    this.on(event, onceWrapper);
    return this;
  }

  off(event: string, fn?: Listener) {
    if (!this._events[event]) return this;
    if (!fn) {
      this._events[event] = [];
      return this;
    }
    const listeners = this._events[event];
    for (let i = 0; i < listeners.length; i++) {
      if (listeners[i] === fn || listeners[i].fn === fn) {
        listeners.splice(i, 1);
        break;
      }
    }
    return this;
  }

  emit(event: string, ...args: any[]) {
    if (!this._events[event]) return false;
    const listeners = this._events[event].slice();
    for (let i = 0; i < listeners.length; i++) {
      listeners[i].apply(this, args);
    }
    return true;
  }
}