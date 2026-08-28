import { BaseLoader } from './base-loader.js';
import { createId, getHostname, normalizeUrl } from '../utils.js';

/**
 * ShortcutLoader — owns the shortcuts collection (the most-used feature).
 *
 * Slice shape: array of
 *   { id, title, url, iconUrl, createdAt, position }
 */

export class ShortcutLoader extends BaseLoader {
  constructor({ config, storage, state, bus }) {
    super({
      key: config.get('storage.keys.shortcuts'),
      defaults: [],
      storage,
      state,
      bus,
      normalize: (items) =>
        items
          .filter((item) => item && typeof item === 'object')
          .map((item, index) => this.#normalizeItem(item, index))
          .filter((item) => item.url !== null),
      validate: (data) =>
        Array.isArray(data) ? null : 'must be an array'
    });

    this.config = config;
  }

  #normalizeItem(item, index) {
    const url = normalizeUrl(item.url);
    const title = String(item.title || (url ? getHostname(url) : '') || 'Untitled');
    return {
      id: item.id || createId('sc-'),
      title,
      url,
      iconUrl: item.iconUrl || null,
      createdAt: item.createdAt ?? null,
      position: item.position ?? index
    };
  }

  getAll() {
    return this.data;
  }

  getById(id) {
    return this.data.find((item) => item.id === id) ?? null;
  }

  getCount() {
    return this.data.length;
  }

  /**
   * Add a shortcut. URL is normalized; title falls back to the hostname.
   */
  async add({ title, url, iconUrl } = {}) {
    const validUrl = normalizeUrl(url);
    if (!validUrl) {
      throw new Error('[ShortcutLoader] invalid URL');
    }
    const item = this.#normalizeItem(
      {
        title,
        url: validUrl,
        iconUrl: iconUrl || null,
        createdAt: Date.now(),
        position: this.data.length
      },
      this.data.length
    );
    return this.replace([...this.data, item]);
  }

  /**
   * Update an existing shortcut by id.
   */
  async update(id, partial = {}) {
    if (!this.getById(id)) {
      throw new Error(`[ShortcutLoader] shortcut "${id}" not found`);
    }
    const next = this.data.map((item) =>
      item.id === id ? this.#normalizeItem({ ...item, ...partial }, item.position) : item
    );
    return this.replace(next);
  }

  /**
   * Remove a shortcut by id.
   */
  async remove(id) {
    return this.replace(this.data.filter((item) => item.id !== id));
  }

  /**
   * Reorder the whole collection from an ordered list of ids.
   * Unknown ids are dropped; existing items keep their data.
   */
  async reorder(orderedIds) {
    const byId = new Map(this.data.map((item) => [item.id, item]));
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((item, index) => ({ ...item, position: index }));
    return this.replace(next);
  }

  /**
   * Move one shortcut to a target index.
   */
  async move(id, toIndex) {
    const fromIndex = this.data.findIndex((item) => item.id === id);
    if (fromIndex === -1) {
      throw new Error(`[ShortcutLoader] shortcut "${id}" not found`);
    }
    const next = [...this.data];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(Math.min(toIndex, next.length), 0, moved);
    return this.replace(next.map((item, index) => ({ ...item, position: index })));
  }

  /**
   * Remove all shortcuts.
   */
  async clear() {
    return this.replace([]);
  }
}
