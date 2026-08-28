import { deepMerge } from './utils.js';

/**
 * StateManager — the central, in-memory source of truth.
 *
 * Every domain (settings, theme, shortcuts, wallpapers, widgets) publishes
 * its current data here. UI layers read from this store instead of reaching
 * into loaders or storage directly.
 *
 * Slices are namespace-prefixed: set('shortcuts', [...]) emits "state:shortcuts".
 * Persistence itself is owned by the loaders; this store only mirrors data.
 */

export class StateManager {
  #store = new Map();
  #bus;

  constructor({ bus }) {
    if (!bus) throw new TypeError('StateManager requires an EventBus');
    this.#bus = bus;
  }

  /**
   * Seed the store with initial slices.
   */
  init(initialSlices = {}) {
    for (const [key, value] of Object.entries(initialSlices)) {
      this.#store.set(key, value);
    }
    return this;
  }

  get(key) {
    return this.#store.get(key);
  }

  has(key) {
    return this.#store.has(key);
  }

  /**
   * Set a slice and emit `state:<key>` with `{ key, prev, next }`.
   */
  set(key, value) {
    const prev = this.#store.get(key);
    this.#store.set(key, value);
    this.#bus.emit(`state:${key}`, { key, prev, next: value });
    return value;
  }

  /**
   * Deep-merge a partial update into an existing object slice.
   */
  patch(key, partial) {
    const current = this.#store.get(key);
    return this.set(key, deepMerge(Array.isArray(current) ? [] : current, partial));
  }

  delete(key) {
    if (!this.#store.has(key)) return false;
    const prev = this.#store.get(key);
    this.#store.delete(key);
    this.#bus.emit(`state:${key}`, { key, prev, next: undefined });
    return true;
  }

  /**
   * Subscribe to changes of a single slice.
   * @param {string} key - Slice name.
   * @param {(value: any) => void} callback - Receives the new slice value.
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(key, callback) {
    return this.#bus.on(`state:${key}`, ({ next }) => callback(next));
  }

  /**
   * Subscribe to changes of every slice.
   */
  subscribeAll(callback) {
    return this.#bus.on('state:reset', () => callback(this.snapshot()));
  }

  snapshot() {
    return Object.fromEntries(this.#store);
  }

  reset(initialSlices = {}) {
    this.#store.clear();
    this.init(initialSlices);
    this.#bus.emit('state:reset');
  }
}
