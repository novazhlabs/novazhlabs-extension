import { BaseLoader } from './base-loader.js';
import { createId } from '../utils.js';

/**
 * WallpaperLoader — owns the wallpaper collection and the active selection.
 *
 * Slice shape:
 *   {
 *     items: [ { id, name, type, url?, blobUrl?, mimeType?, size?, addedAt } ],
 *     activeId: string | null
 *   }
 *
 * Loaders only manage data — the video element is rendered elsewhere.
 */

export class WallpaperLoader extends BaseLoader {
  constructor({ config, storage, state, bus }) {
    super({
      key: config.get('storage.keys.wallpapers'),
      defaults: { items: [], activeId: null },
      storage,
      state,
      bus,
      normalize: (data) => {
        const items = (Array.isArray(data?.items) ? data.items : [])
          .map((item, index) => this.#normalizeItem(item, index))
          .filter((item) => item.url || item.blobUrl);
        let activeId = data?.activeId ?? null;
        if (activeId && !items.some((item) => item.id === activeId)) {
          activeId = null;
        }
        if (!activeId && items.length > 0) {
          activeId = items[0].id;
        }
        return { items, activeId };
      },
      validate: (data) => {
        if (!data || !Array.isArray(data.items)) return 'must be { items, activeId }';
        if (data.activeId && !data.items.some((i) => i.id === data.activeId)) {
          return 'activeId does not reference an existing item';
        }
        return null;
      }
    });

    this.config = config;
  }

  #normalizeItem(item, index) {
    return {
      id: item.id || createId('wp-'),
      name: String(item.name || `Wallpaper ${index + 1}`),
      type: item.type || 'upload',
      mediaType: item.mediaType || null,
      url: item.url || null,
      blobUrl: item.blobUrl || null,
      mimeType: item.mimeType || null,
      size: item.size ?? null,
      addedAt: item.addedAt ?? null,
      position: item.position ?? index
    };
  }

  getItems() {
    return this.data.items;
  }

  getCount() {
    return this.data.items.length;
  }

  getById(id) {
    return this.data.items.find((item) => item.id === id) ?? null;
  }

  getActive() {
    return this.data.items.find((item) => item.id === this.data.activeId) ?? null;
  }

  /**
   * Source URL (blob or local path) for the active wallpaper, or null.
   */
  getActiveUrl() {
    const active = this.getActive();
    return active ? active.blobUrl || active.url : null;
  }

  isActive(id) {
    return this.data.activeId === id;
  }

  /**
   * Add a wallpaper. The first added wallpaper becomes active automatically.
   */
  async add(item = {}) {
    if (!item.url && !item.blobUrl) {
      throw new Error('[WallpaperLoader] wallpaper needs a url or blobUrl');
    }
    const normalized = this.#normalizeItem(item, this.data.items.length);
    const items = [...this.data.items, normalized];
    return this.replace({
      items,
      activeId: this.data.activeId || normalized.id
    });
  }

  /**
   * Remove a wallpaper. Removing the active one promotes the next item.
   */
  async remove(id) {
    const items = this.data.items.filter((item) => item.id !== id);
    let activeId = this.data.activeId;
    if (activeId === id) {
      activeId = items.length > 0 ? items[0].id : null;
    }
    return this.replace({ items, activeId });
  }

  /**
   * Set the active wallpaper by id.
   */
  async setActive(id) {
    if (!this.getById(id)) {
      throw new Error(`[WallpaperLoader] wallpaper "${id}" not found`);
    }
    return this.replace({ ...this.data, activeId: id });
  }

  async removeAll() {
    return this.replace({ items: [], activeId: null });
  }
}
