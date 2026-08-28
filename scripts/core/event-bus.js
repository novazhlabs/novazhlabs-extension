/**
 * EventBus — a lightweight, dependency-free publish/subscribe bus.
 * Used as the backbone for all inter-module communication in the core.
 *
 * Events are namespaced strings (e.g. "settings:changed", "state:clock").
 */

export class EventBus {
  #listeners = new Map();

  /**
   * Subscribe to an event.
   * @param {string} event - Event name.
   * @param {(payload: any) => void} handler - Event handler.
   * @returns {() => void} Unsubscribe function.
   */
  on(event, handler) {
    if (typeof event !== 'string' || !event) {
      throw new TypeError('EventBus.on: event must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new TypeError('EventBus.on: handler must be a function');
    }
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    this.#listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Subscribe to an event and fire only once.
   * @returns {() => void} Unsubscribe function.
   */
  once(event, handler) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove a specific handler from an event.
   */
  off(event, handler) {
    const set = this.#listeners.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) {
      this.#listeners.delete(event);
    }
  }

  /**
   * Emit an event synchronously to all subscribers.
   * Handler errors are isolated so one subscriber cannot break the rest.
   */
  emit(event, payload) {
    const set = this.#listeners.get(event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[EventBus] handler error for "${event}"`, error);
      }
    }
  }

  /**
   * Remove all handlers for an event (or all events when omitted).
   */
  clear(event) {
    if (event !== undefined) {
      this.#listeners.delete(event);
    } else {
      this.#listeners.clear();
    }
  }

  /**
   * Number of subscribers for an event.
   */
  listenerCount(event) {
    return this.#listeners.get(event)?.size ?? 0;
  }

  /**
   * List of currently registered event names.
   */
  events() {
    return Array.from(this.#listeners.keys());
  }
}
