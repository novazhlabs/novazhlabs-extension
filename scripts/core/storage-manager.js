/**
 * StorageManager — unified persistence layer.
 *
 * Uses chrome.storage.local when running inside a Chrome extension and
 * transparently falls back to localStorage otherwise (dev/test).
 *
 * Features:
 *  - In-memory cache for synchronous reads
 *  - Cross-context sync via chrome.storage.onChanged (each New Tab is its own page)
 *  - Per-key change subscriptions
 */

const isChromeStorageAvailable = () =>
  typeof globalThis.chrome !== 'undefined' &&
  !!globalThis.chrome.storage?.local;

/**
 * Adapter over chrome.storage.local.
 */
function createChromeAdapter(chromeLocal) {
  return {
    async get(key) {
      const result = await chromeLocal.get(key);
      return result[key];
    },
    async getAll() {
      return chromeLocal.get(null);
    },
    async set(key, value) {
      await chromeLocal.set({ [key]: value });
    },
    async remove(key) {
      await chromeLocal.remove(key);
    },
    async clear() {
      await chromeLocal.clear();
    },
    onChange(callback) {
      chromeLocal.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') callback(changes);
      });
    }
  };
}

/**
 * Adapter over window.localStorage (non-extension fallback).
 */
function createLocalStorageAdapter(namespace = 'glass') {
  const prefix = `${namespace}:`;
  const read = (key) => {
    try {
      const raw = localStorage.getItem(prefix + key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  return {
    async get(key) {
      return read(key);
    },
    async getAll() {
      const result = {};
      for (let i = 0; i < localStorage.length; i++) {
        const rawKey = localStorage.key(i);
        if (rawKey?.startsWith(prefix)) {
          const key = rawKey.slice(prefix.length);
          result[key] = read(key);
        }
      }
      return result;
    },
    async set(key, value) {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    },
    async remove(key) {
      localStorage.removeItem(prefix + key);
    },
    async clear() {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const rawKey = localStorage.key(i);
        if (rawKey?.startsWith(prefix)) keysToRemove.push(rawKey);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    },
    onChange() {
      /* no cross-tab notifications in the fallback adapter */
    }
  };
}

export class StorageManager {
  #adapter;
  #cache = new Map();
  #listeners = new Map();
  #started = false;

  constructor({ namespace = 'glass' } = {}) {
    this.namespace = namespace;
    this.#adapter = isChromeStorageAvailable()
      ? createChromeAdapter(chrome.storage.local)
      : createLocalStorageAdapter(namespace);
  }

  /**
   * Load all persisted values into cache and start cross-context sync.
   */
  async init() {
    if (this.#started) return this;
    this.#started = true;
    const entries = await this.#adapter.getAll();
    for (const [key, value] of Object.entries(entries)) {
      this.#cache.set(key, value);
    }
    this.#adapter.onChange?.((changes) => {
      for (const [key, change] of Object.entries(changes)) {
        const nextValue = change.newValue;
        this.#cache.set(key, nextValue);
        this.#notify(key, nextValue);
      }
    });
    return this;
  }

  /**
   * Read a value, preferring the in-memory cache.
   */
  async get(key) {
    if (this.#cache.has(key)) return this.#cache.get(key);
    const value = await this.#adapter.get(key);
    this.#cache.set(key, value);
    return value;
  }

  /**
   * Read multiple keys at once.
   */
  async getMany(keys) {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  /**
   * Persist a value and notify local subscribers.
   */
  async set(key, value) {
    this.#cache.set(key, value);
    await this.#adapter.set(key, value);
    this.#notify(key, value);
  }

  /**
   * Persist several key/value pairs atomically.
   */
  async setMany(entries) {
    for (const [key, value] of Object.entries(entries)) {
      this.#cache.set(key, value);
    }
    await Promise.all(
      Object.entries(entries).map(([key, value]) => this.#adapter.set(key, value))
    );
    for (const [key, value] of Object.entries(entries)) {
      this.#notify(key, value);
    }
  }

  /**
   * Remove a key and notify local subscribers.
   */
  async remove(key) {
    this.#cache.delete(key);
    await this.#adapter.remove(key);
    this.#notify(key, undefined);
  }

  /**
   * Subscribe to changes for a specific key.
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(key, callback) {
    if (!this.#listeners.has(key)) {
      this.#listeners.set(key, new Set());
    }
    this.#listeners.get(key).add(callback);
    return () => this.#listeners.get(key)?.delete(callback);
  }

  has(key) {
    return this.#cache.has(key);
  }

  keys() {
    return Array.from(this.#cache.keys());
  }

  async clear() {
    this.#cache.clear();
    await this.#adapter.clear();
  }

  clearListeners() {
    this.#listeners.clear();
  }

  #notify(key, value) {
    const set = this.#listeners.get(key);
    if (!set || set.size === 0) return;
    for (const callback of [...set]) {
      try {
        callback(value);
      } catch (error) {
        console.error(`[StorageManager] listener error for key "${key}"`, error);
      }
    }
  }
}
