/**
 * A lightweight and flexible event emitter implementation.
 */
type Listener = ((...args: unknown[]) => void) & { fn?: (...args: unknown[]) => void };

/**
 * EventEmitter class allows subscribing to and emitting events.
 */
export default class EventEmitter {
  /**
   * Stores all event listeners, categorized by event names.
   */
  private _events: Record<string, Listener[]> = {};

  /**
   * Registers a listener function to be called whenever the specified event is emitted.
   *
   * @param event - The name of the event to listen for.
   * @param fn - The listener function to invoke when the event is emitted.
   * @returns The current instance of EventEmitter for chaining.
   */
  on(event: string, fn: Listener): this {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(fn);
    return this;
  }

  /**
   * Registers a one-time listener function for the specified event.
   * The listener will be automatically removed after its first invocation.
   *
   * @param event - The name of the event to listen for.
   * @param fn - The listener function to invoke when the event is emitted.
   * @returns The current instance of EventEmitter for chaining.
   */
  once(event: string, fn: Listener): this {
    const onceWrapper: Listener = (...args: unknown[]) => {
      this.off(event, onceWrapper);
      fn.apply(this, args);
    };
    onceWrapper.fn = fn;
    this.on(event, onceWrapper);
    return this;
  }

  /**
   * Removes a specific listener function or all listeners for a given event.
   *
   * @param event - The name of the event whose listener(s) should be removed.
   * @param fn - The specific listener function to remove. If omitted, all listeners for the event will be removed.
   * @returns The current instance of EventEmitter for chaining.
   */
  off(event: string, fn?: Listener): this {
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

  /**
   * Emits an event, invoking all registered listeners for the specified event.
   *
   * @param event - The name of the event to emit.
   * @param args - The arguments to pass to the listener functions.
   * @returns A boolean indicating whether any listeners were invoked.
   */
  emit(event: string, ...args: unknown[]): boolean {
    if (!this._events[event]) return false;
    const listeners = this._events[event].slice();
    for (const listener of listeners) {
      listener.apply(this, args);
    }
    return true;
  }
}
