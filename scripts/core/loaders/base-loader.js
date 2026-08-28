import { deepClone, deepMerge, isEqual } from '../utils.js';

/**
 * BaseLoader — shared behavior for every domain loader.
 *
 * A loader owns one persisted slice of data. It:
 *  - loads + normalizes data (defaults merged, custom normalize applied)
 *  - validates on write
 *  - mirrors the current value into the central StateManager
 *  - re-syncs when the underlying storage key changes (cross-context)
 *  - emits `<key>:changed` events after every committed write
 *
 * Subclasses provide `key`, `defaults`, and optionally `normalize`/`validate`.
 */

export class BaseLoader {
  constructor(options) {
    const {
      key,
      defaults,
      storage,
      state,
      bus,
      normalize = null,
      validate = null
    } = options;

    if (!key) throw new TypeError('BaseLoader: key is required');
    if (!storage || !state || !bus) {
      throw new TypeError('BaseLoader: storage, state and bus are required');
    }

    this.key = key;
    this.defaults = defaults;
    this.storage = storage;
    this.state = state;
    this.bus = bus;
    this.customNormalize = normalize;
    this.validate = validate;
    this.data = null;
    this.#unsubscribeStorage = null;
  }

  #unsubscribeStorage = null;

  /**
   * Event name emitted after every committed change.
   */
  get event() {
    return `${this.key}:changed`;
  }

  /**
   * Load the slice, normalize it, publish to state and start syncing.
   */
  async init() {
    const raw = await this.storage.get(this.key);
    this.data = this.normalize(raw);
    this.commit();

    this.#unsubscribeStorage = this.storage.subscribe(this.key, (value) => {
      const next = this.normalize(value);
      if (!isEqual(this.data, next)) {
        this.data = next;
        this.commit();
        this.bus.emit(this.event, next);
      }
    });

    return this;
  }

  /**
   * Merge stored data over the defaults and pass through the custom normalize.
   */
  normalize(value) {
    const base = deepMerge(deepClone(this.defaults), value);
    return this.customNormalize ? this.customNormalize(base, value) : base;
  }

  /**
   * Deep-merge a partial update, validate, persist and emit.
   */
  async update(partial, { persist = true } = {}) {
    if (partial === undefined || partial === null) return this.data;
    const next = this.normalize(deepMerge(deepClone(this.data), partial));
    return this.#commitNext(next, persist);
  }

  /**
   * Replace the whole slice value, validate, persist and emit.
   */
  async replace(value, { persist = true } = {}) {
    const next = this.normalize(value);
    return this.#commitNext(next, persist);
  }

  /**
   * Restore the slice to its default state.
   */
  async reset({ persist = true } = {}) {
    const next = this.normalize(undefined);
    return this.#commitNext(next, persist);
  }

  get() {
    return this.data;
  }

  /**
   * Subscribe to `<key>:changed`.
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(callback) {
    return this.bus.on(this.event, callback);
  }

  /**
   * Mirror the current value into the central state store.
   */
  commit() {
    this.state.set(this.key, this.data);
  }

  destroy() {
    this.#unsubscribeStorage?.();
    this.#unsubscribeStorage = null;
  }

  async #commitNext(next, persist) {
    const error = this.validate ? this.validate(next) : null;
    if (error) {
      throw new Error(`[${this.constructor.name}] ${error}`);
    }
    if (isEqual(this.data, next)) return this.data;

    this.data = next;
    this.commit();
    if (persist) {
      await this.storage.set(this.key, next);
    }
    this.bus.emit(this.event, next);
    return this.data;
  }
}
