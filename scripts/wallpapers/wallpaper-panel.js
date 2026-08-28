/**
 * WallpaperPanel — settings UI for the live wallpaper system.
 *
 * A floating glass panel with:
 *  - a thumbnail grid (live video previews), click to activate
 *  - per-item remove
 *  - an "add" tile that imports a local video file
 *  - toggles: loop, sound (muted), pause-when-inactive
 *
 * Data comes from core.wallpapers (loader); playback is driven by
 * WallpaperEngine. Panel prefs are persisted under the "wallpaper.prefs" key
 * and uploaded videos are persisted in IndexedDB so they survive restarts.
 */

import { createId } from '../core/utils.js';
import { saveVideo, deleteVideo, loadVideo } from './blob-store.js';

const PREF_KEY = 'wallpaper.prefs';
const DEFAULT_PREFS = { loop: true, sound: false, pauseOnHide: true };
const ACCEPTED_MEDIA = [
  'video/mp4', 'video/webm', 'video/quicktime',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'
];
const ALL_EXTENSIONS_RE = /\.(mp4|webm|mov|jpe?g|png|gif|webp|bmp|svg)$/i;

function isImageMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.startsWith('image/');
}

export class WallpaperPanel {
  constructor({ core, engine, panel, trigger, fileInput }) {
    if (!core || !engine || !panel) {
      throw new TypeError('WallpaperPanel requires { core, engine, panel }');
    }
    this.core = core;
    this.engine = engine;
    this.panel = panel;
    this.trigger = trigger ?? null;
    this.fileInput = fileInput ?? null;
    this.prefs = { ...DEFAULT_PREFS };
    this.#unsubscribers = [];
  }

  #unsubscribers = [];
  #active = false;

  async init() {
    await this.#loadPrefs();
    this.#applyPrefs();

    this.#buildControls();
    this.#buildThumbnails();
    this.#bindOpenClose();
    this.#bindFileInput();
    this.#bindAddTile();

    this.#unsubscribers.push(
      this.core.wallpapers.subscribe(() => this.#buildThumbnails())
    );
    return this;
  }

  async #loadPrefs() {
    const stored = await this.core.storage.get(PREF_KEY);
    this.prefs = { ...DEFAULT_PREFS, ...(stored && typeof stored === 'object' ? stored : {}) };
  }

  async #savePrefs() {
    await this.core.storage.set(PREF_KEY, this.prefs);
  }

  #applyPrefs() {
    this.engine.setLoop(this.prefs.loop);
    this.engine.setMuted(this.prefs.sound === false);
    this.engine.setPauseOnHide(this.prefs.pauseOnHide);
  }

  #buildControls() {
    const loop = this.#makeToggle(
      'loop',
      'Loop',
      this.prefs.loop,
      (value) => {
        this.prefs.loop = value;
        this.engine.setLoop(value);
      }
    );
    const sound = this.#makeToggle(
      'sound',
      'Sound',
      this.prefs.sound,
      (value) => {
        this.prefs.sound = value;
        this.engine.setMuted(!value);
      }
    );
    const pauseOnHide = this.#makeToggle(
      'pauseOnHide',
      'Pause when inactive',
      this.prefs.pauseOnHide,
      (value) => {
        this.prefs.pauseOnHide = value;
        this.engine.setPauseOnHide(value);
      }
    );

    const controls = this.panel.querySelector('[data-wallpaper-controls]');
    if (!controls) return;
    controls.append(loop, sound, pauseOnHide);
  }

  #makeToggle(id, label, initialValue, onChange) {
    const labelEl = document.createElement('label');
    labelEl.className = 'wp-toggle';
    const span = document.createElement('span');
    span.className = 'wp-toggle__label';
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'wp-toggle__input';
    input.id = `wp-pref-${id}`;
    input.checked = Boolean(initialValue);
    const slider = document.createElement('span');
    slider.className = 'wp-toggle__slider';
    input.addEventListener('change', () => {
      const value = input.checked;
      onChange(value);
      this.#savePrefs().catch((error) => {
        console.warn('[WallpaperPanel] failed to save prefs', error);
      });
    });
    labelEl.append(span, input, slider);
    return labelEl;
  }

  #buildThumbnails() {
    const grid = this.panel.querySelector('[data-wallpaper-grid]');
    if (!grid) return;
    grid.replaceChildren();

    const activeId = this.core.wallpapers.getActive()?.id ?? null;

    for (const item of this.core.wallpapers.getItems()) {
      grid.append(this.#makeThumb(item, activeId));
    }

    grid.append(this.#makeAddTile());

    const count = this.panel.querySelector('[data-wallpaper-count]');
    if (count) {
      count.textContent = `${this.core.wallpapers.getCount()} available`;
    }
  }

  #makeThumb(item, activeId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wp-thumb';
    button.dataset.wallpaperId = item.id;
    button.title = item.name;
    if (item.id === activeId) button.classList.add('is-active');
    button.setAttribute('aria-pressed', item.id === activeId ? 'true' : 'false');

    const useImage = isImageMime(item.mimeType) || item.mediaType === 'image';
    let preview;

    if (useImage) {
      preview = document.createElement('img');
      preview.className = 'wp-thumb__preview';
      preview.src = item.blobUrl || item.url;
      preview.alt = item.name;
      preview.loading = 'lazy';
    } else {
      preview = document.createElement('video');
      preview.className = 'wp-thumb__preview';
      preview.src = item.blobUrl || item.url;
      preview.muted = true;
      preview.loop = true;
      preview.playsInline = true;
      preview.preload = 'metadata';
      preview.setAttribute('aria-hidden', 'true');
    }

    const name = document.createElement('span');
    name.className = 'wp-thumb__name';
    name.textContent = item.name;
    name.title = item.name;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'wp-thumb__remove';
    remove.title = `Remove ${item.name}`;
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      this.#removeWallpaper(item);
    });

    button.append(preview, name, remove);

    if (!useImage) {
      const playOnHover = () => {
        preview.currentTime = 0;
        preview.play().catch(() => {});
      };
      const pauseOnLeave = () => preview.pause();
      button.addEventListener('mouseenter', playOnHover);
      button.addEventListener('mouseleave', pauseOnLeave);
    }

    button.addEventListener('click', () => this.#activateWallpaper(item.id));
    return button;
  }

  #makeAddTile() {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'wp-thumb wp-thumb--add';
    tile.title = 'Add wallpaper';
    tile.innerHTML = `
      <span class="wp-thumb__add-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </span>
      <span class="wp-thumb__name">Add</span>
    `;
    tile.addEventListener('click', () => this.fileInput?.click());
    return tile;
  }

  #bindAddTile() {
    this.fileInput?.addEventListener('click', (event) => event.stopPropagation());
  }

  #bindFileInput() {
    if (!this.fileInput) return;
    this.fileInput.addEventListener('change', async () => {
      const files = Array.from(this.fileInput.files ?? []);
      for (const file of files) {
        await this.#addWallpaperFile(file);
      }
      this.fileInput.value = '';
    });
  }

  async #addWallpaperFile(file) {
    if (!ACCEPTED_MEDIA.includes(file.type)) {
      console.warn('[WallpaperPanel] unsupported file type', file.type);
      return;
    }
    const id = createId('wp-');
    const blobUrl = URL.createObjectURL(file);
    const name = file.name.replace(ALL_EXTENSIONS_RE, '');
    const mediaType = isImageMime(file.type) ? 'image' : 'video';
    try {
      await saveVideo(id, file);
    } catch (error) {
      console.warn('[WallpaperPanel] failed to store upload', error);
      URL.revokeObjectURL(blobUrl);
      return;
    }
    try {
      await this.core.wallpapers.add({
        id,
        name,
        blobUrl,
        type: 'upload',
        mediaType,
        mimeType: file.type,
        size: file.size,
        addedAt: Date.now()
      });
    } catch (error) {
      console.warn('[WallpaperPanel] failed to add wallpaper', error);
      URL.revokeObjectURL(blobUrl);
      deleteVideo(id).catch(() => {});
    }
  }

  async #activateWallpaper(id) {
    try {
      await this.core.wallpapers.setActive(id);
      // Persist the selection independently so it survives restarts even if
      // the wallpaper list is reconstructed.
      this.prefs.activeId = id;
      await this.#savePrefs();
    } catch (error) {
      console.warn('[WallpaperPanel] failed to activate wallpaper', error);
    }
  }

  async #removeWallpaper(item) {
    const wasActive = this.core.wallpapers.isActive(item.id);
    try {
      await this.core.wallpapers.remove(item.id);
      if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
      if (item.type === 'upload') {
        deleteVideo(item.id).catch(() => {});
      }
      if (wasActive) {
        const active = this.core.wallpapers.getActive();
        if (active) await this.#activateWallpaper(active.id);
      }
    } catch (error) {
      console.warn('[WallpaperPanel] failed to remove wallpaper', error);
    }
  }

  #bindOpenClose() {
    if (!this.trigger) return;
    this.trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      this.toggle();
    });
    document.addEventListener('click', (event) => {
      if (
        this.#active &&
        !this.panel.contains(event.target) &&
        !this.trigger?.contains(event.target)
      ) {
        this.close();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.#active) this.close();
    });
  }

  get isOpen() {
    return this.#active;
  }

  toggle() {
    this.#active ? this.close() : this.open();
  }

  open() {
    this.#active = true;
    this.panel.classList.add('is-open');
    this.panel.setAttribute('aria-hidden', 'false');
    this.trigger?.setAttribute('aria-expanded', 'true');
    this.#buildThumbnails();
  }

  close() {
    this.#active = false;
    this.panel.classList.remove('is-open');
    this.panel.setAttribute('aria-hidden', 'true');
    this.trigger?.setAttribute('aria-expanded', 'false');
  }

  destroy() {
    this.#unsubscribers.forEach((unsub) => unsub());
    this.#unsubscribers = [];
  }
}

/**
 * Refresh uploaded wallpapers after a restart: object URLs from a previous
 * session are dead, so each upload's Blob is reloaded from IndexedDB and a
 * fresh object URL is assigned. Orphaned uploads (no stored bytes) are
 * dropped by the loader's normalizer.
 */
export async function restoreUploadedWallpapers(core) {
  const items = core.wallpapers.getItems();
  if (!items.some((item) => item.type === 'upload')) return;

  const restored = [];
  let changed = false;
  for (const item of items) {
    if (item.type === 'upload') {
      const blob = await loadVideo(item.id).catch(() => null);
      if (blob) {
        if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
        restored.push({ ...item, blobUrl: URL.createObjectURL(blob) });
        changed = true;
      } else {
        // stale upload without stored bytes — drop it
        changed = true;
      }
    } else {
      restored.push(item);
    }
  }

  if (changed) {
    await core.wallpapers.replace({ items: restored });
  }
}
